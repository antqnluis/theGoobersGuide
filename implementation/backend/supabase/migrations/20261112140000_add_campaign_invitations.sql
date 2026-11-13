begin;

create table public.campaign_invitations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (inviter_id <> recipient_id),
  check ((status = 'pending') = (resolved_at is null))
);

create unique index campaign_invitations_one_pending_idx
  on public.campaign_invitations (campaign_id, recipient_id) where status = 'pending';
create index campaign_invitations_campaign_idx on public.campaign_invitations (campaign_id);
create index campaign_invitations_recipient_idx on public.campaign_invitations (recipient_id);
create index campaign_invitations_inviter_idx on public.campaign_invitations (inviter_id);

alter table public.campaign_invitations enable row level security;
revoke all on table public.campaign_invitations from public, anon, authenticated, service_role;

create function public.send_campaign_invitation(p_campaign_id uuid, p_username text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_id uuid;
  invitation_id uuid;
begin
  -- Serialize sends and responses for this campaign so membership checks stay current.
  perform 1 from public.campaigns
    where id = p_campaign_id and owner_id = caller_id
    for no key update;
  if not found then
    raise insufficient_privilege using message = 'campaign_invitation_owner_required';
  end if;

  select profiles.id into target_id
  from public.profiles
  join auth.users on users.id = profiles.id
  where lower(profiles.username) =
    lower(regexp_replace(p_username collate "C", '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    and users.deleted_at is null;

  if target_id is null then
    raise exception 'campaign_invitation_unknown_username';
  end if;
  if target_id = caller_id then
    raise exception 'campaign_invitation_self';
  end if;
  if exists (
    select 1 from public.campaign_members
    where campaign_id = p_campaign_id and profile_id = target_id
  ) then
    raise exception 'campaign_invitation_already_member';
  end if;

  insert into public.campaign_invitations (campaign_id, inviter_id, recipient_id)
  values (p_campaign_id, caller_id, target_id)
  on conflict (campaign_id, recipient_id) where status = 'pending' do nothing
  returning id into invitation_id;

  if invitation_id is null then
    raise exception 'campaign_invitation_already_pending';
  end if;
  return invitation_id;
end;
$$;

create function public.list_my_campaign_invitations()
returns table (id uuid, campaign_name text, inviter_username text)
language sql stable security definer set search_path = ''
as $$
  select invitations.id, campaigns.name, profiles.username
  from public.campaign_invitations as invitations
  join public.campaigns on campaigns.id = invitations.campaign_id
  join public.profiles on profiles.id = invitations.inviter_id
  where invitations.recipient_id = (select auth.uid()) and invitations.status = 'pending'
  order by invitations.created_at desc, invitations.id;
$$;

create function public.list_campaign_outgoing_invitations(p_campaign_id uuid)
returns table (id uuid, recipient_username text)
language sql stable security definer set search_path = ''
as $$
  select invitations.id, profiles.username
  from public.campaign_invitations as invitations
  join public.campaigns on campaigns.id = invitations.campaign_id
  join public.profiles on profiles.id = invitations.recipient_id
  where invitations.campaign_id = p_campaign_id and invitations.status = 'pending'
    and campaigns.owner_id = (select auth.uid())
  order by invitations.created_at desc, invitations.id;
$$;

create function public.respond_to_campaign_invitation(p_invitation_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_campaign_id uuid;
begin
  if p_accept is null then
    raise invalid_parameter_value using message = 'campaign_invitation_response_required';
  end if;

  -- Lock the campaign before touching the invitation, matching campaign deletion's order.
  select campaigns.id into target_campaign_id
  from public.campaigns
  join public.campaign_invitations as invitations on invitations.campaign_id = campaigns.id
  where invitations.id = p_invitation_id and invitations.recipient_id = caller_id
    and invitations.status = 'pending'
  for no key update of campaigns;

  if target_campaign_id is null then
    raise exception 'campaign_invitation_unavailable';
  end if;

  update public.campaign_invitations
  set status = case when p_accept then 'accepted' else 'declined' end, resolved_at = now()
  where id = p_invitation_id and recipient_id = caller_id and status = 'pending';

  if not found then
    raise exception 'campaign_invitation_unavailable';
  end if;

  if p_accept then
    insert into public.campaign_members (campaign_id, profile_id, role)
    values (target_campaign_id, caller_id, 'member')
    on conflict (campaign_id, profile_id) do nothing;
  end if;
end;
$$;

create function public.cancel_campaign_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.campaign_invitations as invitations
  set status = 'cancelled', resolved_at = now()
  from public.campaigns
  where invitations.id = p_invitation_id and invitations.status = 'pending'
    and invitations.campaign_id = campaigns.id and campaigns.owner_id = (select auth.uid());

  if not found then
    raise exception 'campaign_invitation_unavailable';
  end if;
end;
$$;

revoke all on function
  public.send_campaign_invitation(uuid, text),
  public.list_my_campaign_invitations(),
  public.list_campaign_outgoing_invitations(uuid),
  public.respond_to_campaign_invitation(uuid, boolean),
  public.cancel_campaign_invitation(uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  public.send_campaign_invitation(uuid, text),
  public.list_my_campaign_invitations(),
  public.list_campaign_outgoing_invitations(uuid),
  public.respond_to_campaign_invitation(uuid, boolean),
  public.cancel_campaign_invitation(uuid)
  to authenticated;

commit;
