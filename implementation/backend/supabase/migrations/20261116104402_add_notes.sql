begin;

-- M03.4 Phase 1: campaign notes.
-- Notes are private (author only) or shared with the campaign (every current member reads and
-- edits). All writes are direct single-row writes bounded by checks, a guard trigger, and RLS.
-- Access is computed from current membership, so the departure hook is unchanged.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  visibility text not null default 'private',
  title text not null,
  body text not null default '',
  character_id uuid,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notes_visibility_check check (visibility in ('private', 'campaign')),
  constraint notes_title_check check (
    title = btrim(title) and char_length(title) between 1 and 120 and title !~ '[[:cntrl:]]'
  ),
  -- Newlines and tabs are allowed in the body; other control characters are not.
  constraint notes_body_check check (
    char_length(body) <= 20000 and body !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
  ),
  -- Skipped when character_id is null (match simple). Clears only the link on delete.
  constraint notes_character_fkey foreign key (character_id, campaign_id)
    references public.characters (id, campaign_id) on delete set null (character_id)
);

create index notes_campaign_updated_idx on public.notes (campaign_id, updated_at desc);
create index notes_author_idx on public.notes (author_id, campaign_id);
create index notes_character_idx on public.notes (character_id) where character_id is not null;

-- Integrity for every write path, including postgres and service-role tooling.
create function private.guard_note_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  -- The FK's "set null" when a linked character is deleted runs inside another trigger.
  -- It only clears the link, so it is not recorded as an edit.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    new.updated_by := old.updated_by;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.campaign_id <> old.campaign_id
       or new.author_id <> old.author_id or new.created_at <> old.created_at then
      raise integrity_constraint_violation using message = 'note_reassignment_forbidden';
    end if;
    if new.visibility <> old.visibility and auth.uid() is distinct from old.author_id then
      raise insufficient_privilege using message = 'note_visibility_author_only';
    end if;
  else
    -- INSERT: serialize one author's inserts in one campaign, then enforce the cap (D3).
    perform pg_advisory_xact_lock(
      hashtextextended('notes:' || new.campaign_id::text || ':' || new.author_id::text, 0)
    );
    if (select count(*) from public.notes
        where campaign_id = new.campaign_id and author_id = new.author_id) >= 500 then
      raise exception 'note_limit_reached';
    end if;
  end if;

  -- A new or changed link must point at a character a current member owns (D5).
  if new.character_id is not null
     and (tg_op = 'INSERT' or new.character_id is distinct from old.character_id)
     and not exists (
       select 1 from public.characters as c
       join public.campaign_members as m
         on m.campaign_id = c.campaign_id and m.profile_id = c.owner_id
       where c.id = new.character_id and c.campaign_id = new.campaign_id
     ) then
    raise exception 'note_character_unavailable';
  end if;

  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function private.guard_note_write() from public, anon, authenticated, service_role;

create trigger notes_guard_write
  before insert or update on public.notes
  for each row execute function private.guard_note_write();

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function private.set_updated_at();

alter table public.notes enable row level security;

revoke all on table public.notes from public, anon, authenticated, service_role;

grant select, delete on table public.notes to authenticated;
grant insert (campaign_id, visibility, title, body, character_id)
  on table public.notes to authenticated;
grant update (visibility, title, body, character_id) on table public.notes to authenticated;

-- Read: current members read shared notes; the author reads their own while a member.
create policy "Members read shared notes and authors read their own"
  on public.notes for select to authenticated
  using (
    campaign_id in (select private.current_campaign_ids())
    and (visibility = 'campaign' or author_id = (select auth.uid()))
  );

create policy "Members write their own notes"
  on public.notes for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and campaign_id in (select private.current_campaign_ids())
  );

-- Update: any current member edits a shared note; the author edits their own.
create policy "Members edit shared notes and authors edit their own"
  on public.notes for update to authenticated
  using (
    campaign_id in (select private.current_campaign_ids())
    and (visibility = 'campaign' or author_id = (select auth.uid()))
  )
  with check (
    campaign_id in (select private.current_campaign_ids())
    and (visibility = 'campaign' or author_id = (select auth.uid()))
  );

create policy "Authors delete their notes"
  on public.notes for delete to authenticated
  using (
    author_id = (select auth.uid())
    and campaign_id in (select private.current_campaign_ids())
  );

commit;
