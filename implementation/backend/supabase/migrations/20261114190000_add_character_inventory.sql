begin;

-- M03.3 Phase 1: coins and inventory.
-- Coins are columns of character_sheets and are written only through the delta RPC added in
-- the next migration (no UPDATE grant here). Items are rows in character_items with direct
-- owner writes, bounded by checks, a guard trigger, and RLS that mirrors sheet visibility.

-- Currency (D2, D3). Constant defaults: no table rewrite, and the existing row starts at zero.
alter table public.character_sheets
  add column cp integer not null default 0,
  add column sp integer not null default 0,
  add column ep integer not null default 0,
  add column gp integer not null default 0,
  add column pp integer not null default 0,
  add constraint character_sheets_currency_check check (
    cp between 0 and 9999999 and sp between 0 and 9999999 and ep between 0 and 9999999
    and gp between 0 and 9999999 and pp between 0 and 9999999
  );

create table public.character_items (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  name text not null,
  quantity integer not null default 1,
  weight numeric(7, 2),
  description text,
  equipped boolean not null default false,
  attuned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint character_items_name_check check (
    name = btrim(name) and char_length(name) between 1 and 80 and name !~ '[[:cntrl:]]'
  ),
  constraint character_items_quantity_check check (quantity between 0 and 9999),
  constraint character_items_weight_check check (weight is null or weight between 0 and 99999.99),
  -- Newlines and tabs are allowed in descriptions; other control characters are not.
  constraint character_items_description_check check (
    description is null
    or (char_length(description) between 1 and 2000
        and description !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]')
  )
);

create index character_items_character_id_idx on public.character_items (character_id);

-- Integrity for every write path, including postgres and service-role tooling.
create function private.guard_character_item_write()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.character_id <> old.character_id then
      raise integrity_constraint_violation using message = 'item_reassignment_forbidden';
    end if;
    return new;
  end if;

  -- INSERT: serialize inserts for one character, then enforce the cap (D6).
  perform 1 from public.characters where id = new.character_id for no key update;
  if (select count(*) from public.character_items where character_id = new.character_id) >= 200 then
    raise exception 'item_limit_reached';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_character_item_write()
  from public, anon, authenticated, service_role;

create trigger character_items_guard_write
  before insert or update on public.character_items
  for each row execute function private.guard_character_item_write();

create trigger character_items_set_updated_at
  before update on public.character_items
  for each row execute function private.set_updated_at();

alter table public.character_items enable row level security;

revoke all on table public.character_items from public, anon, authenticated, service_role;

grant select, delete on table public.character_items to authenticated;
grant insert (character_id, name, quantity, weight, description, equipped, attuned)
  on table public.character_items to authenticated;
grant update (name, quantity, weight, description, equipped, attuned)
  on table public.character_items to authenticated;

-- Read: the owner always; other current members only when the sheet is shared (D1).
-- The subquery is filtered by the characters SELECT policy (membership of both sides).
create policy "Owners and shared members read items"
  on public.character_items for select to authenticated
  using (
    exists (
      select 1 from public.characters as c
      where c.id = character_items.character_id
        and (c.owner_id = (select auth.uid()) or c.sheet_visibility = 'campaign')
    )
  );

create policy "Owners add items"
  on public.character_items for insert to authenticated
  with check (
    exists (
      select 1 from public.characters as c
      where c.id = character_items.character_id
        and c.owner_id = (select auth.uid())
        and c.campaign_id in (select private.current_campaign_ids())
    )
  );

create policy "Owners update items"
  on public.character_items for update to authenticated
  using (
    exists (
      select 1 from public.characters as c
      where c.id = character_items.character_id
        and c.owner_id = (select auth.uid())
        and c.campaign_id in (select private.current_campaign_ids())
    )
  )
  with check (
    exists (
      select 1 from public.characters as c
      where c.id = character_items.character_id
        and c.owner_id = (select auth.uid())
        and c.campaign_id in (select private.current_campaign_ids())
    )
  );

create policy "Owners delete items"
  on public.character_items for delete to authenticated
  using (
    exists (
      select 1 from public.characters as c
      where c.id = character_items.character_id
        and c.owner_id = (select auth.uid())
        and c.campaign_id in (select private.current_campaign_ids())
    )
  );

commit;
