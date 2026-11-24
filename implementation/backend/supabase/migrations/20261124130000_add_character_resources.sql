begin;

-- M04 Phase 2 (L1, L4): trackers as rows. One row per spell-slot level, hit-die size, or named
-- class or homebrew tracker. Taps go through adjust_character_resource (next migration); direct
-- owner writes cover adding, renaming, reordering, setting a maximum, and typed corrections.
-- Reads follow the sheet: the owner always, other current members only when it is shared.

create table public.character_resources (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  kind text not null,
  name text,
  slot_level smallint,
  die smallint,
  maximum integer not null,
  current integer not null,
  reset text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint character_resources_kind_check check (kind in ('spell_slots', 'hit_dice', 'tracker')),
  constraint character_resources_name_check check (
    name is null
    or (name = btrim(name) and char_length(name) between 1 and 60 and name !~ '[[:cntrl:]]')
  ),
  -- Per-kind columns: slots carry a level, hit dice a die, trackers a name.
  constraint character_resources_shape_check check (
    case kind
      when 'spell_slots' then slot_level is not null and slot_level between 1 and 9 and die is null
      when 'hit_dice' then die is not null and die in (6, 8, 10, 12) and slot_level is null
      else name is not null and slot_level is null and die is null
    end
  ),
  constraint character_resources_maximum_check check (maximum between 0 and 999),
  constraint character_resources_current_check check (current between 0 and maximum),
  constraint character_resources_reset_check check (reset in ('short', 'long', 'none')),
  constraint character_resources_position_check check (position between 0 and 9999)
);

create index character_resources_character_position_idx
  on public.character_resources (character_id, position);

-- Integrity for every write path, including postgres and service-role tooling.
create function private.guard_character_resource_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.character_id <> old.character_id then
      raise integrity_constraint_violation using message = 'resource_reassignment_forbidden';
    end if;
    -- Lowering the maximum never leaves current above it.
    if new.maximum <> old.maximum and new.current > new.maximum then
      new.current := new.maximum;
    end if;
    return new;
  end if;

  -- INSERT: serialize inserts for one character, then enforce the cap.
  perform 1 from public.characters where id = new.character_id for no key update;
  if (select count(*) from public.character_resources where character_id = new.character_id) >= 40 then
    raise exception 'resource_limit';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_character_resource_write()
  from public, anon, authenticated, service_role;

create trigger character_resources_guard_write
  before insert or update on public.character_resources
  for each row execute function private.guard_character_resource_write();

create trigger character_resources_set_updated_at
  before update on public.character_resources
  for each row execute function private.set_updated_at();

alter table public.character_resources enable row level security;

revoke all on table public.character_resources from public, anon, authenticated, service_role;

grant select, delete on table public.character_resources to authenticated;
grant insert (character_id, kind, name, slot_level, die, maximum, current, reset, position)
  on table public.character_resources to authenticated;
grant update (name, maximum, current, reset, position)
  on table public.character_resources to authenticated;

-- The subquery is filtered by the characters SELECT policy (current members of both sides).
create policy "Owners and shared members read resources"
  on public.character_resources for select to authenticated
  using (
    exists (
      select 1 from public.characters as c
      where c.id = character_resources.character_id
        and (c.owner_id = (select auth.uid()) or c.sheet_visibility = 'campaign')
    )
  );

create policy "Owners add resources"
  on public.character_resources for insert to authenticated
  with check (
    exists (
      select 1 from public.characters as c
      where c.id = character_resources.character_id
        and c.owner_id = (select auth.uid())
        and c.campaign_id in (select private.current_campaign_ids())
    )
  );

create policy "Owners update resources"
  on public.character_resources for update to authenticated
  using (
    exists (
      select 1 from public.characters as c
      where c.id = character_resources.character_id
        and c.owner_id = (select auth.uid())
        and c.campaign_id in (select private.current_campaign_ids())
    )
  )
  with check (
    exists (
      select 1 from public.characters as c
      where c.id = character_resources.character_id
        and c.owner_id = (select auth.uid())
        and c.campaign_id in (select private.current_campaign_ids())
    )
  );

create policy "Owners delete resources"
  on public.character_resources for delete to authenticated
  using (
    exists (
      select 1 from public.characters as c
      where c.id = character_resources.character_id
        and c.owner_id = (select auth.uid())
        and c.campaign_id in (select private.current_campaign_ids())
    )
  );

-- Live updates (as in M03.7): the subscriber's select policy is checked against each row, so a
-- private sheet's trackers never reach another member. Replica identity stays default.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'character_resources'
  ) then
    alter publication supabase_realtime add table public.character_resources;
  end if;
end;
$$;

commit;
