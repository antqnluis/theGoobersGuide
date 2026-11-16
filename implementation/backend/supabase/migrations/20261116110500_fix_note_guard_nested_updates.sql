begin;

-- M03.4 Phase 1 fix: the guard's nested-update branch (foreign-key "set null" actions) restored
-- updated_by to its old value, which blocked "on delete set null" when an editor's account was
-- deleted. A nested update now passes through untouched: clearing a character link leaves
-- updated_by as it was (the action changes only that column), and deleting an editor's account
-- clears updated_by as intended. The function keeps its owner and (postgres-only) privileges.
create or replace function private.guard_note_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  -- Foreign-key actions (a deleted character or account) run inside another trigger. They only
  -- clear one column, so they are not recorded as an edit.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
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

commit;
