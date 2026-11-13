begin;

-- Display names become visible to other campaign members, so bound them.
-- Adding the constraint fails (and rolls back) if any existing value violates it.
alter table public.profiles
  add constraint profiles_display_name_check
  check (
    display_name is null
    or (
      display_name = btrim(display_name)
      and char_length(display_name) between 1 and 40
      and display_name !~ '[[:cntrl:]]'
    )
  );

-- Roster rows plus each member's display name. Members only; get_campaign_roster
-- keeps its contract. Direct profile access stays self-only.
create function public.get_campaign_party(p_campaign_id uuid)
returns table (profile_id uuid, role text, username text, display_name text)
language sql stable
security definer set search_path = ''
as $$
  select members.profile_id, members.role, profiles.username, profiles.display_name
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

revoke all on function public.get_campaign_party(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_campaign_party(uuid) to authenticated;

commit;
