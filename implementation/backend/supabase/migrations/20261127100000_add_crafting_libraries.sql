begin;

-- M04 Phase 1: crafting catalogue (plan §3.1, §3.2, §3.5).
--   * crafting_libraries: owned by a DM, reusable across their campaigns.
--   * crafting_items, crafting_recipes, crafting_recipe_materials: the catalogue. Readable only
--     by the library owner and written only by import_crafting_pack (C1). Players get no table
--     access at all (C7); later phases expose player-facing fields through SECURITY DEFINER
--     functions.
--   * crafting_pack_imports: the import history.
--   * campaign_crafting_libraries: which libraries a campaign uses (C5).
--   * import_crafting_pack, delete_crafting_library, set_campaign_crafting_library.
--
-- Money is stored in whole copper (C3). Lock order: campaign FOR SHARE -> library FOR UPDATE.

-- ---------------------------------------------------------------------------------------------
-- Check helpers
-- ---------------------------------------------------------------------------------------------

-- A text[] of at most p_max_count single-line, trimmed entries of 1 to p_max_len characters.
create function private.crafting_text_array_ok(p_values text[], p_max_count integer, p_max_len integer)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_values is not null
    and cardinality(p_values) <= p_max_count
    and not exists (
      select 1 from unnest(p_values) as t (value)
      where t.value is null
        or t.value <> btrim(t.value)
        or char_length(t.value) not between 1 and p_max_len
        or t.value ~ '[[:cntrl:]]'
    );
$$;

revoke all on function private.crafting_text_array_ok(text[], integer, integer)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Libraries
-- ---------------------------------------------------------------------------------------------

create table public.crafting_libraries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crafting_libraries_name_check check (
    name = btrim(name) and char_length(name) between 1 and 120 and name !~ '[[:cntrl:]]'
  ),
  -- Newlines and tabs are allowed; other control characters are not.
  constraint crafting_libraries_description_check check (
    description is null
    or (char_length(description) between 1 and 2000
        and description !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]')
  )
);

create index crafting_libraries_owner_idx on public.crafting_libraries (owner_id, created_at);

-- Integrity for every write path: at most 20 libraries per owner (C14), an empty description is
-- stored as null, and identity never changes.
create function private.guard_crafting_library_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.owner_id <> old.owner_id or new.created_at <> old.created_at then
      raise integrity_constraint_violation using message = 'crafting_library_reassignment_forbidden';
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('crafting_libraries:' || new.owner_id::text, 0));
    if (select count(*) from public.crafting_libraries where owner_id = new.owner_id) >= 20 then
      raise exception 'crafting_library_limit_reached';
    end if;
  end if;
  new.description := nullif(btrim(new.description), '');
  return new;
end;
$$;

revoke all on function private.guard_crafting_library_write()
  from public, anon, authenticated, service_role;

create trigger crafting_libraries_guard_write
  before insert or update on public.crafting_libraries
  for each row execute function private.guard_crafting_library_write();

create trigger crafting_libraries_set_updated_at
  before update on public.crafting_libraries
  for each row execute function private.set_updated_at();

alter table public.crafting_libraries enable row level security;

revoke all on table public.crafting_libraries from public, anon, authenticated, service_role;
grant select on table public.crafting_libraries to authenticated;
grant insert (name, description) on table public.crafting_libraries to authenticated;
grant update (name, description) on table public.crafting_libraries to authenticated;
-- No delete grant: libraries are deleted through delete_crafting_library.

create policy "Owners read their libraries"
  on public.crafting_libraries for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Owners create libraries"
  on public.crafting_libraries for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Owners rename their libraries"
  on public.crafting_libraries for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------------------------

create table public.crafting_items (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.crafting_libraries (id) on delete cascade,
  slug text not null,
  name text not null,
  -- Case and edge spaces never distinguish two names (W5), so the name fallback is unambiguous.
  name_key text generated always as (lower(btrim(name))) stored,
  category text not null,
  rarity text not null,
  value_cp integer not null,
  weight numeric(7, 2),
  consumable boolean not null default false,
  attunement boolean not null default false,
  attunement_note text,
  description text,
  tags text[] not null default '{}',
  source text,
  harvest jsonb,
  dm_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crafting_items_slug_check check (
    char_length(slug) between 1 and 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint crafting_items_name_check check (
    name = btrim(name) and char_length(name) between 1 and 80 and name !~ '[[:cntrl:]]'
  ),
  constraint crafting_items_category_check check (
    category in (
      'material', 'weapon', 'armor', 'shield', 'wondrous', 'potion', 'scroll', 'ammunition',
      'tool', 'other'
    )
  ),
  constraint crafting_items_rarity_check check (
    rarity in ('common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact')
  ),
  constraint crafting_items_value_check check (value_cp between 0 and 100000000),
  constraint crafting_items_weight_check check (weight is null or weight between 0 and 99999.99),
  constraint crafting_items_attunement_note_check check (
    attunement_note is null
    or (attunement
        and attunement_note = btrim(attunement_note)
        and char_length(attunement_note) between 1 and 120
        and attunement_note !~ '[[:cntrl:]]')
  ),
  constraint crafting_items_description_check check (
    description is null
    or (char_length(description) between 1 and 2000
        and description !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]')
  ),
  constraint crafting_items_tags_check check (private.crafting_text_array_ok(tags, 10, 40)),
  constraint crafting_items_source_check check (
    source is null
    or (source = btrim(source) and char_length(source) between 1 and 200
        and source !~ '[[:cntrl:]]')
  ),
  constraint crafting_items_harvest_check check (
    harvest is null or jsonb_typeof(harvest) = 'object'
  ),
  constraint crafting_items_dm_notes_check check (
    dm_notes is null
    or (char_length(dm_notes) between 1 and 2000
        and dm_notes !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]')
  ),
  constraint crafting_items_library_slug_key unique (library_id, slug),
  -- Deferrable so one import can swap two names; import_crafting_pack checks it at its end.
  constraint crafting_items_library_name_key unique (library_id, name_key)
    deferrable initially immediate,
  -- The target of the composite foreign keys that keep recipes inside one library.
  constraint crafting_items_library_id_key unique (library_id, id)
);

-- Prefix suggestions (C9).
create index crafting_items_name_prefix_idx
  on public.crafting_items (library_id, name_key text_pattern_ops);

-- Identity never changes (slugs are what re-imports match on).
create function private.guard_crafting_catalogue_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.id <> old.id or new.library_id <> old.library_id or new.slug <> old.slug then
    raise integrity_constraint_violation using message = 'crafting_reassignment_forbidden';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_crafting_catalogue_write()
  from public, anon, authenticated, service_role;

create trigger crafting_items_guard_write
  before update on public.crafting_items
  for each row execute function private.guard_crafting_catalogue_write();

create trigger crafting_items_set_updated_at
  before update on public.crafting_items
  for each row execute function private.set_updated_at();

alter table public.crafting_items enable row level security;

revoke all on table public.crafting_items from public, anon, authenticated, service_role;
grant select on table public.crafting_items to authenticated;

-- The library owner only. Every write is import_crafting_pack's (no write grants).
create policy "Library owners read items"
  on public.crafting_items for select to authenticated
  using (
    library_id in (
      select l.id from public.crafting_libraries as l where l.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------------------------------

create table public.crafting_recipes (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.crafting_libraries (id) on delete cascade,
  slug text not null,
  output_item_id uuid not null,
  output_quantity integer not null,
  crafting_cost_cp integer not null,
  workdays integer not null,
  tools text[] not null default '{}',
  requirements text,
  check_skill text,
  check_dc integer,
  notes text,
  source text,
  dm_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crafting_recipes_slug_check check (
    char_length(slug) between 1 and 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  constraint crafting_recipes_output_quantity_check check (output_quantity between 1 and 999),
  constraint crafting_recipes_cost_check check (crafting_cost_cp between 0 and 100000000),
  constraint crafting_recipes_workdays_check check (workdays between 0 and 9999),
  constraint crafting_recipes_tools_check check (private.crafting_text_array_ok(tools, 10, 80)),
  constraint crafting_recipes_requirements_check check (
    requirements is null
    or (char_length(requirements) between 1 and 500
        and requirements !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]')
  ),
  constraint crafting_recipes_check_check check (
    (check_skill is null and check_dc is null)
    or (check_skill is not null and check_dc between 1 and 40
        and check_skill = btrim(check_skill)
        and char_length(check_skill) between 1 and 40
        and check_skill !~ '[[:cntrl:]]')
  ),
  constraint crafting_recipes_notes_check check (
    notes is null
    or (char_length(notes) between 1 and 2000
        and notes !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]')
  ),
  constraint crafting_recipes_source_check check (
    source is null
    or (source = btrim(source) and char_length(source) between 1 and 200
        and source !~ '[[:cntrl:]]')
  ),
  constraint crafting_recipes_dm_notes_check check (
    dm_notes is null
    or (char_length(dm_notes) between 1 and 2000
        and dm_notes !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]')
  ),
  constraint crafting_recipes_library_slug_key unique (library_id, slug),
  -- The target of the materials' composite foreign key.
  constraint crafting_recipes_library_id_key unique (library_id, id),
  -- The output stays in the recipe's library, and an item still used as an output can't be
  -- deleted (NO ACTION is checked at the end of the statement, so deleting a whole library still
  -- cascades).
  constraint crafting_recipes_output_fkey foreign key (library_id, output_item_id)
    references public.crafting_items (library_id, id)
);

create index crafting_recipes_output_idx on public.crafting_recipes (library_id, output_item_id);

-- Deleting a library (directly, or through its owner's account) cascades to its items and its
-- recipes with no defined order, and an item can't go while a recipe still uses it. Remove the
-- recipes first; their materials go with them.
create function private.crafting_library_delete_recipes()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.crafting_recipes where library_id = old.id;
  return old;
end;
$$;

revoke all on function private.crafting_library_delete_recipes()
  from public, anon, authenticated, service_role;

create trigger crafting_libraries_delete_recipes
  before delete on public.crafting_libraries
  for each row execute function private.crafting_library_delete_recipes();

create trigger crafting_recipes_guard_write
  before update on public.crafting_recipes
  for each row execute function private.guard_crafting_catalogue_write();

create trigger crafting_recipes_set_updated_at
  before update on public.crafting_recipes
  for each row execute function private.set_updated_at();

alter table public.crafting_recipes enable row level security;

revoke all on table public.crafting_recipes from public, anon, authenticated, service_role;
grant select on table public.crafting_recipes to authenticated;

create policy "Library owners read recipes"
  on public.crafting_recipes for select to authenticated
  using (
    library_id in (
      select l.id from public.crafting_libraries as l where l.owner_id = (select auth.uid())
    )
  );

create table public.crafting_recipe_materials (
  recipe_id uuid not null,
  library_id uuid not null,
  item_id uuid not null,
  role text not null,
  quantity integer not null,
  position smallint not null,

  primary key (recipe_id, item_id),
  constraint crafting_recipe_materials_role_check check (role in ('key', 'other')),
  constraint crafting_recipe_materials_quantity_check check (quantity between 1 and 999),
  constraint crafting_recipe_materials_position_check check (position between 0 and 19),
  constraint crafting_recipe_materials_recipe_fkey foreign key (library_id, recipe_id)
    references public.crafting_recipes (library_id, id) on delete cascade,
  constraint crafting_recipe_materials_item_fkey foreign key (library_id, item_id)
    references public.crafting_items (library_id, id)
);

-- The long rest's join (C4, plan §4), and the item foreign key's lookup.
create index crafting_recipe_materials_item_idx on public.crafting_recipe_materials (item_id);
create index crafting_recipe_materials_library_recipe_idx
  on public.crafting_recipe_materials (library_id, recipe_id);

alter table public.crafting_recipe_materials enable row level security;

revoke all on table public.crafting_recipe_materials from public, anon, authenticated, service_role;
grant select on table public.crafting_recipe_materials to authenticated;

create policy "Library owners read recipe materials"
  on public.crafting_recipe_materials for select to authenticated
  using (
    library_id in (
      select l.id from public.crafting_libraries as l where l.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Import history and campaign links
-- ---------------------------------------------------------------------------------------------

create table public.crafting_pack_imports (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.crafting_libraries (id) on delete cascade,
  imported_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  pack_name text not null,
  source_label text,
  items_added integer not null,
  items_updated integer not null,
  recipes_added integer not null,
  recipes_updated integer not null,
  items_removed integer not null,
  recipes_removed integer not null,
  imported_at timestamptz not null default now(),

  constraint crafting_pack_imports_pack_name_check check (
    pack_name = btrim(pack_name) and char_length(pack_name) between 1 and 120
    and pack_name !~ '[[:cntrl:]]'
  ),
  constraint crafting_pack_imports_source_label_check check (
    source_label is null
    or (source_label = btrim(source_label) and char_length(source_label) between 1 and 120
        and source_label !~ '[[:cntrl:]]')
  ),
  constraint crafting_pack_imports_counts_check check (
    items_added >= 0 and items_updated >= 0 and recipes_added >= 0 and recipes_updated >= 0
    and items_removed >= 0 and recipes_removed >= 0
  )
);

create index crafting_pack_imports_library_idx
  on public.crafting_pack_imports (library_id, imported_at desc);
-- The profiles FK cascade.
create index crafting_pack_imports_imported_by_idx on public.crafting_pack_imports (imported_by);

alter table public.crafting_pack_imports enable row level security;

revoke all on table public.crafting_pack_imports from public, anon, authenticated, service_role;
grant select on table public.crafting_pack_imports to authenticated;

create policy "Library owners read their import history"
  on public.crafting_pack_imports for select to authenticated
  using (
    library_id in (
      select l.id from public.crafting_libraries as l where l.owner_id = (select auth.uid())
    )
  );

create table public.campaign_crafting_libraries (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  library_id uuid not null references public.crafting_libraries (id) on delete cascade,
  enabled_by uuid default auth.uid() references public.profiles (id) on delete set null,
  enabled_at timestamptz not null default now(),

  primary key (campaign_id, library_id)
);

-- The library cascade and the long rest's lookup of a library's campaigns.
create index campaign_crafting_libraries_library_idx
  on public.campaign_crafting_libraries (library_id);
create index campaign_crafting_libraries_enabled_by_idx
  on public.campaign_crafting_libraries (enabled_by) where enabled_by is not null;

alter table public.campaign_crafting_libraries enable row level security;

revoke all on table public.campaign_crafting_libraries
  from public, anon, authenticated, service_role;
grant select on table public.campaign_crafting_libraries to authenticated;

-- The campaign owner lists what is enabled (and can disable it, C15). Players never see which
-- libraries exist. Writes are set_campaign_crafting_library's.
create policy "Campaign owners read enabled libraries"
  on public.campaign_crafting_libraries for select to authenticated
  using (
    exists (
      select 1 from public.campaigns as c
      where c.id = campaign_crafting_libraries.campaign_id
        and c.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------------------------
-- Pack validation helpers (plan §2.3, §2.4, §2.7)
-- Each raises crafting_pack_invalid with the failing path in DETAIL, and returns the normalized
-- value (trimmed, empty optional values as null).
-- ---------------------------------------------------------------------------------------------

create function private.craft_fail(p_path text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'crafting_pack_invalid' using detail = p_path;
end;
$$;

create function private.craft_text(
  p_obj jsonb,
  p_key text,
  p_path text,
  p_max integer,
  p_required boolean default false,
  p_multiline boolean default false
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_value jsonb := p_obj -> p_key;
  v_text text;
begin
  if v_value is null or jsonb_typeof(v_value) = 'null' then
    if p_required then
      perform private.craft_fail(p_path || '.' || p_key);
    end if;
    return null;
  end if;
  if jsonb_typeof(v_value) <> 'string' then
    perform private.craft_fail(p_path || '.' || p_key);
  end if;
  v_text := btrim(v_value #>> '{}');
  if v_text = '' then
    if p_required then
      perform private.craft_fail(p_path || '.' || p_key);
    end if;
    return null;
  end if;
  if char_length(v_text) > p_max
    or (p_multiline and v_text ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]')
    or (not p_multiline and v_text ~ '[[:cntrl:]]')
  then
    perform private.craft_fail(p_path || '.' || p_key);
  end if;
  return v_text;
end;
$$;

-- A slug, exactly as written (never trimmed or lowercased).
create function private.craft_slug(
  p_obj jsonb,
  p_key text,
  p_path text,
  p_required boolean default true
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_value jsonb := p_obj -> p_key;
  v_text text;
begin
  if v_value is null or jsonb_typeof(v_value) = 'null' then
    if p_required then
      perform private.craft_fail(p_path || '.' || p_key);
    end if;
    return null;
  end if;
  v_text := case when jsonb_typeof(v_value) = 'string' then v_value #>> '{}' end;
  if v_text is null or char_length(v_text) not between 1 and 80
    or v_text !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  then
    perform private.craft_fail(p_path || '.' || p_key);
  end if;
  return v_text;
end;
$$;

create function private.craft_enum(
  p_obj jsonb,
  p_key text,
  p_path text,
  p_allowed text[]
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_value jsonb := p_obj -> p_key;
begin
  if v_value is null or jsonb_typeof(v_value) <> 'string'
    or (v_value #>> '{}') <> all (p_allowed)
  then
    perform private.craft_fail(p_path || '.' || p_key);
  end if;
  return v_value #>> '{}';
end;
$$;

create function private.craft_int(
  p_obj jsonb,
  p_key text,
  p_path text,
  p_min integer,
  p_max integer,
  p_required boolean default false
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_value jsonb := p_obj -> p_key;
  v_number numeric;
begin
  if v_value is null or jsonb_typeof(v_value) = 'null' then
    if p_required then
      perform private.craft_fail(p_path || '.' || p_key);
    end if;
    return null;
  end if;
  if jsonb_typeof(v_value) <> 'number' then
    perform private.craft_fail(p_path || '.' || p_key);
  end if;
  v_number := (v_value #>> '{}')::numeric;
  if v_number <> trunc(v_number) or v_number < p_min or v_number > p_max then
    perform private.craft_fail(p_path || '.' || p_key);
  end if;
  return v_number::integer;
end;
$$;

-- A non-negative number of at most 2 decimals, up to p_max (gp values and weights).
create function private.craft_decimal(
  p_obj jsonb,
  p_key text,
  p_path text,
  p_max numeric,
  p_required boolean default false
)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_value jsonb := p_obj -> p_key;
  v_number numeric;
begin
  if v_value is null or jsonb_typeof(v_value) = 'null' then
    if p_required then
      perform private.craft_fail(p_path || '.' || p_key);
    end if;
    return null;
  end if;
  if jsonb_typeof(v_value) <> 'number' then
    perform private.craft_fail(p_path || '.' || p_key);
  end if;
  v_number := (v_value #>> '{}')::numeric;
  if v_number < 0 or v_number > p_max or v_number * 100 <> trunc(v_number * 100) then
    perform private.craft_fail(p_path || '.' || p_key);
  end if;
  return v_number;
end;
$$;

create function private.craft_bool(p_obj jsonb, p_key text, p_path text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_value jsonb := p_obj -> p_key;
begin
  if v_value is null or jsonb_typeof(v_value) = 'null' then
    return false;
  end if;
  if jsonb_typeof(v_value) <> 'boolean' then
    perform private.craft_fail(p_path || '.' || p_key);
  end if;
  return (v_value #>> '{}')::boolean;
end;
$$;

create function private.craft_text_list(
  p_obj jsonb,
  p_key text,
  p_path text,
  p_max_count integer,
  p_max_len integer
)
returns text[]
language plpgsql
set search_path = ''
as $$
declare
  v_value jsonb := p_obj -> p_key;
  v_result text[] := '{}';
  v_entry jsonb;
  v_text text;
begin
  if v_value is null or jsonb_typeof(v_value) = 'null' then
    return v_result;
  end if;
  if jsonb_typeof(v_value) <> 'array' or jsonb_array_length(v_value) > p_max_count then
    perform private.craft_fail(p_path || '.' || p_key);
  end if;
  for v_entry in select e.value from jsonb_array_elements(v_value) as e (value) loop
    v_text := case when jsonb_typeof(v_entry) = 'string' then btrim(v_entry #>> '{}') end;
    if v_text is null or char_length(v_text) not between 1 and p_max_len
      or v_text ~ '[[:cntrl:]]'
    then
      perform private.craft_fail(p_path || '.' || p_key);
    end if;
    v_result := v_result || v_text;
  end loop;
  return v_result;
end;
$$;

create function private.craft_harvest(p_obj jsonb, p_path text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_value jsonb := p_obj -> 'harvest';
  v_path text := p_path || '.harvest';
  v_from text[];
  v_result jsonb;
begin
  if v_value is null or jsonb_typeof(v_value) = 'null' then
    return null;
  end if;
  if not private.import_has_only_keys(v_value, array['from', 'skill', 'dc', 'notes']) then
    perform private.craft_fail(v_path);
  end if;
  v_from := private.craft_text_list(v_value, 'from', v_path, 10, 80);
  v_result := jsonb_strip_nulls(jsonb_build_object(
    'from', case when cardinality(v_from) > 0 then to_jsonb(v_from) end,
    'skill', private.craft_text(v_value, 'skill', v_path, 40),
    'dc', private.craft_int(v_value, 'dc', v_path, 1, 40),
    'notes', private.craft_text(v_value, 'notes', v_path, 500, false, true)
  ));
  return case when v_result = '{}'::jsonb then null else v_result end;
end;
$$;

revoke all on function
  private.craft_fail(text),
  private.craft_text(jsonb, text, text, integer, boolean, boolean),
  private.craft_slug(jsonb, text, text, boolean),
  private.craft_enum(jsonb, text, text, text[]),
  private.craft_int(jsonb, text, text, integer, integer, boolean),
  private.craft_decimal(jsonb, text, text, numeric, boolean),
  private.craft_bool(jsonb, text, text),
  private.craft_text_list(jsonb, text, text, integer, integer),
  private.craft_harvest(jsonb, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- import_crafting_pack
-- ---------------------------------------------------------------------------------------------

create function public.import_crafting_pack(
  p_library_id uuid,
  p_pack jsonb,
  p_source_label text default null
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller_id uuid := auth.uid();
  v_label text := nullif(btrim(p_source_label), '');
  v_meta jsonb;
  v_pack_name text;
  v_items jsonb;
  v_recipes jsonb;
  v_remove jsonb;
  v_remove_items text[] := '{}';
  v_remove_recipes text[] := '{}';
  v_entry jsonb;
  v_line jsonb;
  v_lines jsonb;
  v_output jsonb;
  v_check jsonb;
  v_attunement jsonb;
  v_index integer;
  v_line_index integer;
  v_path text;
  v_line_path text;
  v_role text;
  v_slug text;
  v_name text;
  v_slug_seen text[];
  v_name_seen text[];
  v_line_slugs text[];
  v_item_id uuid;
  v_recipe_id uuid;
  v_output_id uuid;
  v_line_items uuid[];
  v_line_roles text[];
  v_line_quantities integer[];
  v_inserted boolean;
  v_att boolean;
  v_att_note text;
  v_check_skill text;
  v_check_dc integer;
  v_count integer;
  v_items_added integer := 0;
  v_items_updated integer := 0;
  v_recipes_added integer := 0;
  v_recipes_updated integer := 0;
  v_items_removed integer := 0;
  v_recipes_removed integer := 0;
  v_detail text;
  v_import_id uuid;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'crafting_sign_in_required';
  end if;
  if p_library_id is null or p_pack is null then
    raise invalid_parameter_value using message = 'crafting_argument_required';
  end if;
  if v_label is not null and (char_length(v_label) > 120 or v_label ~ '[[:cntrl:]]') then
    raise exception 'crafting_pack_invalid' using detail = 'source_label';
  end if;

  -- Serializes imports of one library, and the long rest's read of it (plan §5.2).
  perform 1 from public.crafting_libraries as l
  where l.id = p_library_id and l.owner_id = caller_id
  for update of l;
  if not found then
    raise exception 'crafting_library_unavailable';
  end if;

  -- Envelope.
  if not private.import_has_only_keys(
    p_pack, array['format', 'version', 'pack', 'items', 'recipes', 'remove']
  ) then
    perform private.craft_fail('$');
  end if;
  if p_pack -> 'format' is distinct from to_jsonb('the-goobers-guide-crafting-pack'::text) then
    perform private.craft_fail('format');
  end if;
  if jsonb_typeof(p_pack -> 'version') is distinct from 'number'
    or p_pack -> 'version' is distinct from to_jsonb(1)
  then
    perform private.craft_fail('version');
  end if;
  v_meta := p_pack -> 'pack';
  if not private.import_has_only_keys(v_meta, array['name', 'source', 'description']) then
    perform private.craft_fail('pack');
  end if;
  v_pack_name := private.craft_text(v_meta, 'name', 'pack', 120, true);
  perform private.craft_text(v_meta, 'source', 'pack', 200);
  perform private.craft_text(v_meta, 'description', 'pack', 2000, false, true);

  v_items := coalesce(p_pack -> 'items', '[]'::jsonb);
  v_recipes := coalesce(p_pack -> 'recipes', '[]'::jsonb);
  v_remove := coalesce(p_pack -> 'remove', '{}'::jsonb);
  if jsonb_typeof(v_items) <> 'array' then
    perform private.craft_fail('items');
  end if;
  if jsonb_typeof(v_recipes) <> 'array' then
    perform private.craft_fail('recipes');
  end if;
  if jsonb_array_length(v_items) > 2000 then
    raise exception 'crafting_library_full' using detail = 'items';
  end if;
  if jsonb_array_length(v_recipes) > 2000 then
    raise exception 'crafting_library_full' using detail = 'recipes';
  end if;
  if not private.import_has_only_keys(v_remove, array['items', 'recipes']) then
    perform private.craft_fail('remove');
  end if;
  foreach v_role in array array['items', 'recipes'] loop
    v_lines := v_remove -> v_role;
    if v_lines is null then
      continue;
    end if;
    if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) > 2000 then
      perform private.craft_fail('remove.' || v_role);
    end if;
    v_index := 0;
    for v_entry in select e.value from jsonb_array_elements(v_lines) as e (value) loop
      v_slug := private.craft_slug(
        jsonb_build_object('s', v_entry), 's', 'remove.' || v_role || '[' || v_index || ']'
      );
      if v_role = 'items' then
        v_remove_items := v_remove_items || v_slug;
      else
        v_remove_recipes := v_remove_recipes || v_slug;
      end if;
      v_index := v_index + 1;
    end loop;
  end loop;
  if jsonb_array_length(v_items) + jsonb_array_length(v_recipes)
    + cardinality(v_remove_items) + cardinality(v_remove_recipes) = 0
  then
    perform private.craft_fail('$');
  end if;

  -- Items. Names are checked at the end, so a pack may swap two names.
  set constraints public.crafting_items_library_name_key deferred;
  v_slug_seen := '{}';
  v_name_seen := '{}';
  for v_entry, v_index in
    select e.value, (e.ordinality - 1)::integer
    from jsonb_array_elements(v_items) with ordinality as e (value, ordinality)
  loop
    v_path := 'items[' || v_index || ']';
    if not private.import_has_only_keys(
      v_entry,
      array[
        'id', 'name', 'category', 'rarity', 'value_gp', 'weight', 'consumable', 'attunement',
        'description', 'tags', 'source', 'harvest', 'dm_notes'
      ]
    ) then
      perform private.craft_fail(v_path);
    end if;
    v_slug := private.craft_slug(v_entry, 'id', v_path);
    if v_slug = any (v_slug_seen) then
      perform private.craft_fail(v_path || '.id');
    end if;
    v_slug_seen := v_slug_seen || v_slug;
    v_name := private.craft_text(v_entry, 'name', v_path, 80, true);
    if lower(v_name) = any (v_name_seen) then
      raise exception 'crafting_name_taken' using detail = v_path || '.name';
    end if;
    v_name_seen := v_name_seen || lower(v_name);

    v_attunement := v_entry -> 'attunement';
    v_att := false;
    v_att_note := null;
    if v_attunement is not null and jsonb_typeof(v_attunement) <> 'null' then
      if jsonb_typeof(v_attunement) = 'boolean' then
        v_att := (v_attunement #>> '{}')::boolean;
      elsif jsonb_typeof(v_attunement) = 'string' then
        v_att := true;
        v_att_note := private.craft_text(v_entry, 'attunement', v_path, 120, true);
      else
        perform private.craft_fail(v_path || '.attunement');
      end if;
    end if;

    insert into public.crafting_items as i (
      library_id, slug, name, category, rarity, value_cp, weight, consumable, attunement,
      attunement_note, description, tags, source, harvest, dm_notes
    )
    values (
      p_library_id,
      v_slug,
      v_name,
      private.craft_enum(
        v_entry, 'category', v_path,
        array[
          'material', 'weapon', 'armor', 'shield', 'wondrous', 'potion', 'scroll',
          'ammunition', 'tool', 'other'
        ]
      ),
      private.craft_enum(
        v_entry, 'rarity', v_path,
        array['common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact']
      ),
      (private.craft_decimal(v_entry, 'value_gp', v_path, 1000000, true) * 100)::integer,
      private.craft_decimal(v_entry, 'weight', v_path, 99999.99),
      private.craft_bool(v_entry, 'consumable', v_path),
      v_att,
      v_att_note,
      private.craft_text(v_entry, 'description', v_path, 2000, false, true),
      private.craft_text_list(v_entry, 'tags', v_path, 10, 40),
      private.craft_text(v_entry, 'source', v_path, 200),
      private.craft_harvest(v_entry, v_path),
      private.craft_text(v_entry, 'dm_notes', v_path, 2000, false, true)
    )
    on conflict (library_id, slug) do update set
      name = excluded.name,
      category = excluded.category,
      rarity = excluded.rarity,
      value_cp = excluded.value_cp,
      weight = excluded.weight,
      consumable = excluded.consumable,
      attunement = excluded.attunement,
      attunement_note = excluded.attunement_note,
      description = excluded.description,
      tags = excluded.tags,
      source = excluded.source,
      harvest = excluded.harvest,
      dm_notes = excluded.dm_notes
    returning (xmax = 0) into v_inserted;

    if v_inserted then
      v_items_added := v_items_added + 1;
    else
      v_items_updated := v_items_updated + 1;
    end if;
  end loop;

  -- Recipes. Item references resolve against the library as it now stands, so a recipe-only pack
  -- may use items from an earlier import.
  v_slug_seen := '{}';
  for v_entry, v_index in
    select e.value, (e.ordinality - 1)::integer
    from jsonb_array_elements(v_recipes) with ordinality as e (value, ordinality)
  loop
    v_path := 'recipes[' || v_index || ']';
    if not private.import_has_only_keys(
      v_entry,
      array[
        'id', 'output', 'key_materials', 'materials', 'crafting_cost_gp', 'workdays', 'tools',
        'requirements', 'check', 'notes', 'source', 'dm_notes'
      ]
    ) then
      perform private.craft_fail(v_path);
    end if;
    v_slug := private.craft_slug(v_entry, 'id', v_path);
    if v_slug = any (v_slug_seen) then
      perform private.craft_fail(v_path || '.id');
    end if;
    v_slug_seen := v_slug_seen || v_slug;

    v_output := v_entry -> 'output';
    if not private.import_has_only_keys(v_output, array['item', 'quantity']) then
      perform private.craft_fail(v_path || '.output');
    end if;
    v_line_slugs := array[private.craft_slug(v_output, 'item', v_path || '.output')];
    select i.id into v_output_id
    from public.crafting_items as i
    where i.library_id = p_library_id and i.slug = v_line_slugs[1];
    if v_output_id is null then
      raise exception 'crafting_pack_reference_missing' using detail = v_path || '.output.item';
    end if;

    -- Key lines first, then the others: positions keep the file's order.
    v_line_items := '{}';
    v_line_roles := '{}';
    v_line_quantities := '{}';
    for v_role in select r from unnest(array['key_materials', 'materials']) as r loop
      v_lines := v_entry -> v_role;
      if v_lines is null or jsonb_typeof(v_lines) = 'null' then
        v_lines := '[]'::jsonb;
      end if;
      if jsonb_typeof(v_lines) <> 'array' then
        perform private.craft_fail(v_path || '.' || v_role);
      end if;
      v_line_index := 0;
      for v_line in select e.value from jsonb_array_elements(v_lines) as e (value) loop
        v_line_path := v_path || '.' || v_role || '[' || v_line_index || ']';
        if not private.import_has_only_keys(v_line, array['item', 'quantity']) then
          perform private.craft_fail(v_line_path);
        end if;
        v_name := private.craft_slug(v_line, 'item', v_line_path);
        -- Each item at most once per recipe, and never the output itself.
        if v_name = any (v_line_slugs) then
          perform private.craft_fail(v_line_path || '.item');
        end if;
        v_line_slugs := v_line_slugs || v_name;
        select i.id into v_item_id
        from public.crafting_items as i
        where i.library_id = p_library_id and i.slug = v_name;
        if v_item_id is null then
          raise exception 'crafting_pack_reference_missing' using detail = v_line_path || '.item';
        end if;
        v_line_items := v_line_items || v_item_id;
        v_line_roles := v_line_roles || case when v_role = 'key_materials' then 'key' else 'other' end;
        v_line_quantities := v_line_quantities
          || private.craft_int(v_line, 'quantity', v_line_path, 1, 999, true);
        v_line_index := v_line_index + 1;
      end loop;
      if v_role = 'key_materials' and v_line_index not between 1 and 5 then
        perform private.craft_fail(v_path || '.key_materials');
      end if;
    end loop;
    if cardinality(v_line_items) > 20 then
      perform private.craft_fail(v_path || '.materials');
    end if;

    v_check := v_entry -> 'check';
    v_check_skill := null;
    v_check_dc := null;
    if v_check is not null and jsonb_typeof(v_check) <> 'null' then
      if not private.import_has_only_keys(v_check, array['skill', 'dc']) then
        perform private.craft_fail(v_path || '.check');
      end if;
      v_check_skill := private.craft_text(v_check, 'skill', v_path || '.check', 40, true);
      v_check_dc := private.craft_int(v_check, 'dc', v_path || '.check', 1, 40, true);
    end if;

    insert into public.crafting_recipes as r (
      library_id, slug, output_item_id, output_quantity, crafting_cost_cp, workdays, tools,
      requirements, check_skill, check_dc, notes, source, dm_notes
    )
    values (
      p_library_id,
      v_slug,
      v_output_id,
      private.craft_int(v_output, 'quantity', v_path || '.output', 1, 999, true),
      (private.craft_decimal(v_entry, 'crafting_cost_gp', v_path, 1000000, true) * 100)::integer,
      private.craft_int(v_entry, 'workdays', v_path, 0, 9999, true),
      private.craft_text_list(v_entry, 'tools', v_path, 10, 80),
      private.craft_text(v_entry, 'requirements', v_path, 500, false, true),
      v_check_skill,
      v_check_dc,
      private.craft_text(v_entry, 'notes', v_path, 2000, false, true),
      private.craft_text(v_entry, 'source', v_path, 200),
      private.craft_text(v_entry, 'dm_notes', v_path, 2000, false, true)
    )
    on conflict (library_id, slug) do update set
      output_item_id = excluded.output_item_id,
      output_quantity = excluded.output_quantity,
      crafting_cost_cp = excluded.crafting_cost_cp,
      workdays = excluded.workdays,
      tools = excluded.tools,
      requirements = excluded.requirements,
      check_skill = excluded.check_skill,
      check_dc = excluded.check_dc,
      notes = excluded.notes,
      source = excluded.source,
      dm_notes = excluded.dm_notes
    returning r.id, (xmax = 0) into v_recipe_id, v_inserted;

    if v_inserted then
      v_recipes_added := v_recipes_added + 1;
    else
      v_recipes_updated := v_recipes_updated + 1;
    end if;

    -- Lines are replaced per recipe.
    delete from public.crafting_recipe_materials as m where m.recipe_id = v_recipe_id;
    insert into public.crafting_recipe_materials (
      recipe_id, library_id, item_id, role, quantity, position
    )
    select v_recipe_id, p_library_id, t.item_id, t.role, t.quantity, (t.ordinality - 1)::smallint
    from unnest(v_line_items, v_line_roles, v_line_quantities)
      with ordinality as t (item_id, role, quantity, ordinality);
  end loop;

  -- Removals: recipes first, so an item and the recipes that used it can leave together. An item
  -- that a remaining recipe still uses can't (the foreign keys are checked at statement end).
  if cardinality(v_remove_recipes) > 0 then
    delete from public.crafting_recipes as r
    where r.library_id = p_library_id and r.slug = any (v_remove_recipes);
    get diagnostics v_recipes_removed = row_count;
  end if;
  if cardinality(v_remove_items) > 0 then
    begin
      delete from public.crafting_items as i
      where i.library_id = p_library_id and i.slug = any (v_remove_items);
      get diagnostics v_items_removed = row_count;
    exception when foreign_key_violation then
      raise exception 'crafting_pack_reference_missing' using detail = 'remove.items';
    end;
  end if;

  -- Names are unique per library (W5). The constraint is deferred so a pack may swap two names;
  -- check it now.
  begin
    set constraints public.crafting_items_library_name_key immediate;
  exception when unique_violation then
    get stacked diagnostics v_detail = pg_exception_detail;
    raise exception 'crafting_name_taken' using detail = v_detail;
  end;

  select count(*) into v_count from public.crafting_items as i where i.library_id = p_library_id;
  if v_count > 2000 then
    raise exception 'crafting_library_full' using detail = 'items';
  end if;
  select count(*) into v_count from public.crafting_recipes as r where r.library_id = p_library_id;
  if v_count > 2000 then
    raise exception 'crafting_library_full' using detail = 'recipes';
  end if;

  insert into public.crafting_pack_imports (
    library_id, imported_by, pack_name, source_label, items_added, items_updated,
    recipes_added, recipes_updated, items_removed, recipes_removed
  )
  values (
    p_library_id, caller_id, v_pack_name, v_label, v_items_added, v_items_updated,
    v_recipes_added, v_recipes_updated, v_items_removed, v_recipes_removed
  )
  returning id into v_import_id;

  -- The history keeps the newest 100 imports per library.
  delete from public.crafting_pack_imports as h
  where h.library_id = p_library_id
    and h.id in (
      select o.id from public.crafting_pack_imports as o
      where o.library_id = p_library_id
      order by o.imported_at desc, o.id desc
      offset 100
    );

  update public.crafting_libraries as l set updated_at = now() where l.id = p_library_id;

  return jsonb_build_object(
    'import_id', v_import_id,
    'items_added', v_items_added,
    'items_updated', v_items_updated,
    'recipes_added', v_recipes_added,
    'recipes_updated', v_recipes_updated,
    'items_removed', v_items_removed,
    'recipes_removed', v_recipes_removed
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- delete_crafting_library
-- ---------------------------------------------------------------------------------------------

-- With p_confirm = false, reports what deleting would affect. With true, deletes the library and,
-- through the cascades, its catalogue, history, and campaign links. `saved` and `linked_items`
-- count rows in tables that arrive in later phases and are zero until then; those migrations
-- replace this function to count them.
create function public.delete_crafting_library(p_library_id uuid, p_confirm boolean)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller_id uuid := auth.uid();
  v_campaigns integer;
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

  if p_confirm then
    delete from public.crafting_libraries as l where l.id = p_library_id;
  end if;

  return jsonb_build_object(
    'campaigns', v_campaigns,
    'saved', 0,
    'linked_items', 0,
    'deleted', p_confirm
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- set_campaign_crafting_library
-- ---------------------------------------------------------------------------------------------

-- Enable: the caller owns the campaign and the library, at most 10 libraries per campaign.
-- Disable: the caller owns the campaign, whoever owns the library (C15). Idempotent.
create function public.set_campaign_crafting_library(
  p_campaign_id uuid,
  p_library_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller_id uuid := auth.uid();
  v_owner_id uuid;
begin
  if caller_id is null then
    raise insufficient_privilege using message = 'crafting_sign_in_required';
  end if;
  if p_campaign_id is null or p_library_id is null or p_enabled is null then
    raise invalid_parameter_value using message = 'crafting_argument_required';
  end if;

  -- Membership changes take NO KEY UPDATE on the campaign, so they wait for this call.
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

  if not p_enabled then
    delete from public.campaign_crafting_libraries as c
    where c.campaign_id = p_campaign_id and c.library_id = p_library_id;
    return;
  end if;

  if not exists (
    select 1 from public.crafting_libraries as l
    where l.id = p_library_id and l.owner_id = caller_id
  ) then
    raise exception 'crafting_library_unavailable';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('campaign_crafting_libraries:' || p_campaign_id::text, 0)
  );
  if exists (
    select 1 from public.campaign_crafting_libraries as c
    where c.campaign_id = p_campaign_id and c.library_id = p_library_id
  ) then
    return;
  end if;
  if (select count(*) from public.campaign_crafting_libraries as c
      where c.campaign_id = p_campaign_id) >= 10 then
    raise exception 'crafting_campaign_library_limit';
  end if;

  begin
    insert into public.campaign_crafting_libraries (campaign_id, library_id, enabled_by)
    values (p_campaign_id, p_library_id, caller_id);
  exception when foreign_key_violation then
    -- The library was deleted a moment ago.
    raise exception 'crafting_library_unavailable';
  end;
end;
$$;

revoke all on function public.import_crafting_pack(uuid, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function public.delete_crafting_library(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.set_campaign_crafting_library(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;

grant execute on function public.import_crafting_pack(uuid, jsonb, text) to authenticated;
grant execute on function public.delete_crafting_library(uuid, boolean) to authenticated;
grant execute on function public.set_campaign_crafting_library(uuid, uuid, boolean)
  to authenticated;

commit;
