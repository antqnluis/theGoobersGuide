begin;

-- M03.2 Phase 2: character lifecycle RPCs and the departure hook body.
--
-- Lock order is always campaigns -> characters. Every RPC locks the campaign row FOR SHARE,
-- which conflicts with the FOR NO KEY UPDATE taken by leave_campaign, remove_campaign_member,
-- transfer_campaign_ownership, invitation responses, owner edits, and campaign deletion, but
-- not with other FOR SHARE locks, so character changes by different players run in parallel
-- while membership changes serialize with them.

create function public.create_character(
  p_campaign_id uuid,
  p_name text,
  p_species text default null,
  p_class_name text default null,
  p_subclass text default null,
  p_background text default null,
  p_level integer default 1,
  p_in_party boolean default false
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_name text := btrim(p_name);
  v_species text := nullif(btrim(p_species), '');
  v_class text := nullif(btrim(p_class_name), '');
  v_subclass text := nullif(btrim(p_subclass), '');
  v_background text := nullif(btrim(p_background), '');
  v_level integer := coalesce(p_level, 1);
  v_in_party boolean := coalesce(p_in_party, false);
  v_character_id uuid;
  v_constraint text;
begin
  if p_campaign_id is null then
    raise invalid_parameter_value using message = 'character_campaign_required';
  end if;

  if v_name is null or char_length(v_name) not between 1 and 80 or v_name ~ '[[:cntrl:]]' then
    raise invalid_parameter_value using message = 'character_name_invalid';
  end if;

  if exists (
    select 1
    from unnest(array[v_species, v_class, v_subclass, v_background]) as detail
    where detail is not null and (char_length(detail) > 60 or detail ~ '[[:cntrl:]]')
  ) then
    raise invalid_parameter_value using message = 'character_details_invalid';
  end if;

  if v_level not between 1 and 20 then
    raise invalid_parameter_value using message = 'character_level_invalid';
  end if;

  -- Serialize with membership changes. Only members can lock, and an unknown,
  -- inaccessible, or departed campaign gets the same response.
  perform 1
  from public.campaigns
  where campaigns.id = p_campaign_id
    and exists (
      select 1 from public.campaign_members as m
      where m.campaign_id = campaigns.id and m.profile_id = caller_id
    )
  for share of campaigns;
  if not found then
    raise exception 'character_campaign_unavailable';
  end if;

  begin
    insert into public.characters (campaign_id, owner_id, name, species, class_name, subclass, background, level, status, in_party)
    values (p_campaign_id, caller_id, v_name, v_species, v_class, v_subclass, v_background, v_level, 'active', v_in_party)
    returning id into v_character_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'characters_one_active_per_player_idx' then
      raise exception 'character_active_exists';
    end if;
    raise;
  end;

  insert into public.character_sheets (character_id) values (v_character_id);

  return v_character_id;
end;
$$;

create function public.set_character_status(p_character_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_campaign_id uuid;
  v_status text;
  v_constraint text;
begin
  if p_character_id is null or p_status is null then
    raise invalid_parameter_value using message = 'character_required';
  end if;
  if p_status not in ('active', 'retired', 'deceased') then
    raise invalid_parameter_value using message = 'character_status_invalid';
  end if;

  -- Campaign first (same order as the membership RPCs), then the character row.
  select characters.campaign_id into v_campaign_id
  from public.characters
  where characters.id = p_character_id and characters.owner_id = caller_id;
  if not found then
    raise exception 'character_unavailable';
  end if;

  perform 1
  from public.campaigns
  where campaigns.id = v_campaign_id
    and exists (
      select 1 from public.campaign_members as m
      where m.campaign_id = campaigns.id and m.profile_id = caller_id
    )
  for share of campaigns;
  if not found then
    raise exception 'character_unavailable';
  end if;

  select characters.status into v_status
  from public.characters
  where characters.id = p_character_id
    and characters.owner_id = caller_id
    and characters.campaign_id = v_campaign_id
  for update;
  if not found then
    raise exception 'character_unavailable';
  end if;

  if v_status = p_status then
    return;
  end if;

  begin
    if p_status = 'active' then
      -- Returning to active never re-adds the character to the party.
      update public.characters set status = 'active' where id = p_character_id;
    else
      update public.characters set status = p_status, in_party = false where id = p_character_id;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'characters_one_active_per_player_idx' then
      raise exception 'character_active_exists';
    end if;
    raise;
  end;
end;
$$;

create function public.set_character_in_party(p_character_id uuid, p_in_party boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_campaign_id uuid;
  v_status text;
  v_in_party boolean;
begin
  if p_character_id is null or p_in_party is null then
    raise invalid_parameter_value using message = 'character_required';
  end if;

  select characters.campaign_id into v_campaign_id
  from public.characters
  where characters.id = p_character_id and characters.owner_id = caller_id;
  if not found then
    raise exception 'character_unavailable';
  end if;

  perform 1
  from public.campaigns
  where campaigns.id = v_campaign_id
    and exists (
      select 1 from public.campaign_members as m
      where m.campaign_id = campaigns.id and m.profile_id = caller_id
    )
  for share of campaigns;
  if not found then
    raise exception 'character_unavailable';
  end if;

  select characters.status, characters.in_party into v_status, v_in_party
  from public.characters
  where characters.id = p_character_id
    and characters.owner_id = caller_id
    and characters.campaign_id = v_campaign_id
  for update;
  if not found then
    raise exception 'character_unavailable';
  end if;

  if v_in_party = p_in_party then
    return;
  end if;
  if p_in_party and v_status <> 'active' then
    raise exception 'character_not_active';
  end if;

  update public.characters set in_party = p_in_party where id = p_character_id;
end;
$$;

revoke all on function public.create_character(uuid, text, text, text, text, text, integer, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.set_character_status(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.set_character_in_party(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.create_character(uuid, text, text, text, text, text, integer, boolean)
  to authenticated;
grant execute on function public.set_character_status(uuid, text) to authenticated;
grant execute on function public.set_character_in_party(uuid, boolean) to authenticated;

-- Departure hook (called by leave_campaign and remove_campaign_member after the membership
-- row is deleted, inside their transaction). M2: the departed player's characters leave the
-- party. They are kept, never deleted. M6: adventure participations will be marked 'left'.
create or replace function private.handle_campaign_member_departure(p_campaign_id uuid, p_profile_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.characters
  set in_party = false
  where campaign_id = p_campaign_id and owner_id = p_profile_id and in_party;
end;
$$;

revoke all on function private.handle_campaign_member_departure(uuid, uuid)
  from public, anon, authenticated, service_role;

commit;
