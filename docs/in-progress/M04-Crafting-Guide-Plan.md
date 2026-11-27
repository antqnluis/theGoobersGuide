# M04 — Crafting Guide ("The Maker's Visions"): Implementation Plan

## Status

**Proposed (2026-11-26), review questions settled (2026-11-27).** The product decisions W1–W18 were agreed with the user on 2026-11-26 while the idea was being refined. The five [review questions](#questions-to-settle-in-review) were settled on 2026-11-27, each as proposed (C2, C9, C15, Q11, Q12). Phases 0 to 4 are done (2026-11-27); progress is in the [implementation log](M04-Implementation-Log.md). Branch: `milestone/crafting-guide`. This plan builds on what was actually built in [M03.1 — Membership Lifecycle](../completed/M03.1-Membership-Lifecycle.md), [M03.2 — Characters and Party](../completed/M03.2-Characters-and-Party.md), [M03.3 — Inventory and Currency](../completed/M03.3-Inventory-and-Currency.md), [M03.7 — Session Utilities](../completed/M03.7-Session-Utilities.md) (Realtime), and the import pattern of [M03.8](../completed/M03.8-Character-Imports.md) and [M03.9](../completed/M03.9-DM-Handoffs.md). Where they disagree with this plan, [DATABASE_SCHEMA.md](../reference/DATABASE_SCHEMA.md) describes the system as built.

Evidence was gathered on 2026-11-26 with read-only operations only: the migrations up to `20261124160000_add_npc_portraits.sql`, `src/features/characters/` (inventory service, item form, inventory rules, import plumbing), `src/features/campaigns/camp/campLayout.ts`, `CampaignCamp.tsx`, `CampaignWorkspacePage.tsx`, `useCampaignLive.ts`, the `e2e/` suites, and `docs/reference/DATABASE_SCHEMA.md`.

## Overview and objectives

*The Last Frontier* draws on Drakkenheim's crafting, Hamund's monster components, the 2024 DMG's crafting costs and times, and the group's D&D reference library. M04 turns that material into **a wiki that each character reads from their own inventory**. When the DM calls a long rest, each character receives **visions**: the recipes they now hold a key material for, with everything else each one needs and what it costs. Recipes they hold only some key materials for appear as **fragments**, unknown items shown as ???. Players never see the whole catalogue. They discover it by carrying the right things.

Goals: rewarding discovery, steady equipment progression, and room for bespoke inventions, while keeping class features, balance, and world consistency intact and keeping bookkeeping to a minimum.

M04 delivers:

1. **Crafting libraries owned by the DM** (`crafting_libraries`, `crafting_items`, `crafting_recipes`, `crafting_recipe_materials`), filled only by importing **crafting packs**: versioned JSON (`the-goobers-guide-crafting-pack`, version 1). A library can be reused across the DM's campaigns (`campaign_crafting_libraries`).
2. **A copyable pack prompt** that helps the DM turn book pages or notes into a pack with an outside assistant. As in M03.8 D1, the app never calls an AI service.
3. **Catalogue links on inventory items.** `character_items.crafting_item_id` is set when the player picks a suggestion. Unlinked items still match by exact name.
4. **The long rest.** `call_long_rest` (campaign owner only) recomputes each active character's visions and fragments in one transaction and records the rest (`crafting_rests`).
5. **Visions, fragments, and saved visions** per character (`character_visions`, `character_saved_recipes`), read only through `get_character_visions`, which returns exactly what that character may see. Material counts and costs are computed live on every read.
6. **A new camp area, The Maker's Visions**: a shrine stone beside the campfire. It has a player view (visions, fragments, saved, "New" badges, costs) and a DM view (libraries, imports, browsing, enabling, and Call a long rest).
7. **Tests:** multi-account integration tests on the local stack (including attempts to read hidden recipes directly), pack parser, cost, and prompt unit tests, component tests, and a written mocked browser spec.

## Inherited rules (no change)

| Source | Rule | Consequence for M04 |
| --- | --- | --- |
| AGENTS.md | RLS on every exposed table. Frontend checks are not authorization. | Hidden recipes are hidden by the database: players have **no table access** to catalogue rows. They read through one SECURITY DEFINER function (C7). |
| M03.3 D1, B10 | Items are sheet data. The campaign owner has no override on private sheets. | `call_long_rest` reads inventories inside the database and returns only a character count to the DM (C6). The DM never sees anyone's visions (W16). |
| M03.3 D3 | The purse holds cp, sp, and gp only. | Values are stored in **copper** and shown with the existing `describeCoins` helper (C3). |
| M03.3 D6 | Item names are 1–80 characters, rarity uses six fixed values. | Catalogue item names have the same bound and rarities (§2.3), so a linked item copies cleanly into the inventory. |
| M03.2 | One active character per player per campaign. Retired and deceased characters stay editable. | A rest covers active characters of current members (W12). Retired and deceased characters keep their visions and saved recipes, read-only in the sense that rests skip them. |
| M03.1 §6 | Player-owned rows never reference `campaign_members`. Departure keeps data and revokes access. | Vision rows reference `characters` only. Departure needs no new hook. |
| M03.7 D11 | Realtime delivers inserts and updates filtered by the select policy. Deletes are not subscribed. | `crafting_rests` is published (inserts). Members refetch their visions when a rest lands (C12). |
| M03.8 D1, D5 | Prompt plus JSON. One all-or-nothing call per import. Unknown fields ignored and listed. Uploads under 1 MB. | Same for packs, using `readJsonDocument` and `checkEnvelope` from `importText.ts`. |

## Agreed product decisions (2026-11-26)

| # | Decision |
| --- | --- |
| W1 | **The guide is view only.** It never consumes materials, spends gold, or creates items. Crafting happens at the table, and inventory is updated by hand. |
| W2 | **A recipe is revealed only by holding its key materials.** Recipes aren't listed by default. Every recipe names one or more key materials. |
| W3 | **The DM calls the long rest.** It recomputes which recipes each character sees. Between rests, *which* recipes are shown stays fixed. |
| W4 | **Characters can save a vision.** A saved vision stays in the guide after later rests would hide it, until the character removes it. |
| W5 | **Inventory items match catalogue items by link, with an exact-name fallback** (ignoring case and surrounding spaces). |
| W6 | **Missing materials show their name and gold value, never their source.** Harvest data is stored for the DM only. |
| W7 | **Discovery is per character.** Nothing is shared across the party. |
| W8 | **Libraries belong to the DM and are reused across campaigns.** Licensed book content stays in imported data and is never committed to the repo. |
| W9 | **Every vision shows its costs.** Each line shows quantity × unit value. The vision shows the materials subtotal, the crafting cost, the **total**, and **still to pay** (the value of the missing materials plus the crafting cost). |
| W10 | **Any quantity of a key material counts**, so holding 1 of 2 reveals the recipe and shows "1 of 2". With several key materials, a full vision needs at least one of *each*. |
| W11 | **Have/missing counts and still to pay update with the inventory.** Only *which* recipes are shown is fixed at the rest. |
| W12 | **A rest covers active characters of current members only.** Others keep what they had but gain nothing. |
| W13 | **The guide is a new camp area** with its own scene object, like the journal crates and the map table. |
| W14 | **The area is themed as visions received at rest.** "The party rests, and visions come." The scene object glows when the viewing character has something new. Name: **The Maker's Visions** (settled as Q11). |
| W15 | **Partial key materials give a fragment**: "Unknown item: ???" with the held key materials by name and the rest as `??? ×N`. The output, other materials, costs, time, and tools stay hidden. A recipe with a single key material never gives a fragment. |
| W16 | **The DM browses the entire library, not the characters' guides.** |
| W17 | **"New" badge** on visions and fragments that a rest reveals for the first time, until the next rest. A fragment that becomes a vision counts as new. |
| W18 | **Key materials count toward the total and still to pay.** |

## Proposed technical decisions

| # | Question | Proposal |
| --- | --- | --- |
| C1 | How is the catalogue written? | **Only through `import_crafting_pack`.** There is no item or recipe editor in M04. The DM fixes a mistake by editing the file and importing it again (upsert by slug). Libraries can be renamed and deleted directly. |
| C2 | Are packs additive? | **Yes.** Importing upserts every item and recipe in the pack and leaves the rest of the library alone. A pack may list `remove: { items: [], recipes: [] }` slugs to delete. Removing an item that a remaining recipe still uses fails the import (`crafting_pack_reference_missing`). |
| C3 | How are gold values stored? | **As whole copper** (`value_cp`, `crafting_cost_cp`, `integer`, 0–100,000,000). Packs state gp with up to two decimals, and the parser converts exactly (`Math.round(gp * 100)` after a decimal-places check). Sums are computed as `bigint` / `number`. |
| C4 | What counts as "holding" an item? | Inventory rows with **`quantity > 0`** whose `crafting_item_id` is the item, or that are **unlinked** and whose `lower(btrim(name))` equals the item's `name_key`. Quantities from several rows add up. Rows at 0 ("used up") never count. One SQL helper implements this for both the rest and the read (C7), so there's a single definition. |
| C5 | Which libraries apply to a character? | **Those enabled on the character's campaign** (`campaign_crafting_libraries`). Disabling a library hides its visions and saved recipes from that campaign (rows are kept and return if it's re-enabled). Deleting a library removes them. |
| C6 | What does `call_long_rest` return? | Only `rest_id`, `called_at`, and the **number of characters** covered. Never per-character results, so the DM learns nothing about private inventories (B10). |
| C7 | How do players read visions? | Through **`get_character_visions(p_character_id)`** only (SECURITY DEFINER, owner of the character, current member). It returns the visions, fragments, and saved recipes with live counts and costs. Fragments carry an opaque id, held key-material names, and a missing count, and nothing else. `character_visions` and `character_saved_recipes` have **no select grant**. |
| C8 | Can other players see a character's visions when the sheet is shared? | **No.** Visions follow W7, not sheet visibility. |
| C9 | What do item suggestions offer, given that catalogue names are part of the secret? | **Materials of the enabled libraries, plus the outputs of this character's current and saved visions**, through `search_crafting_items(p_character_id, p_query)`: at least 2 characters, prefix and word matches, at most 8 results, player-facing fields only. Other outputs (the upgrades you haven't seen) never appear. A player who types an exact name still matches through the fallback (W5). |
| C10 | Can a link point anywhere? | **No.** The item guard refuses a `crafting_item_id` that is not in a library enabled on the character's campaign (`item_catalogue_unavailable`). A later disable keeps the link but it stops counting (C5). Deleting the catalogue item sets the link to null. |
| C11 | How is "New" decided? | Each vision row stores `new_in_rest_id`: the rest that first revealed it as its current kind. It is new while that is the campaign's latest rest. A fragment that becomes a vision gets the new rest's id. A vision that drops back to a fragment keeps its old id (not new). |
| C12 | How do other devices learn about a rest? | `crafting_rests` joins `supabase_realtime` (inserts). Every current member may read their campaign's rests (time and count only). On insert, the workspace invalidates the visions queries. Inventory edits in the same tab invalidate them at once. Edits from another device show on refetch (window focus or reopening the area), because `character_items` isn't published (unchanged from M03.7). |
| C13 | Can rests be spammed? | **A 30-second cooldown per campaign** (`crafting_rest_too_soon`). Calling a rest is cheap but rewrites every character's visions and pings every member. |
| C14 | Limits | 20 libraries per owner, 2,000 items and 2,000 recipes per library, 1–5 key materials and up to 20 lines per recipe, 10 enabled libraries per campaign, 200 saved recipes per character, packs under 1 MB. The text bounds are in §2.3. |
| C15 | What happens on ownership transfer? | **Enabled libraries stay enabled**, so players keep their visions. The new owner sees them listed as "Enabled by a previous DM" and can disable them but can't browse or import into them, because they belong to the previous DM. |
| C16 | Which pack fields reach players? | Items: `name`, `category`, `rarity`, value, `weight`, `consumable`, `attunement`, `description`. Recipes: output and quantity, lines, crafting cost, `workdays`, `tools`, `requirements`, `check`, `notes`. **Never** `slug`, `tags`, `source`, `harvest`, or `dm_notes`. |

### Questions to settle in review

Settled 2026-11-27. Each was decided as proposed; the alternatives are kept for history.

| # | Question | Decision | Alternatives considered |
| --- | --- | --- | --- |
| C9 | Which catalogue suggestions does a player get when adding an item? | **Materials of the enabled libraries plus the outputs of this character's own visions.** This reveals that a material exists, never what it makes. | Own visions only; no suggestions; the DM hands out linked loot. |
| C2 | What does importing into a library with content do? | **Add and update by id**, with an optional `remove` list. | Each import replaces the whole library. |
| C15 | What happens to a previous DM's enabled libraries after an ownership transfer? | **They stay enabled.** The new DM can disable them but can't browse or edit them. | Disable automatically; copy the library to the new DM. |
| Q11 | What is the area called? | **The Maker's Visions**, a shrine stone beside the campfire (place: *Shrine stone*). | *Ember Visions*, *The Dreaming Hearth*, *Whispers of the Forge-God*. |
| Q12 | What can be saved? | **Full visions only**, not fragments. | Visions and fragments. |

## 1. Current implementation audit

### 1.1 Objects M04 builds on

| Object | Relevant facts | M04 use |
| --- | --- | --- |
| `public.campaigns`, `campaign_members` | `owner_id` mirrors the single `owner` membership row. Membership RPCs lock the campaign `FOR NO KEY UPDATE`. | `call_long_rest` checks the caller is `owner_id` and locks the campaign `FOR SHARE`, so it serializes with departures and transfers. |
| `private.current_campaign_ids()` | SECURITY DEFINER, scoped to the caller. | Policies on `crafting_rests` and the membership checks in the new RPCs. |
| `public.characters` | `status` (`active`, `retired`, `deceased`), `owner_id`, `campaign_id`, immutable keys. One active per player per campaign. | The rest covers `status = 'active'` characters whose owner is a current member. Visions reference `characters (id) on delete cascade`. |
| `public.character_items` | Free-text `name` (1–80), `quantity` 0–9,999, `rarity`, direct owner writes under RLS, column grants, `guard_character_item_write` (200-item cap, immutable keys). Not in `supabase_realtime`. | Gains `crafting_item_id` (nullable, `on delete set null`) with insert and update grants and a guard check (C10). |
| `inventoryRules.ts` | `describeCoins`, `formatPurseValue` (cp, sp, gp). | Reused for every cost in the guide. |
| `importText.ts` | `readJsonDocument` (1 MB, one code fence), `checkEnvelope`, `documentFormats`, `wrongFormatMessages`, `controlCharacters`. | Gains `documentFormats.crafting` and `craftingPackVersion = 1`. |
| `ItemForm.tsx` | Name, quantity, weight, rarity, description, equipped, attuned. | The name field gains catalogue suggestions. Choosing one fills name, rarity, weight, and description, and links the item. |
| `campLayout.ts` | `CampLocationId` union and the `campLocations` table drive scene buttons, the Places list, and panel gating. Props: tent 280, fire 480, bedrolls 380–580, map table 690, crates 770, waystone 880 (base art pixels on a 960 × 270 panorama). | New `'visions'` location and a `shrineStone` prop at about **x 625, y 246**, between the bedroll circle and the map table (confirmed against the draw plan in Phase 0). |
| `CampaignCamp.tsx`, `CampaignWorkspacePage.tsx` | Each destination's content is passed in as a node. Content loads on first open. `waiting` counts drive the Places badges. | New `visions` node, lazy load on first open, `waiting.visions` = number of new visions and fragments. |
| `useCampaignLive.ts` | One channel per campaign. `watch(table, events, onChange, filter)` subscriptions invalidate query keys. | One more subscription: `crafting_rests` INSERT with `campaign_id=eq.<id>`. |

### 1.2 What doesn't exist yet

- No long-rest concept anywhere in the app or the database.
- No catalogue of items. Inventory names are free text.
- No feature folder for crafting. New code goes in `src/features/crafting/`.

### 1.3 Tests

Integration specs share `e2e/support/localPlayers.ts` and `localSupabase.ts`. The nearest models are `local-supabase-inventory.spec.ts` (sheet-visibility privacy) and `local-supabase-handoffs.spec.ts` (an import RPC). Graphical suites (the full `test:e2e` and the camp-scene specs) are written for new cases but, as the project currently prefers, only light checks are run routinely (§8.5).

## 2. Crafting pack format

### 2.1 Design

- **One catalogue of items.** Materials, equipment, and consumables are all `items`, told apart by `category`. A recipe's inputs and output both reference item slugs. A crafted item can therefore be the key material for its upgrade, which gives equipment progression.
- **Files are packs.** A file may hold any mix of `items`, `recipes`, and `remove`, so the DM can keep `materials.json` and `drakkenheim-recipes.json` apart.
- **Stable slugs.** Re-importing updates rows with the same slug.
- **References resolve within the library** after the pack is applied, so a recipe pack may use items from an earlier pack.

### 2.2 Envelope

```json
{
  "format": "the-goobers-guide-crafting-pack",
  "version": 1,
  "pack": {
    "name": "Hamund's Wyvern Components",
    "source": "Hamund's Harvesting Handbook",
    "description": "Wyvern materials and the recipes that use them."
  },
  "items": [],
  "recipes": [],
  "remove": { "items": [], "recipes": [] }
}
```

`pack.name` (1–120) is required and is recorded in the import history. `pack.source` and `pack.description` are optional. Every list is optional, but a pack must contain at least one item, recipe, or removal.

### 2.3 Item

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | string | yes | Slug `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–80 characters, unique in the library. Stored as `slug`. |
| `name` | string | yes | 1–80 characters, trimmed, no control characters. Unique in the library ignoring case (`name_key`), so the name fallback is unambiguous. |
| `category` | string | yes | `material`, `weapon`, `armor`, `shield`, `wondrous`, `potion`, `scroll`, `ammunition`, `tool`, `other`. |
| `rarity` | string | yes | `common`, `uncommon`, `rare`, `very_rare`, `legendary`, `artifact`. |
| `value_gp` | number | yes | 0–1,000,000, at most 2 decimals. |
| `weight` | number | no | 0–99,999.99 lb. |
| `consumable` | boolean | no | Default `false`. |
| `attunement` | boolean or string | no | `true`, or a requirement of 1–120 characters ("by a spellcaster"). |
| `description` | string | no | Up to 2,000 characters, newlines allowed. |
| `tags` | string[] | no | Up to 10, each 1–40 characters. DM only (filters in the browser). |
| `source` | string | no | Up to 200 characters. DM only. |
| `harvest` | object | no | DM only: `{ "from": string[] (≤10, each ≤80), "skill": string (≤40), "dc": integer 1–40, "notes": string (≤500) }`, every key optional. |
| `dm_notes` | string | no | Up to 2,000 characters. DM only. |

### 2.4 Recipe

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | string | yes | Slug, unique in the library. |
| `output` | object | yes | `{ "item": "<slug>", "quantity": 1–999 }`. |
| `key_materials` | array | yes | 1–5 lines of `{ "item": "<slug>", "quantity": 1–999 }`. |
| `materials` | array | no | The other lines. Key and other lines together: at most 20, each item at most once per recipe, and never the output itself. |
| `crafting_cost_gp` | number | yes | 0–1,000,000, at most 2 decimals. |
| `workdays` | integer | yes | 0–9,999. |
| `tools` | string[] | no | Up to 10, each 1–80 characters. |
| `requirements` | string | no | Up to 500 characters. |
| `check` | object | no | `{ "skill": string (1–40), "dc": integer 1–40 }`, information only. |
| `notes` | string | no | Up to 2,000 characters. Shown to players. |
| `source` | string | no | Up to 200 characters. DM only. |
| `dm_notes` | string | no | Up to 2,000 characters. DM only. |

An item may have several recipes (alternative routes). The guide names a vision after its output item.

### 2.5 Authoring guideline (balance)

Aim for a recipe's **total** (every line's value + crafting cost) to land on the 2024 DMG crafting cost for the output's rarity, so harvested materials stand in for part of the gold. Use the table's workdays unless the source says otherwise. Consumables cost half and take half the time.

| Rarity | Cost | Workdays |
| --- | --- | --- |
| Common | 50 gp | 5 |
| Uncommon | 200 gp | 10 |
| Rare | 2,000 gp | 50 |
| Very rare | 20,000 gp | 125 |
| Legendary | 100,000 gp | 250 |

The DM browser shows each recipe's total next to the guideline for its output's rarity, as a hint only.

### 2.6 Worked example

```json
{
  "format": "the-goobers-guide-crafting-pack",
  "version": 1,
  "pack": { "name": "Wyvern Components", "source": "Hamund's Harvesting Handbook" },
  "items": [
    { "id": "wyvern-poison-gland", "name": "Wyvern Poison Gland", "category": "material", "rarity": "uncommon", "value_gp": 50, "weight": 1, "tags": ["wyvern"],
      "harvest": { "from": ["Wyvern"], "skill": "Medicine", "dc": 15 } },
    { "id": "wyvern-fang", "name": "Wyvern Fang", "category": "material", "rarity": "uncommon", "value_gp": 40, "weight": 0.5, "tags": ["wyvern"] },
    { "id": "alchemical-base", "name": "Alchemical Base", "category": "material", "rarity": "common", "value_gp": 5 },
    { "id": "venom-blade-oil", "name": "Venom Blade Oil", "category": "potion", "rarity": "uncommon", "value_gp": 150, "consumable": true,
      "description": "Coat one weapon or three pieces of ammunition. For 1 minute, a hit deals an extra 2d6 poison damage." },
    { "id": "wyvern-fang-dagger", "name": "Wyvern Fang Dagger", "category": "weapon", "rarity": "uncommon", "value_gp": 400, "weight": 1,
      "description": "A +1 dagger. On a critical hit, the target takes an extra 3d6 poison damage." },
    { "id": "wyrmfang-blade", "name": "Wyrmfang Blade", "category": "weapon", "rarity": "rare", "value_gp": 4000, "weight": 1, "attunement": true,
      "description": "A +2 dagger that deals an extra 1d6 poison damage on a hit." }
  ],
  "recipes": [
    { "id": "venom-blade-oil", "output": { "item": "venom-blade-oil", "quantity": 1 },
      "key_materials": [{ "item": "wyvern-poison-gland", "quantity": 1 }],
      "materials": [{ "item": "alchemical-base", "quantity": 2 }],
      "crafting_cost_gp": 40, "workdays": 5, "tools": ["Poisoner's Kit"] },
    { "id": "wyvern-fang-dagger", "output": { "item": "wyvern-fang-dagger", "quantity": 1 },
      "key_materials": [{ "item": "wyvern-fang", "quantity": 2 }],
      "materials": [{ "item": "wyvern-poison-gland", "quantity": 1 }],
      "crafting_cost_gp": 70, "workdays": 10, "tools": ["Smith's Tools"], "requirements": "Proficiency in Arcana." },
    { "id": "wyrmfang-blade", "output": { "item": "wyrmfang-blade", "quantity": 1 },
      "key_materials": [{ "item": "wyvern-fang-dagger", "quantity": 1 }],
      "materials": [{ "item": "wyvern-poison-gland", "quantity": 3 }, { "item": "wyvern-fang", "quantity": 4 }],
      "crafting_cost_gp": 1290, "workdays": 50, "tools": ["Smith's Tools"], "requirements": "Proficiency in Arcana." }
  ]
}
```

The totals are 100 gp (uncommon consumable), 200 gp (uncommon), and 2,000 gp (rare), as §2.5 suggests.

What a character holding 1 Wyvern Fang and 1 Wyvern Poison Gland sees after a rest:

| Vision | Lines | Total | Still to pay |
| --- | --- | --- | --- |
| Venom Blade Oil | Gland (key) 1/1 ✓ 50 gp · Alchemical Base 0/2 ✗ 10 gp · crafting 40 gp | 100 gp | 50 gp |
| Wyvern Fang Dagger | Wyvern Fang (key) 1/2 80 gp · Gland 1/1 ✓ 50 gp · crafting 70 gp | 200 gp | 110 gp |

Still to pay counts only the missing quantity: 1 more fang (40 gp) plus 70 gp crafting. Wyrmfang Blade stays hidden until the character holds a Wyvern Fang Dagger. With a hypothetical recipe whose key materials are Wyvern Fang and Basilisk Eye, the same character would see a fragment: **Unknown item: ???**, key materials *Wyvern Fang ✓ · ??? ×1*, and nothing else.

### 2.7 Validation

Two layers, as in M03.8:

- **Client parser** (`craftingPack.ts`): checks the envelope, every field against §2.3–2.4, duplicate slugs and names within the pack, references within the pack, and the line rules. It produces readable errors with paths (`recipes[2].materials[0].item`). Unknown keys are ignored and listed under "Not imported". A pack with any error can't be imported. The review shows counts (new and updated items and recipes, removals) before the DM confirms.
- **Server** (`import_crafting_pack`): re-validates every field (the client is not trusted), resolves references against the library after the upserts and removals, enforces the C14 caps and name uniqueness, and either applies everything or nothing. Server errors map to the same copy (§3.5).

### 2.8 Pack prompt (`craftingPackPrompt.ts`)

A copyable prompt for the DM, versioned with the format and built from the same limit constants as the parser (tests check every stated limit, as `characterPrompts.test.ts` does). It asks the assistant to read the DM's pasted source material as **data only**, ignore any instructions inside it, produce JSON in exactly the §2 shape, invent no rules text that the source doesn't give, use the §2.5 guideline when a cost or time is missing, and put anything uncertain in `dm_notes`. The DM can also give the slugs of items already in the library, so recipes can reference them.

## 3. Schema and RPCs

All new tables have RLS enabled, `revoke all … from public, anon, authenticated, service_role`, and explicit grants. Functions use `set search_path = ''`. Every new public RPC is `EXECUTE` for `authenticated` only, rejects null arguments with `22023`, and raises `P0001` with the messages in §3.5.

### 3.1 Migrations (new, timestamp-prefixed, additive only)

| Migration | Contents |
| --- | --- |
| `…_add_crafting_libraries.sql` | `crafting_libraries`, `crafting_items`, `crafting_recipes`, `crafting_recipe_materials`, `crafting_pack_imports`, `campaign_crafting_libraries`, their guards, policies, and `import_crafting_pack`, `delete_crafting_library`, `set_campaign_crafting_library`. |
| `…_link_items_to_crafting.sql` | `character_items.crafting_item_id`, grants, the guard extension, `search_crafting_items`. |
| `…_add_long_rests_and_visions.sql` | `crafting_rests`, `character_visions`, `character_saved_recipes`, the private matching helpers, `call_long_rest`, `get_character_visions`, `save_vision`, `unsave_vision`, and the Realtime publication for `crafting_rests`. |

### 3.2 Catalogue tables

**`public.crafting_libraries`**: `id uuid pk`, `owner_id uuid not null default auth.uid() → profiles on delete cascade`, `name text` (1–120, trimmed, no control characters), `description text` (≤2,000, null when empty), `created_at`, `updated_at`. Owner: select, update `(name, description)`, insert `(name, description)` (capped at 20 by the guard), delete through `delete_crafting_library` (which returns how many campaigns and saved recipes it affects first, for the confirmation copy).

**`public.crafting_items`**: `id uuid pk`, `library_id → crafting_libraries on delete cascade`, `slug`, `name`, `name_key text generated always as (lower(btrim(name))) stored`, `category`, `rarity`, `value_cp integer`, `weight numeric(7,2)`, `consumable boolean`, `attunement boolean`, `attunement_note text`, `description`, `tags text[]`, `source`, `harvest jsonb`, `dm_notes`, `created_at`, `updated_at`. `unique (library_id, slug)`, `unique (library_id, name_key)`, `unique (library_id, id)` (for composite foreign keys). Index `(library_id, name_key)` and a `name_key text_pattern_ops` index for prefix suggestions.

**`public.crafting_recipes`**: `id uuid pk`, `library_id`, `slug`, `output_item_id`, `output_quantity`, `crafting_cost_cp`, `workdays`, `tools text[]`, `requirements`, `check_skill`, `check_dc`, `notes`, `source`, `dm_notes`, timestamps. `unique (library_id, slug)`. `foreign key (library_id, output_item_id) references crafting_items (library_id, id)`, so the output is always in the same library. An item still used as an output can't be deleted (restrict).

**`public.crafting_recipe_materials`**: `recipe_id → crafting_recipes on delete cascade`, `library_id`, `item_id`, `role text check (role in ('key', 'other'))`, `quantity integer 1–999`, `position smallint`. `primary key (recipe_id, item_id)`, `foreign key (library_id, item_id) references crafting_items (library_id, id)` (restrict). Index on `item_id` (the rest's join).

Catalogue tables grant **select to `authenticated`** with a policy **library owner only**, and no write grants. Every write goes through `import_crafting_pack`. A guard trigger on each table forbids changing `id`, `library_id`, and `slug`.

**`public.crafting_pack_imports`**: `id`, `library_id` (cascade), `imported_by → profiles on delete cascade`, `pack_name`, `source_label` (from the file name, 1–120), `items_added`, `items_updated`, `recipes_added`, `recipes_updated`, `items_removed`, `recipes_removed`, `imported_at`. Owner select only. The history keeps the newest 100 per library.

**`public.campaign_crafting_libraries`**: `campaign_id → campaigns on delete cascade`, `library_id → crafting_libraries on delete cascade`, `enabled_by → profiles on delete set null`, `enabled_at`, `primary key (campaign_id, library_id)`. Select: the campaign owner (to list and disable). Writes only through `set_campaign_crafting_library`.

### 3.3 Inventory link

`character_items.crafting_item_id uuid null references crafting_items (id) on delete set null`, plus `grant insert (crafting_item_id), update (crafting_item_id)` to `authenticated`. `guard_character_item_write` gains one check when the value is set or changes: the item must be in a library enabled on the character's campaign, otherwise `item_catalogue_unavailable`. The existing item policies cover the column. Index on `crafting_item_id`.

### 3.4 Rests and visions

**`public.crafting_rests`**: `id`, `campaign_id` (cascade), `called_by → profiles on delete set null`, `called_at`, `character_count`. Select: current members of the campaign. Published to `supabase_realtime`. The newest 50 per campaign are kept.

**`public.character_visions`**: `id uuid pk` (the opaque id returned for fragments), `character_id → characters on delete cascade`, `recipe_id → crafting_recipes on delete cascade`, `kind text check (kind in ('vision', 'fragment'))`, `new_in_rest_id → crafting_rests on delete set null`, `revealed_at`. `unique (character_id, recipe_id)`. **No grants**: written by `call_long_rest`, read by `get_character_visions`.

**`public.character_saved_recipes`**: `character_id` (cascade), `recipe_id` (cascade), `saved_at`, `primary key (character_id, recipe_id)`. No grants: written by `save_vision` and `unsave_vision`, read by `get_character_visions`. Capped at 200 per character.

### 3.5 RPCs

| RPC | Security | Behaviour | Errors |
| --- | --- | --- | --- |
| `import_crafting_pack(p_library_id uuid, p_pack jsonb, p_source_label text)` | DEFINER | Caller must own the library. Locks the library row `FOR UPDATE`. Validates the whole pack (§2.3–2.4), upserts items by slug, then recipes and their lines (lines are replaced per recipe), applies removals, re-checks references and caps, records `crafting_pack_imports`, and returns the counts. All or nothing. | `crafting_library_unavailable`, `crafting_pack_invalid` (with the first failing path in `detail`), `crafting_pack_reference_missing`, `crafting_name_taken`, `crafting_library_full` |
| `delete_crafting_library(p_library_id uuid, p_confirm boolean)` | DEFINER | With `p_confirm = false`, returns `{ campaigns, saved, linked_items }` counts for the confirmation. With `true`, deletes it. | `crafting_library_unavailable` |
| `set_campaign_crafting_library(p_campaign_id, p_library_id, p_enabled boolean)` | DEFINER | Enable: caller owns the campaign **and** the library, at most 10 per campaign. Disable: caller owns the campaign (any library, per C15). Locks the campaign `FOR SHARE`. | `crafting_campaign_owner_required` (`42501`), `crafting_library_unavailable`, `crafting_campaign_library_limit` |
| `search_crafting_items(p_character_id, p_query text)` | DEFINER | Caller owns the character and is a current member. Returns at most 8 player-facing rows (C9, C16) from enabled libraries: materials, plus outputs of this character's current and saved visions. Query 2–80 characters. | `character_unavailable`, `crafting_query_invalid` (`22023`) |
| `call_long_rest(p_campaign_id)` | DEFINER | Caller is `campaigns.owner_id`. Locks the campaign `FOR SHARE`, checks the 30-second cooldown, inserts the rest, recomputes visions for every active character of a current member (§4), and returns `rest_id`, `called_at`, `character_count`. | `crafting_campaign_owner_required` (`42501`), `campaign_unavailable`, `crafting_rest_too_soon` |
| `get_character_visions(p_character_id)` | DEFINER, `stable` | Caller owns the character and is a current member (any status). Returns one `jsonb` document (§3.6) with live counts and costs. Only enabled libraries count. | `character_unavailable` |
| `save_vision(p_character_id, p_recipe_id)` / `unsave_vision(p_character_id, p_recipe_id)` | DEFINER | Save requires a current **vision** row (not a fragment, Q12) for that recipe. Unsave always works. Idempotent. | `character_unavailable`, `vision_unavailable`, `saved_limit_reached` |

As in M03.3, anyone who isn't the owner, isn't a current member, or names a row that doesn't exist gets the same "unavailable" error, so existence isn't revealed.

### 3.6 `get_character_visions` result

```json
{
  "last_rest_at": "2026-11-26T21:04:00Z",
  "visions": [
    {
      "recipe_id": "…", "new": true, "saved": false,
      "output": { "name": "Venom Blade Oil", "category": "potion", "rarity": "uncommon", "value_cp": 15000,
                  "weight": null, "consumable": true, "attunement": null, "description": "…", "quantity": 1 },
      "lines": [
        { "role": "key", "item_id": "…", "name": "Wyvern Poison Gland", "rarity": "uncommon", "value_cp": 5000, "need": 1, "have": 1 },
        { "role": "other", "item_id": "…", "name": "Alchemical Base", "rarity": "common", "value_cp": 500, "need": 2, "have": 0 }
      ],
      "crafting_cost_cp": 4000, "workdays": 5, "tools": ["Poisoner's Kit"],
      "requirements": null, "check": null, "notes": null
    }
  ],
  "fragments": [
    { "id": "…", "new": false, "held": ["Wyvern Fang"], "missing": 1 }
  ],
  "saved": [ { "…": "same shape as a vision, with saved = true, for saved recipes not currently revealed" } ]
}
```

The client computes the subtotal, total, and still to pay from `lines` and `crafting_cost_cp` (`craftingCost.ts`), so the arithmetic is unit-tested in one place. `have` is the live count (C4), so it updates after any inventory refetch.

## 4. Long-rest algorithm

Inside `call_long_rest`, after the lock and cooldown, as one statement per step:

1. **Characters:** `status = 'active'`, `campaign_id = p_campaign_id`, and the owner is in `campaign_members` for that campaign (W12).
2. **Held:** for each of those characters and each catalogue item in the enabled libraries, the summed `quantity` of matching inventory rows (C4). The helper `private.crafting_held(p_campaign_id)` returns `(character_id, crafting_item_id, held)` rows with `held > 0`.
3. **Classify** each recipe of the enabled libraries per character: `key_total` = number of key lines, `key_held` = key lines with `held > 0`. `vision` when `key_held = key_total`. `fragment` when `0 < key_held < key_total` (so never for a single key material). Otherwise nothing.
4. **Apply:** delete the character's vision rows that are no longer classified. Insert new ones with `new_in_rest_id = rest_id`. Update changed kinds: a fragment that becomes a vision gets `new_in_rest_id = rest_id` (C11); a vision that becomes a fragment keeps its id. Unchanged rows are left alone.
5. Characters outside step 1 are not touched (their rows are kept, W12).

Saved recipes are never touched by a rest.

## 5. Authorization and concurrency

### 5.1 Matrix

| Actor | Catalogue rows | Enable or disable | Call a rest | A character's visions | Saved recipes | Link items |
| --- | --- | --- | --- | --- | --- | --- |
| Library owner | Read all fields. Write via import. | Enable on campaigns they own | If campaign owner | Only their own characters | Own characters | Own characters |
| Campaign owner (not library owner) | None | Disable only (C15) | Yes | Only their own characters | Own characters | Own characters |
| Character owner, current member | None directly. Player-facing fields only via `get_character_visions` and `search_crafting_items` | No | No | Own, all statuses | Own | Own, enabled libraries only |
| Other members, even with a shared sheet | None | No | No | None (C8) | None | No |
| Departed player | None | No | No | None until rejoining | None until rejoining | No |
| `anon` | None | No | No | None | None | No |

### 5.2 Concurrency

- `call_long_rest` and `set_campaign_crafting_library` lock the campaign `FOR SHARE`, after which membership changes (`FOR NO KEY UPDATE`) wait, so a rest never covers a player halfway through leaving.
- Two concurrent rests in one campaign: each takes an advisory transaction lock keyed by the campaign before the cooldown check, so the second waits for the first to commit and then fails with `crafting_rest_too_soon`.
- An import during a rest: the import locks the library `FOR UPDATE`, and the rest reads libraries `FOR SHARE`, so one waits for the other and the rest never sees half a pack.
- Inventory edits during a rest are ordinary row writes. The rest sees the committed state at its statement snapshot. That's acceptable because the guide shows live counts anyway (W11).

## 6. Frontend

### 6.1 Files (`src/features/crafting/` unless noted)

| File | Purpose |
| --- | --- |
| `craftingTypes.ts` | Types for packs, the visions document, and library rows. |
| `craftingPack.ts` (+ test) | Pack parser and validator (§2.7) and the gp → cp conversion. |
| `craftingPackPrompt.ts` (+ test) | The DM's copyable prompt (§2.8). |
| `craftingCost.ts` (+ test) | Line cost, subtotal, total, still to pay, and the DMG guideline for a rarity, using `describeCoins` from `characters/inventoryRules.ts`. |
| `craftingService.ts` (+ test) | RPC calls and library table reads, mapping server errors to copy. |
| `craftingQueries.ts` | Query keys and options: `visionsKey(characterId)`, `librariesKey(userId)`, `campaignLibrariesKey(campaignId)`, `libraryBrowseKey(libraryId)`, `lastRestKey(campaignId)`. |
| `CampVisions.tsx` (+ test) | The area's root: a character picker (active first, then retired and deceased) and, for the campaign owner, a **DM** tab. |
| `VisionList.tsx`, `VisionCard.tsx` (+ tests) | Visions and saved visions: output, lines with ✓/✗ and have/need, line costs, totals, workdays, tools, requirements, check, notes, New badge, and Save/Unsave. |
| `FragmentCard.tsx` (+ test) | "Unknown item: ???", held key materials, and `??? ×N`. |
| `VisionsDm.tsx` (+ test) | The DM tab: libraries, enable/disable for this campaign, Import pack, Browse, history, Copy prompt, and **Call a long rest** with its confirmation and last-rest time. |
| `PackImportDialog.tsx` (+ test) | Pick or paste a file, parse, show errors or the review counts, confirm, and import. |
| `LibraryBrowser.tsx` (+ test) | Search and filter (category, rarity, tag) over items and recipes, including the DM-only fields and the §2.5 hint. A recipe can be previewed as a player would see it. |
| `characters/ItemForm.tsx` | The name field gains a suggestions list (C9), with a "Linked to the catalogue" chip and an Unlink action. |
| `characters/inventoryService.ts` | Sends `crafting_item_id` on add and edit. Invalidates `visionsKey` after every inventory mutation. |
| `characters/importText.ts` | `documentFormats.crafting`, `craftingPackVersion`, and wrong-format copy. |
| `campaigns/camp/campLayout.ts` | `'visions'` location (label *Visions*, place *Shrine stone*) and the `shrineStone` prop. |
| `campaigns/camp/campArt.ts`, `campFx.ts` | The shrine sprite and a soft glow while `waiting.visions > 0`. Respects reduced motion (a static highlight instead). |
| `campaigns/CampaignCamp.tsx`, `CampaignWorkspacePage.tsx` | The `visions` node, lazy loading on first open, and `waiting.visions`. |
| `campaigns/useCampaignLive.ts` | `crafting_rests` INSERT → invalidate `visionsKey` for cached characters and `lastRestKey`. |

### 6.2 States

| Screen | Loading | Empty | Error | Success |
| --- | --- | --- | --- | --- |
| Player view | Skeleton cards | No rest yet: "No visions yet. They come when the party takes a long rest." Rest but nothing: "Nothing stirred in your dreams. Carry new materials into your next rest." No libraries: "Your DM hasn't added a crafting library to this campaign." | Retry with the mapped message | Visions, then fragments, then saved. New ones first, each group by name. |
| DM tab | Skeleton list | "Create a library and import a crafting pack to begin." | Retry | Libraries with enabled toggles, last rest time, and Call a long rest |
| Pack import | Parsing / importing spinner | — | Path-level errors (client), or the mapped server error | Counts, then a toast ("Imported 6 items and 3 recipes into Wyvern Components") |
| Call a long rest | Button busy | — | `crafting_rest_too_soon`: "The party has only just rested." | Toast: "The party rests. Visions come to 4 characters." |
| Suggestions | Inline spinner after 250 ms debounce | No matches: nothing shown (the item still saves as typed) | Silent, so typing keeps working | Up to 8 rows with name, rarity, and value |

### 6.3 Accessibility and layout

- The shrine is a scene button and a Places entry like every destination, with the label "Visions" and the badge count in its accessible name ("Visions, 2 new").
- Cards are a list. ✓/✗ is always paired with the text "have 1 of 2", never colour alone. Costs read as words through `describeCoins`.
- "New" is text, not only a glow. The glow respects `prefers-reduced-motion`.
- Fragment `???` is announced as "Unknown item" and "1 unknown key material".
- Works at phone width with the existing journal panel ('wide' layout like adventures and notes).

## 7. Membership and lifecycle

- **Leaving or removal:** visions and saved recipes are kept and invisible, because `get_character_visions` requires current membership. **Rejoining** restores them. The departure hook doesn't change.
- **Retired or deceased:** kept and readable by the owner, skipped by rests. Returning to active means the next rest includes them again.
- **Deleting a character** deletes its visions and saved recipes. **Deleting a campaign** deletes its rests, links, and (through characters) visions. **Deleting a library** deletes its catalogue, links, visions, and saved recipes, and clears inventory links (the items themselves stay).
- **Ownership transfer:** C15. The previous DM's libraries stay enabled. The new DM can call rests at once.
- **Deleting the DM's account** deletes their libraries (cascade), which removes those visions from every campaign. The confirmation copy for account deletion, when that flow exists, must say so.

## 8. Testing

### 8.1 Integration: `e2e/local-supabase-crafting.spec.ts` (new, added to `test:local-supabase`)

- A DM creates a library, imports the §2.6 pack, and re-imports a corrected copy: counts, upserts by slug, no duplicates. An invalid pack, a missing reference, a duplicate name, and a removal of a used item each change nothing.
- **Hidden catalogue:** a player selecting directly from `crafting_items`, `crafting_recipes`, `crafting_recipe_materials`, `character_visions`, and `character_saved_recipes` gets no rows. Another DM can't read or import into the library.
- **Rest:** only the campaign owner can call it. The cooldown holds. Only active characters of current members are covered. A retired character keeps old rows.
- **Matching:** linked items, unlinked exact-name items (case and spaces), quantity 0 not counting, quantities summed across rows, and a link into a disabled or foreign library being refused.
- **Visions and fragments:** the §2.6 scenario gives two visions and no Wyrmfang Blade. A two-key recipe with one key held gives a fragment whose payload holds only `id`, `new`, `held`, and `missing`. Holding both keys turns it into a vision at the next rest, marked new.
- **Live counts:** adding an Alchemical Base changes `have` without a rest.
- **Privacy:** another player (even with a shared sheet), the DM, and a departed player get `character_unavailable` from `get_character_visions` and `search_crafting_items`. The DM's rest result contains no per-character data.
- **Save:** saving a vision works, saving a fragment fails, a saved vision survives a rest that hides it, and unsaving works.
- **Disable and delete:** disabling hides a library's visions and saved recipes, re-enabling restores them, deleting removes them and clears links.
- **Concurrency:** two simultaneous rests give one success and one `crafting_rest_too_soon`. A rest racing a member's departure never covers the departing player.

### 8.2 Unit: Vitest

- `craftingPack.test.ts`: every §2.3–2.4 rule, gp → cp edge cases (0.01, 1,000,000, three decimals refused), unknown keys listed, path-level messages.
- `craftingCost.test.ts`: the §2.6 tables exactly (totals, still to pay with a partial key), large values, and the guideline per rarity.
- `craftingPackPrompt.test.ts`: every limit stated in the prompt matches the parser constants.
- Component tests: `VisionCard`, `FragmentCard`, `CampVisions` states (§6.2), `VisionsDm` (owner only, confirmation, cooldown copy), `PackImportDialog`, ItemForm suggestions and linking, and the `campLayout` entry.

### 8.3 Browser e2e (mocked): `e2e/visions.spec.ts`

Written in Phase 5: opening the shrine, the empty states, a vision with costs, a fragment, saving, the DM importing a pack and calling a rest. Per the project's current practice, this spec and the camp-scene specs are written but not run routinely (§8.5).

### 8.4 Real stack

One UI test against the local stack in Phase 6: the DM imports the example pack and enables it, a player links a Wyvern Fang, the DM calls a rest, and the player sees the Wyvern Fang Dagger vision with "1 of 2" and 110 gp still to pay.

### 8.5 Per phase

Every phase runs `npm run lint`, `npm run format:check`, `npm run build`, and `npm test` from `implementation/frontend`. Phases that touch the database also run `npm run db:migrate` (backend), regenerate types, and run `npm run test:local-supabase` (or at least the crafting and inventory specs). The full `npm run test:e2e` and the camp-scene specs are not run routinely. The log records exactly which commands ran.

## 9. Phased implementation plan

### Phase 0: Baseline and art (no behaviour changes)

Run the light checks and record the baseline. Confirm the shrine's spot in the draw plan (x ≈ 625). Write the shrine stone art brief (a small weathered standing stone with carved maker's marks, faint smoke, and an idle and a glowing state, matching the 32–50 px props). The user generates it in ChatGPT and drops the files in `art-src/camp`.

### Phase 1: Catalogue schema and import RPC

The first migration (§3.2), `import_crafting_pack`, `delete_crafting_library`, `set_campaign_crafting_library`, generated types, and the catalogue half of the integration spec (import, re-import, invalid packs, hidden tables, other DMs).

### Phase 2: Pack format, prompt, and the DM tab

`craftingPack.ts`, `craftingPackPrompt.ts`, `importText.ts` constants, `craftingService.ts`, `PackImportDialog`, `LibraryBrowser`, and `VisionsDm`, mounted temporarily behind the new camp location with a placeholder sprite. Unit and component tests.

### Phase 3: Inventory links

The second migration (§3.3), `search_crafting_items`, ItemForm suggestions and linking, and the visions-cache invalidation hook (a no-op until Phase 4). Matching and link-refusal integration cases.

### Phase 4: Rests and visions

The third migration (§3.4), the matching helpers, `call_long_rest`, `get_character_visions`, `save_vision`, `unsave_vision`, and Realtime. The rest of the integration spec (§8.1).

### Phase 5: The Maker's Visions area

The shrine sprite and glow, `CampVisions`, `VisionList`, `VisionCard`, `FragmentCard`, saved visions, New badges, the Places badge, live refresh, and Call a long rest in the DM tab. Component tests and the written mocked spec (§8.3).

### Phase 6: Real-stack test and documentation

The real-stack UI test (§8.4), `DATABASE_SCHEMA.md` (a new "Crafting" section), `docs/README.md`, and the implementation log. Move this plan to `completed/` when everything is done.

## 10. Acceptance criteria

1. A DM can create a library, import the §2.6 pack, re-import it corrected, browse it with DM-only fields, and enable it on a campaign they own.
2. A player can't read any catalogue row except through their own character's visions and suggestions, verified by direct table queries.
3. After a rest, a character holding a Wyvern Fang and a Wyvern Poison Gland sees exactly the two visions and costs in §2.6, and nothing about Wyrmfang Blade.
4. A character holding some but not all key materials of a recipe sees a fragment with only the held names and the missing count.
5. Counts and still to pay change when the inventory changes, without a rest. Which recipes are shown changes only at a rest.
6. Saved visions survive rests until unsaved. Fragments can't be saved.
7. Only the campaign owner can call a rest. It covers only active characters of current members and returns no per-character data.
8. New visions and fragments carry a "New" badge until the next rest, and the shrine shows the count.
9. Every screen has loading, empty, error, and success states. The light checks and the local-stack suite pass.

## 11. Risks and edge cases

### Risks

| Risk | Mitigation |
| --- | --- |
| Catalogue names leak through suggestions (C9). | Limited to materials and this character's own outputs, at most 8, and at least 2 characters typed. Accepted in review (C9). |
| A pack typo silently breaks discovery (a misspelled key material that nobody can ever hold). | The DM browser flags recipes whose key materials are never anyone's output and have no `harvest` data, as a hint ("No known source"). |
| Name-fallback mismatches ("Wyvern fang" vs "Wyvern Fangs"). | The fallback is exact by design (W5). Suggestions make linking the easy path, and the item row shows whether it's linked. |
| Large libraries make rests slow. | Set-based SQL with indexes on `crafting_recipe_materials.item_id` and `character_items.crafting_item_id`. The integration spec times a rest over 2,000 recipes and 6 characters. |
| Licensed text in packs. | Packs are imported data only. The repo contains only the original §2.6 example. |
| The DM deletes a library mid-campaign. | The confirmation lists affected campaigns, saved recipes, and linked items first (`delete_crafting_library` with `p_confirm = false`). |

### Edge cases covered

Two inventory rows of the same material (summed). An item at quantity 0 (ignored). A linked item renamed by the player (the link still counts). An unlinked item matching names in two enabled libraries (counts for both). A recipe whose output is also one of its materials (refused). A recipe re-imported with different key materials (visions update at the next rest, live lines at once). A character moved to retired between rests (kept, skipped). A rest with no enabled libraries (succeeds, clears nothing, says so). A campaign owner who also plays (DM tab plus their own visions).
