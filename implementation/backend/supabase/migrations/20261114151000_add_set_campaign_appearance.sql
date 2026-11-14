begin;

-- Saving a look is an upsert, which PostgREST cannot do under column-level grants (it
-- rewrites every payload column on conflict). A function does it atomically instead, so
-- clients no longer insert or update the table directly; they may still delete their own
-- row to return to the default look.

drop policy "Members add their own appearance" on public.campaign_appearances;
drop policy "Members update their own appearance" on public.campaign_appearances;
revoke insert, update on table public.campaign_appearances from authenticated;
revoke insert (campaign_id, cloak, skin, headwear, pack) on table public.campaign_appearances
  from authenticated;
revoke update (cloak, skin, headwear, pack) on table public.campaign_appearances from authenticated;

create function public.set_campaign_appearance(
  p_campaign_id uuid,
  p_cloak integer,
  p_skin integer,
  p_headwear text,
  p_pack text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise insufficient_privilege using message = 'appearance_sign_in_required';
  end if;
  if p_campaign_id is null or p_cloak is null or p_skin is null
    or p_headwear is null or p_pack is null then
    raise invalid_parameter_value using message = 'appearance_required';
  end if;
  if p_cloak not between 0 and 7 or p_skin not between 0 and 4
    or p_headwear not in ('hood', 'hat', 'cap', 'bare')
    or p_pack not in ('satchel', 'bedroll', 'quiver', 'none') then
    raise invalid_parameter_value using message = 'appearance_invalid';
  end if;

  -- Lock the campaign row the way the other member-scoped RPCs do, so a look cannot be
  -- written while the caller is being removed.
  perform 1
  from public.campaigns as c
  join public.campaign_members as m on m.campaign_id = c.id and m.profile_id = caller
  where c.id = p_campaign_id
  for share of c;
  if not found then
    raise exception 'appearance_campaign_unavailable' using errcode = 'P0001';
  end if;

  insert into public.campaign_appearances (campaign_id, profile_id, cloak, skin, headwear, pack)
  values (p_campaign_id, caller, p_cloak, p_skin, p_headwear, p_pack)
  on conflict (campaign_id, profile_id) do update
    set cloak = excluded.cloak,
        skin = excluded.skin,
        headwear = excluded.headwear,
        pack = excluded.pack;
end;
$$;

revoke all on function public.set_campaign_appearance(uuid, integer, integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_campaign_appearance(uuid, integer, integer, text, text)
  to authenticated;

commit;
