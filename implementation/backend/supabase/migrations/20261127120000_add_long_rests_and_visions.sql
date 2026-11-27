begin;

-- M04 Phase 4: long rests, visions, and saved visions (plan §3.4, §3.5, §3.6, §4).
--   * crafting_rests: one row per long rest a DM calls. Members read them and Realtime delivers
--     inserts (C12).
--   * character_visions and character_saved_recipes: no grants at all (C7). `call_long_rest`,
--     `save_vision`, and `unsave_vision` write them, `get_character_visions` reads them.
--   * private.crafting_held: the single definition of "holding" an item (C4).
--   * private.crafting_classify: the rest's vision / fragment rules (W2, W10, W15).
--   * call_long_rest, get_character_visions, save_vision, unsave_vision.
--   * search_crafting_items now also offers the outputs of the character's own visions (C9), and
--     delete_crafting_library now counts the saved recipes a delete removes.
--
-- Lock order: campaign FOR SHARE -> advisory lock -> libraries FOR SHARE.

-- ---------------------------------------------------------------------------------------------
-- Rests
-- ---------------------------------------------------------------------------------------------

create table public.crafting_rests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  called_by uuid default auth.uid() references public.profiles (id) on delete set null,
  called_at timestamptz not null default now(),
  character_count integer not null default 0,

  constraint crafting_rests_character_count_check check (character_count between 0 and 100000)
);

-- The cooldown, the "latest rest" lookup, and the newest-50 trim.
create index crafting_rests_campaign_idx on public.crafting_rests (campaign_id, called_at desc);
create index crafting_rests_called_by_idx on public.crafting_rests (called_by)
  where called_by is not null;

alter table public.crafting_rests enable row level security;

revoke all on table public.crafting_rests from public, anon, authenticated, service_role;
grant select on table public.crafting_rests to authenticated;

-- Every current member may read their campaign's rests: a time and a count, nothing else (C6).
create policy "Members read their campaign's rests"
  on public.crafting_rests for select to authenticated
  using (campaign_id in (select private.current_campaign_ids()));

-- Inserts only (default replica identity). The select policy filters delivery (C12).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'crafting_rests'
    )
  then
    alter publication supabase_realtime add table public.crafting_rests;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Visions and saved recipes
-- ---------------------------------------------------------------------------------------------

create table public.character_visions (
  -- Also the opaque id a fragment is shown under.
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  recipe_id uuid not null references public.crafting_recipes (id) on delete cascade,
  kind text not null,
  -- The rest that first revealed the recipe as its current kind (C11). Null once that rest is
  -- trimmed, by which time it is no longer "new".
  new_in_rest_id uuid references public.crafting_rests (id) on delete set null,
  revealed_at timestamptz not null default now(),

  constraint character_visions_kind_check check (kind in ('vision', 'fragment')),
  constraint character_visions_character_recipe_key unique (character_id, recipe_id)
);

-- The recipe cascade, and the "new" lookup.
create index character_visions_recipe_idx on public.character_visions (recipe_id);
create index character_visions_new_rest_idx on public.character_visions (new_in_rest_id)
  where new_in_rest_id is not null;

alter table public.character_visions enable row level security;
revoke all on table public.character_visions from public, anon, authenticated, service_role;

create table public.character_saved_recipes (
  character_id uuid not null references public.characters (id) on delete cascade,
  recipe_id uuid not null references public.crafting_recipes (id) on delete cascade,
  saved_at timestamptz not null default now(),

  primary key (character_id, recipe_id)
);

create index character_saved_recipes_recipe_idx on public.character_saved_recipes (recipe_id);

alter table public.character_saved_recipes enable row level security;
revoke all on table public.character_saved_recipes from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Matching helpers
-- ---------------------------------------------------------------------------------------------

-- What each character of a campaign holds (C4): the summed quantity, over inventory rows with
-- quantity > 0, of every catalogue item in a library enabled on the campaign. A row counts for
-- the item it is linked to, or, when it is unlinked, for the item with the same name (ignoring
-- case and edge spaces, W5). A link into a library that is no longer enabled stops counting (C5)
-- and does not fall back to the name. Optionally narrowed to one character.
create function private.crafting_held(p_campaign_id uuid, p_character_id uuid default null)
returns table (character_id uuid, crafting_item_id uuid, held bigint)
language sql
stable
security definer set search_path = ''
as $$
  select m.character_id, m.crafting_item_id, sum(m.quantity)::bigint
  from (
    select ci.character_id, i.id as crafting_item_id, ci.quantity
    from public.characters as ch
    join public.character_items as ci on ci.character_id = ch.id and ci.quantity > 0
    join public.crafting_items as i on i.id = ci.crafting_item_id
    join public.campaign_crafting_libraries as l
      on l.library_id = i.library_id and l.campaign_id = ch.campaign_id
    where ch.campaign_id = p_campaign_id
      and (p_character_id is null or ch.id = p_character_id)
    union all
    select ci.character_id, i.id, ci.quantity
    from public.characters as ch
    join public.character_items as ci
      on ci.character_id = ch.id and ci.quantity > 0 and ci.crafting_item_id is null
    join public.campaign_crafting_libraries as l on l.campaign_id = ch.campaign_id
    join public.crafting_items as i
      on i.library_id = l.library_id and i.name_key = lower(btrim(ci.name))
    where ch.campaign_id = p_campaign_id
      and (p_character_id is null or ch.id = p_character_id)
  ) as m
  group by m.character_id, m.crafting_item_id;
$$;

revoke all on function private.crafting_held(uuid, uuid) from public, anon, authenticated, service_role;

-- The characters a rest covers (W12): active, in this campaign, owned by a current member.
create function private.crafting_rest_characters(p_campaign_id uuid)
returns setof uuid
language sql
stable
security definer set search_path = ''
as $$
  select ch.id
  from public.characters as ch
  where ch.campaign_id = p_campaign_id
    and ch.status = 'active'
    and exists (
      select 1 from public.campaign_members as m
      where m.campaign_id = ch.campaign_id and m.profile_id = ch.owner_id
    );
$$;

revoke all on function private.crafting_rest_characters(uuid)
  from public, anon, authenticated, service_role;

-- Every (character, recipe) a rest would reveal and as what (plan §4 step 3): a vision when the
-- character holds at least one of each key material, a fragment when it holds some but not all
-- of several (so never for a single key material). Only recipes of enabled libraries, only the
-- characters a rest covers.
create function private.crafting_classify(p_campaign_id uuid)
returns table (character_id uuid, recipe_id uuid, kind text)
language sql
stable
security definer set search_path = ''
as $$
  with keys as (
    select m.recipe_id, count(*) as key_total
    from public.crafting_recipe_materials as m
    join public.campaign_crafting_libraries as l
      on l.library_id = m.library_id and l.campaign_id = p_campaign_id
    where m.role = 'key'
    group by m.recipe_id
  ),
  counted as (
    select h.character_id, m.recipe_id, count(*) as key_held
    from private.crafting_held(p_campaign_id) as h
    join public.crafting_recipe_materials as m
      on m.item_id = h.crafting_item_id and m.role = 'key'
    join public.campaign_crafting_libraries as l
      on l.library_id = m.library_id and l.campaign_id = p_campaign_id
    where h.held > 0
      and h.character_id in (select private.crafting_rest_characters(p_campaign_id))
    group by h.character_id, m.recipe_id
  )
  select c.character_id, c.recipe_id,
    case when c.key_held = k.key_total then 'vision' else 'fragment' end
  from counted as c
  join keys as k on k.recipe_id = c.recipe_id;
$$;

revoke all on function private.crafting_classify(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- call_long_rest
-- ---------------------------------------------------------------------------------------------

-- The campaign owner calls a rest: every active character of a current member has its visions
-- and fragments recomputed (§4). Returns the rest and how many characters it covered, and
-- nothing per character, so the DM learns nothing about private inventories (C6, B10).
create function public.call_long_rest(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller_id uuid := auth.uid();
  v_owner_id uuid;
  v_rest_id uuid;
  v_called_at timestamptz;
  v_characters integer;
  v_libraries integer;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'crafting_sign_in_required';
  end if;
  if p_campaign_id is null then
    raise invalid_parameter_value using message = 'crafting_argument_required';
  end if;

  -- Membership changes take NO KEY UPDATE on the campaign, so they wait for this call and a rest
  -- never covers a player halfway through leaving (§5.2).
  select c.owner_id into v_owner_id
  from public.campaigns as c
  where c.id = p_campaign_id
  for share of c;
  if not found or not exists (
    select 1 from public.campaign_members as m
    where m.campaign_id = p_campaign_id and m.profile_id = caller_id
  ) then
    raise exception 'campaign_unavailable';
  end if;
  if v_owner_id is distinct from caller_id then
    raise insufficient_privilege using message = 'crafting_campaign_owner_required';
  end if;

  -- Two concurrent rests: the second waits here, then fails the cooldown below.
  perform pg_advisory_xact_lock(hashtextextended('crafting_rests:' || p_campaign_id::text, 0));
  if exists (
    select 1 from public.crafting_rests as r
    where r.campaign_id = p_campaign_id
      and r.called_at > clock_timestamp() - interval '30 seconds'
  ) then
    raise exception 'crafting_rest_too_soon';
  end if;

  -- An import locks its library FOR UPDATE, so a rest never reads half a pack.
  perform 1
  from public.crafting_libraries as lib
  where lib.id in (
    select l.library_id from public.campaign_crafting_libraries as l
    where l.campaign_id = p_campaign_id
  )
  order by lib.id
  for share of lib;

  select count(*) into v_libraries
  from public.campaign_crafting_libraries as l
  where l.campaign_id = p_campaign_id;

  select count(*) into v_characters
  from private.crafting_rest_characters(p_campaign_id);

  insert into public.crafting_rests (campaign_id, called_by, called_at, character_count)
  values (p_campaign_id, caller_id, clock_timestamp(), v_characters)
  returning id, called_at into v_rest_id, v_called_at;

  -- One statement, so the delete and the upsert read the same classification. The delete drops
  -- what is no longer revealed: only the covered characters' rows for recipes of the enabled
  -- libraries are considered, so rows for a disabled library wait for it to return (C5) and
  -- characters outside the rest keep what they had (W12). The upsert reveals new ones and
  -- changes kinds. A fragment that becomes a vision is new again (C11, W17); a vision that
  -- drops back to a fragment keeps its old marker. Rows whose kind did not change are left alone.
  with result as materialized (
    select c.character_id, c.recipe_id, c.kind
    from private.crafting_classify(p_campaign_id) as c
  ),
  dropped as (
    delete from public.character_visions as v
    using public.crafting_recipes as r
    where r.id = v.recipe_id
      and r.library_id in (
        select l.library_id from public.campaign_crafting_libraries as l
        where l.campaign_id = p_campaign_id
      )
      and v.character_id in (select private.crafting_rest_characters(p_campaign_id))
      and not exists (
        select 1 from result as t
        where t.character_id = v.character_id and t.recipe_id = v.recipe_id
      )
    returning v.id
  )
  insert into public.character_visions as v (character_id, recipe_id, kind, new_in_rest_id)
  select t.character_id, t.recipe_id, t.kind, v_rest_id
  from result as t
  on conflict (character_id, recipe_id) do update
    set kind = excluded.kind,
        new_in_rest_id = case
          when v.kind = 'fragment' and excluded.kind = 'vision' then excluded.new_in_rest_id
          else v.new_in_rest_id
        end,
        revealed_at = case
          when v.kind = 'fragment' and excluded.kind = 'vision' then now()
          else v.revealed_at
        end
    where v.kind is distinct from excluded.kind;

  -- The history keeps the newest 50 rests per campaign.
  delete from public.crafting_rests as h
  where h.campaign_id = p_campaign_id
    and h.id in (
      select o.id from public.crafting_rests as o
      where o.campaign_id = p_campaign_id
      order by o.called_at desc, o.id desc
      offset 50
    );

  return jsonb_build_object(
    'rest_id', v_rest_id,
    'called_at', v_called_at,
    'character_count', v_characters,
    'library_count', v_libraries
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- get_character_visions
-- ---------------------------------------------------------------------------------------------

-- Everything one character may see (§3.6): its visions and saved recipes with live counts (C4,
-- W11), and its fragments with nothing but the held key materials and how many are missing
-- (W15). The caller must own the character and be a current member, in any character status.
-- Only libraries enabled on the campaign count (C5). Never returns slugs, tags, sources,
-- harvest data, or DM notes (C16).
create function public.get_character_visions(p_character_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller_id uuid := auth.uid();
  v_campaign_id uuid;
  v_latest_rest_id uuid;
  v_last_rest_at timestamptz;
  v_libraries integer;
  v_visions jsonb;
  v_saved jsonb;
  v_fragments jsonb;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'crafting_sign_in_required';
  end if;
  if p_character_id is null then
    raise invalid_parameter_value using message = 'crafting_argument_required';
  end if;

  select c.campaign_id into v_campaign_id
  from public.characters as c
  where c.id = p_character_id and c.owner_id = caller_id;
  if not found or not exists (
    select 1 from public.campaign_members as m
    where m.campaign_id = v_campaign_id and m.profile_id = caller_id
  ) then
    raise exception 'character_unavailable';
  end if;

  select r.id, r.called_at into v_latest_rest_id, v_last_rest_at
  from public.crafting_rests as r
  where r.campaign_id = v_campaign_id
  order by r.called_at desc, r.id desc
  limit 1;

  select count(*) into v_libraries
  from public.campaign_crafting_libraries as l
  where l.campaign_id = v_campaign_id;

  -- Visions and saved recipes: the same card, told apart by whether a vision row currently
  -- reveals the recipe.
  with held as (
    select h.crafting_item_id, h.held
    from private.crafting_held(v_campaign_id, p_character_id) as h
  ),
  enabled as (
    select l.library_id from public.campaign_crafting_libraries as l
    where l.campaign_id = v_campaign_id
  ),
  vision_rows as (
    select v.recipe_id, (v.new_in_rest_id is not null and v.new_in_rest_id = v_latest_rest_id) as is_new
    from public.character_visions as v
    join public.crafting_recipes as r on r.id = v.recipe_id
    where v.character_id = p_character_id
      and v.kind = 'vision'
      and r.library_id in (select library_id from enabled)
  ),
  saved_rows as (
    select s.recipe_id
    from public.character_saved_recipes as s
    join public.crafting_recipes as r on r.id = s.recipe_id
    where s.character_id = p_character_id
      and r.library_id in (select library_id from enabled)
  ),
  shown as (
    select
      u.recipe_id,
      (vr.recipe_id is not null) as is_vision,
      coalesce(vr.is_new, false) as is_new,
      (sr.recipe_id is not null) as is_saved
    from (
      select recipe_id from vision_rows
      union
      select recipe_id from saved_rows
    ) as u
    left join vision_rows as vr on vr.recipe_id = u.recipe_id
    left join saved_rows as sr on sr.recipe_id = u.recipe_id
  ),
  cards as (
    select
      s.is_vision,
      s.is_new,
      o.name_key,
      s.recipe_id,
      jsonb_build_object(
        'recipe_id', r.id,
        'new', s.is_new,
        'saved', s.is_saved,
        'output', jsonb_build_object(
          'name', o.name,
          'category', o.category,
          'rarity', o.rarity,
          'value_cp', o.value_cp,
          'weight', o.weight,
          'consumable', o.consumable,
          'attunement', case
            when not o.attunement then null
            when o.attunement_note is not null then to_jsonb(o.attunement_note)
            else to_jsonb(true)
          end,
          'description', o.description,
          'quantity', r.output_quantity
        ),
        'lines', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'role', m.role,
              'item_id', mi.id,
              'name', mi.name,
              'rarity', mi.rarity,
              'value_cp', mi.value_cp,
              'need', m.quantity,
              'have', coalesce(h.held, 0)
            )
            order by m.position
          )
          from public.crafting_recipe_materials as m
          join public.crafting_items as mi on mi.id = m.item_id
          left join held as h on h.crafting_item_id = m.item_id
          where m.recipe_id = r.id
        ), '[]'::jsonb),
        'crafting_cost_cp', r.crafting_cost_cp,
        'workdays', r.workdays,
        'tools', to_jsonb(r.tools),
        'requirements', r.requirements,
        'check', case
          when r.check_skill is null then null
          else jsonb_build_object('skill', r.check_skill, 'dc', r.check_dc)
        end,
        'notes', r.notes
      ) as card
    from shown as s
    join public.crafting_recipes as r on r.id = s.recipe_id
    join public.crafting_items as o on o.id = r.output_item_id
  )
  select
    coalesce(jsonb_agg(c.card order by c.is_new desc, c.name_key, c.recipe_id)
      filter (where c.is_vision), '[]'::jsonb),
    coalesce(jsonb_agg(c.card order by c.name_key, c.recipe_id)
      filter (where not c.is_vision), '[]'::jsonb)
  into v_visions, v_saved
  from cards as c;

  -- Fragments: the held key materials by name and how many are still unknown. The output, the
  -- other materials, costs, time, and tools never leave the database.
  with held as (
    select h.crafting_item_id
    from private.crafting_held(v_campaign_id, p_character_id) as h
    where h.held > 0
  )
  select coalesce(jsonb_agg(
    jsonb_build_object('id', f.id, 'new', f.is_new, 'held', f.held_names, 'missing', f.missing)
    order by f.is_new desc, f.held_names::text, f.id
  ), '[]'::jsonb)
  into v_fragments
  from (
    select
      v.id,
      (v.new_in_rest_id is not null and v.new_in_rest_id = v_latest_rest_id) as is_new,
      coalesce(
        (select jsonb_agg(mi.name order by mi.name_key, mi.id)
         from public.crafting_recipe_materials as m
         join public.crafting_items as mi on mi.id = m.item_id
         where m.recipe_id = v.recipe_id and m.role = 'key'
           and m.item_id in (select crafting_item_id from held)),
        '[]'::jsonb
      ) as held_names,
      (select count(*) from public.crafting_recipe_materials as m
       where m.recipe_id = v.recipe_id and m.role = 'key'
         and m.item_id not in (select crafting_item_id from held))::integer as missing
    from public.character_visions as v
    join public.crafting_recipes as r on r.id = v.recipe_id
    where v.character_id = p_character_id
      and v.kind = 'fragment'
      and r.library_id in (
        select l.library_id from public.campaign_crafting_libraries as l
        where l.campaign_id = v_campaign_id
      )
  ) as f;

  return jsonb_build_object(
    'last_rest_at', v_last_rest_at,
    'library_count', v_libraries,
    'visions', v_visions,
    'fragments', v_fragments,
    'saved', v_saved
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- save_vision / unsave_vision
-- ---------------------------------------------------------------------------------------------

-- A saved vision stays in the guide after later rests would hide it, until it is removed (W4).
-- Only a vision the character currently has can be saved (Q12): not a fragment, and not one of
-- a disabled library. Saving again is a no-op.
create function public.save_vision(p_character_id uuid, p_recipe_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller_id uuid := auth.uid();
  v_campaign_id uuid;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'crafting_sign_in_required';
  end if;
  if p_character_id is null or p_recipe_id is null then
    raise invalid_parameter_value using message = 'crafting_argument_required';
  end if;

  select c.campaign_id into v_campaign_id
  from public.characters as c
  where c.id = p_character_id and c.owner_id = caller_id;
  if not found or not exists (
    select 1 from public.campaign_members as m
    where m.campaign_id = v_campaign_id and m.profile_id = caller_id
  ) then
    raise exception 'character_unavailable';
  end if;

  -- Serialize saves for one character, then enforce the cap.
  perform 1 from public.characters as c where c.id = p_character_id for no key update;

  if not exists (
    select 1
    from public.character_visions as v
    join public.crafting_recipes as r on r.id = v.recipe_id
    join public.campaign_crafting_libraries as l
      on l.library_id = r.library_id and l.campaign_id = v_campaign_id
    where v.character_id = p_character_id and v.recipe_id = p_recipe_id and v.kind = 'vision'
  ) then
    raise exception 'vision_unavailable';
  end if;

  if exists (
    select 1 from public.character_saved_recipes as s
    where s.character_id = p_character_id and s.recipe_id = p_recipe_id
  ) then
    return;
  end if;
  if (select count(*) from public.character_saved_recipes as s
      where s.character_id = p_character_id) >= 200 then
    raise exception 'saved_limit_reached';
  end if;

  insert into public.character_saved_recipes (character_id, recipe_id)
  values (p_character_id, p_recipe_id);
end;
$$;

-- Removing a saved vision always works, whether or not the recipe is still revealed.
create function public.unsave_vision(p_character_id uuid, p_recipe_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller_id uuid := auth.uid();
  v_campaign_id uuid;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'crafting_sign_in_required';
  end if;
  if p_character_id is null or p_recipe_id is null then
    raise invalid_parameter_value using message = 'crafting_argument_required';
  end if;

  select c.campaign_id into v_campaign_id
  from public.characters as c
  where c.id = p_character_id and c.owner_id = caller_id;
  if not found or not exists (
    select 1 from public.campaign_members as m
    where m.campaign_id = v_campaign_id and m.profile_id = caller_id
  ) then
    raise exception 'character_unavailable';
  end if;

  delete from public.character_saved_recipes as s
  where s.character_id = p_character_id and s.recipe_id = p_recipe_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- search_crafting_items: add the outputs of the character's own visions (C9)
-- ---------------------------------------------------------------------------------------------

-- Same as Phase 3, plus the outputs of this character's current visions and saved recipes. A
-- fragment's output and every other output stay hidden.
create or replace function public.search_crafting_items(p_character_id uuid, p_query text)
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller_id uuid := auth.uid();
  v_campaign_id uuid;
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_pattern text;
  v_result jsonb;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'crafting_sign_in_required';
  end if;
  if p_character_id is null or p_query is null then
    raise invalid_parameter_value using message = 'crafting_argument_required';
  end if;

  select c.campaign_id into v_campaign_id
  from public.characters as c
  where c.id = p_character_id and c.owner_id = caller_id;
  if not found or not exists (
    select 1 from public.campaign_members as m
    where m.campaign_id = v_campaign_id and m.profile_id = caller_id
  ) then
    raise exception 'character_unavailable';
  end if;

  if char_length(v_query) < 2 or char_length(v_query) > 80 or v_query ~ '[[:cntrl:]]' then
    raise invalid_parameter_value using message = 'crafting_query_invalid';
  end if;

  -- LIKE wildcards in the query are literal characters.
  v_pattern := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'category', s.category,
        'rarity', s.rarity,
        'value_cp', s.value_cp,
        'weight', s.weight,
        'description', s.description
      )
      order by s.rank, s.name_key, s.id
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      i.id, i.name, i.name_key, i.category, i.rarity, i.value_cp, i.weight, i.description,
      case when i.name_key like v_pattern || '%' escape '\' then 0 else 1 end as rank
    from public.crafting_items as i
    join public.campaign_crafting_libraries as l on l.library_id = i.library_id
    where l.campaign_id = v_campaign_id
      and (
        i.category = 'material'
        or i.id in (
          select r.output_item_id
          from public.character_visions as v
          join public.crafting_recipes as r on r.id = v.recipe_id
          where v.character_id = p_character_id and v.kind = 'vision'
          union
          select r.output_item_id
          from public.character_saved_recipes as sr
          join public.crafting_recipes as r on r.id = sr.recipe_id
          where sr.character_id = p_character_id
        )
      )
      and (i.name_key like v_pattern || '%' escape '\'
           or i.name_key like '% ' || v_pattern || '%' escape '\')
    order by 9, i.name_key, i.id
    limit 8
  ) as s;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- delete_crafting_library: count the saved recipes a delete removes
-- ---------------------------------------------------------------------------------------------

create or replace function public.delete_crafting_library(p_library_id uuid, p_confirm boolean)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller_id uuid := auth.uid();
  v_campaigns integer;
  v_saved integer;
  v_linked integer;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'crafting_sign_in_required';
  end if;
  if p_library_id is null or p_confirm is null then
    raise invalid_parameter_value using message = 'crafting_argument_required';
  end if;

  perform 1 from public.crafting_libraries as l
  where l.id = p_library_id and l.owner_id = caller_id
  for update of l;
  if not found then
    raise exception 'crafting_library_unavailable';
  end if;

  select count(*) into v_campaigns
  from public.campaign_crafting_libraries as c
  where c.library_id = p_library_id;

  select count(*) into v_saved
  from public.character_saved_recipes as s
  join public.crafting_recipes as r on r.id = s.recipe_id
  where r.library_id = p_library_id;

  select count(*) into v_linked
  from public.character_items as ci
  join public.crafting_items as i on i.id = ci.crafting_item_id
  where i.library_id = p_library_id;

  if p_confirm then
    delete from public.crafting_libraries as l where l.id = p_library_id;
  end if;

  return jsonb_build_object(
    'campaigns', v_campaigns,
    'saved', v_saved,
    'linked_items', v_linked,
    'deleted', p_confirm
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------

revoke all on function public.call_long_rest(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_character_visions(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.save_vision(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.unsave_vision(uuid, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.call_long_rest(uuid) to authenticated;
grant execute on function public.get_character_visions(uuid) to authenticated;
grant execute on function public.save_vision(uuid, uuid) to authenticated;
grant execute on function public.unsave_vision(uuid, uuid) to authenticated;

commit;
