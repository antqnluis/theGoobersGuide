begin;

-- M03.3 Phase 3 follow-up: coins stop at gold. Electrum and platinum are removed.
-- Compensating migration for the five-coin purse added in 20261114190000 and 20261114191000.
-- It deletes the ep and pp columns, so it refuses to run if any sheet holds those coins.

do $$
begin
  if exists (select 1 from public.character_sheets where ep <> 0 or pp <> 0) then
    raise exception 'electrum or platinum balances exist; spend or convert them before applying this migration';
  end if;
end;
$$;

drop function public.adjust_character_currency(uuid, integer, integer, integer, integer, integer);

alter table public.character_sheets drop constraint character_sheets_currency_check;
alter table public.character_sheets
  drop column ep,
  drop column pp,
  add constraint character_sheets_currency_check check (
    cp between 0 and 9999999 and sp between 0 and 9999999 and gp between 0 and 9999999
  );

create function public.adjust_character_currency(
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

  return query select r_cp, r_sp, r_gp, r_updated_at;
end;
$$;

revoke all on function public.adjust_character_currency(uuid, integer, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.adjust_character_currency(uuid, integer, integer, integer)
  to authenticated;

commit;
