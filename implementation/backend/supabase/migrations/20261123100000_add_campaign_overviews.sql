begin;

-- The campaign overview: what the owner tells the table about the campaign as it stands
-- (where the party is, the current chapter and objective, the last and next sessions, and the
-- table's rules). One row per campaign, created the first time the owner saves it; a campaign
-- without a row simply has an empty overview. Every member can read it; only the owner writes.

create table public.campaign_overviews (
  campaign_id uuid primary key references public.campaigns (id) on delete cascade,

  -- A short pinned message to the table.
  announcement text not null default '',

  -- Where the story is now.
  location text not null default '',
  in_world_date text not null default '',
  chapter text not null default '',
  situation text not null default '',
  objective text not null default '',

  -- Sessions.
  last_session text not null default '',
  next_session_at timestamptz,
  next_session_note text not null default '',

  -- The table.
  ruleset text not null default '',
  house_rules text not null default '',
  table_notes text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint campaign_overviews_announcement_length check (char_length(announcement) <= 500),
  constraint campaign_overviews_location_length check (char_length(location) <= 120),
  constraint campaign_overviews_in_world_date_length check (char_length(in_world_date) <= 80),
  constraint campaign_overviews_chapter_length check (char_length(chapter) <= 120),
  constraint campaign_overviews_situation_length check (char_length(situation) <= 3000),
  constraint campaign_overviews_objective_length check (char_length(objective) <= 1000),
  constraint campaign_overviews_last_session_length check (char_length(last_session) <= 4000),
  constraint campaign_overviews_next_session_note_length
    check (char_length(next_session_note) <= 300),
  constraint campaign_overviews_ruleset_length check (char_length(ruleset) <= 80),
  constraint campaign_overviews_house_rules_length check (char_length(house_rules) <= 3000),
  constraint campaign_overviews_table_notes_length check (char_length(table_notes) <= 3000)
);

create trigger campaign_overviews_set_updated_at
  before update on public.campaign_overviews
  for each row execute function private.set_updated_at();

alter table public.campaign_overviews enable row level security;

revoke all on table public.campaign_overviews from public, anon, authenticated, service_role;
grant select on table public.campaign_overviews to authenticated;
grant insert (
  campaign_id, announcement, location, in_world_date, chapter, situation, objective,
  last_session, next_session_at, next_session_note, ruleset, house_rules, table_notes
) on table public.campaign_overviews to authenticated;
grant update (
  announcement, location, in_world_date, chapter, situation, objective,
  last_session, next_session_at, next_session_note, ruleset, house_rules, table_notes
) on table public.campaign_overviews to authenticated;

create policy "Members can read their campaign overview"
  on public.campaign_overviews for select to authenticated
  using (campaign_id in (select private.current_campaign_ids()));

create policy "Owners can create their campaign overview"
  on public.campaign_overviews for insert to authenticated
  with check (
    exists (
      select 1 from public.campaigns
      where campaigns.id = campaign_overviews.campaign_id
        and campaigns.owner_id = (select auth.uid())
    )
  );

create policy "Owners can update their campaign overview"
  on public.campaign_overviews for update to authenticated
  using (
    exists (
      select 1 from public.campaigns
      where campaigns.id = campaign_overviews.campaign_id
        and campaigns.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.campaigns
      where campaigns.id = campaign_overviews.campaign_id
        and campaigns.owner_id = (select auth.uid())
    )
  );

-- Live updates: members see a new location or announcement without reloading. The select
-- policy is checked for each subscriber, so only members of the campaign receive the change.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename = 'campaign_overviews'
     ) then
    alter publication supabase_realtime add table public.campaign_overviews;
  end if;
end;
$$;

commit;
