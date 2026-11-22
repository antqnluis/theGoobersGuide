begin;

-- A player's galaxy: each campaign the player belongs to occupies one of their planets
-- ("slots" 0, 1, 2, ...). Position and look are derived from the slot by the app, so only
-- the campaign -> slot assignment is stored. The assignment is per player: the same campaign
-- can sit on different planets in different players' galaxies. It is cosmetic and never
-- grants access; membership stays the only thing that does.
--
-- Player-owned data, so it references the campaign and the profile directly (never
-- campaign_members). Leaving a campaign keeps the row as a released "rejoin preference"
-- (released_at set), so rejoining restores the planet when it is still free. Released rows
-- never reserve a slot and are never visible through the API.

create table public.galaxy_planets (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  slot smallint not null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (profile_id, campaign_id),
  constraint galaxy_planets_slot_check check (slot >= 0)
);

-- One campaign per planet. Released rows do not hold their slot.
create unique index galaxy_planets_active_slot_idx
  on public.galaxy_planets (profile_id, slot)
  where released_at is null;

-- The campaigns FK cascade.
create index galaxy_planets_campaign_id_idx on public.galaxy_planets (campaign_id);

create trigger galaxy_planets_set_updated_at
  before update on public.galaxy_planets
  for each row execute function private.set_updated_at();

alter table public.galaxy_planets enable row level security;

revoke all on table public.galaxy_planets from public, anon, authenticated, service_role;
grant select on table public.galaxy_planets to authenticated;

-- Only the caller's own active assignments, and only while they are still a member.
create policy "Players read their own planets"
on public.galaxy_planets for select to authenticated
using (
  profile_id = (select auth.uid())
  and released_at is null
  and campaign_id in (select private.current_campaign_ids())
);

-- Claim a planet for a campaign the player has just joined. Idempotent: an active row is
-- returned as is. Otherwise the first free slot of: the preferred one, the slot remembered
-- from an earlier membership, the lowest unused one. Nothing is ever displaced.
create function private.assign_galaxy_planet(
  p_profile_id uuid,
  p_campaign_id uuid,
  p_preferred smallint default null
) returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot smallint;
  v_remembered smallint;
begin
  -- Serializes every galaxy write for this player.
  perform pg_advisory_xact_lock(hashtextextended('galaxy_planets:' || p_profile_id::text, 0));

  select g.slot into v_slot
  from public.galaxy_planets as g
  where g.profile_id = p_profile_id and g.campaign_id = p_campaign_id and g.released_at is null;
  if found then
    return v_slot;
  end if;

  select g.slot into v_remembered
  from public.galaxy_planets as g
  where g.profile_id = p_profile_id and g.campaign_id = p_campaign_id and g.released_at is not null;

  v_slot := null;
  if p_preferred is not null and p_preferred >= 0 and not exists (
    select 1 from public.galaxy_planets as g
    where g.profile_id = p_profile_id and g.released_at is null and g.slot = p_preferred
  ) then
    v_slot := p_preferred;
  elsif v_remembered is not null and not exists (
    select 1 from public.galaxy_planets as g
    where g.profile_id = p_profile_id and g.released_at is null and g.slot = v_remembered
  ) then
    v_slot := v_remembered;
  else
    select s.n::smallint into v_slot
    from generate_series(
      0,
      (select coalesce(max(g.slot), -1) + 1
       from public.galaxy_planets as g
       where g.profile_id = p_profile_id and g.released_at is null)
    ) as s (n)
    where not exists (
      select 1 from public.galaxy_planets as g
      where g.profile_id = p_profile_id and g.released_at is null and g.slot = s.n
    )
    order by s.n
    limit 1;
  end if;

  insert into public.galaxy_planets (profile_id, campaign_id, slot)
  values (p_profile_id, p_campaign_id, v_slot)
  on conflict (profile_id, campaign_id) do update
    set slot = excluded.slot, released_at = null;

  return v_slot;
end;
$$;

revoke all on function private.assign_galaxy_planet(uuid, uuid, smallint)
  from public, anon, authenticated, service_role;

-- A membership row appears (campaign creation, accepted invitation, any future path):
-- claim a planet in the same transaction.
create function private.claim_galaxy_planet_on_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assign_galaxy_planet(new.profile_id, new.campaign_id);
  return new;
end;
$$;

revoke all on function private.claim_galaxy_planet_on_join()
  from public, anon, authenticated, service_role;

create trigger campaign_members_assign_galaxy_planet
  after insert on public.campaign_members
  for each row execute function private.claim_galaxy_planet_on_join();

-- A membership row goes (leave, removal, administrative delete): release the planet but
-- keep the row as the rejoin preference. Rows deleted by a cascade (campaign or account
-- deletion) go with the foreign keys, so skip them rather than lock for every member.
create function private.release_galaxy_planet_on_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.campaigns as c where c.id = old.campaign_id)
    or not exists (select 1 from public.profiles as p where p.id = old.profile_id) then
    return old;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('galaxy_planets:' || old.profile_id::text, 0));

  update public.galaxy_planets
  set released_at = now()
  where profile_id = old.profile_id
    and campaign_id = old.campaign_id
    and released_at is null;

  return old;
end;
$$;

revoke all on function private.release_galaxy_planet_on_leave()
  from public, anon, authenticated, service_role;

create trigger campaign_members_release_galaxy_planet
  after delete on public.campaign_members
  for each row execute function private.release_galaxy_planet_on_leave();

-- Move the caller's campaign onto a chosen free planet ("create from this world"). A taken
-- planet is not an error: nothing moves and the current slot is returned.
create function public.move_galaxy_planet(
  p_campaign_id uuid,
  p_slot integer
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  v_current smallint;
  v_highest integer;
begin
  if caller is null then
    raise insufficient_privilege using message = 'galaxy_planet_sign_in_required';
  end if;
  if p_campaign_id is null or p_slot is null then
    raise invalid_parameter_value using message = 'galaxy_planet_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('galaxy_planets:' || caller::text, 0));

  -- An active row implies current membership: release takes the same lock. Unknown,
  -- inaccessible and departed campaigns all get the same error.
  select g.slot into v_current
  from public.galaxy_planets as g
  where g.profile_id = caller and g.campaign_id = p_campaign_id and g.released_at is null;
  if not found then
    raise exception 'galaxy_planet_campaign_unavailable' using errcode = 'P0001';
  end if;

  -- Only planets the caller can see: the six starters plus any beyond them in use.
  select coalesce(max(g.slot), 0) into v_highest
  from public.galaxy_planets as g
  where g.profile_id = caller and g.released_at is null;
  if p_slot < 0 or p_slot > greatest(5, v_highest) then
    raise invalid_parameter_value using message = 'galaxy_planet_invalid';
  end if;

  if p_slot = v_current then
    return v_current;
  end if;

  if exists (
    select 1 from public.galaxy_planets as g
    where g.profile_id = caller and g.released_at is null and g.slot = p_slot
  ) then
    return v_current;
  end if;

  update public.galaxy_planets
  set slot = p_slot
  where profile_id = caller and campaign_id = p_campaign_id;

  return p_slot;
end;
$$;

revoke all on function public.move_galaxy_planet(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.move_galaxy_planet(uuid, integer) to authenticated;

-- Existing players keep their ring order: oldest campaign first, then id (the order the
-- galaxy used before planets were stored). Reads campaigns and memberships only.
insert into public.galaxy_planets (profile_id, campaign_id, slot)
select
  m.profile_id,
  m.campaign_id,
  (row_number() over (partition by m.profile_id order by c.created_at, c.id) - 1)::smallint
from public.campaign_members as m
join public.campaigns as c on c.id = m.campaign_id
on conflict do nothing;

commit;
