begin;

-- M03.3: a read-only log of coin changes, so a character can show its recent transactions.
-- Rows are written only by adjust_character_currency (security definer); clients can read the
-- log exactly when they can read the sheet, and nothing else. Each row stores the net change
-- and the balances after it, so the arithmetic (before -> after) is server-computed.

create table public.character_currency_log (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  character_id uuid not null references public.characters (id) on delete cascade,
  created_at timestamptz not null default now(),
  cp_delta integer not null,
  sp_delta integer not null,
  gp_delta integer not null,
  cp_after integer not null,
  sp_after integer not null,
  gp_after integer not null,

  constraint character_currency_log_delta_check check (
    cp_delta between -9999999 and 9999999 and sp_delta between -9999999 and 9999999
    and gp_delta between -9999999 and 9999999
  ),
  constraint character_currency_log_after_check check (
    cp_after between 0 and 9999999 and sp_after between 0 and 9999999
    and gp_after between 0 and 9999999
  ),
  constraint character_currency_log_changed_check check (
    cp_delta <> 0 or sp_delta <> 0 or gp_delta <> 0
  )
);

create index character_currency_log_character_seq_idx
  on public.character_currency_log (character_id, seq desc);

alter table public.character_currency_log enable row level security;

revoke all on table public.character_currency_log from public, anon, authenticated, service_role;
grant select on table public.character_currency_log to authenticated;

-- Same visibility as the sheet: the owner always, other current members when shared.
create policy "Owners and shared members read the coin log"
  on public.character_currency_log for select to authenticated
  using (
    exists (
      select 1 from public.characters as c
      where c.id = character_currency_log.character_id
        and (c.owner_id = (select auth.uid()) or c.sheet_visibility = 'campaign')
    )
  );

-- The coin RPC now records each change that is applied (no-ops and refusals are not logged)
-- and keeps the newest 100 rows per character. Same signature, so create or replace.
create or replace function public.adjust_character_currency(
  p_character_id uuid,
  p_cp integer default 0,
  p_sp integer default 0,
  p_gp integer default 0
)
returns table (cp integer, sp integer, gp integer, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller_id uuid := auth.uid();
  v_campaign_id uuid;
  d_cp integer := coalesce(p_cp, 0);
  d_sp integer := coalesce(p_sp, 0);
  d_gp integer := coalesce(p_gp, 0);
  cur record;
  n_cp bigint;
  n_sp bigint;
  n_gp bigint;
  r_cp integer;
  r_sp integer;
  r_gp integer;
  r_updated_at timestamptz;
begin
  if p_character_id is null then
    raise invalid_parameter_value using message = 'currency_required';
  end if;
  if d_cp not between -9999999 and 9999999 or d_sp not between -9999999 and 9999999
    or d_gp not between -9999999 and 9999999
  then
    raise invalid_parameter_value using message = 'currency_amount_invalid';
  end if;

  select characters.campaign_id into v_campaign_id
  from public.characters
  where characters.id = p_character_id and characters.owner_id = caller_id;
  if not found then
    raise exception 'character_unavailable';
  end if;

  perform 1 from public.campaigns where campaigns.id = v_campaign_id for share of campaigns;
  if not found then
    raise exception 'character_unavailable';
  end if;
  if not exists (
    select 1 from public.campaign_members as m
    where m.campaign_id = v_campaign_id and m.profile_id = caller_id
  ) then
    raise exception 'character_unavailable';
  end if;

  select s.cp, s.sp, s.gp, s.updated_at into cur
  from public.character_sheets as s
  where s.character_id = p_character_id
    and exists (
      select 1 from public.characters as c
      where c.id = s.character_id and c.owner_id = caller_id and c.campaign_id = v_campaign_id
    )
  for update of s;
  if not found then
    raise exception 'character_unavailable';
  end if;

  if d_cp = 0 and d_sp = 0 and d_gp = 0 then
    return query select cur.cp, cur.sp, cur.gp, cur.updated_at;
    return;
  end if;

  n_cp := cur.cp::bigint + d_cp;
  n_sp := cur.sp::bigint + d_sp;
  n_gp := cur.gp::bigint + d_gp;

  if n_cp < 0 or n_sp < 0 or n_gp < 0 then
    raise exception 'currency_insufficient';
  end if;
  if n_cp > 9999999 or n_sp > 9999999 or n_gp > 9999999 then
    raise exception 'currency_limit_exceeded';
  end if;

  update public.character_sheets as s
  set cp = n_cp::integer, sp = n_sp::integer, gp = n_gp::integer
  where s.character_id = p_character_id
  returning s.cp, s.sp, s.gp, s.updated_at
  into r_cp, r_sp, r_gp, r_updated_at;

  -- The sheet row is locked, so rows for one character are written one at a time, in order.
  insert into public.character_currency_log (
    character_id, cp_delta, sp_delta, gp_delta, cp_after, sp_after, gp_after
  ) values (p_character_id, d_cp, d_sp, d_gp, r_cp, r_sp, r_gp);

  delete from public.character_currency_log as l
  where l.character_id = p_character_id
    and l.seq not in (
      select k.seq from public.character_currency_log as k
      where k.character_id = p_character_id
      order by k.seq desc
      limit 100
    );

  return query select r_cp, r_sp, r_gp, r_updated_at;
end;
$$;

commit;
