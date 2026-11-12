begin;

-- Keep signup and campaign writes out of the backfills until both triggers
-- are in place.
lock table auth.users in share row exclusive mode;
lock table public.campaigns in access exclusive mode;

alter table private.account_usernames set schema public;
alter table public.account_usernames rename to profiles;
alter table public.profiles rename column user_id to id;
alter table public.profiles rename constraint account_usernames_pkey to profiles_pkey;
alter table public.profiles rename constraint account_usernames_user_id_fkey to profiles_id_fkey;
alter table public.profiles rename constraint account_usernames_username_key to profiles_username_key;
alter table public.profiles rename constraint account_usernames_username_check to profiles_username_check;

alter table public.profiles
  alter column username drop not null,
  add column display_name text,
  add column avatar_url text,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

insert into public.profiles (id)
select users.id
from auth.users as users
where not exists (select 1 from public.profiles where profiles.id = users.id);

-- The existing Auth trigger keeps its reference to the renamed function.
alter function private.record_account_username() rename to create_profile;

create or replace function private.create_profile()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, lower(btrim(new.raw_user_meta_data ->> 'username') collate "C"));
  return new;
end;
$$;

create or replace function public.resolve_username_email(account_username text)
returns text
language sql stable
security definer set search_path = ''
as $$
  select users.email
  from public.profiles
  join auth.users as users on users.id = profiles.id
  where profiles.username = account_username
    and users.deleted_at is null;
$$;

alter function public.set_campaigns_updated_at() set schema private;
alter function private.set_campaigns_updated_at() rename to set_updated_at;
alter function private.set_updated_at() set search_path = '';
revoke execute on function private.set_updated_at() from public, anon, authenticated;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.campaigns
  add column if not exists description text,
  drop constraint campaigns_owner_id_fkey,
  add constraint campaigns_owner_id_fkey
    foreign key (owner_id) references public.profiles (id) on delete cascade;

create index campaigns_owner_id_idx on public.campaigns (owner_id);

create table public.campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (campaign_id, profile_id)
);

create unique index campaign_members_one_owner_idx
  on public.campaign_members (campaign_id) where role = 'owner';
create index campaign_members_profile_id_idx on public.campaign_members (profile_id);

insert into public.campaign_members (campaign_id, profile_id, role, joined_at)
select id, owner_id, 'owner', created_at
from public.campaigns;

create function private.add_campaign_owner_membership()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.campaign_members (campaign_id, profile_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

revoke execute on function private.add_campaign_owner_membership() from public, anon, authenticated;

create trigger campaigns_add_owner_membership
  after insert on public.campaigns
  for each row execute function private.add_campaign_owner_membership();

-- Read membership as the table owner so campaign and roster reads never
-- re-enter the roster policy. Scope the result to the caller's Auth ID.
create function private.current_campaign_ids()
returns setof uuid
language sql stable
security definer set search_path = ''
as $$
  select campaign_id
  from public.campaign_members
  where profile_id = (select auth.uid());
$$;

revoke execute on function private.current_campaign_ids() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_campaign_ids() to authenticated;

alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon, authenticated, service_role;
grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url) on table public.profiles to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke all on table public.campaigns from public, anon, authenticated;
grant select, insert, delete on table public.campaigns to authenticated;
revoke update on table public.campaigns from service_role;
grant update (name, description) on table public.campaigns to authenticated, service_role;

drop policy "Users can read their own campaigns" on public.campaigns;

-- An INSERT with RETURNING checks visibility before the AFTER INSERT trigger.
create policy "Owners and members can read their campaigns"
  on public.campaigns for select to authenticated
  using ((select auth.uid()) = owner_id or id in (select private.current_campaign_ids()));

alter table public.campaign_members enable row level security;
revoke all on table public.campaign_members from public, anon, authenticated, service_role;
grant select, delete on table public.campaign_members to authenticated;
grant insert (campaign_id, profile_id, role) on table public.campaign_members to authenticated;

create policy "Members can read their campaign rosters"
  on public.campaign_members for select to authenticated
  using (campaign_id in (select private.current_campaign_ids()));

create policy "Owners can add regular members"
  on public.campaign_members for insert to authenticated
  with check (
    role = 'member'
    and exists (
      select 1
      from public.campaigns
      where campaigns.id = campaign_members.campaign_id
        and campaigns.owner_id = (select auth.uid())
    )
  );

create policy "Owners can remove regular members"
  on public.campaign_members for delete to authenticated
  using (
    role = 'member'
    and exists (
      select 1
      from public.campaigns
      where campaigns.id = campaign_members.campaign_id
        and campaigns.owner_id = (select auth.uid())
    )
  );

commit;
