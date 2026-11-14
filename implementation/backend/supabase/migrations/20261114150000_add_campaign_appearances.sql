begin;

-- Each player's look for their seat at the camp, per campaign. Cosmetic only: the same
-- four choices the camp derives from a profile id by default (cloak colour, skin tone,
-- headwear, pack). No row means "use the default look".
--
-- Player-owned data, so it references the campaign and the profile directly (never
-- campaign_members) and survives leaving and rejoining. Access follows membership: it is
-- readable by current members while its owner is also a member, and only the owner writes.

create table public.campaign_appearances (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  cloak smallint not null,
  skin smallint not null,
  headwear text not null,
  pack text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (campaign_id, profile_id),
  constraint campaign_appearances_cloak_check check (cloak between 0 and 7),
  constraint campaign_appearances_skin_check check (skin between 0 and 4),
  constraint campaign_appearances_headwear_check check (headwear in ('hood', 'hat', 'cap', 'bare')),
  constraint campaign_appearances_pack_check check (pack in ('satchel', 'bedroll', 'quiver', 'none'))
);

-- The profiles FK cascade.
create index campaign_appearances_profile_id_idx on public.campaign_appearances (profile_id);

create trigger campaign_appearances_set_updated_at
  before update on public.campaign_appearances
  for each row execute function private.set_updated_at();

alter table public.campaign_appearances enable row level security;

revoke all on table public.campaign_appearances from public, anon, authenticated, service_role;

grant select, delete on table public.campaign_appearances to authenticated;
grant insert (campaign_id, cloak, skin, headwear, pack) on table public.campaign_appearances
  to authenticated;
grant update (cloak, skin, headwear, pack) on table public.campaign_appearances to authenticated;

-- Current members see the looks of current members (a departed player's look is hidden
-- until they rejoin, like their characters).
create policy "Members read current members' appearances"
on public.campaign_appearances for select to authenticated
using (
  campaign_id in (select private.current_campaign_ids())
  and exists (
    select 1 from public.campaign_members as m
    where m.campaign_id = campaign_appearances.campaign_id
      and m.profile_id = campaign_appearances.profile_id
  )
);

create policy "Members add their own appearance"
on public.campaign_appearances for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and campaign_id in (select private.current_campaign_ids())
);

create policy "Members update their own appearance"
on public.campaign_appearances for update to authenticated
using (
  profile_id = (select auth.uid())
  and campaign_id in (select private.current_campaign_ids())
)
with check (
  profile_id = (select auth.uid())
  and campaign_id in (select private.current_campaign_ids())
);

create policy "Members delete their own appearance"
on public.campaign_appearances for delete to authenticated
using (
  profile_id = (select auth.uid())
  and campaign_id in (select private.current_campaign_ids())
);

commit;
