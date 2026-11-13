begin;

-- Character portraits: a private Storage bucket, a path column on characters, and
-- owner-only writes. Anyone who may read a character's summary may read its portrait
-- (it is summary-level, like the name), whatever the sheet's visibility.
--
-- Objects live at "<character id>/<random>.<png|jpg|webp>". A new upload gets a new name
-- (never an overwrite), so the path on the row changes with each picture.

alter table public.characters add column portrait_path text;

alter table public.characters add constraint characters_portrait_path_check check (
  portrait_path is null
  or portrait_path ~ ('^' || id::text || '/[A-Za-z0-9_-]{1,64}\.(png|jpg|webp)$')
);

-- Owners may set or clear their own character's portrait path (RLS already limits rows).
grant update (portrait_path) on table public.characters to authenticated;

-- The character a Storage object name belongs to, or null for any other name.
create function private.portrait_character_id(p_name text)
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

revoke execute on function private.portrait_character_id(text) from public, anon, authenticated;
grant execute on function private.portrait_character_id(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'character-portraits',
  'character-portraits',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- `storage.objects.name` is qualified because characters has a name column too.
-- Reading: the subquery is filtered by the characters SELECT policy, so only current
-- members of the character's campaign (and only while its owner is still a member) match.
create policy "Members read character portraits"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'character-portraits'
    and exists (
      select 1 from public.characters as c
      where c.id = private.portrait_character_id(storage.objects.name)
    )
  );

create policy "Owners add character portraits"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'character-portraits'
    and exists (
      select 1 from public.characters as c
      where c.id = private.portrait_character_id(storage.objects.name)
        and c.owner_id = (select auth.uid())
        and c.campaign_id in (select private.current_campaign_ids())
    )
  );

create policy "Owners remove character portraits"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'character-portraits'
    and exists (
      select 1 from public.characters as c
      where c.id = private.portrait_character_id(storage.objects.name)
        and c.owner_id = (select auth.uid())
    )
  );

commit;
