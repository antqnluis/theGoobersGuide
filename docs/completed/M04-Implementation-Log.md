# M04 — Crafting Guide: Implementation Log

Plan: [M04-Crafting-Guide.md](M04-Crafting-Guide.md). Branch: `milestone/crafting-guide`.

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

| Command                                                                                     | Result                                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:migrate` and `npm run db:types` (backend)                                       | Applied and regenerated                                                                                                                                              |
| `npm run lint`, `npm run format:check`, `npm run build`                                     | Passed                                                                                                                                                               |
| `npm test`                                                                                  | Passed: 136 files, 2,161 tests (no frontend code changed)                                                                                                            |
| `npx playwright test e2e/local-supabase-crafting.spec.ts`                                   | Passed: 55 tests                                                                                                                                                     |
| `npx playwright test` on the inventory, characters, imports, membership, and handoffs specs | 111 passed, 1 failed: the inventory UI test "a player adds coins and an item in the tent" failed once and passed when rerun alone (a timing flake in a browser test) |

Not run: `npm run test:e2e`, the camp-scene specs, and the rest of `test:local-supabase` (notes, adventures, dice, live, appearance, sprite, galaxy). Nothing in this phase touches them.

Not tested: a rest racing a member's departure and a rest racing an import. Both rely on the locks in §5.2 (campaign `FOR SHARE`, libraries `FOR SHARE`, the import's `FOR UPDATE`), which the spec doesn't exercise. Realtime delivery of `crafting_rests` is checked only as publication membership; Phase 5's live refresh covers delivery.

## Phase 5: The Maker's Visions area (2026-11-27)

### What was added

- **Player view** (`CampVisions`, `VisionList`, `VisionCard`, `FragmentCard`): a character picker (the active character first, then retired and deceased), then visions, fragments, and saved visions with their counts. A card shows the output, every material as "have 1 of 2" text beside a ✓/✗, line costs, the materials subtotal, the total, **still to pay**, workdays, tools, requirements, the check, notes, a **New** badge, and Save or Remove from saved. A fragment shows "Unknown item: ???", the key materials held by name, and `??? ×N`, with spoken equivalents ("Unknown item", "1 unknown key material"). The empty states are the three in §6.2.
- **DM tab**: owners get "My visions" and "DM: libraries and rests" tabs (only the DM tab when they have no character). The tab gains a **Long rest** section: the last rest's time and how many characters it reached, then _Call a long rest_ with a confirmation. The toast says "The party rests. Visions come to N characters." (or that no library is on, or no character is active). A second rest inside 30 seconds shows "The party has only just rested."
- **Camp**: the shrine is now open to every member (`ownerOnly: false`), and the Places entry reads "Visions, N new" (new visions plus new fragments of the viewer's active character). While N > 0 the scene swaps in the `shrine-stone-lit` sprite and rises a few ember motes (`shrineGlow`, standing still under reduced motion). The hover and focus outline covers both sprites.
- **Live refresh**: `useCampaignLive` subscribes to `crafting_rests` inserts for the campaign and refetches every cached visions list and the last rest. A rejoin refetches stale visions lists too.
- **Data layer**: `getCharacterVisions`, `saveVision`, `unsaveVision`, `callLongRest`, `getLastRest`, with copy for `crafting_rest_too_soon`, `character_unavailable`, `vision_unavailable`, and `saved_limit_reached`; `visionsOptions`, `lastRestOptions`; `callRest` and `setSaved` in `useCraftingActions`.
- **Tests**: unit and component tests for every new piece (counts below), `e2e/visions.spec.ts` (7 tests, written per §8.3), and `e2e/support/craftingFixtures.ts`.

### Decisions made while building

- **"New" stays until the next rest, so the shrine glows until then**, even after the player has looked. That is what W14 and W17 say (new until the next rest). If it proves noisy, the fix is a per-device "seen" marker, not a server change.
- **The count comes from the workspace, not the area.** The page reads the active character's visions as soon as the camp loads, so the Places entry and the glow are right before the shrine is opened. The area reuses that query. Retired and deceased characters load only when picked.
- **The save buttons carry the output's name** ("Save this vision (Venom Blade Oil)") so several cards on one page stay distinguishable.
- **A rest with no library on is allowed** (as in the database), and the toast says nothing stirred rather than claiming visions.
- **The e2e fixtures don't import app code.** The node TypeScript config resolves imports strictly, so `craftingFixtures.ts` holds plain data.

### Plan deviations

- The plan's `CampVisions` "character picker" is a select shown only when the player has more than one character.
- The glow is the lit sprite plus a few motes rather than a separate light pool, to keep the camp's light layer untouched.

### Verification (from `implementation/frontend`)

| Command                                   | Result                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run lint`, `npm run format:check`    | Passed                                                                              |
| `npm run build`                           | Passed (the existing large-chunk warning remains)                                   |
| `npm test`                                | Passed: 140 files, 2,212 tests                                                      |
| `npx playwright test e2e/visions.spec.ts` | Passed: 7 tests (two selectors and a checkbox wait in the spec needed fixing first) |

Not run: `npm run test:e2e`, the camp-scene specs, and `npm run test:local-supabase`. No database file changed in this phase. The lit sprite and the motes have not been looked at in a browser.

## Phase 6: Real-stack test and documentation (2026-11-27)

### What was added

- **Real-stack browser test** (§8.4) in `e2e/local-supabase-crafting.spec.ts`, now 56 tests. Two accounts and two browsers: the DM creates a library, pastes the §2.6 pack, imports it, and turns it on; the player adds a Wyvern Fang from a suggestion (linked) and a Poison Gland by typing its name (unlinked); the player sees "No visions yet" before the rest; the DM calls the rest and sees "Visions come to 1 character"; the player's Places entry reads "Visions, 2 new" and the dagger shows "have 1 of 2" and "110 gp still to pay", with no sign of the Wyrmfang Blade or the DM's tab. It also checks that the database holds six items and one linked of two inventory rows.
- **Docs**: a new "Crafting" section in [DATABASE_SCHEMA.md](../reference/DATABASE_SCHEMA.md) (tables, access, the inventory link and the holding rule, RPCs, vision rules, Realtime, lifecycle), a pointer from its inventory section, `crafting_rests` in its Realtime list, and `docs/README.md`.
- The plan and this log moved from `in-progress/` to `completed/`, with the plan's status set to implemented.

### Decisions made while building

- The browser test reloads the player's page after the rest instead of waiting for Realtime, so Realtime delivery of `crafting_rests` is still checked only as publication membership (Phase 4) and in the unit test for the subscription (Phase 5).
- The count of imported items is scoped to the DM's own library, because earlier test runs leave libraries with the same name.

### Verification (from `implementation/frontend`)

| Command                                                             | Result                                                                  |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npx playwright test e2e/local-supabase-crafting.spec.ts`           | Passed: 56 tests (the new browser test needed two selector fixes first) |
| `npm run lint`, `npm run format:check`, `npm run build`, `npm test` | Passed (140 files, 2,212 tests; no frontend code changed in this phase) |

## Close-out

### Acceptance criteria (§10)

| #   | Criterion                                                                                                        | Where it is checked                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | A DM can create, import, re-import, browse, and enable a library                                                 | Integration spec (Phase 1), `LibraryBrowser` tests, browser test      |
| 2   | Players read no catalogue row except through their visions and suggestions                                       | Integration spec: direct reads of every table return nothing          |
| 3   | After a rest, the §2.6 character sees exactly the two visions and no Wyrmfang Blade                              | Integration spec and browser test                                     |
| 4   | Partial key materials give a fragment with only the held names and a count                                       | Integration spec, `FragmentCard` tests                                |
| 5   | Counts change with the inventory without a rest; which recipes show changes only at a rest                       | Integration spec                                                      |
| 6   | Saved visions survive rests; fragments can't be saved                                                            | Integration spec, `CampVisions` tests                                 |
| 7   | Only the owner can call a rest; it covers active characters of current members and returns no per-character data | Integration spec                                                      |
| 8   | New badge until the next rest, and the shrine shows the count                                                    | `VisionCard`, `CampaignCamp` and browser tests, `e2e/visions.spec.ts` |
| 9   | Every screen has loading, empty, error, and success states; the light checks and local-stack suite pass          | Component tests; see below                                            |

### What was not run

`npm run test:e2e` (the full mocked browser suite), the camp-scene specs, and the rest of `test:local-supabase` (notes, adventures, dice, live, appearance, sprite, galaxy) were not run for M04. The lit shrine and its motes have not been looked at in a browser, and the shrine's label plate next to the map table's on a phone was not checked (Phase 0 flagged it). A rest racing a member's departure or an import, and Realtime delivery itself, are untested.

## Sealed visions: the reveal (2026-11-27)

A design pass (the Impeccable overdrive command) on the player's vision screen: what a rest brings now arrives as an experience instead of a list.

### What was added

- **Sealed folios** (`SealedFolio`): each new vision and fragment is a leather plate with a pixel wax seal. Breaking it cracks the wax into halves, bursts embers, and opens the folio in its place. **Break all seals** opens the rest at once.
- **The folio's entrance** (`VisionCard`, `FragmentCard`, `crafting.css`): it unfurls and opens itself, inks its title in, pops its chips, sweeps once in its rarity's colour, slides each material in with a lantern tick, and counts "still to pay" up (`CountCopper`). Fragments clear from a smudge. Several at once stagger.
- **Once per rest** (`visionReveal.ts`): which seals are broken is kept on the device per character and rest. "Replay the reveal" seals them again. A later rest seals its own new ones and forgets the old record.
- **The shrine follows the seals**: the Places count and the lit sprite now count what is still sealed (`useSealedCount`), so reading the visions puts the glow out.
- Pixel `cross` icon for a missing material, replacing the ✗ glyph (and a drawn tick for ✓). A materials table that stacks into two-line rows in narrow cards. The "new" mark on a card is a lantern top rule, not a coloured side border.
- DESIGN.md has a "Sealed visions" section.

### Decisions made while building

- **Sealed for everyone, with a skip.** The gate is the feature, so reduced motion keeps the seals and drops the show; "Break all seals" is the quick path during a session.
- **No server change.** "Sealed" is a device-local nicety over the server's `new` flag; clearing the browser only replays the reveal.
- The earlier note that the shrine glows until the next rest no longer holds: it glows until the seals are broken.

### Verification (from `implementation/frontend`)

| Command                                                          | Result                                                                                                |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npx vitest run src/features/crafting src/features/campaigns`    | Passed: 56 files, 742 tests                                                                           |
| `npx playwright test e2e/visions.spec.ts`                        | Passed: 9 tests                                                                                       |
| `npx playwright test e2e/local-supabase-crafting.spec.ts`        | Passed: 56 tests                                                                                      |
| Looked at in the built-in browser against the seeded demo player | Sealed list, mid-crack, mid-unfurl (foil, count-up, tick flash), final card, and a 375px phone layout |

Final run: `npm run lint`, `npm run format:check`, and `npm run build` passed, and `npm test` passed (143 files, 2,240 tests). The full `npm run test:e2e` and the camp-scene specs were not run.

## Visions layout: the card rail (2026-11-27)

A layout pass (the Impeccable layout command) on the same screen, at the player's request: show the cards side by side and scroll sideways past what fits.

### What changed

- **`CardRail`**: each group (Visions, Fragments, Saved) is a row of cards that scrolls sideways with snap, an edge fade where more wait, and two arrow keys that appear only on overflow. The row is a labelled, focusable region.
- **Card as a portrait folio**: the face shows the name, chips, still to pay, and one line per material (held of needed), with "Recipe details" opening the table, tools, and notes in the card. Sealed cards are the same width and stand taller.
- **A just-unsealed card stays closed**, and its entrance (the lantern tick, the stagger, the count-up) plays on the face's lines. Opening it automatically stretched one card to a screen tall in a row of short ones.
- A `chevron` pixel icon, and the card's unit-price column is gone in the card (it is always the stacked two-line form there).

### Verification (from `implementation/frontend`)

Looked at in the built-in browser against the seeded demo player at 1440 and 375 wide (sealed, opened, scrolled to the end, arrows disabled at each end). `npm run lint`, `npm run format:check`, and `npm run build` passed; `npm test` passed (144 files, 2,249 tests); `e2e/visions.spec.ts` passed (9; one run failed at sign-in in the mocked setup and passed on rerun); the crafting integration spec passed (56); the Impeccable layout scan found nothing. The full `npm run test:e2e` and the camp-scene specs were not run.

## Visions polish: consistency (2026-11-27)

A polish pass (the Impeccable polish command) over the whole Maker's Visions area, the player's view and the DM's, for one set of patterns.

### What was inconsistent, and what it became

- **Tabs:** the player/DM switch and the library browser's Items and Recipes were pairs of toggle buttons, while the notes use ribbon tabs. Now one `RibbonTabs` (pixel icon, uppercase label, oxblood underline) draws all of them, and its CSS moved from `npcs.css` to `journal.css` where the journal's shared pieces live.
- **Plates:** the vision cards, the DM's libraries, and the library browser's rows each had their own border and radius. All three now use the journal's printed plate (`journal-panel`), and a new card adds its lantern top rule over that plate's double rule.
- **"New":** a custom, smaller badge beside full-height chips. It is now a `journal-chip` (`journal-chip--new`) with a pixel star, so it reads as a sibling of the rarity and "Saved" chips.
- **Fragments:** they had their own bold sans title and sentences. They now have the vision card's anatomy: the serif name, a chip row, then ticked and crossed lines ("held" and `???` `×N`).
- **Type and colour:** card names, the seal title and the strip title all use the journal heading size (1.4rem); the leather plates use the camp cream token instead of a literal.
- **Replay** is the journal's ghost button instead of a one-off text button, and the DM tab gets a "Libraries" heading so Long rest, Libraries, and New library read as three sections.

### Verification

Looked at in the built-in browser as the DM (main tab and library browser) and as the player at 1440 and 375 wide. `npm run lint`, `npm run format:check`, and `npm run build` passed; `npm test` passed (144 files, 2,250 tests); `e2e/visions.spec.ts` passed (9) after its fragment assertions were updated to the new card; the crafting integration spec passed (56); the Impeccable scan found nothing. The full `npm run test:e2e` and the camp-scene specs were not run.
