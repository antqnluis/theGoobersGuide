begin;

-- M03.2 Phase 1: characters and character sheets.
-- Creation and state transitions (status, party) are added in the next migration as RPCs;
-- clients have no INSERT grant and no UPDATE grant on status or in_party.

-- Structural rules for the version-1 sheet body. Reads no tables, so it is valid in a
-- check constraint. Free-text lengths are bounded by the 64 KiB size cap in the table.
create function private.character_sheet_is_valid(p_sheet jsonb)
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
      if jsonb_typeof(element) <> 'object' then
        return false;
      end if;
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

revoke all on function private.character_sheet_is_valid(jsonb)
  from public, anon, authenticated, service_role;

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null,
  species text,
  class_name text,
  subclass text,
  background text,
  level integer not null default 1,
  status text not null default 'active',
  in_party boolean not null default false,
  sheet_visibility text not null default 'private',
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint characters_name_check check (
    name = btrim(name) and char_length(name) between 1 and 80 and name !~ '[[:cntrl:]]'
  ),
  constraint characters_details_check check (
    (species is null or (species = btrim(species) and char_length(species) between 1 and 60 and species !~ '[[:cntrl:]]'))
    and (class_name is null or (class_name = btrim(class_name) and char_length(class_name) between 1 and 60 and class_name !~ '[[:cntrl:]]'))
    and (subclass is null or (subclass = btrim(subclass) and char_length(subclass) between 1 and 60 and subclass !~ '[[:cntrl:]]'))
    and (background is null or (background = btrim(background) and char_length(background) between 1 and 60 and background !~ '[[:cntrl:]]'))
  ),
  constraint characters_level_check check (level between 1 and 20),
  constraint characters_status_check check (status in ('active', 'retired', 'deceased')),
  constraint characters_sheet_visibility_check check (sheet_visibility in ('private', 'campaign')),
  constraint characters_party_requires_active check (not in_party or status = 'active'),

  -- Targets for later composite FKs (adventure participants: same campaign, same owner).
  constraint characters_id_campaign_key unique (id, campaign_id),
  constraint characters_id_owner_key unique (id, owner_id)
);

-- At most one active character per player per campaign, for every write path.
create unique index characters_one_active_per_player_idx
  on public.characters (campaign_id, owner_id) where status = 'active';

-- Listing by campaign, the campaign FK cascade, and the departure hook's update.
create index characters_campaign_owner_idx on public.characters (campaign_id, owner_id);
-- The profiles FK cascade.
create index characters_owner_id_idx on public.characters (owner_id);

create table public.character_sheets (
  character_id uuid primary key references public.characters (id) on delete cascade,
  max_hp integer,
  current_hp integer,
  temp_hp integer not null default 0,
  armor_class integer,
  speed integer,
  sheet jsonb not null default '{"version": 1}'::jsonb,
  updated_at timestamptz not null default now(),

  constraint character_sheets_hp_check check (
    (max_hp is null or max_hp between 1 and 9999)
    and (current_hp is null or current_hp between 0 and 9999)
    and (max_hp is null or current_hp is null or current_hp <= max_hp)
    and temp_hp between 0 and 9999
  ),
  constraint character_sheets_armor_class_check check (armor_class is null or armor_class between 0 and 99),
  constraint character_sheets_speed_check check (speed is null or speed between 0 and 999),
  constraint character_sheets_sheet_check check (
    octet_length(sheet::text) <= 65536 and private.character_sheet_is_valid(sheet)
  )
);

-- Integrity for every write path, including postgres and service-role tooling.
create function private.guard_character_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  needs_membership boolean;
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.campaign_id <> old.campaign_id or new.owner_id <> old.owner_id then
      raise integrity_constraint_violation using message = 'character_reassignment_forbidden';
    end if;
    if new.status <> old.status then
      new.status_changed_at := now();
    end if;
  end if;

  -- A character can be created, or join the party, only while its owner is a member.
  if tg_op = 'INSERT' then
    needs_membership := true;
  else
    needs_membership := new.in_party and not old.in_party;
  end if;
  if needs_membership and not exists (
    select 1 from public.campaign_members as m
    where m.campaign_id = new.campaign_id and m.profile_id = new.owner_id
  ) then
    raise integrity_constraint_violation using message = 'character_owner_not_member';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_character_write()
  from public, anon, authenticated, service_role;

create trigger characters_guard_write
  before insert or update on public.characters
  for each row execute function private.guard_character_write();

create trigger characters_set_updated_at
  before update on public.characters
  for each row execute function private.set_updated_at();

create trigger character_sheets_set_updated_at
  before update on public.character_sheets
  for each row execute function private.set_updated_at();

alter table public.characters enable row level security;
alter table public.character_sheets enable row level security;

revoke all on table public.characters, public.character_sheets
  from public, anon, authenticated, service_role;

grant select, delete on table public.characters to authenticated;
grant update (name, species, class_name, subclass, background, level, sheet_visibility)
  on table public.characters to authenticated;

grant select on table public.character_sheets to authenticated;
grant update (max_hp, current_hp, temp_hp, armor_class, speed, sheet)
  on table public.character_sheets to authenticated;

-- Summaries: current members see the characters of current members, all statuses.
create policy "Members read current members' characters"
  on public.characters for select to authenticated
  using (
    campaign_id in (select private.current_campaign_ids())
    and exists (
      select 1 from public.campaign_members as m
      where m.campaign_id = characters.campaign_id and m.profile_id = characters.owner_id
    )
  );

create policy "Owners update their characters"
  on public.characters for update to authenticated
  using (owner_id = (select auth.uid()) and campaign_id in (select private.current_campaign_ids()))
  with check (owner_id = (select auth.uid()) and campaign_id in (select private.current_campaign_ids()));

create policy "Owners delete their characters"
  on public.characters for delete to authenticated
  using (owner_id = (select auth.uid()) and campaign_id in (select private.current_campaign_ids()));

-- Sheets: the owner always (while a member); other current members only when shared.
-- The subquery is filtered by the characters SELECT policy.
create policy "Owners and shared members read sheets"
  on public.character_sheets for select to authenticated
  using (
    exists (
      select 1 from public.characters as c
      where c.id = character_sheets.character_id
        and (c.owner_id = (select auth.uid()) or c.sheet_visibility = 'campaign')
    )
  );

create policy "Owners update their sheets"
  on public.character_sheets for update to authenticated
  using (
    exists (
      select 1 from public.characters as c
      where c.id = character_sheets.character_id
        and c.owner_id = (select auth.uid())
        and c.campaign_id in (select private.current_campaign_ids())
    )
  )
  with check (
    exists (
      select 1 from public.characters as c
      where c.id = character_sheets.character_id
        and c.owner_id = (select auth.uid())
        and c.campaign_id in (select private.current_campaign_ids())
    )
  );

commit;
