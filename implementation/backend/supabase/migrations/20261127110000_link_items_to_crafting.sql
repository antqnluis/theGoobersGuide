begin;

-- M04 Phase 3: catalogue links on inventory items (plan §3.3, C9, C10).
--   * character_items.crafting_item_id: set when the player picks a suggestion. Unlinked items
--     still match by exact name (W5), so the column is only ever a shortcut.
--   * guard_character_item_write refuses a link to an item that is not in a library enabled on
--     the character's campaign. A later disable keeps the link, but it stops counting (C5).
--   * search_crafting_items: the suggestions behind the item form. Materials of the enabled
--     libraries only for now; Phase 4 adds the outputs of the character's own visions.
--   * delete_crafting_library now counts the inventory links a delete would clear.

-- ---------------------------------------------------------------------------------------------
-- The link
-- ---------------------------------------------------------------------------------------------

-- Deleting a catalogue item (or its whole library) clears the link and keeps the inventory item.
alter table public.character_items
  add column crafting_item_id uuid references public.crafting_items (id) on delete set null;

-- The set-null action and the long rest's join both look rows up by this column.
create index character_items_crafting_item_idx
  on public.character_items (crafting_item_id) where crafting_item_id is not null;

grant insert (crafting_item_id) on table public.character_items to authenticated;
grant update (crafting_item_id) on table public.character_items to authenticated;

-- The link must name an item of a library enabled on the character's campaign. Anything else,
-- including an item that does not exist, gets the same error, so a player can't probe for ids.
create function private.assert_item_catalogue_link(p_character_id uuid, p_crafting_item_id uuid)
returns void
language plpgsql
stable
security definer set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.crafting_items as i
    join public.campaign_crafting_libraries as l on l.library_id = i.library_id
    join public.characters as c on c.campaign_id = l.campaign_id
    where i.id = p_crafting_item_id and c.id = p_character_id
  ) then
    raise exception 'item_catalogue_unavailable';
  end if;
end;
$$;

revoke all on function private.assert_item_catalogue_link(uuid, uuid)
  from public, anon, authenticated, service_role;

-- Same guard as before, plus the link check when a link is set or changed. Clearing a link, and
-- the set-null action of a deleted catalogue item, are always allowed.
create or replace function private.guard_character_item_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.character_id <> old.character_id then
      raise integrity_constraint_violation using message = 'item_reassignment_forbidden';
    end if;
    if new.crafting_item_id is not null
       and new.crafting_item_id is distinct from old.crafting_item_id then
      perform private.assert_item_catalogue_link(new.character_id, new.crafting_item_id);
    end if;
    return new;
  end if;

  -- INSERT: serialize inserts for one character, then enforce the cap (D6).
  perform 1 from public.characters where id = new.character_id for no key update;
  if (select count(*) from public.character_items where character_id = new.character_id) >= 200 then
    raise exception 'item_limit_reached';
  end if;
  if new.crafting_item_id is not null then
    perform private.assert_item_catalogue_link(new.character_id, new.crafting_item_id);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- search_crafting_items
-- ---------------------------------------------------------------------------------------------

-- At most 8 suggestions for a character's item form, from the libraries enabled on its campaign:
-- name, category, rarity, value, weight, and description only (C16). A match is a name that
-- starts with the query or has a word that does. The query is 2 to 80 characters. The caller
-- must own the character and be a current member; anyone else gets character_unavailable.
create function public.search_crafting_items(p_character_id uuid, p_query text)
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
      and i.category = 'material'
      and (i.name_key like v_pattern || '%' escape '\'
           or i.name_key like '% ' || v_pattern || '%' escape '\')
    order by 9, i.name_key, i.id
    limit 8
  ) as s;

  return v_result;
end;
$$;

revoke all on function public.search_crafting_items(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.search_crafting_items(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- delete_crafting_library: count the links a delete clears
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

  select count(*) into v_linked
  from public.character_items as ci
  join public.crafting_items as i on i.id = ci.crafting_item_id
  where i.library_id = p_library_id;

  if p_confirm then
    delete from public.crafting_libraries as l where l.id = p_library_id;
  end if;

  -- `saved` counts rows in a table that arrives in Phase 4, which replaces this function.
  return jsonb_build_object(
    'campaigns', v_campaigns,
    'saved', 0,
    'linked_items', v_linked,
    'deleted', p_confirm
  );
end;
$$;

commit;
