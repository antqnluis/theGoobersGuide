begin;

-- M03.9 Phase 1: DM handoffs (plan §3).
--   * public.adventure_handoffs: verbatim sources, readable by exactly the people who can read the
--     adventure (private.visible_adventure_ids), deletable by their importer while the adventure
--     is editable. Rows are written only by private.record_adventure_handoff.
--   * adventure_objectives.handoff_id / adventure_updates.handoff_id: nullable links to the source.
--     Clients have no grant on either column, so only the record helper can set them.
--   * public.attach_adventure_handoff / public.create_adventure_from_handoff: SECURITY INVOKER, so
--     every existing grant, policy, guard trigger, check, and cap decides each write exactly as it
--     does for the editors. The functions only make the writes succeed or fail together.
--
-- Lock order (plan §4.2): campaign FOR SHARE -> adventure FOR UPDATE, the same order as the
-- departure hook and the participant RPCs. An invoker function cannot lock the campaign row
-- (members have no UPDATE policy on it), so private.lock_handoff_target takes both locks.

-- ---------------------------------------------------------------------------------------------
-- Sources
-- ---------------------------------------------------------------------------------------------

create table public.adventure_handoffs (
  id uuid primary key default gen_random_uuid(),
  adventure_id uuid not null,
  campaign_id uuid not null,
  imported_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null,
  source_label text,
  source_text text not null,
  applied jsonb not null default '{}'::jsonb,
  change_count integer not null,
  imported_at timestamptz not null default now(),

  constraint adventure_handoffs_adventure_fkey foreign key (adventure_id, campaign_id)
    references public.adventures (id, campaign_id) on delete cascade,
  constraint adventure_handoffs_kind_check check (kind in ('new', 'attach')),
  constraint adventure_handoffs_source_label_check check (
    source_label is null
    or (source_label = btrim(source_label)
        and char_length(source_label) between 1 and 120
        and source_label !~ '[[:cntrl:]]')
  ),
  -- Newlines and tabs are allowed; every other control character is not.
  constraint adventure_handoffs_source_text_check check (
    octet_length(source_text) between 1 and 65536
    and source_text ~ '[^[:space:]]'
    and source_text !~ '[\x01-\x08\x0B\x0C\x0D\x0E-\x1F\x7F]'
  ),
  constraint adventure_handoffs_applied_check check (jsonb_typeof(applied) = 'object'),
  constraint adventure_handoffs_change_count_check check (change_count >= 0)
);

create index adventure_handoffs_adventure_imported_at_idx
  on public.adventure_handoffs (adventure_id, imported_at desc);
-- The profiles FK cascade.
create index adventure_handoffs_imported_by_idx on public.adventure_handoffs (imported_by);

alter table public.adventure_objectives
  add column handoff_id uuid references public.adventure_handoffs (id) on delete set null;
alter table public.adventure_updates
  add column handoff_id uuid references public.adventure_handoffs (id) on delete set null;

-- The set-null FK action looks the referencing rows up by this column.
create index adventure_objectives_handoff_idx
  on public.adventure_objectives (handoff_id) where handoff_id is not null;
create index adventure_updates_handoff_idx
  on public.adventure_updates (handoff_id) where handoff_id is not null;

alter table public.adventure_handoffs enable row level security;

revoke all on table public.adventure_handoffs from public, anon, authenticated, service_role;
grant select, delete on table public.adventure_handoffs to authenticated;

-- Sources follow whole-thread sharing (H3): whoever can read the adventure reads its sources.
create policy "Readers see sources"
  on public.adventure_handoffs for select to authenticated
  using (adventure_id in (select private.visible_adventure_ids()));

-- H10: the importer only, while the adventure is editable (so never while archived).
create policy "Importers delete their sources"
  on public.adventure_handoffs for delete to authenticated
  using (
    imported_by = (select auth.uid())
    and adventure_id in (select private.editable_adventure_ids())
  );

-- At most 50 sources per adventure (H11), serialized the same way as the update cap.
create function private.guard_adventure_handoff_insert()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('adventure_handoffs:' || new.adventure_id::text, 0)
  );
  if (select count(*) from public.adventure_handoffs
      where adventure_id = new.adventure_id) >= 50 then
    raise exception 'handoff_limit_reached';
  end if;
  return new;
end;
$$;

create trigger adventure_handoffs_guard_insert
  before insert on public.adventure_handoffs
  for each row execute function private.guard_adventure_handoff_insert();

revoke all on function private.guard_adventure_handoff_insert()
  from public, anon, authenticated, service_role;

-- H13: inserts only (default replica identity). The select policy filters delivery.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'adventure_handoffs'
    )
  then
    alter publication supabase_realtime add table public.adventure_handoffs;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Payload helpers
-- ---------------------------------------------------------------------------------------------

-- Source label: trimmed, empty becomes null, otherwise 1-120 characters, no control characters.
create function private.normalize_handoff_label(p_label text)
returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  v_label text := nullif(btrim(p_label), '');
begin
  if v_label is null then
    return null;
  end if;
  if char_length(v_label) > 120 or v_label ~ '[[:cntrl:]]' then
    raise invalid_parameter_value using message = 'handoff_source_invalid';
  end if;
  return v_label;
end;
$$;

-- Shape of p_changes (plan §3.3). Only these keys exist, so type, visibility, participants,
-- consent, invitations, and archive state (H4) are refused wherever they appear. Values are
-- bounded by the tables' own checks, not here. 'new' needs a title and has no existing
-- objectives to update.
create function private.handoff_changes_are_valid(p_changes jsonb, p_mode text)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  v_details jsonb;
  v_objectives jsonb;
  v_add jsonb;
  v_update jsonb;
  v_item jsonb;
  v_value jsonb;
  v_key text;
begin
  if p_mode is null or p_mode not in ('attach', 'new') then
    return false;
  end if;
  if not private.import_has_only_keys(p_changes, array['details', 'objectives', 'update']) then
    return false;
  end if;

  if p_mode = 'new' and jsonb_typeof(p_changes #> '{details,title}') is distinct from 'string' then
    return false;
  end if;

  if p_changes ? 'details' then
    v_details := p_changes -> 'details';
    if not private.import_has_only_keys(
      v_details, array['title', 'status', 'next_step', 'reference', 'description']
    ) then
      return false;
    end if;
    if not exists (select 1 from jsonb_object_keys(v_details)) then
      return false;
    end if;
    for v_key, v_value in select key, value from jsonb_each(v_details) loop
      if jsonb_typeof(v_value) <> 'string' then
        return false;
      end if;
    end loop;
  end if;

  if p_changes ? 'objectives' then
    v_objectives := p_changes -> 'objectives';
    if not private.import_has_only_keys(v_objectives, array['add', 'update']) then
      return false;
    end if;
    v_add := coalesce(v_objectives -> 'add', '[]'::jsonb);
    v_update := coalesce(v_objectives -> 'update', '[]'::jsonb);
    if jsonb_typeof(v_add) <> 'array' or jsonb_typeof(v_update) <> 'array' then
      return false;
    end if;
    if jsonb_array_length(v_add) + jsonb_array_length(v_update) = 0
      or jsonb_array_length(v_add) > 50
      or jsonb_array_length(v_update) > 50
    then
      return false;
    end if;
    if p_mode = 'new' and jsonb_array_length(v_update) > 0 then
      return false;
    end if;

    for v_value in select value from jsonb_array_elements(v_add) loop
      if jsonb_typeof(v_value) <> 'string' then
        return false;
      end if;
    end loop;

    for v_item in select value from jsonb_array_elements(v_update) loop
      if not private.import_has_only_keys(v_item, array['id', 'title', 'done'])
        or not private.import_is_uuid(v_item -> 'id')
        or not exists (select 1 from jsonb_object_keys(v_item) as k (key) where k.key <> 'id')
      then
        return false;
      end if;
      if v_item ? 'title' and jsonb_typeof(v_item -> 'title') <> 'string' then
        return false;
      end if;
      if v_item ? 'done' and jsonb_typeof(v_item -> 'done') <> 'boolean' then
        return false;
      end if;
    end loop;

    -- No objective is targeted twice.
    if (
      select count(*) <> count(distinct e.value ->> 'id')
      from jsonb_array_elements(v_update) as e (value)
    ) then
      return false;
    end if;
  end if;

  if p_changes ? 'update' and jsonb_typeof(p_changes -> 'update') <> 'string' then
    return false;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Definer helpers (not exposed through the API: the private schema is not an API schema)
-- ---------------------------------------------------------------------------------------------

-- Locks the adventure's campaign FOR SHARE, then the adventure FOR UPDATE, and refuses a target
-- the caller cannot edit. Changes nothing. Unknown, inaccessible, and departed targets all raise
-- 'adventure_unavailable'; an editor's archived adventure raises 'adventure_archived'.
create function private.lock_handoff_target(p_adventure_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_adventure public.adventures;
begin
  if p_adventure_id is null or private.lock_adventure_campaign(p_adventure_id) is null then
    raise exception 'adventure_unavailable';
  end if;

  v_adventure := private.lock_adventure_row(p_adventure_id);
  if v_adventure.id is null
    or v_adventure.id not in (select private.writable_adventure_ids())
  then
    raise exception 'adventure_unavailable';
  end if;
  if v_adventure.archived_at is not null then
    raise exception 'adventure_archived';
  end if;
end;
$$;

-- The only write path for sources. Re-checks that the caller can edit the adventure, validates
-- the source, inserts it, and tags (H9) only the objectives and the update that the caller
-- created in this transaction. now() is the transaction start, the same value the rows'
-- created_at defaults took, so an older row can never match.
create function private.record_adventure_handoff(
  p_adventure_id uuid,
  p_kind text,
  p_source_text text,
  p_source_label text,
  p_applied jsonb,
  p_change_count integer,
  p_objective_ids uuid[],
  p_update_id uuid
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_campaign_id uuid;
  v_text text;
  v_id uuid;
begin
  if caller_id is null then
    raise exception 'adventure_unavailable';
  end if;
  if p_kind is null or p_kind not in ('new', 'attach')
    or p_applied is null or jsonb_typeof(p_applied) <> 'object'
    or p_change_count is null or p_change_count < 0
  then
    raise invalid_parameter_value using message = 'handoff_invalid';
  end if;

  select a.campaign_id into v_campaign_id
  from public.adventures as a
  where a.id = p_adventure_id
    and a.id in (select private.editable_adventure_ids());
  if not found then
    raise exception 'adventure_unavailable';
  end if;

  v_text := replace(replace(p_source_text, E'\r\n', E'\n'), E'\r', E'\n');
  if v_text is null
    or octet_length(v_text) not between 1 and 65536
    or v_text !~ '[^[:space:]]'
    or v_text ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
  then
    raise invalid_parameter_value using message = 'handoff_source_invalid';
  end if;

  insert into public.adventure_handoffs (
    adventure_id, campaign_id, imported_by, kind, source_label, source_text, applied, change_count
  ) values (
    p_adventure_id, v_campaign_id, caller_id, p_kind,
    private.normalize_handoff_label(p_source_label), v_text, p_applied, p_change_count
  )
  returning id into v_id;

  if p_objective_ids is not null and cardinality(p_objective_ids) > 0 then
    update public.adventure_objectives as o
    set handoff_id = v_id
    where o.id = any (p_objective_ids)
      and o.adventure_id = p_adventure_id
      and o.created_by = caller_id
      and o.created_at = now();
  end if;

  if p_update_id is not null then
    update public.adventure_updates as u
    set handoff_id = v_id
    where u.id = p_update_id
      and u.adventure_id = p_adventure_id
      and u.author_id = caller_id
      and u.created_at = now();
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- public.attach_adventure_handoff
-- ---------------------------------------------------------------------------------------------

create function public.attach_adventure_handoff(
  p_adventure_id uuid,
  p_expected jsonb,
  p_changes jsonb,
  p_source_text text,
  p_source_label text default null
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_label text := private.normalize_handoff_label(p_source_label);
  v_has_changes boolean;
  v_details jsonb;
  v_objectives jsonb;
  v_add jsonb;
  v_update jsonb;
  v_expected_objectives jsonb;
  v_expected_adventure timestamptz;
  v_current_adventure timestamptz;
  v_item jsonb;
  v_key text;
  v_value jsonb;
  v_title text;
  v_new_id uuid;
  v_object_ids uuid[] := array[]::uuid[];
  v_update_id uuid;
  v_added integer := 0;
  v_changed integer := 0;
  v_fields integer := 0;
  v_applied jsonb;
begin
  if p_adventure_id is null
    or p_changes is null
    or not private.handoff_changes_are_valid(p_changes, 'attach')
  then
    raise invalid_parameter_value using message = 'handoff_invalid';
  end if;

  v_has_changes := p_changes <> '{}'::jsonb;
  v_details := p_changes -> 'details';
  v_objectives := p_changes -> 'objectives';
  v_add := coalesce(v_objectives -> 'add', '[]'::jsonb);
  v_update := coalesce(v_objectives -> 'update', '[]'::jsonb);

  -- Expected versions. A source-only attach changes nothing, so it expects nothing.
  if v_has_changes then
    if not private.import_has_only_keys(p_expected, array['adventure_updated_at', 'objectives'])
      or not p_expected ?& array['adventure_updated_at', 'objectives']
      or jsonb_typeof(p_expected -> 'adventure_updated_at') <> 'string'
      or jsonb_typeof(p_expected -> 'objectives') <> 'object'
    then
      raise invalid_parameter_value using message = 'handoff_invalid';
    end if;
    v_expected_objectives := p_expected -> 'objectives';
    begin
      v_expected_adventure := (p_expected ->> 'adventure_updated_at')::timestamptz;
      for v_key, v_value in select key, value from jsonb_each(v_expected_objectives) loop
        if not private.import_is_uuid(to_jsonb(v_key)) or jsonb_typeof(v_value) <> 'string' then
          raise invalid_parameter_value using message = 'handoff_invalid';
        end if;
        perform (v_value #>> '{}')::timestamptz;
      end loop;
    exception
      when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
        raise invalid_parameter_value using message = 'handoff_invalid';
    end;

    -- Every targeted objective needs an expected version.
    if exists (
      select 1 from jsonb_array_elements(v_update) as e (value)
      where not v_expected_objectives ? (e.value ->> 'id')
    ) then
      raise invalid_parameter_value using message = 'handoff_invalid';
    end if;
  end if;

  -- Campaign, then adventure. Raises adventure_unavailable / adventure_archived.
  perform private.lock_handoff_target(p_adventure_id);

  if v_has_changes then
    select a.updated_at into v_current_adventure
    from public.adventures as a
    where a.id = p_adventure_id;
    if not found then
      raise exception 'adventure_unavailable';
    end if;
    -- Strict concurrency (§4.2): any change since the review was loaded fails the whole apply.
    if v_current_adventure is distinct from v_expected_adventure then
      raise exception 'handoff_conflict';
    end if;
  end if;

  begin
    if p_changes ? 'details' then
      update public.adventures as a
      set title = case when v_details ? 'title' then v_details ->> 'title' else a.title end,
          status = case when v_details ? 'status' then v_details ->> 'status' else a.status end,
          next_step = case when v_details ? 'next_step' then v_details ->> 'next_step' else a.next_step end,
          reference = case when v_details ? 'reference' then v_details ->> 'reference' else a.reference end,
          description = case when v_details ? 'description' then v_details ->> 'description' else a.description end
      where a.id = p_adventure_id;
      if not found then
        raise exception 'adventure_unavailable';
      end if;
      v_fields := (select count(*)::integer from jsonb_object_keys(v_details));
    end if;

    -- Updates are filtered by the expected version, so an objective that changed, was removed,
    -- or belongs to another adventure matches nothing and fails the whole apply.
    for v_item in select e.value from jsonb_array_elements(v_update) as e (value) loop
      update public.adventure_objectives as o
      set title = case when v_item ? 'title' then v_item ->> 'title' else o.title end,
          done = case when v_item ? 'done' then (v_item ->> 'done')::boolean else o.done end
      where o.id = (v_item ->> 'id')::uuid
        and o.adventure_id = p_adventure_id
        and o.updated_at = (v_expected_objectives ->> (v_item ->> 'id'))::timestamptz;
      if not found then
        raise exception 'handoff_conflict';
      end if;
      v_changed := v_changed + 1;
    end loop;

    -- Adds last. The objective cap trigger still runs for every row.
    for v_title in
      select e.value #>> '{}'
      from jsonb_array_elements(v_add) with ordinality as e (value, n)
      order by e.n
    loop
      insert into public.adventure_objectives (adventure_id, title)
      values (p_adventure_id, v_title)
      returning id into v_new_id;
      v_object_ids := v_object_ids || v_new_id;
      v_added := v_added + 1;
    end loop;

    if p_changes ? 'update' then
      insert into public.adventure_updates (adventure_id, body)
      values (p_adventure_id, p_changes ->> 'update')
      returning id into v_update_id;
    end if;

    v_applied := jsonb_build_object(
      'fields', coalesce(
        (select jsonb_agg(k.key order by k.key) from jsonb_object_keys(v_details) as k (key)),
        '[]'::jsonb
      ),
      'objectives_added', v_added,
      'objectives_changed', v_changed,
      'update', v_update_id is not null
    );

    return private.record_adventure_handoff(
      p_adventure_id, 'attach', p_source_text, v_label, v_applied,
      v_fields + v_added + v_changed + case when v_update_id is not null then 1 else 0 end,
      v_object_ids, v_update_id
    );
  exception
    when check_violation or not_null_violation or numeric_value_out_of_range
      or invalid_text_representation or string_data_right_truncation
    then
      raise invalid_parameter_value using message = 'handoff_values_invalid';
  end;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- public.create_adventure_from_handoff
-- ---------------------------------------------------------------------------------------------

create function public.create_adventure_from_handoff(
  p_campaign_id uuid,
  p_type text,
  p_character_id uuid,
  p_changes jsonb,
  p_source_text text,
  p_source_label text default null
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_label text := private.normalize_handoff_label(p_source_label);
  v_details jsonb;
  v_add jsonb;
  v_title text;
  v_id uuid;
  v_new_id uuid;
  v_object_ids uuid[] := array[]::uuid[];
  v_update_id uuid;
  v_added integer := 0;
  v_applied jsonb;
begin
  if p_campaign_id is null
    or p_changes is null
    or not private.handoff_changes_are_valid(p_changes, 'new')
  then
    raise invalid_parameter_value using message = 'handoff_invalid';
  end if;

  v_details := p_changes -> 'details';
  v_add := coalesce(p_changes #> '{objectives,add}', '[]'::jsonb);

  begin
    -- Membership, the campaign lock, the character, and the creator cap are create_adventure's.
    -- A new personal or side adventure is private to its creator's character.
    v_id := public.create_adventure(
      p_campaign_id,
      p_type,
      v_details ->> 'title',
      p_character_id,
      v_details ->> 'next_step',
      v_details ->> 'description'
    );

    -- create_adventure takes no status or reference.
    if v_details ? 'status' or v_details ? 'reference' then
      update public.adventures as a
      set status = case when v_details ? 'status' then v_details ->> 'status' else a.status end,
          reference = case when v_details ? 'reference' then v_details ->> 'reference' else a.reference end
      where a.id = v_id;
      if not found then
        raise exception 'adventure_unavailable';
      end if;
    end if;

    for v_title in
      select e.value #>> '{}'
      from jsonb_array_elements(v_add) with ordinality as e (value, n)
      order by e.n
    loop
      insert into public.adventure_objectives (adventure_id, title)
      values (v_id, v_title)
      returning id into v_new_id;
      v_object_ids := v_object_ids || v_new_id;
      v_added := v_added + 1;
    end loop;

    if p_changes ? 'update' then
      insert into public.adventure_updates (adventure_id, body)
      values (v_id, p_changes ->> 'update')
      returning id into v_update_id;
    end if;

    v_applied := jsonb_build_object(
      'fields', (select jsonb_agg(k.key order by k.key) from jsonb_object_keys(v_details) as k (key)),
      'objectives_added', v_added,
      'objectives_changed', 0,
      'update', v_update_id is not null
    );

    perform private.record_adventure_handoff(
      v_id, 'new', p_source_text, v_label, v_applied,
      (select count(*)::integer from jsonb_object_keys(v_details))
        + v_added + case when v_update_id is not null then 1 else 0 end,
      v_object_ids, v_update_id
    );
  exception
    when check_violation or not_null_violation or numeric_value_out_of_range
      or invalid_text_representation or string_data_right_truncation
    then
      raise invalid_parameter_value using message = 'handoff_values_invalid';
  end;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------

revoke all on function private.normalize_handoff_label(text)
  from public, anon, authenticated, service_role;
revoke all on function private.handoff_changes_are_valid(jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function private.lock_handoff_target(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.record_adventure_handoff(uuid, text, text, text, jsonb, integer, uuid[], uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.attach_adventure_handoff(uuid, jsonb, jsonb, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.create_adventure_from_handoff(uuid, text, uuid, jsonb, text, text)
  from public, anon, authenticated, service_role;

-- The invoker RPCs call the helpers as the signed-in user, so those need EXECUTE too. The private
-- schema is not exposed through the API, so clients still cannot call them.
grant execute on function private.normalize_handoff_label(text) to authenticated;
grant execute on function private.handoff_changes_are_valid(jsonb, text) to authenticated;
grant execute on function private.lock_handoff_target(uuid) to authenticated;
grant execute on function private.record_adventure_handoff(uuid, text, text, text, jsonb, integer, uuid[], uuid)
  to authenticated;
grant execute on function public.attach_adventure_handoff(uuid, jsonb, jsonb, text, text)
  to authenticated;
grant execute on function public.create_adventure_from_handoff(uuid, text, uuid, jsonb, text, text)
  to authenticated;

commit;
