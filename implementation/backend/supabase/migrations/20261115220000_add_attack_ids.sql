begin;

-- M03.8 Phase 1 (D12): every attack in a sheet body carries an id, so an update can target an
-- attack exactly. Three steps in one transaction:
--   1. backfill ids on existing attacks (order and every other key are kept),
--   2. replace private.character_sheet_is_valid so each attack needs a unique lowercase UUID id,
--   3. verify that no stored sheet violates the new rule (create or replace does not re-check
--      existing rows, so the migration raises and rolls back if any does).
-- The 64 KiB body limit is still enforced by character_sheets_sheet_check while step 1 runs, so a
-- sheet that would no longer fit makes the migration fail instead of being altered.

-- 1. Backfill. An attack keeps its id only when it is a lowercase UUID string that no earlier
-- attack in the same sheet already uses. Sheets with no attacks are not touched.
with expanded as (
  select
    s.character_id,
    a.ordinality,
    a.value as attack,
    case
      when jsonb_typeof(a.value -> 'id') = 'string'
        and (a.value ->> 'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then a.value ->> 'id'
      else null
    end as valid_id
  from public.character_sheets as s
  cross join lateral jsonb_array_elements(s.sheet -> 'attacks') with ordinality as a (value, ordinality)
  where jsonb_typeof(s.sheet -> 'attacks') = 'array'
    and jsonb_array_length(s.sheet -> 'attacks') > 0
),
ranked as (
  select
    e.*,
    row_number() over (partition by e.character_id, e.valid_id order by e.ordinality) as occurrence
  from expanded as e
),
rebuilt as (
  select
    r.character_id,
    jsonb_agg(
      case
        when r.valid_id is not null and r.occurrence = 1 then r.attack
        else r.attack || jsonb_build_object('id', gen_random_uuid()::text)
      end
      order by r.ordinality
    ) as attacks
  from ranked as r
  group by r.character_id
)
update public.character_sheets as s
set sheet = jsonb_set(s.sheet, '{attacks}', rebuilt.attacks)
from rebuilt
where s.character_id = rebuilt.character_id
  and s.sheet -> 'attacks' is distinct from rebuilt.attacks;

-- 2. The validator. Same signature and grants (create or replace keeps both); only the attacks
-- block is new.
create or replace function private.character_sheet_is_valid(p_sheet jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  top_keys constant text[] := array[
    'version', 'abilities', 'saving_throws', 'skills', 'attacks',
    'features', 'spells', 'notes', 'alignment', 'experience'
  ];
  ability_keys constant text[] := array['str', 'dex', 'con', 'int', 'wis', 'cha'];
  skill_keys constant text[] := array[
    'acrobatics', 'animal_handling', 'arcana', 'athletics', 'deception', 'history',
    'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
    'performance', 'persuasion', 'religion', 'sleight_of_hand', 'stealth', 'survival'
  ];
  entry record;
  element jsonb;
  seen text[] := array[]::text[];
  attack_ids text[] := array[]::text[];
begin
  if p_sheet is null or jsonb_typeof(p_sheet) <> 'object' then
    return false;
  end if;

  for entry in select key, value from jsonb_each(p_sheet) loop
    if not entry.key = any (top_keys) then
      return false;
    end if;
  end loop;

  if p_sheet ? 'version' and p_sheet -> 'version' <> '1'::jsonb then
    return false;
  end if;

  if p_sheet ? 'abilities' then
    if jsonb_typeof(p_sheet -> 'abilities') <> 'object' then
      return false;
    end if;
    for entry in select key, value from jsonb_each(p_sheet -> 'abilities') loop
      if not entry.key = any (ability_keys)
        or jsonb_typeof(entry.value) <> 'number'
        or (entry.value #>> '{}')::numeric <> trunc((entry.value #>> '{}')::numeric)
        or (entry.value #>> '{}')::numeric not between 1 and 30
      then
        return false;
      end if;
    end loop;
  end if;

  if p_sheet ? 'saving_throws' then
    if jsonb_typeof(p_sheet -> 'saving_throws') <> 'array' then
      return false;
    end if;
    for element in select value from jsonb_array_elements(p_sheet -> 'saving_throws') loop
      if jsonb_typeof(element) <> 'string'
        or not (element #>> '{}') = any (ability_keys)
        or (element #>> '{}') = any (seen)
      then
        return false;
      end if;
      seen := seen || (element #>> '{}');
    end loop;
  end if;

  if p_sheet ? 'skills' then
    if jsonb_typeof(p_sheet -> 'skills') <> 'object' then
      return false;
    end if;
    for entry in select key, value from jsonb_each(p_sheet -> 'skills') loop
      if not entry.key = any (skill_keys)
        or jsonb_typeof(entry.value) <> 'string'
        or (entry.value #>> '{}') not in ('proficient', 'expertise')
      then
        return false;
      end if;
    end loop;
  end if;

  if p_sheet ? 'attacks' then
    if jsonb_typeof(p_sheet -> 'attacks') <> 'array'
      or jsonb_array_length(p_sheet -> 'attacks') > 30
    then
      return false;
    end if;
    for element in select value from jsonb_array_elements(p_sheet -> 'attacks') loop
      if jsonb_typeof(element) <> 'object'
        or jsonb_typeof(element -> 'id') is distinct from 'string'
        or (element ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        or (element ->> 'id') = any (attack_ids)
      then
        return false;
      end if;
      attack_ids := attack_ids || (element ->> 'id');
    end loop;
  end if;

  if p_sheet ? 'features' and jsonb_typeof(p_sheet -> 'features') <> 'string' then
    return false;
  end if;
  if p_sheet ? 'spells' and jsonb_typeof(p_sheet -> 'spells') <> 'string' then
    return false;
  end if;
  if p_sheet ? 'notes' and jsonb_typeof(p_sheet -> 'notes') <> 'string' then
    return false;
  end if;
  if p_sheet ? 'alignment' and jsonb_typeof(p_sheet -> 'alignment') <> 'string' then
    return false;
  end if;

  if p_sheet ? 'experience' and jsonb_typeof(p_sheet -> 'experience') <> 'null' then
    if jsonb_typeof(p_sheet -> 'experience') <> 'number'
      or (p_sheet ->> 'experience')::numeric <> trunc((p_sheet ->> 'experience')::numeric)
      or (p_sheet ->> 'experience')::numeric not between 0 and 1000000
    then
      return false;
    end if;
  end if;

  return true;
end;
$$;

-- 3. Verify every stored body against the new rule and the size limit.
do $$
declare
  v_invalid integer;
begin
  select count(*) into v_invalid
  from public.character_sheets as s
  where not private.character_sheet_is_valid(s.sheet) or octet_length(s.sheet::text) > 65536;
  if v_invalid > 0 then
    raise exception 'add_attack_ids: % sheet(s) do not satisfy the new attack-id rule', v_invalid;
  end if;
end;
$$;

commit;
