begin;

-- Fail closed on existing inconsistency instead of repairing it silently.
do $$
begin
  if exists (
    select 1 from public.campaigns as c
    where (select count(*) from public.campaign_members as m
           where m.campaign_id = c.id and m.role = 'owner') <> 1
       or not exists (select 1 from public.campaign_members as m
                      where m.campaign_id = c.id and m.role = 'owner'
                        and m.profile_id = c.owner_id)
  ) then
    raise exception 'campaign ownership is inconsistent; resolve it before applying this migration';
  end if;
end;
$$;

-- A1: an owner's profile (and so their Auth user) cannot be deleted while they own campaigns.
alter table public.campaigns
  drop constraint campaigns_owner_id_fkey,
  add constraint campaigns_owner_id_fkey
    foreign key (owner_id) references public.profiles (id) on delete restrict;

-- Invariant, checked at commit for every affected campaign that still exists:
-- exactly one owner row, and it belongs to campaigns.owner_id.
create function private.assert_campaign_ownership_consistent()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  affected uuid[];
begin
  if tg_table_name = 'campaigns' then
    affected := array[new.id];
  elsif tg_op = 'INSERT' then
    affected := array[new.campaign_id];
  elsif tg_op = 'DELETE' then
    affected := array[old.campaign_id];
  else
    affected := array[old.campaign_id, new.campaign_id];
  end if;

  if exists (
    select 1 from public.campaigns as c
    where c.id = any (affected)
      and ((select count(*) from public.campaign_members as m
            where m.campaign_id = c.id and m.role = 'owner') <> 1
        or not exists (select 1 from public.campaign_members as m
                       where m.campaign_id = c.id and m.role = 'owner'
                         and m.profile_id = c.owner_id))
  ) then
    raise exception using
      errcode = 'integrity_constraint_violation',
      message = 'campaign_ownership_inconsistent';
  end if;
  return null;
end;
$$;

revoke all on function private.assert_campaign_ownership_consistent()
  from public, anon, authenticated, service_role;

create constraint trigger campaigns_ownership_consistent
  after insert or update of owner_id on public.campaigns
  deferrable initially deferred
  for each row execute function private.assert_campaign_ownership_consistent();

create constraint trigger campaign_members_ownership_consistent
  after insert or update or delete on public.campaign_members
  deferrable initially deferred
  for each row execute function private.assert_campaign_ownership_consistent();

commit;
