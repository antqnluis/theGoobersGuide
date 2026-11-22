begin;

-- M03.7 Phase 6 (D11): live updates for character sheets, notes, and adventures.
-- Postgres-changes delivery checks each subscriber's select policy against the row, so a private
-- sheet, a private note, or an adventure its subscriber cannot read never reaches that client.
-- Replica identity stays default (inserts and updates only): delete events carry no policy-checked
-- row, so the app does not subscribe to them and relies on refetching for removals.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array[
    'character_sheets',
    'notes',
    'adventures',
    'adventure_participants',
    'adventure_objectives',
    'adventure_updates'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

commit;
