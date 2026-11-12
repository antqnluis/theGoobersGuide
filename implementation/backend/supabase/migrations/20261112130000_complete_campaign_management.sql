begin;

alter table public.campaigns
  add constraint campaigns_name_not_whitespace
  check (name ~ '[^[:space:]]') not valid;

do $$
begin
  if not exists (select 1 from public.campaigns where name !~ '[^[:space:]]') then
    alter table public.campaigns validate constraint campaigns_name_not_whitespace;
  end if;
end;
$$;

revoke insert (campaign_id, profile_id, role), delete
  on table public.campaign_members from authenticated;

drop policy "Owners can add regular members" on public.campaign_members;
drop policy "Owners can remove regular members" on public.campaign_members;

create function public.get_campaign_roster(p_campaign_id uuid)
returns table (profile_id uuid, role text, username text)
language sql stable
security definer set search_path = ''
as $$
  select members.profile_id, members.role, profiles.username
  from public.campaign_members as members
  join public.profiles as profiles on profiles.id = members.profile_id
  where members.campaign_id = p_campaign_id
    and exists (
      select 1
      from public.campaign_members as caller
      where caller.campaign_id = p_campaign_id
        and caller.profile_id = (select auth.uid())
    );
$$;

revoke all on function public.get_campaign_roster(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_campaign_roster(uuid) to authenticated;

commit;
