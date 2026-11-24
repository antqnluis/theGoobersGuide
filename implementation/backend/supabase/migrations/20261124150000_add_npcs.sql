begin;

-- Campaign NPC log: the people a party has met. Like notes, an NPC entry is private (author only)
-- or shared with the campaign (every current member reads and edits). Only the author shares,
-- unshares, or deletes. All writes are direct single-row writes bounded by checks, a guard
-- trigger, and RLS. Access is computed from current membership.

create table public.npcs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  visibility text not null default 'private',
  name text not null,
  role text not null default '',
  location text not null default '',
  body text not null default '',
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint npcs_visibility_check check (visibility in ('private', 'campaign')),
  constraint npcs_name_check check (
    name = btrim(name) and char_length(name) between 1 and 120 and name !~ '[[:cntrl:]]'
  ),
  constraint npcs_role_check check (
    role = btrim(role) and char_length(role) <= 120 and role !~ '[[:cntrl:]]'
  ),
  constraint npcs_location_check check (
    location = btrim(location) and char_length(location) <= 120 and location !~ '[[:cntrl:]]'
  ),
  -- Newlines and tabs are allowed in the body; other control characters are not.
  constraint npcs_body_check check (
    char_length(body) <= 20000 and body !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
  )
);

create index npcs_campaign_updated_idx on public.npcs (campaign_id, updated_at desc);
create index npcs_author_idx on public.npcs (author_id, campaign_id);

-- Integrity for every write path, including postgres and service-role tooling.
create function private.guard_npc_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  -- Foreign-key actions (a deleted account) run inside another trigger and only clear one
  -- column, so they are not recorded as an edit.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.campaign_id <> old.campaign_id
       or new.author_id <> old.author_id or new.created_at <> old.created_at then
      raise integrity_constraint_violation using message = 'npc_reassignment_forbidden';
    end if;
    if new.visibility <> old.visibility and auth.uid() is distinct from old.author_id then
      raise insufficient_privilege using message = 'npc_visibility_author_only';
    end if;
  else
    -- INSERT: serialize one author's inserts in one campaign, then enforce the cap.
    perform pg_advisory_xact_lock(
      hashtextextended('npcs:' || new.campaign_id::text || ':' || new.author_id::text, 0)
    );
    if (select count(*) from public.npcs
        where campaign_id = new.campaign_id and author_id = new.author_id) >= 500 then
      raise exception 'npc_limit_reached';
    end if;
  end if;

  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function private.guard_npc_write() from public, anon, authenticated, service_role;

create trigger npcs_guard_write
  before insert or update on public.npcs
  for each row execute function private.guard_npc_write();

create trigger npcs_set_updated_at
  before update on public.npcs
  for each row execute function private.set_updated_at();

alter table public.npcs enable row level security;

revoke all on table public.npcs from public, anon, authenticated, service_role;

grant select, delete on table public.npcs to authenticated;
grant insert (campaign_id, visibility, name, role, location, body)
  on table public.npcs to authenticated;
grant update (visibility, name, role, location, body) on table public.npcs to authenticated;

-- Read: current members read shared entries; the author reads their own while a member.
create policy "Members read shared npcs and authors read their own"
  on public.npcs for select to authenticated
  using (
    campaign_id in (select private.current_campaign_ids())
    and (visibility = 'campaign' or author_id = (select auth.uid()))
  );

create policy "Members write their own npcs"
  on public.npcs for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and campaign_id in (select private.current_campaign_ids())
  );

-- Update: any current member edits a shared entry; the author edits their own.
create policy "Members edit shared npcs and authors edit their own"
  on public.npcs for update to authenticated
  using (
    campaign_id in (select private.current_campaign_ids())
    and (visibility = 'campaign' or author_id = (select auth.uid()))
  )
  with check (
    campaign_id in (select private.current_campaign_ids())
    and (visibility = 'campaign' or author_id = (select auth.uid()))
  );

create policy "Authors delete their npcs"
  on public.npcs for delete to authenticated
  using (
    author_id = (select auth.uid())
    and campaign_id in (select private.current_campaign_ids())
  );

-- Live updates: Postgres-changes delivery checks each subscriber's select policy against the
-- row, so a private entry never reaches another member's client.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'npcs'
     ) then
    alter publication supabase_realtime add table public.npcs;
  end if;
end;
$$;

commit;
