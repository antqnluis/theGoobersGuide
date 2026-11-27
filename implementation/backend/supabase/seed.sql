-- Local demo data for The Goober's Guide (development only).
--
-- Runs after migrations on `npm run db:reset`, and on a running local stack with
-- `npm run db:seed`. It is safe to run again: it does nothing once the demo campaign exists.
-- Never apply it to a hosted project; `supabase db push` does not run it.
--
-- It creates two local accounts and one campaign, through the app's own functions so every rule
-- and trigger applies:
--   * demo_dm      owns "The Ember Road (demo)", with the "Ember Road Components" crafting
--                  library imported and turned on. Sign in with the DM's email or username.
--   * demo_player  plays Brannoc in that campaign, carrying materials that reveal two visions and
--                  two fragments after the long rest this seed calls.
-- Both accounts use the one password set in `demo_password` below (local use only).

do $seed$
declare
  demo_password constant text := 'ember-road-demo';
  campaign_name constant text := 'The Ember Road (demo)';

  dm_id uuid;
  player_id uuid;
  v_campaign_id uuid;
  v_library_id uuid;
  v_character_id uuid;
  v_pack jsonb;

begin
  if exists (
    select 1 from public.campaigns c join public.profiles p on p.id = c.owner_id
    where c.name = campaign_name and p.username = 'demo_dm'
  ) then
    raise notice 'Demo data already present; nothing to do.';
    return;
  end if;

  -- ------------------------------------------------------------------------------------------
  -- Accounts (the profile rows come from the Auth insert trigger)
  -- ------------------------------------------------------------------------------------------
  select id into dm_id from auth.users where email = 'demo.dm@example.com';
  if dm_id is null then
    dm_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', dm_id, 'authenticated', 'authenticated',
      'demo.dm@example.com', extensions.crypt(demo_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"username":"demo_dm"}', now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), dm_id, dm_id::text, 'email',
      jsonb_build_object('sub', dm_id::text, 'email', 'demo.dm@example.com', 'email_verified', true),
      now(), now(), now()
    );
  end if;

  select id into player_id from auth.users where email = 'demo.player@example.com';
  if player_id is null then
    player_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', player_id, 'authenticated', 'authenticated',
      'demo.player@example.com', extensions.crypt(demo_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{"username":"demo_player"}', now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), player_id, player_id::text, 'email',
      jsonb_build_object('sub', player_id::text, 'email', 'demo.player@example.com', 'email_verified', true),
      now(), now(), now()
    );
  end if;

  -- ------------------------------------------------------------------------------------------
  -- The DM: campaign, library, import, enable
  -- ------------------------------------------------------------------------------------------
  -- From here each step runs as the signed-in person the app's functions would see.
  perform set_config('request.jwt.claim.sub', dm_id::text, true);

  insert into public.campaigns (owner_id, name, description)
  values (
    dm_id, campaign_name,
    'A demo table for the Maker''s Visions: a DM with a crafting library, and a player carrying the right materials.'
  )
  returning id into v_campaign_id;

  insert into public.campaign_members (campaign_id, profile_id, role)
  values (v_campaign_id, player_id, 'member');

  insert into public.crafting_libraries (owner_id, name, description)
  values (
    dm_id, 'Ember Road Components',
    'Original demo recipes: wyvern parts, frost moths, and ember salt.'
  )
  returning id into v_library_id;

  v_pack := $pack$
  {
    "format": "the-goobers-guide-crafting-pack",
    "version": 1,
    "pack": { "name": "Ember Road Components", "source": "Demo seed" },
    "items": [
      { "id": "wyvern-poison-gland", "name": "Wyvern Poison Gland", "category": "material", "rarity": "uncommon", "value_gp": 50, "weight": 1,
        "tags": ["wyvern"], "harvest": { "from": ["Wyvern"], "skill": "Medicine", "dc": 15 },
        "dm_notes": "Harvested from a wyvern's tail. Only the DM sees this." },
      { "id": "wyvern-fang", "name": "Wyvern Fang", "category": "material", "rarity": "uncommon", "value_gp": 40, "weight": 0.5,
        "tags": ["wyvern"], "harvest": { "from": ["Wyvern"], "skill": "Survival", "dc": 12 } },
      { "id": "alchemical-base", "name": "Alchemical Base", "category": "material", "rarity": "common", "value_gp": 5 },
      { "id": "frost-moth-wing", "name": "Frost Moth Wing", "category": "material", "rarity": "uncommon", "value_gp": 25, "weight": 0.1,
        "harvest": { "from": ["Frost moth swarm"], "skill": "Nature", "dc": 13 } },
      { "id": "glimmer-moss", "name": "Glimmer Moss", "category": "material", "rarity": "common", "value_gp": 8,
        "harvest": { "from": ["Damp caves"], "skill": "Nature", "dc": 10 } },
      { "id": "ember-salt", "name": "Ember Salt", "category": "material", "rarity": "common", "value_gp": 12, "weight": 0.5 },
      { "id": "stonebark-resin", "name": "Stonebark Resin", "category": "material", "rarity": "uncommon", "value_gp": 30,
        "harvest": { "from": ["Stonebark trees"], "skill": "Survival", "dc": 14 } },
      { "id": "iron-ingot", "name": "Iron Ingot", "category": "material", "rarity": "common", "value_gp": 10, "weight": 1 },

      { "id": "venom-blade-oil", "name": "Venom Blade Oil", "category": "potion", "rarity": "uncommon", "value_gp": 150, "consumable": true,
        "description": "Coat one weapon or three pieces of ammunition. For 1 minute, a hit deals an extra 2d6 poison damage." },
      { "id": "wyvern-fang-dagger", "name": "Wyvern Fang Dagger", "category": "weapon", "rarity": "uncommon", "value_gp": 400, "weight": 1,
        "description": "A +1 dagger. On a critical hit, the target takes an extra 3d6 poison damage." },
      { "id": "wyrmfang-blade", "name": "Wyrmfang Blade", "category": "weapon", "rarity": "rare", "value_gp": 4000, "weight": 1, "attunement": true,
        "description": "A +2 dagger that deals an extra 1d6 poison damage on a hit." },
      { "id": "frostward-draught", "name": "Frostward Draught", "category": "potion", "rarity": "uncommon", "value_gp": 120, "consumable": true,
        "description": "For 1 hour, you have resistance to cold damage and ignore difficult terrain made of ice or snow." },
      { "id": "emberwick-lantern", "name": "Emberwick Lantern", "category": "wondrous", "rarity": "uncommon", "value_gp": 300, "weight": 2,
        "description": "A hooded lantern that burns without oil. As an action, you can shed bright light in a 60-foot cone for 1 minute, once per dawn." }
    ],
    "recipes": [
      { "id": "venom-blade-oil", "output": { "item": "venom-blade-oil", "quantity": 1 },
        "key_materials": [ { "item": "wyvern-poison-gland", "quantity": 1 } ],
        "materials": [ { "item": "alchemical-base", "quantity": 2 } ],
        "crafting_cost_gp": 40, "workdays": 5, "tools": ["Poisoner's Kit"] },
      { "id": "wyvern-fang-dagger", "output": { "item": "wyvern-fang-dagger", "quantity": 1 },
        "key_materials": [ { "item": "wyvern-fang", "quantity": 2 } ],
        "materials": [ { "item": "wyvern-poison-gland", "quantity": 1 } ],
        "crafting_cost_gp": 70, "workdays": 10, "tools": ["Smith's Tools"], "requirements": "Proficiency in Arcana.",
        "check": { "skill": "Arcana", "dc": 13 } },
      { "id": "wyrmfang-blade", "output": { "item": "wyrmfang-blade", "quantity": 1 },
        "key_materials": [ { "item": "wyvern-fang-dagger", "quantity": 1 } ],
        "materials": [ { "item": "wyvern-poison-gland", "quantity": 3 }, { "item": "wyvern-fang", "quantity": 4 } ],
        "crafting_cost_gp": 1290, "workdays": 50, "tools": ["Smith's Tools"], "requirements": "Proficiency in Arcana.",
        "dm_notes": "The upgrade nobody has earned yet: it stays hidden until the dagger is in someone's pack." },
      { "id": "frostward-draught", "output": { "item": "frostward-draught", "quantity": 1 },
        "key_materials": [ { "item": "frost-moth-wing", "quantity": 1 }, { "item": "glimmer-moss", "quantity": 2 } ],
        "materials": [ { "item": "alchemical-base", "quantity": 1 } ],
        "crafting_cost_gp": 30, "workdays": 3, "tools": ["Alchemist's Supplies"], "notes": "Brew it fresh; it loses its bite after a day." },
      { "id": "emberwick-lantern", "output": { "item": "emberwick-lantern", "quantity": 1 },
        "key_materials": [ { "item": "ember-salt", "quantity": 2 }, { "item": "stonebark-resin", "quantity": 1 } ],
        "materials": [ { "item": "iron-ingot", "quantity": 2 } ],
        "crafting_cost_gp": 100, "workdays": 8, "tools": ["Tinker's Tools"] }
    ]
  }
  $pack$::jsonb;

  perform public.import_crafting_pack(v_library_id, v_pack, 'Demo seed');
  perform public.set_campaign_crafting_library(v_campaign_id, v_library_id, true);

  -- ------------------------------------------------------------------------------------------
  -- The player: a character, coins, and what they carry
  -- ------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', player_id::text, true);

  v_character_id := public.create_character(
    v_campaign_id, 'Brannoc', 'Human', 'Fighter', null, 'Soldier', 3, true
  );

  -- Linked to the catalogue, as a player's picked suggestion would be.
  insert into public.character_items (character_id, name, quantity, weight, rarity, crafting_item_id)
  select v_character_id, i.name, q.quantity, i.weight, i.rarity, i.id
  from (values ('wyvern-fang', 1), ('frost-moth-wing', 1), ('ember-salt', 3)) as q(slug, quantity)
  join public.crafting_items i on i.slug = q.slug and i.library_id = v_library_id;

  -- Typed by hand, so it matches by name alone (lower case on purpose).
  insert into public.character_items (character_id, name, quantity, weight)
  values
    (v_character_id, 'wyvern poison gland', 1, 1),
    (v_character_id, 'Rope (50 ft)', 1, 10),
    (v_character_id, 'Rations', 5, 2),
    (v_character_id, 'Healing potion', 2, 0.5);

  update public.character_sheets set gp = 42, sp = 5 where character_id = v_character_id;

  -- ------------------------------------------------------------------------------------------
  -- The DM calls the long rest, then the player saves the oil
  -- ------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', dm_id::text, true);
  perform public.call_long_rest(v_campaign_id);

  perform set_config('request.jwt.claim.sub', player_id::text, true);
  perform public.save_vision(
    v_character_id,
    (select r.id from public.crafting_recipes r where r.library_id = v_library_id and r.slug = 'venom-blade-oil')
  );

  perform set_config('request.jwt.claim.sub', '', true);
  raise notice 'Demo data created: sign in as demo.dm@example.com (DM) or demo.player@example.com (player).';
end
$seed$;
