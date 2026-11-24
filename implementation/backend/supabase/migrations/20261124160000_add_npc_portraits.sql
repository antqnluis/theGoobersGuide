begin;

-- NPC portraits: a private Storage bucket and a path column on npcs. Only the entry's author
-- sets, changes, or clears the picture. Anyone who may read an NPC may read its portrait, so a
-- private NPC's picture is visible only to its author and a shared NPC's to current members.
--
-- Objects live at "<npc id>/<random>.<png|jpg|webp>". A new upload gets a new name (never an
-- overwrite), so the path on the row changes with each picture.

alter table public.npcs add column portrait_path text;

alter table public.npcs add constraint npcs_portrait_path_check check (
  portrait_path is null
  or portrait_path ~ ('^' || id::text || '/[A-Za-z0-9_-]{1,64}\.(png|jpg|webp)$')
);

grant update (portrait_path) on table public.npcs to authenticated;

-- The guard now also keeps the picture with the author: any member may edit a shared NPC's text,
-- but only its author may change the picture.
create or replace function private.guard_npc_write()
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
    if new.portrait_path is distinct from old.portrait_path
       and auth.uid() is distinct from old.author_id then
      raise insufficient_privilege using message = 'npc_portrait_author_only';
    end if;
  else
    -- INSERT: a picture needs the row's id first, so it is never set on insert.
    if new.portrait_path is not null then
      raise integrity_constraint_violation using message = 'npc_portrait_after_create';
    end if;
    -- Serialize one author's inserts in one campaign, then enforce the cap.
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

-- The NPC a Storage object name belongs to, or null for any other name.
create function private.portrait_npc_id(p_name text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1)
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

revoke execute on function private.portrait_npc_id(text) from public, anon, authenticated;
grant execute on function private.portrait_npc_id(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'npc-portraits',
  'npc-portraits',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Reading: the subquery is filtered by the npcs SELECT policy, so only the author (private) or
-- current members (shared) match. `storage.objects.name` is qualified because npcs has a name.
create policy "Readers read npc portraits"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'npc-portraits'
    and exists (
      select 1 from public.npcs as n
      where n.id = private.portrait_npc_id(storage.objects.name)
    )
  );

create policy "Authors add npc portraits"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'npc-portraits'
    and exists (
      select 1 from public.npcs as n
      where n.id = private.portrait_npc_id(storage.objects.name)
        and n.author_id = (select auth.uid())
        and n.campaign_id in (select private.current_campaign_ids())
    )
  );

create policy "Authors remove npc portraits"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'npc-portraits'
    and exists (
      select 1 from public.npcs as n
      where n.id = private.portrait_npc_id(storage.objects.name)
        and n.author_id = (select auth.uid())
    )
  );

commit;
