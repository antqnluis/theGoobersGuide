# M04 — Crafting Guide: Implementation Log

Plan: [M04-Crafting-Guide-Plan.md](M04-Crafting-Guide-Plan.md). Branch: `milestone/crafting-guide`.

## Phase 0: Baseline and art (2026-11-27)

No behaviour changes.

### Baseline (from `implementation/frontend`, before any M04 code)

| Command                | Result                                     |
| ---------------------- | ------------------------------------------ |
| `npm run lint`         | Passed                                     |
| `npm run format:check` | Passed                                     |
| `npm run build`        | Passed (the usual chunk-size warning only) |
| `npm test`             | Passed: 128 files, 1,928 tests             |

Not run: `npm run test:e2e`, the camp-scene specs, and `npm run test:local-supabase`. No database work has started, and the project currently skips the graphical suites (plan §8.5).

### Shrine position

Confirmed against `campLayout.ts` and the sprite sizes in the art manifest: **x 625, y 246** (bottom centre).

- The cream bedroll (x 580, 43 px wide) ends near x 602, the shrine (about 32 px wide) spans about 609 to 641, and the map table (x 690, 47 px wide) starts near x 667. That leaves about 7 px and 26 px of clearance.
- The farthest party seat is at x 566, so no seated figure is covered.
- At `y 246` the shrine draws behind the bedrolls (`y 252` to `260`) and just in front of the map table (`y 242`).
- Watch in Phase 5: the map table's label plate ends at the table's right edge (`plateAlign: 'end'`), and the shrine's plate is centred at x 625. On a phone the two plates may sit close together. Check them with the camp-scene view and switch the shrine to `plateAlign: 'end'` or the table's plate to `below` if they collide.

### Art brief

[`art-src/camp/shrine-prompts.md`](../../implementation/frontend/art-src/camp/shrine-prompts.md) holds the brief, the sidecar (`shrine.json` contents), and a ChatGPT prompt for one sheet with two sprites, `shrine-stone` (idle) and `shrine-stone-lit` (glowing), in warm ember light so it contrasts with the cyan waystone.

**Art delivered:** `shrine.png` (two sprites, idle and lit) was added to `art-src/camp/` with `shrine.json` (`scale 0.048`). `npm run art:build` produced `shrine-stone.png` and `shrine-stone-lit.png`, both 27 x 42, and `npm run art:check` passed (34 layers, 0 placeholders). Phase 5 wires them into the camp; nothing draws them yet.

## Phase 1: Catalogue schema and import RPC (2026-11-27)

### What was added

- Migration `20261127100000_add_crafting_libraries.sql`: `crafting_libraries`, `crafting_items`, `crafting_recipes`, `crafting_recipe_materials`, `crafting_pack_imports`, `campaign_crafting_libraries`, with RLS and grants as planned (§3.2). Catalogue tables are select-only for the library owner; libraries take direct inserts and renames on `name` and `description` only.
- RPCs `import_crafting_pack`, `delete_crafting_library`, `set_campaign_crafting_library` (§3.5), plus private `craft_*` validators that raise `crafting_pack_invalid` with the failing path in `detail`.
- Regenerated `src/types/database.ts`, and `e2e/local-supabase-crafting.spec.ts` (16 tests), added to `test:local-supabase`.

### Decisions made while building

- **Deferred name check.** `unique (library_id, name_key)` is `deferrable initially immediate`. The import defers it and checks it at its end, so one pack can swap two item names. A collision reports `crafting_name_taken` with the database's key detail.
- **Recipe-first library delete.** Deleting a library cascades to items and recipes in no fixed order, and an item can't go while a recipe uses it. A `before delete` trigger on `crafting_libraries` removes the recipes first, so it holds for a direct delete and for a deleted account.
- **Foreign keys are `NO ACTION`, not `RESTRICT`.** Same effect for a used item (checked at statement end), but whole-library cascades work.
- **Strict pack keys on the server.** The server refuses unknown keys anywhere in the pack (as `import_has_only_keys` does for M03.8). The client parser strips and lists unknown keys before sending.
- **`delete_crafting_library` counts.** `saved` and `linked_items` are `0` until their tables exist. The Phase 3 and Phase 4 migrations must replace the function to count them (and the spec's expected preview then changes).
- **Removal of unknown slugs is ignored**, and counts report rows actually removed.

### Plan deviations

None in behaviour. The import also accepts an optional `source_label` that may be null (pasted packs have no file name); the history column is nullable.

### Verification (from `implementation/frontend` unless noted)

| Command                                                                                      | Result                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:reset` (backend)                                                                 | Run once to rebuild the local database. The local database held three migrations from another branch (`add_character_status_columns`, `add_character_resources`, `add_live_resource_rpcs`), which made `db:migrate` refuse. Local data was deleted. Hosted data untouched. |
| `npm run db:types` (backend), then Prettier                                                  | Done.                                                                                                                                                                                                                                                                      |
| `npm run lint`, `npm run format:check`, `npm run build`                                      | Passed                                                                                                                                                                                                                                                                     |
| `npm test`                                                                                   | Passed: 128 files, 1,928 tests (no frontend code changed)                                                                                                                                                                                                                  |
| `npx playwright test` on the crafting, inventory, membership, characters, and handoffs specs | Passed: 105 tests                                                                                                                                                                                                                                                          |

Not run: the rest of `test:local-supabase` (the notes, adventures, dice, live, appearance, sprite, galaxy, and import specs) and `test:e2e`. Not changed by this phase.

Not tested yet: a concurrent import and rest (needs Phase 4), and account deletion cascading to libraries (no account-deletion flow exists).

## Phase 2: Pack format, prompt, and the DM tab (2026-11-27)

### What was added (`implementation/frontend/src/features/crafting/` unless noted)

- `craftingPack.ts`: the pack parser. It checks every §2.3–2.4 field against `craftingLimits`, collects path-level problems (`items[2].value_gp`), lists unknown keys under "Not imported", and returns a normalized pack. Given a `LibrarySnapshot` it also checks references, names (a pack may swap two), removals that would strand a recipe, and the per-library caps, and counts new, updated, and removed things by slug.
- `craftingPackPrompt.ts`: the copyable prompt, built from the same constants. The tests check each stated limit at its boundary against the parser. It can list a library's existing item ids (capped at 400).
- `craftingCost.ts`: line cost, subtotal, total, still to pay, and the DMG guideline. The tests reproduce the §2.6 table exactly (oil 100 gp and 50 gp still to pay, dagger 200 gp and 110 gp).
- `craftingService.ts`, `craftingQueries.ts`, `useCraftingActions.ts`: RPC calls and table reads (paged in 1,000s because of `max_rows`), query keys under `['campaigns', 'crafting']`, and the DM's writes with mapped error copy.
- `PackImportDialog`, `LibraryBrowser`, `VisionsDm`, and `CampVisions`: import with review counts, browse with filters, the "No known source" hint, and a player preview; libraries with create, rename, delete (checked first), and enable or disable; and the area itself.
- `characters/importText.ts`: `documentFormats.crafting`, `craftingPackVersion`, and wrong-format messages in both directions.
- Camp: `'visions'` location (label _Visions_, place _Shrine stone_), the `shrineStone` prop at x 625, y 246 (drawn with the new `shrine-stone` sprite), its outline target, and the `visions` node in `CampaignCamp` and `CampaignWorkspacePage`, loaded on first open.

### Decisions made while building

- **The shrine is owner-only for now.** `ownerOnly: true` keeps the area (and its Places entry) the campaign owner's until Phase 5 adds the player view; players see the stone as scenery. Phase 5 must flip it to `false`.
- **The lit sprite is not drawn yet.** `shrine-stone-lit` exists in the manifest, but nothing uses it until the glow in Phase 5.
- **`delete_crafting_library` copy** already shows saved-vision and linked-item counts when they are above zero (they are zero until Phases 3 and 4).
- **Libraries enabled by a previous DM** appear as "Library 1, 2…" with a Turn off button, because a library's name belongs to its owner (C15).
- Browser-visible copy uses the plan's names ("The Maker’s Visions", "Shrine stone", "Visions").

### Verification (from `implementation/frontend`)

| Command                                                   | Result                                                                                                            |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run lint`, `npm run format:check`, `npm run build`   | Passed                                                                                                            |
| `npm test`                                                | Passed: 136 files, 2,140 tests (crafting: 8 files, 209 tests)                                                     |
| `npm run art:check`                                       | Passed                                                                                                            |
| `npx playwright test e2e/local-supabase-crafting.spec.ts` | Passed: 17 tests. It gained a test that every limit the prompt states is accepted by the database at its largest. |

Not run: `npm run test:e2e`, the camp-scene specs, the rest of `test:local-supabase`, and a visual check of the new screens in a browser (the project skips graphical suites). The DM tab has not been opened against the local stack in the browser. Phase 6's real-stack UI test covers it.

## Phase 3: Inventory links (2026-11-27)

### What was added

- Migration `20261127110000_link_items_to_crafting.sql`:
  - `character_items.crafting_item_id` (nullable, `on delete set null`, indexed), with insert and update column grants.
  - `guard_character_item_write` refuses a link to an item outside the libraries enabled on the character's campaign (`item_catalogue_unavailable`). A nonexistent id, another DM's item, and your own library that this campaign doesn't use all give the same error. Clearing a link, and leaving one unchanged after its library is disabled, are always allowed.
  - `search_crafting_items(p_character_id, p_query)`: at most 8 suggestions, owner and current member only, query 2 to 80 characters, prefix matches before word matches, `%` and `_` literal. It returns only `id`, `name`, `category`, `rarity`, `value_cp`, `weight`, and `description`.
  - `delete_crafting_library` now counts the inventory links a delete clears.
- Frontend:
  - `ItemForm` takes a `characterId`. With it, the name field is a combobox over the suggestions (250 ms debounce, arrow keys, Enter, and Escape that closes only the list). Picking one fills name, rarity, weight, and description, and links the item. A "Linked to the catalogue" chip has an Unlink button. Renaming a linked item keeps the link.
  - Inventory rows show a "Catalogue" chip to the owner only, so a shared sheet tells readers nothing about it.
  - The visions cache key (`visionsPrefix`, `visionsKey`) exists, and adding, editing, removing, or changing the quantity of an item, and applying a character update, invalidate it. Equipping does not. Nothing reads it before Phase 4.
  - `inventoryError` has copy for `item_catalogue_unavailable`.
- Tests: the crafting integration spec grew to 30 tests (13 new: grants, linking on insert and update, refusals, library delete and item removal clearing links, and the suggestions rules including privacy for other players, the DM, a departed player, and a missing character).

### Decisions made while building

- **"Materials" means items whose category is `material`** (C9). A crafted dagger is not suggested, so upgrade items stay hidden. In Phase 4 the suggestions also include the outputs of the character's own visions, so that migration must replace `search_crafting_items`.
- **`delete_crafting_library` still reports `saved: 0`.** Phase 4 replaces it again to count saved recipes.
- **Matching itself (C4) is not implemented yet.** Phase 3 stores the link and the name fallback is Phase 4's `private.crafting_held` helper, so the plan's "matching" integration cases (unlinked exact names, quantity 0, summed rows) move to Phase 4 with the long rest.
- A changed item row is also touched when its library is deleted (the link is cleared), which moves its `updated_at`. An open edit form for that item would then meet the existing conflict message.

### Verification (from `implementation/frontend`)

| Command                                                                                               | Result                         |
| ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| `npm run db:migrate` and `npm run db:types` (backend)                                                 | Applied and regenerated        |
| `npm run lint`, `npm run format:check`, `npm run build`                                               | Passed                         |
| `npm test`                                                                                            | Passed: 136 files, 2,161 tests |
| `npx playwright test` on the crafting, inventory, characters, imports, membership, and handoffs specs | Passed: 142 tests              |

Not run: `npm run test:e2e`, the camp-scene specs, and the rest of `test:local-supabase` (notes, adventures, dice, live, appearance, sprite, galaxy). The item form was not opened in a browser.

## Phase 4: Rests and visions (2026-11-27)

### What was added

- Migration `20261127120000_add_long_rests_and_visions.sql`:
  - `crafting_rests` (members read, inserts published to Realtime, newest 50 kept per campaign), and `character_visions` and `character_saved_recipes` with RLS on and **no grants for any role** (C7).
  - Private helpers: `crafting_held` (the one definition of "holding", C4), `crafting_rest_characters` (active characters of current members, W12), and `crafting_classify` (vision or fragment per character and recipe, W2, W10, W15).
  - `call_long_rest`, `get_character_visions`, `save_vision`, `unsave_vision` (§3.5, §3.6).
  - `search_crafting_items` replaced: it now also offers the outputs of the character's current visions and saved recipes (C9). Fragments' outputs stay hidden.
  - `delete_crafting_library` replaced: `saved` now counts saved recipes.
- Regenerated `src/types/database.ts`.
- `e2e/local-supabase-crafting.spec.ts` grew from 30 to 55 tests (privileges, rests, visions and fragments, saved visions, disable and delete, hidden tables, and a rest over 1,900 recipes and six characters).

### Decisions made while building

- **`call_long_rest` and `get_character_visions` return one extra field each: `library_count`.** It is the number of libraries enabled on the campaign. Phase 5 needs it to tell "no library yet" from "nothing stirred" (§6.2) without any table access. It reveals no catalogue data.
- **Cooldown uses `clock_timestamp()`**, and the rest records `clock_timestamp()` as `called_at`, so a second rest that waited on the advisory lock still sees the first one. Tests move earlier rests back in time instead of waiting 30 seconds.
- **One statement applies a rest.** A data-modifying CTE drops the rows no longer revealed and upserts the rest from the same classification, so no temporary table is needed.
- **A rest never deletes rows of a disabled library** and never touches characters it doesn't cover (C5, W12). Re-enabling brings them back unchanged.
- **Ordering in `get_character_visions`:** visions and saved recipes by "new" first, then output name. Fragments by "new" first, then the held names. A saved recipe that is also a current vision appears in `visions` with `saved: true`, and in `saved` only when no vision row currently reveals it.
- A saved recipe may also have a fragment row (it dropped back). Both are shown. Not worth special handling.
- `save_vision` requires a current vision of an enabled library, and takes the character row `FOR NO KEY UPDATE` so the 200 cap holds under concurrent saves. `unsave_vision` always works for the owner.

### Plan deviations

Only `library_count` above. Nothing else differs from §3 and §4.

### Verification (from `implementation/frontend` unless noted)

| Command                                                                                                | Result                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:migrate` and `npm run db:types` (backend)                                                  | Applied and regenerated                                                                                                                                             |
| `npm run lint`, `npm run format:check`, `npm run build`                                                | Passed                                                                                                                                                              |
| `npm test`                                                                                             | Passed: 136 files, 2,161 tests (no frontend code changed)                                                                                                           |
| `npx playwright test e2e/local-supabase-crafting.spec.ts`                                              | Passed: 55 tests                                                                                                                                                    |
| `npx playwright test` on the inventory, characters, imports, membership, and handoffs specs            | 111 passed, 1 failed: the inventory UI test "a player adds coins and an item in the tent" failed once and passed when rerun alone (a timing flake in a browser test) |

Not run: `npm run test:e2e`, the camp-scene specs, and the rest of `test:local-supabase` (notes, adventures, dice, live, appearance, sprite, galaxy). Nothing in this phase touches them.

Not tested: a rest racing a member's departure and a rest racing an import. Both rely on the locks in §5.2 (campaign `FOR SHARE`, libraries `FOR SHARE`, the import's `FOR UPDATE`), which the spec doesn't exercise. Realtime delivery of `crafting_rests` is checked only as publication membership; Phase 5's live refresh covers delivery.
