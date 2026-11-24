begin;

-- M04 Phase 2 (L3, L5, L7): atomic HP, tracker, rest, and death-save writes.
-- Prelude for all four (same as the M03.3 RPCs): find the character owned by the caller without
-- a lock, lock the campaign row FOR SHARE (membership changes take NO KEY UPDATE on it, so they
-- serialize with these calls), re-check membership in a fresh statement, then lock the sheet
-- row. Every miss raises the same 'character_unavailable'. Lock order everywhere:
-- campaigns -> character_sheets -> character_resources.

create function private.lock_owned_character_sheet(p_character_id uuid)
returns public.character_sheets
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_campaign_id uuid;
  v_sheet public.character_sheets;
begin
  if p_character_id is null or caller_id is null then
    raise exception 'character_unavailable';
  end if;

  select c.campaign_id into v_campaign_id
  from public.characters as c
  where c.id = p_character_id and c.owner_id = caller_id;
  if not found then
    raise exception 'character_unavailable';
  end if;

  perform 1 from public.campaigns where campaigns.id = v_campaign_id for share of campaigns;
  if not found then
    raise exception 'character_unavailable';
  end if;
  if not exists (
    select 1 from public.campaign_members as m
    where m.campaign_id = v_campaign_id and m.profile_id = caller_id
  ) then
    raise exception 'character_unavailable';
  end if;

  select s.* into v_sheet
  from public.character_sheets as s
  where s.character_id = p_character_id
    and exists (
      select 1 from public.characters as c
      where c.id = s.character_id and c.owner_id = caller_id and c.campaign_id = v_campaign_id
    )
  for update of s;
  if not found then
    raise exception 'character_unavailable';
  end if;
  return v_sheet;
end;
$$;

revoke all on function private.lock_owned_character_sheet(uuid)
  from public, anon, authenticated, service_role;

-- Damage, healing, and temporary HP (L3).
create function public.apply_character_hp(p_character_id uuid, p_kind text, p_amount integer)
returns table (
  current_hp integer,
  temp_hp integer,
  death_save_successes smallint,
  death_save_failures smallint,
  damage_taken integer,
  concentration text,
  updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_sheet public.character_sheets;
  v_current integer;
  v_temp integer;
  v_successes smallint;
  v_failures smallint;
  v_taken integer := 0;
  v_absorbed integer;
begin
  if p_kind is null or p_kind not in ('damage', 'heal', 'temp')
    or p_amount is null or p_amount not between 1 and 9999
  then
    raise invalid_parameter_value using message = 'hp_change_invalid';
  end if;

  v_sheet := private.lock_owned_character_sheet(p_character_id);
  v_current := v_sheet.current_hp;
  v_temp := v_sheet.temp_hp;
  v_successes := v_sheet.death_save_successes;
  v_failures := v_sheet.death_save_failures;

  if p_kind <> 'temp' and (v_sheet.max_hp is null or v_current is null) then
    raise exception 'hp_not_set';
  end if;

  if p_kind = 'damage' then
    v_absorbed := least(v_temp, p_amount);
    v_temp := v_temp - v_absorbed;
    v_taken := p_amount - v_absorbed;
    if v_taken > 0 then
      -- Damage taken at 0 HP is a death-save failure; instant death stays with the player.
      if v_current = 0 then
        v_failures := least(3, v_failures + 1);
      end if;
      v_current := greatest(0, v_current - v_taken);
    end if;
  elsif p_kind = 'heal' then
    if v_current = 0 then
      v_successes := 0;
      v_failures := 0;
    end if;
    v_current := least(v_sheet.max_hp, v_current + p_amount);
  else
    -- Temporary HP do not stack: keep the larger pool.
    v_temp := greatest(v_temp, p_amount);
  end if;

  update public.character_sheets as s
  set current_hp = v_current, temp_hp = v_temp,
      death_save_successes = v_successes, death_save_failures = v_failures
  where s.character_id = p_character_id
  returning s.updated_at into v_sheet.updated_at;

  return query select v_current, v_temp, v_successes, v_failures, v_taken,
    v_sheet.concentration, v_sheet.updated_at;
end;
$$;

-- Spend (negative) or restore (positive) one tracker.
create function public.adjust_character_resource(p_resource_id uuid, p_delta integer)
returns table ("current" integer, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_character_id uuid;
  v_current integer;
  v_maximum integer;
  v_new integer;
  v_updated_at timestamptz;
begin
  if p_resource_id is null then
    raise invalid_parameter_value using message = 'resource_required';
  end if;
  if p_delta is null or p_delta = 0 or p_delta not between -999 and 999 then
    raise invalid_parameter_value using message = 'resource_delta_invalid';
  end if;

  select r.character_id into v_character_id
  from public.character_resources as r
  join public.characters as c on c.id = r.character_id
  where r.id = p_resource_id and c.owner_id = auth.uid();
  if not found then
    raise exception 'resource_unavailable';
  end if;

  perform private.lock_owned_character_sheet(v_character_id);

  select r.current, r.maximum into v_current, v_maximum
  from public.character_resources as r
  where r.id = p_resource_id and r.character_id = v_character_id
  for update of r;
  if not found then
    raise exception 'resource_unavailable';
  end if;

  v_new := v_current + p_delta;
  if v_new < 0 then
    raise exception 'resource_empty';
  end if;
  v_new := least(v_new, v_maximum);

  update public.character_resources as r
  set current = v_new
  where r.id = p_resource_id
  returning r.updated_at into v_updated_at;

  return query select v_new, v_updated_at;
end;
$$;

-- Applies a confirmed rest preview in one transaction (L5). The plan is checked against the rows
-- locked here; nothing is derived on the server.
create function public.take_character_rest(p_character_id uuid, p_kind text, p_plan jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_sheet public.character_sheets;
  v_hp integer;
  v_temp integer;
  v_exhaustion smallint;
  v_successes smallint;
  v_failures smallint;
  v_num numeric;
  v_entry jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_resource record;
  v_result jsonb;
begin
  if p_kind is null or p_kind not in ('short', 'long') then
    raise invalid_parameter_value using message = 'rest_invalid';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object'
    or exists (
      select 1 from jsonb_object_keys(p_plan) as k
      where k <> all (array['hp', 'temp_hp', 'resources', 'exhaustion', 'clear_death_saves'])
    )
  then
    raise invalid_parameter_value using message = 'rest_plan_invalid';
  end if;

  v_sheet := private.lock_owned_character_sheet(p_character_id);
  v_hp := v_sheet.current_hp;
  v_temp := v_sheet.temp_hp;
  v_exhaustion := v_sheet.exhaustion;
  v_successes := v_sheet.death_save_successes;
  v_failures := v_sheet.death_save_failures;

  if p_plan ? 'hp' then
    if v_sheet.max_hp is null then
      raise exception 'hp_not_set';
    end if;
    if p_plan -> 'hp' = '"max"'::jsonb then
      v_hp := v_sheet.max_hp;
    elsif jsonb_typeof(p_plan -> 'hp') = 'number' then
      v_num := (p_plan ->> 'hp')::numeric;
      if v_num <> trunc(v_num) or v_num not between 0 and v_sheet.max_hp then
        raise invalid_parameter_value using message = 'rest_plan_invalid';
      end if;
      v_hp := v_num::integer;
    else
      raise invalid_parameter_value using message = 'rest_plan_invalid';
    end if;
  end if;

  if p_plan ? 'temp_hp' then
    if jsonb_typeof(p_plan -> 'temp_hp') <> 'number' then
      raise invalid_parameter_value using message = 'rest_plan_invalid';
    end if;
    v_num := (p_plan ->> 'temp_hp')::numeric;
    if v_num <> trunc(v_num) or v_num not between 0 and 9999 then
      raise invalid_parameter_value using message = 'rest_plan_invalid';
    end if;
    v_temp := v_num::integer;
  end if;

  if p_plan ? 'exhaustion' then
    if jsonb_typeof(p_plan -> 'exhaustion') <> 'number' then
      raise invalid_parameter_value using message = 'rest_plan_invalid';
    end if;
    v_num := (p_plan ->> 'exhaustion')::numeric;
    if v_num <> trunc(v_num) or v_num not between -6 and 6 then
      raise invalid_parameter_value using message = 'rest_plan_invalid';
    end if;
    v_exhaustion := least(6, greatest(0, v_exhaustion + v_num::integer));
  end if;

  if p_plan ? 'clear_death_saves' then
    if p_plan -> 'clear_death_saves' not in ('true'::jsonb, 'false'::jsonb) then
      raise invalid_parameter_value using message = 'rest_plan_invalid';
    end if;
    if (p_plan -> 'clear_death_saves') = 'true'::jsonb then
      v_successes := 0;
      v_failures := 0;
    end if;
  end if;

  if p_plan ? 'resources' then
    if jsonb_typeof(p_plan -> 'resources') <> 'array' or jsonb_array_length(p_plan -> 'resources') > 40 then
      raise invalid_parameter_value using message = 'rest_plan_invalid';
    end if;
    for v_entry in select e from jsonb_array_elements(p_plan -> 'resources') as e loop
      if jsonb_typeof(v_entry) <> 'object'
        or exists (select 1 from jsonb_object_keys(v_entry) as k where k <> all (array['id', 'current']))
        or jsonb_typeof(v_entry -> 'id') is distinct from 'string'
        or jsonb_typeof(v_entry -> 'current') is distinct from 'number'
      then
        raise invalid_parameter_value using message = 'rest_plan_invalid';
      end if;
      begin
        v_id := (v_entry ->> 'id')::uuid;
      exception when invalid_text_representation then
        raise invalid_parameter_value using message = 'rest_plan_invalid';
      end;
      if v_id = any (v_ids) then
        raise invalid_parameter_value using message = 'rest_plan_invalid';
      end if;
      v_ids := v_ids || v_id;
      v_num := (v_entry ->> 'current')::numeric;
      if v_num <> trunc(v_num) or v_num not between 0 and 999 then
        raise invalid_parameter_value using message = 'rest_plan_invalid';
      end if;

      -- Every resource RPC holds this character's sheet lock first, so row locks cannot deadlock.
      select r.maximum into v_resource
      from public.character_resources as r
      where r.id = v_id and r.character_id = p_character_id
      for update of r;
      if not found then
        raise exception 'resource_unavailable';
      end if;
      if v_num > v_resource.maximum then
        raise invalid_parameter_value using message = 'rest_plan_invalid';
      end if;
      update public.character_resources as r
      set current = v_num::integer
      where r.id = v_id and r.current is distinct from v_num::integer;
    end loop;
  end if;

  update public.character_sheets as s
  set current_hp = v_hp, temp_hp = v_temp, exhaustion = v_exhaustion,
      death_save_successes = v_successes, death_save_failures = v_failures
  where s.character_id = p_character_id;

  select jsonb_build_object(
    'sheet', (
      select jsonb_build_object(
        'current_hp', s.current_hp, 'temp_hp', s.temp_hp, 'exhaustion', s.exhaustion,
        'death_save_successes', s.death_save_successes,
        'death_save_failures', s.death_save_failures, 'updated_at', s.updated_at
      )
      from public.character_sheets as s where s.character_id = p_character_id
    ),
    'resources', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', r.id, 'current', r.current, 'updated_at', r.updated_at)
        order by r.position, r.created_at
      )
      from public.character_resources as r where r.character_id = p_character_id
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- One death-saving throw, already rolled by the server dice (L7).
create function public.record_death_save(p_character_id uuid, p_result text)
returns table (
  current_hp integer,
  death_save_successes smallint,
  death_save_failures smallint,
  updated_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_sheet public.character_sheets;
  v_hp integer;
  v_successes smallint;
  v_failures smallint;
  v_updated_at timestamptz;
begin
  if p_result is null
    or p_result not in ('success', 'failure', 'critical_success', 'critical_failure')
  then
    raise invalid_parameter_value using message = 'death_save_invalid';
  end if;

  v_sheet := private.lock_owned_character_sheet(p_character_id);
  if v_sheet.current_hp is distinct from 0 then
    raise exception 'not_dying';
  end if;
  v_hp := 0;
  v_successes := v_sheet.death_save_successes;
  v_failures := v_sheet.death_save_failures;

  if p_result = 'success' then
    v_successes := least(3, v_successes + 1);
  elsif p_result = 'failure' then
    v_failures := least(3, v_failures + 1);
  elsif p_result = 'critical_failure' then
    v_failures := least(3, v_failures + 2);
  else
    v_hp := 1;
    v_successes := 0;
    v_failures := 0;
  end if;

  update public.character_sheets as s
  set current_hp = v_hp, death_save_successes = v_successes, death_save_failures = v_failures
  where s.character_id = p_character_id
  returning s.updated_at into v_updated_at;

  return query select v_hp, v_successes, v_failures, v_updated_at;
end;
$$;

revoke all on function public.apply_character_hp(uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.adjust_character_resource(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.take_character_rest(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.record_death_save(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.apply_character_hp(uuid, text, integer) to authenticated;
grant execute on function public.adjust_character_resource(uuid, integer) to authenticated;
grant execute on function public.take_character_rest(uuid, text, jsonb) to authenticated;
grant execute on function public.record_death_save(uuid, text) to authenticated;

commit;
