begin;

-- M03.8 Phase 1: character imports (plan §3.2-§3.6).
--   * public.character_imports: provenance rows, readable like the sheet, written only through
--     private.record_character_import.
--   * public.import_character / public.apply_character_update: SECURITY INVOKER, so every
--     existing grant, policy, guard trigger, and check constraint decides each write exactly as
--     it does for the sheet editor. The functions only make the writes succeed or fail together.
--   * Small private helpers validate the payload shape. They read no tables.
--
-- Lock order. The inner coin function (security definer) locks campaigns -> character_sheets,
-- the same order as every other character RPC and the departure hook. An invoker function cannot
-- lock the campaign row itself (members have no UPDATE policy on it), so apply_character_update
-- takes that prelude by calling adjust_character_currency with zero deltas first. That call
-- returns "unavailable" for unknown, inaccessible, and departed characters, locks the campaign
-- FOR SHARE and the sheet FOR UPDATE, and changes nothing. The character row is locked after it.

-- ---------------------------------------------------------------------------------------------
-- Payload helpers
-- ---------------------------------------------------------------------------------------------

create function private.import_has_only_keys(p_value jsonb, p_allowed text[])
returns boolean
language plpgsql immutable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    return false;
  end if;
  return not exists (
    select 1 from jsonb_object_keys(p_value) as k (key) where k.key <> all (p_allowed)
  );
end;
$$;

create function private.import_is_integer(p_value jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
begin
  if p_value is null or jsonb_typeof(p_value) <> 'number' then
    return false;
  end if;
  return (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric);
end;
$$;

create function private.import_is_uuid(p_value jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'string'
    and (p_value #>> '{}') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    false
  );
$$;

-- Shape of one item. 'add': a new row (name required, no id). 'update': an id plus at least
-- one field to change. Values are bounded by the table's own checks, not here.
create function private.import_item_is_valid(p_item jsonb, p_mode text)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  field_keys constant text[] := array['name', 'quantity', 'weight', 'description', 'equipped', 'attuned'];
  v_key text;
  v_value jsonb;
begin
  if not private.import_has_only_keys(
    p_item,
    case when p_mode = 'update' then field_keys || 'id'::text else field_keys end
  ) then
    return false;
  end if;

  if p_mode = 'add' then
    if not p_item ? 'name' then
      return false;
    end if;
    if p_item ? 'id' then
      return false;
    end if;
  elsif p_mode = 'update' then
    if not private.import_is_uuid(p_item -> 'id') then
      return false;
    end if;
    if not exists (select 1 from jsonb_object_keys(p_item) as k (key) where k.key <> 'id') then
      return false;
    end if;
  else
    return false;
  end if;

  for v_key, v_value in select key, value from jsonb_each(p_item) loop
    if v_key = 'id' then
      continue;
    elsif v_key = 'name' then
      if jsonb_typeof(v_value) <> 'string' then return false; end if;
    elsif v_key = 'quantity' then
      if not private.import_is_integer(v_value) then return false; end if;
    elsif v_key = 'weight' then
      if jsonb_typeof(v_value) not in ('number', 'null') then return false; end if;
    elsif v_key = 'description' then
      if jsonb_typeof(v_value) not in ('string', 'null') then return false; end if;
    elsif v_key in ('equipped', 'attuned') then
      if jsonb_typeof(v_value) <> 'boolean' then return false; end if;
    end if;
  end loop;

  return true;
end;
$$;

-- Shape of character details. 'new': name required. 'change': any subset, at least one key.
create function private.import_details_are_valid(p_details jsonb, p_require_name boolean)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  v_key text;
  v_value jsonb;
begin
  if not private.import_has_only_keys(
    p_details, array['name', 'species', 'class_name', 'subclass', 'background', 'level']
  ) then
    return false;
  end if;
  if p_require_name and jsonb_typeof(p_details -> 'name') is distinct from 'string' then
    return false;
  end if;
  if not p_require_name and not exists (select 1 from jsonb_object_keys(p_details)) then
    return false;
  end if;

  for v_key, v_value in select key, value from jsonb_each(p_details) loop
    if v_key = 'name' then
      if jsonb_typeof(v_value) <> 'string' then return false; end if;
    elsif v_key = 'level' then
      if not private.import_is_integer(v_value) then return false; end if;
    elsif jsonb_typeof(v_value) not in ('string', 'null') then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- Shape of vitals. At least one key unless p_allow_empty. temp_hp cannot be null.
create function private.import_vitals_are_valid(p_vitals jsonb, p_allow_empty boolean)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  v_key text;
  v_value jsonb;
begin
  if not private.import_has_only_keys(
    p_vitals, array['max_hp', 'current_hp', 'temp_hp', 'armor_class', 'speed']
  ) then
    return false;
  end if;
  if not p_allow_empty and not exists (select 1 from jsonb_object_keys(p_vitals)) then
    return false;
  end if;

  for v_key, v_value in select key, value from jsonb_each(p_vitals) loop
    if not (
      private.import_is_integer(v_value)
      or (v_key <> 'temp_hp' and jsonb_typeof(v_value) = 'null')
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- Shape of coins: cp, sp, gp only, each an integer within the purse bounds.
create function private.import_coins_are_valid(p_coins jsonb, p_allow_empty boolean)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  v_value jsonb;
begin
  if not private.import_has_only_keys(p_coins, array['cp', 'sp', 'gp']) then
    return false;
  end if;
  if not p_allow_empty and not exists (select 1 from jsonb_object_keys(p_coins)) then
    return false;
  end if;

  for v_value in select value from jsonb_each(p_coins) loop
    if not private.import_is_integer(v_value)
      or (v_value #>> '{}')::numeric not between 0 and 9999999
    then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- Source label (D10): trimmed, empty becomes null, otherwise 1-120 characters, no control
-- characters.
create function private.normalize_import_label(p_label text)
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
    raise invalid_parameter_value using message = 'import_source_invalid';
  end if;
  return v_label;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Provenance (D10)
-- ---------------------------------------------------------------------------------------------

create table public.character_imports (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  imported_by uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  source_label text,
  change_count integer not null,
  imported_at timestamptz not null default now(),

  constraint character_imports_kind_check check (kind in ('new', 'update')),
  constraint character_imports_source_label_check check (
    source_label is null
    or (source_label = btrim(source_label)
        and char_length(source_label) between 1 and 120
        and source_label !~ '[[:cntrl:]]')
  ),
  constraint character_imports_change_count_check check (change_count >= 0)
);

create index character_imports_character_imported_at_idx
  on public.character_imports (character_id, imported_at desc);
-- The profiles FK cascade.
create index character_imports_imported_by_idx on public.character_imports (imported_by);

alter table public.character_imports enable row level security;

revoke all on table public.character_imports from public, anon, authenticated, service_role;
grant select on table public.character_imports to authenticated;

-- Same visibility as the sheet: the owner always, other current members when it is shared.
-- The subquery is filtered by the characters SELECT policy (membership of both sides).
create policy "Owners and shared members read import history"
  on public.character_imports for select to authenticated
  using (
    exists (
      select 1 from public.characters as c
      where c.id = character_imports.character_id
        and (c.owner_id = (select auth.uid()) or c.sheet_visibility = 'campaign')
    )
  );

-- The only write path. Clients have no INSERT, UPDATE, or DELETE privilege, and the private
-- schema is not exposed through the API.
create function private.record_character_import(
  p_character_id uuid,
  p_kind text,
  p_source_label text,
  p_change_count integer
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'character_unavailable';
  end if;
  if p_kind is null or p_kind not in ('new', 'update') or p_change_count is null or p_change_count < 0 then
    raise invalid_parameter_value using message = 'import_invalid';
  end if;

  -- The caller must own the character and still be a member of its campaign.
  if not exists (
    select 1
    from public.characters as c
    join public.campaign_members as m
      on m.campaign_id = c.campaign_id and m.profile_id = c.owner_id
    where c.id = p_character_id and c.owner_id = caller_id
  ) then
    raise exception 'character_unavailable';
  end if;

  insert into public.character_imports (character_id, imported_by, kind, source_label, change_count)
  values (p_character_id, caller_id, p_kind, private.normalize_import_label(p_source_label), p_change_count);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- public.import_character
-- ---------------------------------------------------------------------------------------------

create function public.import_character(
  p_campaign_id uuid,
  p_character jsonb,
  p_source_label text default null
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_label text := private.normalize_import_label(p_source_label);
  v_details jsonb;
  v_vitals jsonb;
  v_items jsonb;
  v_coins jsonb;
  v_item jsonb;
  v_character_id uuid;
  v_cp integer;
  v_sp integer;
  v_gp integer;
  v_coin_change integer;
begin
  -- Shape. Status, in_party, sheet_visibility, and portrait_path are not keys, so they fail here.
  if not private.import_has_only_keys(p_character, array['details', 'vitals', 'sheet', 'items', 'coins'])
    or not p_character ?& array['details', 'vitals', 'sheet', 'items', 'coins']
  then
    raise invalid_parameter_value using message = 'import_invalid';
  end if;

  v_details := p_character -> 'details';
  v_vitals := p_character -> 'vitals';
  v_items := p_character -> 'items';
  v_coins := p_character -> 'coins';

  if not private.import_details_are_valid(v_details, true)
    or not private.import_vitals_are_valid(v_vitals, true)
    or jsonb_typeof(p_character -> 'sheet') <> 'object'
    or jsonb_typeof(v_items) <> 'array'
    or jsonb_array_length(v_items) > 200
    or not private.import_coins_are_valid(v_coins, true)
  then
    raise invalid_parameter_value using message = 'import_invalid';
  end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    if not private.import_item_is_valid(v_item, 'add') then
      raise invalid_parameter_value using message = 'import_invalid';
    end if;
  end loop;

  begin
    -- Membership, the campaign lock, and the one-active rule are create_character's.
    v_character_id := public.create_character(
      p_campaign_id,
      v_details ->> 'name',
      v_details ->> 'species',
      v_details ->> 'class_name',
      v_details ->> 'subclass',
      v_details ->> 'background',
      coalesce((v_details ->> 'level')::integer, 1),
      false
    );

    update public.character_sheets as s
    set max_hp = (v_vitals ->> 'max_hp')::integer,
        current_hp = (v_vitals ->> 'current_hp')::integer,
        temp_hp = coalesce((v_vitals ->> 'temp_hp')::integer, 0),
        armor_class = (v_vitals ->> 'armor_class')::integer,
        speed = (v_vitals ->> 'speed')::integer,
        sheet = p_character -> 'sheet'
    where s.character_id = v_character_id;
    if not found then
      raise exception 'character_unavailable';
    end if;

    -- The item cap trigger still runs for every row.
    insert into public.character_items (character_id, name, quantity, weight, description, equipped, attuned)
    select v_character_id, x.name, coalesce(x.quantity, 1), x.weight, x.description,
           coalesce(x.equipped, false), coalesce(x.attuned, false)
    from rows from (
      jsonb_to_recordset(v_items) as (
        name text, quantity integer, weight numeric, description text, equipped boolean, attuned boolean
      )
    ) with ordinality as x
    order by x.ordinality;

    v_cp := coalesce((v_coins ->> 'cp')::integer, 0);
    v_sp := coalesce((v_coins ->> 'sp')::integer, 0);
    v_gp := coalesce((v_coins ->> 'gp')::integer, 0);
    v_coin_change := case when v_cp <> 0 or v_sp <> 0 or v_gp <> 0 then 1 else 0 end;
    if v_coin_change = 1 then
      perform public.adjust_character_currency(v_character_id, v_cp, v_sp, v_gp);
    end if;

    perform private.record_character_import(
      v_character_id, 'new', v_label, 1 + jsonb_array_length(v_items) + v_coin_change
    );
  exception
    when check_violation or not_null_violation or numeric_value_out_of_range
      or invalid_text_representation or string_data_right_truncation
    then
      raise invalid_parameter_value using message = 'import_values_invalid';
  end;

  return v_character_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- public.apply_character_update
-- ---------------------------------------------------------------------------------------------

create function public.apply_character_update(
  p_character_id uuid,
  p_expected jsonb,
  p_changes jsonb,
  p_source_label text default null
)
returns timestamptz
language plpgsql security invoker set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_label text := private.normalize_import_label(p_source_label);
  v_details jsonb;
  v_vitals jsonb;
  v_items jsonb;
  v_coins jsonb;
  v_has_sheet boolean;
  v_expected_character timestamptz;
  v_expected_sheet timestamptz;
  v_expected_items jsonb;
  v_add jsonb;
  v_update jsonb;
  v_remove jsonb;
  v_item jsonb;
  v_id text;
  v_key text;
  v_value jsonb;
  cur record;
  v_current_character timestamptz;
  v_dcp integer;
  v_dsp integer;
  v_dgp integer;
  v_count integer;
  v_result timestamptz;
begin
  if p_character_id is null then
    raise invalid_parameter_value using message = 'import_invalid';
  end if;

  -- Expected versions.
  if not private.import_has_only_keys(p_expected, array['character_updated_at', 'sheet_updated_at', 'items'])
    or not p_expected ?& array['character_updated_at', 'sheet_updated_at', 'items']
    or jsonb_typeof(p_expected -> 'character_updated_at') <> 'string'
    or jsonb_typeof(p_expected -> 'sheet_updated_at') <> 'string'
    or jsonb_typeof(p_expected -> 'items') <> 'object'
  then
    raise invalid_parameter_value using message = 'import_invalid';
  end if;
  v_expected_items := p_expected -> 'items';
  begin
    v_expected_character := (p_expected ->> 'character_updated_at')::timestamptz;
    v_expected_sheet := (p_expected ->> 'sheet_updated_at')::timestamptz;
    for v_key, v_value in select key, value from jsonb_each(v_expected_items) loop
      if v_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or jsonb_typeof(v_value) <> 'string'
      then
        raise invalid_parameter_value using message = 'import_invalid';
      end if;
      perform (v_value #>> '{}')::timestamptz;
    end loop;
  exception
    when invalid_datetime_format or datetime_field_overflow or invalid_text_representation then
      raise invalid_parameter_value using message = 'import_invalid';
  end;

  -- Changes. Status, in_party, sheet_visibility, and portrait_path are not keys (D8).
  if not private.import_has_only_keys(
    p_changes, array['details', 'vitals', 'sheet', 'items', 'coins', 'change_count']
  ) or not (p_changes ?| array['details', 'vitals', 'sheet', 'items', 'coins']) then
    raise invalid_parameter_value using message = 'import_invalid';
  end if;

  v_details := p_changes -> 'details';
  v_vitals := p_changes -> 'vitals';
  v_items := p_changes -> 'items';
  v_coins := p_changes -> 'coins';
  v_has_sheet := p_changes ? 'sheet';

  if (p_changes ? 'details' and not private.import_details_are_valid(v_details, false))
    or (p_changes ? 'vitals' and not private.import_vitals_are_valid(v_vitals, false))
    or (v_has_sheet and jsonb_typeof(p_changes -> 'sheet') <> 'object')
    or (p_changes ? 'coins' and not private.import_coins_are_valid(v_coins, false))
    or (p_changes ? 'change_count'
        and (not private.import_is_integer(p_changes -> 'change_count')
             or (p_changes ->> 'change_count')::numeric not between 1 and 100000))
  then
    raise invalid_parameter_value using message = 'import_invalid';
  end if;

  if p_changes ? 'items' then
    if not private.import_has_only_keys(v_items, array['add', 'update', 'remove']) then
      raise invalid_parameter_value using message = 'import_invalid';
    end if;
    v_add := coalesce(v_items -> 'add', '[]'::jsonb);
    v_update := coalesce(v_items -> 'update', '[]'::jsonb);
    v_remove := coalesce(v_items -> 'remove', '[]'::jsonb);
    if jsonb_typeof(v_add) <> 'array' or jsonb_typeof(v_update) <> 'array' or jsonb_typeof(v_remove) <> 'array'
      or jsonb_array_length(v_add) + jsonb_array_length(v_update) + jsonb_array_length(v_remove) = 0
      or jsonb_array_length(v_add) > 200
      or jsonb_array_length(v_update) > 200
      or jsonb_array_length(v_remove) > 200
    then
      raise invalid_parameter_value using message = 'import_invalid';
    end if;
    for v_item in select value from jsonb_array_elements(v_add) loop
      if not private.import_item_is_valid(v_item, 'add') then
        raise invalid_parameter_value using message = 'import_invalid';
      end if;
    end loop;
    for v_item in select value from jsonb_array_elements(v_update) loop
      if not private.import_item_is_valid(v_item, 'update') then
        raise invalid_parameter_value using message = 'import_invalid';
      end if;
    end loop;
    for v_value in select value from jsonb_array_elements(v_remove) loop
      if not private.import_is_uuid(v_value) then
        raise invalid_parameter_value using message = 'import_invalid';
      end if;
    end loop;

    -- Every targeted item needs an expected version, and no item is targeted twice.
    if exists (
      select 1
      from (
        select value #>> '{}' as id from jsonb_array_elements(v_remove)
        union all
        select value ->> 'id' from jsonb_array_elements(v_update)
      ) as targets
      where not v_expected_items ? targets.id
    ) or (
      select count(*) <> count(distinct targets.id)
      from (
        select value #>> '{}' as id from jsonb_array_elements(v_remove)
        union all
        select value ->> 'id' from jsonb_array_elements(v_update)
      ) as targets
    ) then
      raise invalid_parameter_value using message = 'import_invalid';
    end if;
  end if;

  -- Lock the campaign (FOR SHARE) and the sheet (FOR UPDATE) through the coin function, which
  -- reports the same "unavailable" error for unknown, inaccessible, other people's, and departed
  -- characters. Zero deltas change and log nothing.
  select * into cur from public.adjust_character_currency(p_character_id, 0, 0, 0);

  select c.updated_at into v_current_character
  from public.characters as c
  where c.id = p_character_id and c.owner_id = caller_id
  for update of c;
  if not found then
    raise exception 'character_unavailable';
  end if;

  -- Strict concurrency (§4.3): any change since the review was loaded fails the whole update.
  if v_current_character is distinct from v_expected_character
    or cur.updated_at is distinct from v_expected_sheet
  then
    raise exception 'import_conflict';
  end if;

  begin
    if p_changes ? 'details' then
      update public.characters as c
      set name = case when v_details ? 'name' then v_details ->> 'name' else c.name end,
          species = case when v_details ? 'species' then v_details ->> 'species' else c.species end,
          class_name = case when v_details ? 'class_name' then v_details ->> 'class_name' else c.class_name end,
          subclass = case when v_details ? 'subclass' then v_details ->> 'subclass' else c.subclass end,
          background = case when v_details ? 'background' then v_details ->> 'background' else c.background end,
          level = case when v_details ? 'level' then (v_details ->> 'level')::integer else c.level end
      where c.id = p_character_id;
    end if;

    if p_changes ? 'vitals' or v_has_sheet then
      update public.character_sheets as s
      set max_hp = case when v_vitals ? 'max_hp' then (v_vitals ->> 'max_hp')::integer else s.max_hp end,
          current_hp = case when v_vitals ? 'current_hp' then (v_vitals ->> 'current_hp')::integer else s.current_hp end,
          temp_hp = case when v_vitals ? 'temp_hp' then (v_vitals ->> 'temp_hp')::integer else s.temp_hp end,
          armor_class = case when v_vitals ? 'armor_class' then (v_vitals ->> 'armor_class')::integer else s.armor_class end,
          speed = case when v_vitals ? 'speed' then (v_vitals ->> 'speed')::integer else s.speed end,
          sheet = case when v_has_sheet then p_changes -> 'sheet' else s.sheet end
      where s.character_id = p_character_id;
    end if;

    if p_changes ? 'items' then
      -- Removes and updates are filtered by the expected version, so an item that changed, was
      -- removed, or belongs to another character matches nothing and fails the whole update.
      for v_id in select value #>> '{}' from jsonb_array_elements(v_remove) loop
        delete from public.character_items as i
        where i.id = v_id::uuid
          and i.character_id = p_character_id
          and i.updated_at = (v_expected_items ->> v_id)::timestamptz;
        if not found then
          raise exception 'import_conflict';
        end if;
      end loop;

      for v_item in select value from jsonb_array_elements(v_update) loop
        update public.character_items as i
        set name = case when v_item ? 'name' then v_item ->> 'name' else i.name end,
            quantity = case when v_item ? 'quantity' then (v_item ->> 'quantity')::integer else i.quantity end,
            weight = case when v_item ? 'weight' then (v_item ->> 'weight')::numeric else i.weight end,
            description = case when v_item ? 'description' then v_item ->> 'description' else i.description end,
            equipped = case when v_item ? 'equipped' then (v_item ->> 'equipped')::boolean else i.equipped end,
            attuned = case when v_item ? 'attuned' then (v_item ->> 'attuned')::boolean else i.attuned end
        where i.id = (v_item ->> 'id')::uuid
          and i.character_id = p_character_id
          and i.updated_at = (v_expected_items ->> (v_item ->> 'id'))::timestamptz;
        if not found then
          raise exception 'import_conflict';
        end if;
      end loop;

      -- Adds last, so removing items frees room under the cap.
      insert into public.character_items (character_id, name, quantity, weight, description, equipped, attuned)
      select p_character_id, x.name, coalesce(x.quantity, 1), x.weight, x.description,
             coalesce(x.equipped, false), coalesce(x.attuned, false)
      from rows from (
        jsonb_to_recordset(v_add) as (
          name text, quantity integer, weight numeric, description text, equipped boolean, attuned boolean
        )
      ) with ordinality as x
      order by x.ordinality;
    end if;

    -- Coins are target balances (D6); the deltas come from the balances read under the lock.
    if p_changes ? 'coins' then
      v_dcp := coalesce((v_coins ->> 'cp')::integer, cur.cp) - cur.cp;
      v_dsp := coalesce((v_coins ->> 'sp')::integer, cur.sp) - cur.sp;
      v_dgp := coalesce((v_coins ->> 'gp')::integer, cur.gp) - cur.gp;
      if v_dcp <> 0 or v_dsp <> 0 or v_dgp <> 0 then
        perform public.adjust_character_currency(p_character_id, v_dcp, v_dsp, v_dgp);
      end if;
    end if;

    v_count := coalesce(
      (p_changes ->> 'change_count')::integer,
      coalesce((select count(*)::integer from jsonb_object_keys(v_details)), 0)
        + coalesce((select count(*)::integer from jsonb_object_keys(v_vitals)), 0)
        + case when v_has_sheet then 1 else 0 end
        + coalesce(jsonb_array_length(v_add), 0)
        + coalesce(jsonb_array_length(v_update), 0)
        + coalesce(jsonb_array_length(v_remove), 0)
        + coalesce((select count(*)::integer from jsonb_object_keys(v_coins)), 0)
    );

    perform private.record_character_import(p_character_id, 'update', v_label, v_count);
  exception
    when check_violation or not_null_violation or numeric_value_out_of_range
      or invalid_text_representation or string_data_right_truncation
    then
      raise invalid_parameter_value using message = 'import_values_invalid';
  end;

  select s.updated_at into v_result
  from public.character_sheets as s
  where s.character_id = p_character_id;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------------

revoke all on function private.import_has_only_keys(jsonb, text[])
  from public, anon, authenticated, service_role;
revoke all on function private.import_is_integer(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.import_is_uuid(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.import_item_is_valid(jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function private.import_details_are_valid(jsonb, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.import_vitals_are_valid(jsonb, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.import_coins_are_valid(jsonb, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.normalize_import_label(text)
  from public, anon, authenticated, service_role;
revoke all on function private.record_character_import(uuid, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.import_character(uuid, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_character_update(uuid, jsonb, jsonb, text)
  from public, anon, authenticated, service_role;

-- The invoker RPCs call the helpers as the signed-in user, so those need EXECUTE too.
grant execute on function private.import_has_only_keys(jsonb, text[]) to authenticated;
grant execute on function private.import_is_integer(jsonb) to authenticated;
grant execute on function private.import_is_uuid(jsonb) to authenticated;
grant execute on function private.import_item_is_valid(jsonb, text) to authenticated;
grant execute on function private.import_details_are_valid(jsonb, boolean) to authenticated;
grant execute on function private.import_vitals_are_valid(jsonb, boolean) to authenticated;
grant execute on function private.import_coins_are_valid(jsonb, boolean) to authenticated;
grant execute on function private.normalize_import_label(text) to authenticated;
grant execute on function private.record_character_import(uuid, text, text, integer) to authenticated;
grant execute on function public.import_character(uuid, jsonb, text) to authenticated;
grant execute on function public.apply_character_update(uuid, jsonb, jsonb, text) to authenticated;

commit;
