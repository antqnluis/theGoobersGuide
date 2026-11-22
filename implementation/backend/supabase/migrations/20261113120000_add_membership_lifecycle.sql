begin;

-- Single place for side effects when a player stops being a member.
-- M1: no player-owned data exists yet, so there is nothing to change.
-- M2: set the player's characters in this campaign to in_party = false.
-- M6: mark the player's adventure participations as 'left' and re-evaluate party visibility.
-- It must never delete player-owned rows.
create function private.handle_campaign_member_departure(p_campaign_id uuid, p_profile_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  return;
end;
$$;

revoke all on function private.handle_campaign_member_departure(uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.leave_campaign(p_campaign_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  campaign_owner_id uuid;
begin
  if p_campaign_id is null then
    raise invalid_parameter_value using message = 'campaign_membership_campaign_required';
  end if;

  -- Serialize with every other membership change. Only members can lock, and an
  -- unknown, inaccessible, or already-left campaign gets the same response.
  select campaigns.owner_id into campaign_owner_id
  from public.campaigns
  where campaigns.id = p_campaign_id
    and exists (
      select 1 from public.campaign_members as m
      where m.campaign_id = campaigns.id and m.profile_id = caller_id
    )
  for no key update of campaigns;
  if not found then
    raise exception 'campaign_membership_unavailable';
  end if;

  if campaign_owner_id = caller_id then
    raise exception 'campaign_leave_owner_must_transfer';
  end if;

  delete from public.campaign_members
  where campaign_id = p_campaign_id and profile_id = caller_id and role = 'member';
  if not found then
    raise exception 'campaign_membership_unavailable';
  end if;

  perform private.handle_campaign_member_departure(p_campaign_id, caller_id);
end;
$$;

create function public.remove_campaign_member(p_campaign_id uuid, p_profile_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if p_campaign_id is null or p_profile_id is null then
    raise invalid_parameter_value using message = 'campaign_member_required';
  end if;

  perform 1 from public.campaigns
    where id = p_campaign_id and owner_id = caller_id
    for no key update;
  if not found then
    raise insufficient_privilege using message = 'campaign_member_owner_required';
  end if;

  if p_profile_id = caller_id then
    raise exception 'campaign_member_remove_owner';
  end if;

  delete from public.campaign_members
  where campaign_id = p_campaign_id and profile_id = p_profile_id and role = 'member';
  if not found then
    raise exception 'campaign_member_unavailable';
  end if;

  perform private.handle_campaign_member_departure(p_campaign_id, p_profile_id);
end;
$$;

create function public.transfer_campaign_ownership(p_campaign_id uuid, p_profile_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if p_campaign_id is null or p_profile_id is null then
    raise invalid_parameter_value using message = 'campaign_transfer_target_required';
  end if;

  perform 1 from public.campaigns
    where id = p_campaign_id and owner_id = caller_id
    for no key update;
  if not found then
    raise insufficient_privilege using message = 'campaign_transfer_owner_required';
  end if;

  if p_profile_id = caller_id then
    raise exception 'campaign_transfer_self';
  end if;

  perform 1
  from public.campaign_members as m
  join auth.users on users.id = m.profile_id
  where m.campaign_id = p_campaign_id
    and m.profile_id = p_profile_id
    and m.role = 'member'
    and users.deleted_at is null
  for update of m;
  if not found then
    raise exception 'campaign_transfer_target_unavailable';
  end if;

  -- Demote before promote: the one-owner unique index is checked per row.
  update public.campaign_members
  set role = 'member'
  where campaign_id = p_campaign_id and profile_id = caller_id and role = 'owner';
  if not found then
    raise integrity_constraint_violation using message = 'campaign_ownership_inconsistent';
  end if;

  update public.campaign_members
  set role = 'owner'
  where campaign_id = p_campaign_id and profile_id = p_profile_id;

  update public.campaigns set owner_id = p_profile_id where id = p_campaign_id;
end;
$$;

revoke all on function
  public.leave_campaign(uuid),
  public.remove_campaign_member(uuid, uuid),
  public.transfer_campaign_ownership(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.leave_campaign(uuid),
  public.remove_campaign_member(uuid, uuid),
  public.transfer_campaign_ownership(uuid, uuid)
  to authenticated;

commit;
