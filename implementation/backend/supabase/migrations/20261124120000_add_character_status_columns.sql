begin;

-- M04 Phase 1: live status on the sheet row (L2) and a body-only revision token (L10).
-- Status columns are small, fixed, and change mid-session, like the vitals beside them. They are
-- written directly by the owner (column grant plus the existing owner update policy); the
-- HP and death-save RPCs added in a later migration write them too.
-- `body_revision` replaces `updated_at` as the concurrency token for body saves, so HP, coin,
-- status, and tracker writes no longer invalidate an open edit on another device.

-- Pure, so authenticated may execute it from the CHECK constraint (as with the sheet validator).
create function private.character_conditions_are_valid(p_conditions text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_conditions is not null
    and coalesce(array_ndims(p_conditions), 1) = 1
    and cardinality(p_conditions) <= 20
    and not exists (
      select 1 from unnest(p_conditions) as c
      where c is null
        or c <> btrim(c)
        or char_length(c) not between 1 and 40
        or c ~ '[[:cntrl:]]'
    )
    and (select count(distinct lower(c)) from unnest(p_conditions) as c) = cardinality(p_conditions);
$$;

revoke all on function private.character_conditions_are_valid(text[])
  from public, anon, authenticated, service_role;
grant execute on function private.character_conditions_are_valid(text[]) to authenticated;

-- Constant defaults: no table rewrite, and existing rows take the defaults.
alter table public.character_sheets
  add column conditions text[] not null default '{}',
  add column exhaustion smallint not null default 0,
  add column death_save_successes smallint not null default 0,
  add column death_save_failures smallint not null default 0,
  add column concentration text,
  add column inspiration boolean not null default false,
  add column body_revision integer not null default 0,
  add constraint character_sheets_conditions_check
    check (private.character_conditions_are_valid(conditions)),
  add constraint character_sheets_exhaustion_check check (exhaustion between 0 and 6),
  add constraint character_sheets_death_saves_check check (
    death_save_successes between 0 and 3 and death_save_failures between 0 and 3
  ),
  add constraint character_sheets_concentration_check check (
    concentration is null
    or (
      concentration = btrim(concentration)
      and char_length(concentration) between 1 and 80
      and concentration !~ '[[:cntrl:]]'
    )
  );

-- Counts only changes to the body. Runs for every write path, including postgres and
-- service-role tooling, so imports (apply_character_update) bump it too.
create function private.bump_character_body_revision()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.sheet is distinct from old.sheet then
    new.body_revision := old.body_revision + 1;
  else
    -- Clients cannot write the column, but other roles could: never let it move by hand.
    new.body_revision := old.body_revision;
  end if;
  return new;
end;
$$;

revoke all on function private.bump_character_body_revision()
  from public, anon, authenticated, service_role;

create trigger character_sheets_bump_body_revision
  before update on public.character_sheets
  for each row execute function private.bump_character_body_revision();

-- `body_revision` is deliberately not granted.
grant update (
  conditions, exhaustion, death_save_successes, death_save_failures, concentration, inspiration
) on table public.character_sheets to authenticated;

commit;
