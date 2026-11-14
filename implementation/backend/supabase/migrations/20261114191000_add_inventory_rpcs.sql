begin;

-- M03.3 Phase 2: atomic coin and quantity deltas.
-- Prelude for both (same as the character RPCs): find the target owned by the caller without a
-- lock, lock the campaign row FOR SHARE (membership changes take NO KEY UPDATE on it, so they
-- serialize with these calls), re-check membership in a fresh statement, then lock the target
-- row. Every miss returns the RPC's "unavailable" error, the same for unknown, inaccessible,
-- and departed targets. Lock order: campaigns -> character_sheets or character_items.

create function public.adjust_character_currency(
  p_character_id uuid,
  p_cp integer default 0,
  p_sp integer default 0,
  p_ep integer default 0,
  p_gp integer default 0,
  p_pp integer default 0
)
returns table (cp integer, sp integer, ep integer, gp integer, pp integer, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller_id uuid := auth.uid();
  v_campaign_id uuid;
  d_cp integer := coalesce(p_cp, 0);
  d_sp integer := coalesce(p_sp, 0);
  d_ep integer := coalesce(p_ep, 0);
  d_gp integer := coalesce(p_gp, 0);
  d_pp integer := coalesce(p_pp, 0);
  cur record;
  n_cp bigint;
  n_sp bigint;
  n_ep bigint;
  n_gp bigint;
  n_pp bigint;
  r_cp integer;
  r_sp integer;
  r_ep integer;
  r_gp integer;
  r_pp integer;
  r_updated_at timestamptz;
begin
  if p_character_id is null then
    raise invalid_parameter_value using message = 'currency_required';
  end if;
  if d_cp not between -9999999 and 9999999 or d_sp not between -9999999 and 9999999
    or d_ep not between -9999999 and 9999999 or d_gp not between -9999999 and 9999999
    or d_pp not between -9999999 and 9999999
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

  select s.cp, s.sp, s.ep, s.gp, s.pp, s.updated_at into cur
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

  if d_cp = 0 and d_sp = 0 and d_ep = 0 and d_gp = 0 and d_pp = 0 then
    return query select cur.cp, cur.sp, cur.ep, cur.gp, cur.pp, cur.updated_at;
    return;
  end if;

  n_cp := cur.cp::bigint + d_cp;
  n_sp := cur.sp::bigint + d_sp;
  n_ep := cur.ep::bigint + d_ep;
  n_gp := cur.gp::bigint + d_gp;
  n_pp := cur.pp::bigint + d_pp;

  if n_cp < 0 or n_sp < 0 or n_ep < 0 or n_gp < 0 or n_pp < 0 then
    raise exception 'currency_insufficient';
  end if;
  if n_cp > 9999999 or n_sp > 9999999 or n_ep > 9999999 or n_gp > 9999999 or n_pp > 9999999 then
    raise exception 'currency_limit_exceeded';
  end if;

  update public.character_sheets as s
  set cp = n_cp::integer, sp = n_sp::integer, ep = n_ep::integer,
      gp = n_gp::integer, pp = n_pp::integer
  where s.character_id = p_character_id
  returning s.cp, s.sp, s.ep, s.gp, s.pp, s.updated_at
  into r_cp, r_sp, r_ep, r_gp, r_pp, r_updated_at;

  return query select r_cp, r_sp, r_ep, r_gp, r_pp, r_updated_at;
end;
$$;

create function public.adjust_character_item_quantity(p_item_id uuid, p_delta integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  v_campaign_id uuid;
  v_quantity integer;
  v_new bigint;
begin
  if p_item_id is null or p_delta is null then
    raise invalid_parameter_value using message = 'item_required';
  end if;
  if p_delta not between -9999 and 9999 then
    raise invalid_parameter_value using message = 'item_quantity_invalid';
  end if;

  select c.campaign_id into v_campaign_id
  from public.character_items as i
  join public.characters as c on c.id = i.character_id
  where i.id = p_item_id and c.owner_id = caller_id;
  if not found then
    raise exception 'item_unavailable';
  end if;

  perform 1 from public.campaigns where campaigns.id = v_campaign_id for share of campaigns;
  if not found then
    raise exception 'item_unavailable';
  end if;
  if not exists (
    select 1 from public.campaign_members as m
    where m.campaign_id = v_campaign_id and m.profile_id = caller_id
  ) then
    raise exception 'item_unavailable';
  end if;

  select i.quantity into v_quantity
  from public.character_items as i
  where i.id = p_item_id
    and exists (
      select 1 from public.characters as c
      where c.id = i.character_id and c.owner_id = caller_id and c.campaign_id = v_campaign_id
    )
  for update of i;
  if not found then
    raise exception 'item_unavailable';
  end if;

  if p_delta = 0 then
    return v_quantity;
  end if;

  v_new := v_quantity::bigint + p_delta;
  if v_new < 0 then
    raise exception 'item_quantity_insufficient';
  end if;
  if v_new > 9999 then
    raise exception 'item_quantity_invalid';
  end if;

  update public.character_items set quantity = v_new::integer where id = p_item_id;
  return v_new::integer;
end;
$$;

revoke all on function public.adjust_character_currency(uuid, integer, integer, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.adjust_character_item_quantity(uuid, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.adjust_character_currency(uuid, integer, integer, integer, integer, integer)
  to authenticated;
grant execute on function public.adjust_character_item_quantity(uuid, integer) to authenticated;

commit;
