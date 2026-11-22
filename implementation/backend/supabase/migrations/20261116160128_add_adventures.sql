begin;

-- M03.5 Phase 1: adventures core.
-- Personal and side adventures are visible only to the owner of their accepted participant
-- character; main adventures to every current member. Every read goes through
-- private.visible_adventure_ids(), every child write through private.editable_adventure_ids().
-- Adventures and their participants are created only by create_adventure. Access is computed
-- from current membership, so the departure hook is unchanged (D6).

create table public.adventures (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type text not null,
  visibility text not null,
  status text not null default 'pending',
  title text not null,
  description text not null default '',
  next_step text not null default '',
  reference text not null default '',
  updated_by uuid references public.profiles (id) on delete set null,
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint adventures_type_check check (type in ('main', 'side', 'personal')),
  -- M6 adds 'party' for shared personal and side adventures; main stays 'campaign'.
  constraint adventures_visibility_check check (visibility in ('participants', 'campaign')),
  constraint adventures_visibility_matches_type check ((type = 'main') = (visibility = 'campaign')),
  constraint adventures_status_check
    check (status in ('pending', 'in_progress', 'on_hold', 'completed')),
  constraint adventures_title_check check (
    title = btrim(title) and char_length(title) between 1 and 120 and title !~ '[[:cntrl:]]'
  ),
  -- Newlines and tabs are allowed in the description; other control characters are not.
  constraint adventures_description_check check (
    char_length(description) <= 4000 and description !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
  ),
  constraint adventures_next_step_check check (
    next_step = btrim(next_step) and char_length(next_step) <= 280 and next_step !~ '[[:cntrl:]]'
  ),
  constraint adventures_reference_check check (
    reference = btrim(reference) and char_length(reference) <= 280 and reference !~ '[[:cntrl:]]'
  ),
  -- Lets participants (and M8's handoffs) pin themselves to the adventure's campaign.
  constraint adventures_id_campaign_key unique (id, campaign_id)
);

create index adventures_campaign_updated_idx on public.adventures (campaign_id, updated_at desc);
create index adventures_creator_idx on public.adventures (created_by, campaign_id);

create table public.adventure_participants (
  id uuid primary key default gen_random_uuid(),
  adventure_id uuid not null,
  campaign_id uuid not null,
  character_id uuid not null,
  profile_id uuid not null,
  -- M5 writes only 'accepted'. The other states are M6's.
  status text not null default 'accepted',
  created_at timestamptz not null default now(),

  constraint adventure_participants_status_check
    check (status in ('proposed', 'invited', 'accepted', 'declined', 'left')),
  constraint adventure_participants_adventure_fkey foreign key (adventure_id, campaign_id)
    references public.adventures (id, campaign_id) on delete cascade,
  constraint adventure_participants_character_campaign_fkey foreign key (character_id, campaign_id)
    references public.characters (id, campaign_id) on delete cascade,
  constraint adventure_participants_character_owner_fkey foreign key (character_id, profile_id)
    references public.characters (id, owner_id) on delete cascade,
  constraint adventure_participants_unique unique (adventure_id, character_id)
);

create index adventure_participants_profile_idx
  on public.adventure_participants (profile_id, status);
create index adventure_participants_character_idx on public.adventure_participants (character_id);

create table public.adventure_objectives (
  id uuid primary key default gen_random_uuid(),
  adventure_id uuid not null references public.adventures (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint adventure_objectives_title_check check (
    title = btrim(title) and char_length(title) between 1 and 200 and title !~ '[[:cntrl:]]'
  ),
  constraint adventure_objectives_done_check check (done = (completed_at is not null))
);

create index adventure_objectives_adventure_idx
  on public.adventure_objectives (adventure_id, created_at);

create table public.adventure_updates (
  id uuid primary key default gen_random_uuid(),
  adventure_id uuid not null references public.adventures (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),

  constraint adventure_updates_body_check check (
    body = btrim(body) and char_length(body) between 1 and 2000
    and body !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
  )
);

create index adventure_updates_adventure_idx
  on public.adventure_updates (adventure_id, created_at desc);

-- Visibility helpers. SECURITY DEFINER, so they read participants without that table's own
-- policy (no recursive RLS). Scoped to the caller through auth.uid().

-- Main adventures of the caller's campaigns, and personal or side adventures where the caller
-- owns an accepted participant. Archived adventures only for their creator.
create function private.visible_adventure_ids()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select a.id
  from public.adventures as a
  where a.campaign_id in (select private.current_campaign_ids())
    and (a.archived_at is null or a.created_by = (select auth.uid()))
    and (
      a.type = 'main'
      or exists (
        select 1 from public.adventure_participants as p
        where p.adventure_id = a.id
          and p.profile_id = (select auth.uid())
          and p.status = 'accepted'
      )
    );
$$;

-- The same, minus archived adventures: where objectives and updates may be written.
create function private.editable_adventure_ids()
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select a.id
  from public.adventures as a
  where a.campaign_id in (select private.current_campaign_ids())
    and a.archived_at is null
    and (
      a.type = 'main'
      or exists (
        select 1 from public.adventure_participants as p
        where p.adventure_id = a.id
          and p.profile_id = (select auth.uid())
          and p.status = 'accepted'
      )
    );
$$;

revoke all on function private.visible_adventure_ids() from public, anon, authenticated, service_role;
revoke all on function private.editable_adventure_ids() from public, anon, authenticated, service_role;
grant execute on function private.visible_adventure_ids() to authenticated;
grant execute on function private.editable_adventure_ids() to authenticated;

-- Adventure integrity for every write path, including postgres and service-role tooling.
create function private.guard_adventure_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  -- Foreign-key actions (a deleted account) run inside another trigger and only clear an
  -- attribution, so they are not recorded as an edit.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.id <> old.id or new.campaign_id <> old.campaign_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or new.visibility <> old.visibility then
    raise integrity_constraint_violation using message = 'adventure_reassignment_forbidden';
  end if;

  if (new.type = 'main') <> (old.type = 'main') then
    raise exception 'adventure_type_change_forbidden';
  end if;

  if old.archived_at is not null then
    -- Archived adventures are read-only. The only change is the creator restoring one.
    if new.archived_at is not null
       or (new.type, new.status, new.title, new.description, new.next_step, new.reference)
          is distinct from
          (old.type, old.status, old.title, old.description, old.next_step, old.reference) then
      raise exception 'adventure_archived';
    end if;
    if caller_id is distinct from old.created_by then
      raise insufficient_privilege using message = 'adventure_archive_creator_only';
    end if;
  elsif new.archived_at is not null then
    if caller_id is distinct from old.created_by then
      raise insufficient_privilege using message = 'adventure_archive_creator_only';
    end if;
    new.archived_at := now();
  end if;

  if new.status <> old.status then
    new.status_changed_at := now();
    new.status_changed_by := caller_id;
  else
    new.status_changed_at := old.status_changed_at;
    new.status_changed_by := old.status_changed_by;
  end if;

  new.updated_by := caller_id;
  return new;
end;
$$;

-- Participants: keys never change, and main adventures never have participants (D1).
create function private.guard_adventure_participant_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.adventure_id <> old.adventure_id
       or new.campaign_id <> old.campaign_id or new.character_id <> old.character_id
       or new.profile_id <> old.profile_id or new.created_at <> old.created_at then
      raise integrity_constraint_violation using message = 'adventure_reassignment_forbidden';
    end if;
  elsif exists (
    select 1 from public.adventures where id = new.adventure_id and type = 'main'
  ) then
    raise exception 'adventure_main_has_no_participants';
  end if;
  return new;
end;
$$;

-- Objectives: keys never change, a cap of 50 per adventure, and tick attribution.
create function private.guard_adventure_objective_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  -- Foreign-key actions (a deleted account) only clear an attribution.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.adventure_id <> old.adventure_id
       or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
      raise integrity_constraint_violation using message = 'adventure_reassignment_forbidden';
    end if;
    if new.done = old.done then
      new.completed_by := old.completed_by;
      new.completed_at := old.completed_at;
      return new;
    end if;
  else
    perform pg_advisory_xact_lock(
      hashtextextended('adventure_objectives:' || new.adventure_id::text, 0)
    );
    if (select count(*) from public.adventure_objectives
        where adventure_id = new.adventure_id) >= 50 then
      raise exception 'adventure_objective_limit_reached';
    end if;
  end if;

  if new.done then
    new.completed_by := auth.uid();
    new.completed_at := now();
  else
    new.completed_by := null;
    new.completed_at := null;
  end if;
  return new;
end;
$$;

-- Updates: a cap of 500 per adventure. There is no update grant, so no update guard.
create function private.guard_adventure_update_insert()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('adventure_updates:' || new.adventure_id::text, 0)
  );
  if (select count(*) from public.adventure_updates
      where adventure_id = new.adventure_id) >= 500 then
    raise exception 'adventure_update_limit_reached';
  end if;
  return new;
end;
$$;

-- A personal or side adventure left with no accepted participant goes too (D5). When the
-- adventure itself is being deleted it is already gone, and this does nothing.
create function private.delete_orphaned_adventure()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.adventures as a
  where a.id = old.adventure_id
    and a.type <> 'main'
    and not exists (
      select 1 from public.adventure_participants as p
      where p.adventure_id = a.id and p.status = 'accepted'
    );
  return null;
end;
$$;

revoke all on function private.guard_adventure_write() from public, anon, authenticated, service_role;
revoke all on function private.guard_adventure_participant_write()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_adventure_objective_write()
  from public, anon, authenticated, service_role;
revoke all on function private.guard_adventure_update_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.delete_orphaned_adventure()
  from public, anon, authenticated, service_role;

-- Trigger names order the guard before set_updated_at.
create trigger adventures_guard_write
  before update on public.adventures
  for each row execute function private.guard_adventure_write();

create trigger adventures_set_updated_at
  before update on public.adventures
  for each row execute function private.set_updated_at();

create trigger adventure_participants_guard_write
  before insert or update on public.adventure_participants
  for each row execute function private.guard_adventure_participant_write();

create trigger adventure_participants_delete_orphan
  after delete on public.adventure_participants
  for each row execute function private.delete_orphaned_adventure();

create trigger adventure_objectives_guard_write
  before insert or update on public.adventure_objectives
  for each row execute function private.guard_adventure_objective_write();

create trigger adventure_objectives_set_updated_at
  before update on public.adventure_objectives
  for each row execute function private.set_updated_at();

create trigger adventure_updates_guard_insert
  before insert on public.adventure_updates
  for each row execute function private.guard_adventure_update_insert();

-- Creates an adventure and, for personal and side, the creator's character as its accepted
-- participant, in one transaction. Lock order: campaigns -> characters, as everywhere else.
create function public.create_adventure(
  p_campaign_id uuid,
  p_type text,
  p_title text,
  p_character_id uuid default null,
  p_next_step text default null,
  p_description text default null
) returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_title text := btrim(p_title);
  v_next_step text := coalesce(btrim(p_next_step), '');
  v_description text := coalesce(replace(replace(p_description, E'\r\n', E'\n'), E'\r', E'\n'), '');
  v_adventure_id uuid;
begin
  if p_campaign_id is null then
    raise invalid_parameter_value using message = 'adventure_campaign_required';
  end if;

  if p_type is null or p_type not in ('main', 'side', 'personal') then
    raise invalid_parameter_value using message = 'adventure_type_invalid';
  end if;

  if v_title is null or char_length(v_title) not between 1 and 120 or v_title ~ '[[:cntrl:]]' then
    raise invalid_parameter_value using message = 'adventure_title_invalid';
  end if;

  if char_length(v_next_step) > 280 or v_next_step ~ '[[:cntrl:]]'
     or char_length(v_description) > 4000
     or v_description ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then
    raise invalid_parameter_value using message = 'adventure_details_invalid';
  end if;

  if p_type = 'main' and p_character_id is not null then
    raise invalid_parameter_value using message = 'adventure_main_has_no_participants';
  end if;

  if p_type <> 'main' and p_character_id is null then
    raise invalid_parameter_value using message = 'adventure_character_required';
  end if;

  -- Serialize with membership changes. Unknown, inaccessible, and departed look the same.
  perform 1
  from public.campaigns
  where campaigns.id = p_campaign_id
    and exists (
      select 1 from public.campaign_members as m
      where m.campaign_id = campaigns.id and m.profile_id = caller_id
    )
  for share of campaigns;
  if not found then
    raise exception 'adventure_campaign_unavailable';
  end if;

  -- The caller's own character in this campaign, any status (D3). Locked against deletion.
  if p_character_id is not null then
    perform 1
    from public.characters
    where id = p_character_id and campaign_id = p_campaign_id and owner_id = caller_id
    for share;
    if not found then
      raise exception 'adventure_character_unavailable';
    end if;
  end if;

  -- Serialize one creator's creates in one campaign, then enforce the cap (D8).
  perform pg_advisory_xact_lock(
    hashtextextended('adventures:' || p_campaign_id::text || ':' || caller_id::text, 0)
  );
  if (select count(*) from public.adventures
      where campaign_id = p_campaign_id and created_by = caller_id) >= 200 then
    raise exception 'adventure_limit_reached';
  end if;

  insert into public.adventures (
    campaign_id, created_by, type, visibility, title, description, next_step, updated_by
  ) values (
    p_campaign_id, caller_id, p_type,
    case when p_type = 'main' then 'campaign' else 'participants' end,
    v_title, v_description, v_next_step, caller_id
  )
  returning id into v_adventure_id;

  if p_character_id is not null then
    insert into public.adventure_participants (adventure_id, campaign_id, character_id, profile_id, status)
    values (v_adventure_id, p_campaign_id, p_character_id, caller_id, 'accepted');
  end if;

  return v_adventure_id;
end;
$$;

revoke all on function public.create_adventure(uuid, text, text, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_adventure(uuid, text, text, uuid, text, text)
  to authenticated;

-- RLS, grants, and policies.
alter table public.adventures enable row level security;
alter table public.adventure_participants enable row level security;
alter table public.adventure_objectives enable row level security;
alter table public.adventure_updates enable row level security;

revoke all on table public.adventures from public, anon, authenticated, service_role;
revoke all on table public.adventure_participants from public, anon, authenticated, service_role;
revoke all on table public.adventure_objectives from public, anon, authenticated, service_role;
revoke all on table public.adventure_updates from public, anon, authenticated, service_role;

grant select on table public.adventures to authenticated;
grant update (type, status, title, description, next_step, reference, archived_at)
  on table public.adventures to authenticated;

grant select on table public.adventure_participants to authenticated;

grant select, delete on table public.adventure_objectives to authenticated;
grant insert (adventure_id, title) on table public.adventure_objectives to authenticated;
grant update (title, done) on table public.adventure_objectives to authenticated;

grant select, delete on table public.adventure_updates to authenticated;
grant insert (adventure_id, body) on table public.adventure_updates to authenticated;

create policy "Readers see visible adventures"
  on public.adventures for select to authenticated
  using (id in (select private.visible_adventure_ids()));

-- The guard decides what an update may change (archived rows, archiving, type).
create policy "Readers edit visible adventures"
  on public.adventures for update to authenticated
  using (id in (select private.visible_adventure_ids()))
  with check (id in (select private.visible_adventure_ids()));

create policy "Readers see participants"
  on public.adventure_participants for select to authenticated
  using (adventure_id in (select private.visible_adventure_ids()));

create policy "Readers see objectives"
  on public.adventure_objectives for select to authenticated
  using (adventure_id in (select private.visible_adventure_ids()));

create policy "Editors add objectives"
  on public.adventure_objectives for insert to authenticated
  with check (adventure_id in (select private.editable_adventure_ids()));

create policy "Editors change objectives"
  on public.adventure_objectives for update to authenticated
  using (adventure_id in (select private.editable_adventure_ids()))
  with check (adventure_id in (select private.editable_adventure_ids()));

create policy "Editors delete objectives"
  on public.adventure_objectives for delete to authenticated
  using (adventure_id in (select private.editable_adventure_ids()));

create policy "Readers see updates"
  on public.adventure_updates for select to authenticated
  using (adventure_id in (select private.visible_adventure_ids()));

create policy "Editors post updates as themselves"
  on public.adventure_updates for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and adventure_id in (select private.editable_adventure_ids())
  );

create policy "Authors delete their updates"
  on public.adventure_updates for delete to authenticated
  using (
    author_id = (select auth.uid())
    and adventure_id in (select private.editable_adventure_ids())
  );

commit;
