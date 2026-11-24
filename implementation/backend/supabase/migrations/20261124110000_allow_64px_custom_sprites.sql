begin;

-- Custom sprites may also be 64x64: 16384 bytes of straight RGBA, 21848 base64 characters
-- (16x16 is 1368, 32x32 is 5464). Every size ends in two "=" padding marks.

alter table public.campaign_custom_sprites
  drop constraint campaign_custom_sprites_pixels_check,
  add constraint campaign_custom_sprites_pixels_check
    check (char_length(pixels) in (1368, 5464, 21848) and pixels ~ '^[A-Za-z0-9+/]+==$');

create or replace function public.set_campaign_custom_sprite(
  p_campaign_id uuid,
  p_pixels text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise insufficient_privilege using message = 'sprite_sign_in_required';
  end if;
  if p_campaign_id is null or p_pixels is null then
    raise invalid_parameter_value using message = 'sprite_required';
  end if;
  if char_length(p_pixels) not in (1368, 5464, 21848) or p_pixels !~ '^[A-Za-z0-9+/]+==$' then
    raise invalid_parameter_value using message = 'sprite_invalid';
  end if;

  -- Lock the campaign row the way the other member-scoped RPCs do, so a sprite cannot be
  -- written while the caller is being removed.
  perform 1
  from public.campaigns as c
  join public.campaign_members as m on m.campaign_id = c.id and m.profile_id = caller
  where c.id = p_campaign_id
  for share of c;
  if not found then
    raise exception 'sprite_campaign_unavailable' using errcode = 'P0001';
  end if;

  insert into public.campaign_custom_sprites (campaign_id, profile_id, pixels)
  values (p_campaign_id, caller, p_pixels)
  on conflict (campaign_id, profile_id) do update set pixels = excluded.pixels;
end;
$$;

commit;
