begin;

-- A player's own pixel sprite for their seat at the camp, per campaign. It replaces the
-- look built from `campaign_appearances` while it exists. The sprite is exactly 16x16 and
-- small enough to live in the row: 1024 bytes of straight RGBA, base64 encoded (1368
-- characters), so no Storage object or signed URL is needed. Cosmetic only.
--
-- Access follows `campaign_appearances`: readable by current members while its owner is
-- also a member, written only through the function below. The player may remove their own
-- sprite, and so may the campaign's owner, to take down an unwelcome one.

create table public.campaign_custom_sprites (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  pixels text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (campaign_id, profile_id),
  constraint campaign_custom_sprites_pixels_check
    check (char_length(pixels) = 1368 and pixels ~ '^[A-Za-z0-9+/]+==$')
);

-- The profiles FK cascade.
create index campaign_custom_sprites_profile_id_idx on public.campaign_custom_sprites (profile_id);

create trigger campaign_custom_sprites_set_updated_at
  before update on public.campaign_custom_sprites
  for each row execute function private.set_updated_at();

alter table public.campaign_custom_sprites enable row level security;

revoke all on table public.campaign_custom_sprites from public, anon, authenticated, service_role;
grant select, delete on table public.campaign_custom_sprites to authenticated;

create policy "Members read current members' custom sprites"
on public.campaign_custom_sprites for select to authenticated
using (
  campaign_id in (select private.current_campaign_ids())
  and exists (
    select 1 from public.campaign_members as m
    where m.campaign_id = campaign_custom_sprites.campaign_id
      and m.profile_id = campaign_custom_sprites.profile_id
  )
);

create policy "Members and owners delete custom sprites"
on public.campaign_custom_sprites for delete to authenticated
using (
  campaign_id in (select private.current_campaign_ids())
  and (
    profile_id = (select auth.uid())
    or exists (
      select 1 from public.campaigns as c
      where c.id = campaign_custom_sprites.campaign_id
        and c.owner_id = (select auth.uid())
    )
  )
);

create function public.set_campaign_custom_sprite(
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
  if char_length(p_pixels) <> 1368 or p_pixels !~ '^[A-Za-z0-9+/]+==$' then
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

revoke all on function public.set_campaign_custom_sprite(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_campaign_custom_sprite(uuid, text) to authenticated;

commit;
