# M04 — Implementation Log

Authoritative plan: [M04 — Live Resources](M04-Live-Resources.md). This log records what was done in each phase, the checks actually run, and any deviations from the plan.

## Phase 0 — Baseline (2026-11-24) — done

No code or migration changes. Branch `milestone/m04`, clean at the start.

| Check | Result |
| --- | --- |
| Local stack | Running. `supabase migration list` shows 35 migrations applied, latest `20261124110000` |
| `character_sheets` rows | 0 locally |
| `npm run lint`, `npm run format:check`, `npm run build` | Pass |
| `npm test` | 1,886 passed |

## Phase 1 — Status columns and body revision (2026-11-24) — done

One migration, `20261124120000_add_character_status_columns.sql`, applied with `npm run db:migrate`. It follows plan §2.1 and §3.1.

- Columns on `character_sheets`: `conditions`, `exhaustion`, `death_save_successes`, `death_save_failures`, `concentration`, `inspiration`, `body_revision`, each with its check. `private.character_conditions_are_valid(text[])` is pure; `authenticated` has `EXECUTE` because the CHECK runs as the writer.
- `private.bump_character_body_revision()` and trigger `character_sheets_bump_body_revision`: increment `body_revision` only when `sheet` changes; any manual change to the column is ignored. Imports bump it too, since the trigger runs on every write path.
- The six status columns are granted for `update` to `authenticated`; `body_revision` is not.
- Frontend: `updateCharacterSheetBody` and `saveSheet` take the previous `body_revision` (a number) instead of `updated_at`. `CharacterSheet` carries the status columns and `body_revision`; `sheetFields` selects them. `adjustCharacterCurrency` still adopts the new `updated_at`, because the import flow checks it.
- Tests: new `e2e/local-supabase-resources.spec.ts` (defaults and grants, constraints, revision moves only on body changes, a body save survives HP and status writes and fails after another body save), added to `test:local-supabase`. The column-grant assertion in `local-supabase-characters.spec.ts` lists the new columns.

### Deviations and notes

1. **Import review still uses `updated_at`.** `apply_character_update` compares the sheet's `updated_at`, so an import review left open while HP, status, or trackers change will report a conflict. The plan does not cover this. Decide in Phase 6 (L12) whether to move it to `body_revision` plus the fields the import touches.
2. **Stale assertion fixed.** `local-supabase-live.spec.ts` listed the Realtime publication without `campaign_overviews` (published since `20261123100000`), so it was already failing. Added it. Phase 2 will add `character_resources`.
3. `db:types` output was reformatted by Prettier; two unrelated blocks it collapsed were restored to the committed style.

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run format:check`, `npm run build` | Pass |
| `npm test` | 1,886 passed |
| `npm run test:local-supabase` | 228 passed; 1 failed (the stale publication assertion above), then fixed and `local-supabase-live.spec.ts` re-run: 5 passed |
| `npm run test:e2e`, camp-scene specs | Not run (project feedback) |

## Phase 2 — Resources table and RPCs (2026-11-24) — done

Two migrations, applied with `npm run db:migrate`: `20261124130000_add_character_resources.sql` (§2.2, §3) and `20261124140000_add_live_resource_rpcs.sql` (§4). `db:types` regenerated. No UI changes.

**Table.** `character_resources` as planned, with a shape check per kind (a slot needs its level, a hit die its die, a tracker its name; none may carry another kind's column), a guard trigger (ids pinned, 40 per character raises `resource_limit`, `current` clamps only when `maximum` changes), column grants, four owner and shared-read policies, and the Realtime publication.

**RPCs.** All four share `private.lock_owned_character_sheet(uuid)`: the M03.3 prelude (owned character, campaign `FOR SHARE`, membership re-check, sheet `FOR UPDATE`), with lock order campaigns → sheet → resources. The helper is not executable by any client role.

| RPC | Notes |
| --- | --- |
| `apply_character_hp` | Damage, heal, temp as in L3. A failure is added only when damage got past temp HP at 0 HP. Returns the concentration text so the client can offer the save. |
| `adjust_character_resource` | Delta −999..999, not 0. `resource_empty` below 0, clamps above the maximum. Unknown, someone else's, or a private sheet's id gives `resource_unavailable`. |
| `take_character_rest` | Validates the whole plan (known keys, integers, ranges, unique ids, ids owned by this character, values ≤ maximum) before applying, in one transaction. Returns jsonb `{sheet, resources}`. |
| `record_death_save` | `not_dying` unless HP is 0. Critical success sets HP 1 and clears; critical failure adds two; counters cap at 3. |

### Deviations and notes

1. **New error codes** beyond §4.5: `resource_unavailable` (stale, foreign, or hidden resource id; the rest dialog should reload on it), `rest_invalid`, `rest_plan_invalid`, `hp_change_invalid`, `resource_delta_invalid`, `resource_required`, `death_save_invalid`. Phase 3 maps them to copy.
2. **Short rests accept the full plan** (HP, temp HP, exhaustion, death saves), not only resets. The owner can already set those directly, and L5 says the player confirms what a rest does.
3. **`take_character_rest` returns jsonb**, so the generated type is `Json`; Phase 3 types it by hand.
4. Generated return types show `concentration` as `string`; it can be null.
5. **Realtime publication** assertion in `local-supabase-live.spec.ts` now lists `character_resources`, and a new case checks that a tracker tap reaches another member on a shared sheet and nobody on a private one.

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run format:check`, `npm run build` | Pass |
| `npm test` | 1,886 passed |
| `npm run test:local-supabase` | 238 passed, including the new resources spec (schema, RLS and grants, tracker spend and restore, visibility and departure, HP rules and concurrent damage, rest plans, death saves) |
| `npm run test:e2e`, camp-scene specs | Not run (project feedback) |

## Phase 3 — Data layer (2026-11-24) — done

No database changes and no UI. New files are in `src/features/characters/` unless noted.

| File | What it does |
| --- | --- |
| `characterTypes.ts` | `CharacterResource`, `ResourceValues`, `ResourceKind`, `ResetRule`, `hitDieSizes`, and `standardConditions` (key, label, reminder) |
| `resourceRules.ts` | Pure rules: `restPreview` (only what would change; hit dice back by half the total, at least 1, largest first), `concentrationDc`, `hitDieRoll` and `hitDieSheetRoll`, `deathSaveRoll` and `deathSaveOutcome`, `hpAfter` (the SQL's HP rules, for instant feedback), `resourceLabel`, `groupResources`, condition helpers, `suggestSpellSlots`, `suggestHitDice` |
| `resourceValidation.ts` | Mirrors the SQL checks for trackers, conditions, concentration, and typed HP amounts |
| `resourceService.ts` | Table reads and writes, the four RPCs, `RestResult` parsing, `resourceError` copy, `isResourceStale` |
| `characterService.ts` | Adds `updateCharacterStatus` (direct column update, like vitals) |
| `characterQueries.ts` | `characterResourcesKey`, `characterResourcesPrefix`, `characterResourcesOptions` |
| `useResourceActions.ts` | `changeHp`, `adjustResource`, `takeRest`, `saveDeathSave`, `saveStatus`, and add, edit, and remove for trackers |
| `../dice/diceSpecs.ts` | `dieSpec(sides, modifier)`; `d20Spec` now calls it |
| `../campaigns/useCampaignLive.ts` | Tracker inserts and updates refetch that character's list through the existing campaign channel. `useCampaignMembership.ts` marks the tracker queries stale on leave or removal |

**Feel (§6.3).** HP and tracker taps change the cache at once. Taps on one target (a character's HP, or one tracker) reach the server in order. While later taps are in flight the earlier answers are not shown, so a bar never steps back; the last answer is kept. A failure on the only tap in flight puts the old value back, and any failure shows safe copy. Rests, status saves, and tracker edits are not optimistic.

### Deviations and notes

1. **Dice sources.** A hit die uses source `tray` and a death save uses `save`; the `roll_dice` source list has no better fit, and adding one would be a migration.
2. **Spell-slot suggestions** read only headings the existing parser understands, such as "3rd level (2 slots)". "3rd level (slots: 2)" is not read, because the parser splits a line at its first colon. Left as is.
3. **Hit dice set to never reset** are skipped by the long-rest default; the other hit-dice rows regain half the total of the rows that do reset.
4. **No optimistic update for HP when HP is unset.** `hpAfter` returns null and the call goes to the server, which answers `hp_not_set`.
5. `characterService.updateCharacterStatus` and the hook's `saveStatus` cover conditions, exhaustion, concentration, inspiration, and death-save pips, which the UI in Phase 4 will use.

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run format:check`, `npm run build` | Pass |
| `npm test` | 1,951 passed (65 new: rules, validation, service, actions hook, live subscription) |
| `npm run test:local-supabase` | 238 passed |
| `npm run test:e2e`, camp-scene specs | Not run (project feedback) |

## Phase 4 — Play view: HP, trackers, conditions, death saves (2026-11-24) — done

No database changes. The owner's display view of an active character is now the "at the table" card; another member's shared sheet shows the same card read-only. All new components are in `src/features/characters/`, styled in `live.css`.

| Component | What it does |
| --- | --- |
| `HpControls` | HP number, bar, and temp HP; an amount field with Damage, Heal, and Temp HP. Bad amounts show an inline error. After damage that gets past temp HP while concentrating, it offers "Roll Concentration save (DC N)" (DC from the damage, CON save from the sheet) |
| `DeathSaves` | Shown at 0 HP. Pips are buttons for the owner (tap a pip to fill up to it, tap the last filled one to clear it). "Roll death save" rolls a d20 through the shared dice, reads the kept natural die, and records success, failure, a natural 20, or a natural 1. Three failures point to the deceased control; three successes say stable |
| `ConditionsBar` | Condition chips with reminders (standard ones stored by key, custom ones as typed), add and remove, exhaustion stepper 0–6, heroic inspiration toggle, concentration start, replace, and end. Another member sees only what is set, and nothing when nothing is |
| `ResourceTrackers` | Spell slots, hit dice, and features as collapsible groups. Up to 10 uses show as 36 px pips (full spends one, empty restores one); more shows a −/+ counter. Loading, error with retry, and an owner-only empty hint |

**Wiring.** `CharacterSheet` takes `playView` (replaces `quickHp`) and `live` (the `useResourceActions` result, created once in `CampaignWorkspacePage` and passed through `CharacterTent`). The typed quick-HP form and the play view's save bar are gone. `hasBar` now means the edit view; `hasTabs` covers the edit and play views. Live controls show only for an active character you own; a retired or deceased character shows the numbers without buttons (§7). The hook's error shows once, above the HP card.

### Deviations and notes

1. **Resting is not wired yet.** The Short rest and Long rest buttons belong to Phase 5 with the rest dialog.
2. **The play view no longer edits current or temp HP by typing.** Typed corrections remain in Edit character, as planned (§3.1).
3. **Mocked browser specs.** `campaigns.spec.ts` now sets current HP in the editor and checks the card instead of the old quick-edit form, and the folio-fit test no longer expects a save bar. `e2e/support/campMocks.ts` gained the status columns, `body_revision` (checked on body saves), and an empty tracker list. The new mocked case for damage, a slot, and a rest (§9.3) waits for Phase 5; none of the mocked specs were run.
4. **Test fixture fix.** The Phase 1–2 integration tests that used SQL fixtures selected rows with no `where`, so a parallel test's committed sheet could leak in (one flaky failure). They are now pinned to a fixed fixture character.
5. **Local stack.** Docker had dropped the Supabase containers mid-phase; `npm run supabase:start` restored them from backup with all three M04 migrations present.

| Check | Result |
| --- | --- |
| `npm run lint`, `npm run format:check`, `npm run build` | Pass |
| `npm test` | 2,002 passed (51 new: the four components, the sheet's play and shared views, the tent) |
| `npm run test:local-supabase` | 238 passed |
| `npm run test:e2e`, camp-scene specs | Not run (project feedback) |

### Browser check (2026-11-24)

Checked by hand in the built-in browser against the local stack, with a seeded test account, campaign, character, and six trackers, at desktop and phone width. Worked: the HP card and bar; damage with temp HP absorbing first (31 → 27, temp gone); the concentration prompt with DC 10, and DC 49 after 99 damage; rolling the concentration save into the dice log; 0 HP showing the death-save track; a death save (natural 19) recording one success; spending a 1st level slot (3 → 2, saved in the database); trackers as pips and a counter for Lay on Hands; conditions with reminders; the page at phone width. Not checked in the browser: removing or adding a condition, exhaustion, inspiration, concentration start and end, pip fixes on the death-save track, another member's read-only view (unit tested), and the live refresh on a second device.

One change came out of it: the Add condition and Concentrating on forms are folded into a collapsed "Add condition or concentration" section, and the two folding headings got a +/− marker. The screenshots lagged the page by a moment after a tap, so some looked stale (a faded Damage button, an old HP bar); the page itself was correct.
