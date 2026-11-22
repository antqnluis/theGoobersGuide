begin;

-- M03.7 Phase 2: the shared roll log, the roll_dice RPC, and Realtime for rolls.
-- The server alone chooses the faces (D2). Clients can read rolls they may see and call roll_dice;
-- they cannot insert, update, or delete a roll. The canonical expression, the kept faces, and the
-- total are rebuilt here from a validated spec (D5), matching src/features/dice/diceNotation.ts
-- (formatSpec) and diceRandom.ts (randomInt, markKept).

-- 2.1 Table ---------------------------------------------------------------------------------

create table public.dice_rolls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  roller_id uuid not null references public.profiles (id) on delete cascade,
  character_id uuid,
  visibility text not null check (visibility in ('campaign', 'self')),
  source text not null check (
    source in ('tray', 'ability', 'save', 'skill', 'initiative', 'attack', 'damage', 'text')
  ),
  label text check (char_length(label) between 1 and 80),
  expression text not null check (char_length(expression) between 1 and 160),
  terms jsonb not null check (jsonb_typeof(terms) = 'array'),
  dice jsonb not null check (jsonb_typeof(dice) = 'array'),
  total integer not null,
  created_at timestamptz not null default now(),
  -- D6/D10: a roll may name only the roller's own character in this campaign. Deleting the
  -- character clears the reference and keeps the roll.
  constraint dice_rolls_character_campaign_fkey
    foreign key (character_id, campaign_id)
    references public.characters (id, campaign_id) on delete set null (character_id),
  constraint dice_rolls_character_owner_fkey
    foreign key (character_id, roller_id)
    references public.characters (id, owner_id) on delete set null (character_id)
);

create index dice_rolls_campaign_created_idx on public.dice_rolls (campaign_id, created_at desc);
-- Rate limit (D8).
create index dice_rolls_roller_created_idx on public.dice_rolls (roller_id, campaign_id, created_at desc);

-- 2.2 Privileges and RLS ----------------------------------------------------------------------

alter table public.dice_rolls enable row level security;
revoke all on table public.dice_rolls from public, anon, authenticated, service_role;
grant select on table public.dice_rolls to authenticated;

-- D1/D3: every current member reads campaign rolls; a private roll is read by its roller only,
-- the campaign owner included (M03 section 5, no owner override).
create policy "Members read campaign rolls and their own private rolls"
  on public.dice_rolls for select to authenticated
  using (
    campaign_id in (select private.current_campaign_ids())
    and (visibility = 'campaign' or roller_id = (select auth.uid()))
  );

-- 2.3 Private helpers (no client role may execute these) -----------------------------------------

-- A uniform integer from 1 to p_sides. One draw is four random bytes read as an unsigned
-- big-endian 32-bit integer; a draw in the biased tail (at or above the largest multiple of
-- p_sides) is discarded and redrawn.
create function private.random_int(p_sides integer)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_limit bigint;
  v_bytes bytea;
  v_draw bigint;
begin
  if p_sides is null or p_sides < 1 or p_sides > 65536 then
    raise exception using errcode = '22023', message = 'dice_sides_invalid';
  end if;
  v_limit := (4294967296::bigint / p_sides) * p_sides;
  loop
    v_bytes := extensions.gen_random_bytes(4);
    v_draw := get_byte(v_bytes, 0)::bigint * 16777216
      + get_byte(v_bytes, 1)::bigint * 65536
      + get_byte(v_bytes, 2)::bigint * 256
      + get_byte(v_bytes, 3)::bigint;
    if v_draw < v_limit then
      return (v_draw % p_sides)::integer + 1;
    end if;
  end loop;
end;
$$;

-- True when v is a JSON number with no fractional part between lo and hi (inclusive). Never
-- raises, whatever v holds.
create function private.dice_int_between(v jsonb, lo numeric, hi numeric)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(v) = 'number'
      then (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
        and (v #>> '{}')::numeric between lo and hi
    else false
  end;
$$;

-- Raises 22023 unless p_terms is a valid spec (the same limits as diceLimits on the client):
-- 1-20 terms; dice terms {kind, sign, count 1-100, sides 2-1000, keep?: {mode, count 1..count}};
-- constant terms {kind, sign, value within +-10000}; at most 100 dice in all. Unknown keys are
-- refused so a stored spec never carries anything the roll did not use.
create function private.validate_dice_terms(p_terms jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_term jsonb;
  v_keep jsonb;
  v_dice integer := 0;
  v_keys text[];
begin
  if p_terms is null or jsonb_typeof(p_terms) <> 'array'
    or jsonb_array_length(p_terms) not between 1 and 20 then
    raise exception using errcode = '22023', message = 'dice_terms_invalid';
  end if;

  for v_term in select value from jsonb_array_elements(p_terms) loop
    if jsonb_typeof(v_term) <> 'object' then
      raise exception using errcode = '22023', message = 'dice_terms_invalid';
    end if;
    select array_agg(key order by key) into v_keys from jsonb_object_keys(v_term) as key;
    if not private.dice_int_between(v_term -> 'sign', -1, 1) or v_term ->> 'sign' = '0' then
      raise exception using errcode = '22023', message = 'dice_terms_invalid';
    end if;

    if v_term ->> 'kind' = 'constant' then
      if v_keys is distinct from array['kind', 'sign', 'value']
        or not private.dice_int_between(v_term -> 'value', -10000, 10000) then
        raise exception using errcode = '22023', message = 'dice_terms_invalid';
      end if;
    elsif v_term ->> 'kind' = 'dice' then
      if v_keys is distinct from array['count', 'kind', 'sides', 'sign']
        and v_keys is distinct from array['count', 'keep', 'kind', 'sides', 'sign'] then
        raise exception using errcode = '22023', message = 'dice_terms_invalid';
      end if;
      if not private.dice_int_between(v_term -> 'count', 1, 100)
        or not private.dice_int_between(v_term -> 'sides', 2, 1000) then
        raise exception using errcode = '22023', message = 'dice_terms_invalid';
      end if;
      v_keep := v_term -> 'keep';
      if v_keep is not null then
        if jsonb_typeof(v_keep) <> 'object'
          or (select array_agg(key order by key) from jsonb_object_keys(v_keep) as key)
            is distinct from array['count', 'mode']
          or v_keep ->> 'mode' not in ('high', 'low')
          or not private.dice_int_between(v_keep -> 'count', 1, (v_term ->> 'count')::numeric) then
          raise exception using errcode = '22023', message = 'dice_terms_invalid';
        end if;
      end if;
      v_dice := v_dice + (v_term ->> 'count')::integer;
    else
      raise exception using errcode = '22023', message = 'dice_terms_invalid';
    end if;
  end loop;

  if v_dice > 100 then
    raise exception using errcode = '22023', message = 'dice_terms_invalid';
  end if;
end;
$$;

-- Rolls a validated spec. Returns the normalised terms (known keys only), the faces per term
-- ([] for a constant, otherwise [{value, kept}] in roll order), the total, and the canonical
-- expression. Keeping dice orders faces by value (descending for high, ascending for low) with
-- the earliest die first on a tie, and keeps the first keep.count.
create function private.roll_terms(p_terms jsonb)
returns table (terms jsonb, dice jsonb, total integer, expression text)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_term jsonb;
  v_index integer := 0;
  v_sign integer;
  v_count integer;
  v_sides integer;
  v_mode text;
  v_keep integer;
  v_values integer[];
  v_kept boolean[];
  v_faces jsonb;
  v_norm jsonb;
  v_body text;
  v_total bigint := 0;
  v_terms jsonb := '[]'::jsonb;
  v_dice jsonb := '[]'::jsonb;
  v_expression text := '';
  v_i integer;
begin
  for v_term in select value from jsonb_array_elements(p_terms) loop
    v_index := v_index + 1;
    v_sign := (v_term ->> 'sign')::integer;

    if v_term ->> 'kind' = 'constant' then
      v_norm := jsonb_build_object('kind', 'constant', 'sign', v_sign, 'value', (v_term ->> 'value')::integer);
      v_faces := '[]'::jsonb;
      v_body := (v_term ->> 'value')::integer::text;
      v_total := v_total + v_sign * (v_term ->> 'value')::integer;
    else
      v_count := (v_term ->> 'count')::integer;
      v_sides := (v_term ->> 'sides')::integer;
      v_values := array[]::integer[];
      for v_i in 1..v_count loop
        v_values := v_values || private.random_int(v_sides);
      end loop;

      v_kept := array_fill(true, array[v_count]);
      v_body := v_count::text || 'd' || v_sides::text;
      v_norm := jsonb_build_object('kind', 'dice', 'sign', v_sign, 'count', v_count, 'sides', v_sides);
      if v_term -> 'keep' is not null then
        v_mode := v_term -> 'keep' ->> 'mode';
        v_keep := (v_term -> 'keep' ->> 'count')::integer;
        v_kept := array_fill(false, array[v_count]);
        for v_i in
          select u.i
          from unnest(v_values) with ordinality as u (v, i)
          order by case when v_mode = 'high' then -u.v else u.v end, u.i
          limit v_keep
        loop
          v_kept[v_i] := true;
        end loop;
        v_norm := v_norm || jsonb_build_object('keep', jsonb_build_object('mode', v_mode, 'count', v_keep));
        v_body := v_body || 'k' || case when v_mode = 'high' then 'h' else 'l' end || v_keep::text;
      end if;

      select coalesce(jsonb_agg(jsonb_build_object('value', u.v, 'kept', v_kept[u.i]) order by u.i), '[]'::jsonb)
        into v_faces
        from unnest(v_values) with ordinality as u (v, i);
      for v_i in 1..v_count loop
        if v_kept[v_i] then
          v_total := v_total + v_sign * v_values[v_i];
        end if;
      end loop;
    end if;

    v_terms := v_terms || jsonb_build_array(v_norm);
    v_dice := v_dice || jsonb_build_array(v_faces);
    if v_index = 1 then
      v_expression := case when v_sign < 0 then '-' else '' end || v_body;
    else
      v_expression := v_expression || case when v_sign < 0 then ' - ' else ' + ' end || v_body;
    end if;
  end loop;

  return query select v_terms, v_dice, v_total::integer, v_expression;
end;
$$;

revoke all on function private.random_int(integer) from public, anon, authenticated, service_role;
revoke all on function private.dice_int_between(jsonb, numeric, numeric) from public, anon, authenticated, service_role;
revoke all on function private.validate_dice_terms(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.roll_terms(jsonb) from public, anon, authenticated, service_role;

-- 2.4 The RPC ----------------------------------------------------------------------------------

-- Errors: 42501 'not_a_member' (not a current member), 42501 'character_unavailable' (not the
-- caller's character in this campaign), 22023 'dice_terms_invalid' / 'dice_roll_invalid', and
-- P0001 'dice_rate_limited' (more than 20 rolls in 10 seconds, D8).
create function public.roll_dice(
  p_campaign_id uuid,
  p_terms jsonb,
  p_visibility text default 'campaign',
  p_source text default 'tray',
  p_label text default null,
  p_character_id uuid default null
)
returns public.dice_rolls
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_label text := nullif(btrim(p_label), '');
  v_rolled record;
  v_row public.dice_rolls;
begin
  if v_caller is null or p_campaign_id is null then
    raise exception using errcode = '42501', message = 'not_a_member';
  end if;

  -- Lock the campaign so a roll cannot race a departure, as the other member-only RPCs do.
  perform 1 from public.campaigns as c where c.id = p_campaign_id for share of c;
  if not found or not exists (
    select 1 from public.campaign_members as m
    where m.campaign_id = p_campaign_id and m.profile_id = v_caller
  ) then
    raise exception using errcode = '42501', message = 'not_a_member';
  end if;

  if p_visibility is null or p_visibility not in ('campaign', 'self')
    or p_source is null
    or p_source not in ('tray', 'ability', 'save', 'skill', 'initiative', 'attack', 'damage', 'text')
    or char_length(v_label) > 80 then
    raise exception using errcode = '22023', message = 'dice_roll_invalid';
  end if;

  perform private.validate_dice_terms(p_terms);

  if p_character_id is not null and not exists (
    select 1 from public.characters as ch
    where ch.id = p_character_id and ch.owner_id = v_caller and ch.campaign_id = p_campaign_id
  ) then
    raise exception using errcode = '42501', message = 'character_unavailable';
  end if;

  -- D8: serialise one roller's rolls in one campaign, then count the last ten seconds.
  perform pg_advisory_xact_lock(hashtextextended(v_caller::text || p_campaign_id::text, 0));
  if (
    select count(*) from public.dice_rolls as r
    where r.roller_id = v_caller and r.campaign_id = p_campaign_id
      and r.created_at > clock_timestamp() - interval '10 seconds'
  ) >= 20 then
    raise exception using errcode = 'P0001', message = 'dice_rate_limited';
  end if;

  select * into v_rolled from private.roll_terms(p_terms);

  insert into public.dice_rolls (
    campaign_id, roller_id, character_id, visibility, source, label,
    expression, terms, dice, total, created_at
  )
  values (
    p_campaign_id, v_caller, p_character_id, p_visibility, p_source, v_label,
    v_rolled.expression, v_rolled.terms, v_rolled.dice, v_rolled.total, clock_timestamp()
  )
  returning * into v_row;

  -- D7: keep the newest 300 rolls in the campaign.
  delete from public.dice_rolls as old
  where old.id in (
    select r.id from public.dice_rolls as r
    where r.campaign_id = p_campaign_id
    order by r.created_at desc, r.id desc
    offset 300
  );

  return v_row;
end;
$$;

revoke all on function public.roll_dice(uuid, jsonb, text, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.roll_dice(uuid, jsonb, text, text, text, uuid) to authenticated;

-- 2.5 Realtime ----------------------------------------------------------------------------------

-- Postgres-changes delivery checks the subscriber's select policy per row, so private rolls and
-- other campaigns never reach a client. Replica identity stays default (inserts only).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.dice_rolls;
  end if;
end;
$$;

commit;
