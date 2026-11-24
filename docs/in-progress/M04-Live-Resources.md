# M04 — Live Resources: Implementation Plan

## Status

**Approved (2026-11-24). In progress: Phases 0–4 done.** Every recommendation in [Approved decisions](#approved-decisions) (L1–L12) was approved as written. Phases 1 (status columns and `body_revision`), 2 (resources table and RPCs), 3 (data layer), and 4 (play view) are in; Phase 5 (rests and the editor) is next. See the [Implementation Log](M04-Implementation-Log.md). This plan builds on characters and sheets from [M03.2](../completed/M03.2-Characters-and-Party.md), the coin delta RPC pattern from [M03.3](../completed/M03.3-Inventory-and-Currency.md), server-rolled dice and live sheets from [M03.7](../completed/M03.7-Session-Utilities.md), and the character document from [M03.8](../completed/M03.8-Character-Imports.md).

Evidence was gathered on 2026-11-24 by reading files only: the 35 migrations (ending `20261124110000_allow_64px_custom_sprites.sql`), `characterTypes.ts`, `characterService.ts`, `CharacterSheet.tsx`, `CharacterTent.tsx`, `spellFormat.ts`, `SpellList.tsx`, `diceContext.ts`, and `legacy/docs/PRODUCT.md` §3.2 and §5.4. No database queries were run; Phase 0 records the baseline.

## Overview and objectives

Product pillar 1 ("Interact") says players should "adjust current resources and access common gameplay actions without repeatedly editing a static sheet" (`PRODUCT.md` §5.4). Today the play view lets the owner type current and temporary HP and save them; nothing else that changes during a fight is tracked. Spell slots appear only as text in a spell-group heading ("1st level (4 slots)"), and class charges, hit dice, conditions, and death saves are not tracked at all.

M04 delivers, on the owner's play view of their own sheet:

1. **Damage and healing** in one tap, with temporary HP absorbing damage first. Applied atomically on the server, so two devices never overwrite each other.
2. **Resource trackers**: spell slots per level (including pact slots), hit dice, and named class or homebrew trackers (Ki, Rage, Bardic Inspiration, Lay on Hands, Channel Divinity). Each one spends and restores with pips or a counter.
3. **Rests**: Short Rest and Long Rest buttons that preview exactly what they will reset before anything changes. A short rest can spend hit dice through the shared dice roller.
4. **Status**: conditions (the standard list plus free-text homebrew ones), exhaustion level, concentration, heroic inspiration, and death saves, which appear at 0 HP and roll through the dice roller.
5. **Live everywhere**: shared sheets update for other members without a refresh, using the existing Realtime plumbing.
6. **A body-only revision token**, so constant mid-session taps no longer cause `sheet_conflict` errors on an open edit on another device (L10).

Out of scope (follow-ups, listed in §12): an initiative tracker, a party status strip that shows HP and conditions without sharing the whole sheet, automatic slot and charge setup from class rules, and spell-casting that spends a slot from the spell list.

## Inherited decisions (no change)

| # | Decision | M04 consequence |
| --- | --- | --- |
| M03 §3 | All access requires current membership. | Every new RPC runs the M03.2 §4.1 prelude: caller owns the character and is a current member. |
| M03 A3 | Sheets are private by default. | Resources and status are readable exactly when the sheet is: owner always, other current members only when `sheet_visibility = 'campaign'`. |
| M03.2 §5.1 | Derived values are never stored. | Spell save DC, concentration save DC, and hit-die healing modifiers are computed in the client from the sheet. |
| M03.3 D4 | Frequently tapped counters use delta RPCs on a locked row, never read-modify-write in the client. | HP changes and resource spend/restore are delta RPCs. |
| M03.7 D2, D6 | Rolls are made by the server; sheet roll buttons appear only on sheets you own. | Hit-die and death-save rolls use `roll_dice` with `characterId`. |
| PRODUCT §3.4 | The app supports homebrew and never silently rewrites user-confirmed mechanics. | Nothing is set up automatically. Rests show a preview the player can adjust before applying (L5). |
| AGENTS.md | Revoke-then-grant, RLS on every table, migrations only. | One new table with RLS; new columns get explicit column grants. |

## Approved decisions

Approved 2026-11-24 as written. The alternatives are kept for history.

| # | Question | Decision | Alternative considered |
| --- | --- | --- | --- |
| **L1** | Where do trackers live? | **New table `public.character_resources`**, one row per tracker. Trackers are a variable-length list that changes every few seconds in a fight; a table gives each one an atomic delta RPC and per-row Realtime events. | A `resources` array in the sheet body. Rejected: every tap would rewrite the 64 KiB body under its concurrency token. |
| **L2** | Where does status live? | **New columns on `character_sheets`** beside the other vitals: `conditions text[]`, `exhaustion`, `death_save_successes`, `death_save_failures`, `concentration`, `inspiration`. They are fixed, small, and change mid-session, which is what the vitals columns are for (`characterTypes.ts`). | A second table. More joins for no gain. |
| **L3** | How do damage and healing write? | **`public.apply_character_hp(p_character_id, p_kind, p_amount)`** with `p_kind` in `damage`, `heal`, `temp`. Damage takes temp HP first, then current HP, floored at 0. Healing caps at max HP and, from 0, clears death saves. `temp` sets temp HP to the larger of the old and new values (temp HP doesn't stack). The existing direct column update stays for typed corrections in edit mode. | Keep last-write-wins typing. Rejected: two devices tapping at once lose updates. |
| **L4** | Tracker kinds | **`spell_slots`** (with `slot_level` 1–9), **`hit_dice`** (with `die` d6/d8/d10/d12), and **`tracker`** (named). Each has `maximum`, `current`, and `reset` in `short`, `long`, `none`. Pact slots are `spell_slots` with `reset = 'short'` and a name ("Pact slots"). Multiclass hit dice are one row per die size. | Free-form trackers only. Rejected: slots and hit dice need level and die to show and roll correctly. |
| **L5** | What does a rest do? | **The client builds a preview, and the player confirms or adjusts it**, then **`public.take_character_rest(p_character_id, p_kind, p_plan jsonb)`** applies it in one transaction. Long-rest defaults: HP to max, temp HP to 0, every `short` and `long` tracker to max, hit dice regain half the total (minimum 1), exhaustion −1, death saves cleared. Short-rest defaults: `short` trackers to max, plus any hit dice the player spent and rolled in the dialog. The RPC checks every entry against the rows it locks. | A fixed server-side rest. Rejected: homebrew rules (2024 long rests restore all hit dice; gritty realism; house rules) and PRODUCT §3.4. |
| **L6** | Hit dice on a short rest | **Each "Spend a hit die" rolls `1dN + CON modifier` through `roll_dice`** (shared to the log like any sheet roll, labelled "Hit die"), decrements that hit-dice row, and heals through `apply_character_hp`. The rest dialog shows the running total. | Typed healing only. Kept as a fallback when the roll fails. |
| **L7** | Death saves | **At current HP 0, the vitals card shows the save track and a "Roll death save" button** (server d20 via `roll_dice`). The client records the result through `public.record_death_save(p_character_id, p_result)`, `p_result` in `success`, `failure`, `critical_success` (natural 20: HP to 1, saves cleared), `critical_failure` (natural 1: two failures). The player can also tap pips directly to fix a mistake. Three failures shows a prompt to mark the character deceased with the existing lifecycle control; it never changes status by itself. | Pips only. Loses the "everyone sees the roll" feel M03.7 built. |
| **L8** | Conditions | **Up to 20 entries, each a standard key** (blinded, charmed, deafened, frightened, grappled, incapacitated, invisible, paralyzed, petrified, poisoned, prone, restrained, stunned, unconscious) **or a custom label of 1–40 characters**. Standard ones get a short reminder and an icon. Exhaustion is its own 0–6 counter, not a condition. Dropping to 0 HP does not add "unconscious" automatically. | Standard list only. Rejected: homebrew. |
| **L9** | Concentration | **`concentration text`, the spell name, or null.** When `apply_character_hp` deals damage while concentrating, the result offers "Roll concentration save (DC N)", DC = max(10, half the damage), using the CON save bonus from `characterSheetRules.ts`. Starting a new concentration spell replaces the old one. | Skip the save prompt. |
| **L10** | Edit conflicts | **Add `character_sheets.body_revision integer`**, incremented by trigger only when `sheet` changes. `updateCharacterSheetBody` checks `body_revision` instead of `updated_at`. HP, coins, status, and trackers then never invalidate an open body edit. This is the fix M03.3 §5.3 named. | Keep `updated_at`. Rejected: M04 makes mid-session writes constant. |
| **L11** | Setting up trackers | **Manual, with suggestions.** The edit view gets a Resources section (add, rename, reorder, set maximum and reset, delete). Above it, the client offers one-tap suggestions it can read without guessing: spell slots from spell headings that `spellFormat.ts` already parses ("1st level (4 slots)"), and hit dice from a single class name it recognises and the level. The player accepts each one; nothing is created silently. | Full class tables. Out of scope; multiclass and homebrew make them unreliable. |
| **L12** | Imports and exports | **Export includes tracker maximums and resets in the character document; import proposes them as differences like any other field (M03.8 review). Current values, conditions, and death saves are never imported** — they are session state, not sheet data. Format version moves 3 → 4; the reader still accepts 3. Can be cut to its own milestone without affecting the rest. | Leave imports alone in M04. |

## 1. Current implementation audit

### 1.1 What M04 builds on

- **Vitals** are columns on `character_sheets`: `max_hp`, `current_hp`, `temp_hp`, `armor_class`, `speed` (`20261113140000_add_characters.sql`), with `current_hp <= max_hp` checked. Clients update them directly through a column grant; `updateCharacterVitals` is last-write-wins.
- **The play view** is `CharacterSheet` with `readOnly` and `quickHp` (`CharacterTent.tsx`): the owner can type current and temp HP and save them. The edit view is `readOnly={false}`.
- **Concurrency**: `updateCharacterSheetBody` guards body saves with `.eq('updated_at', previousUpdatedAt)`. Coin and vitals writes bump `updated_at`, so they invalidate open body edits on other devices (M03.3 §5.3).
- **Spell slots** exist only as text. `parseSpells` reads a count from a heading like "1st level (4 slots)" and `SpellList` displays it.
- **Modifiers** (`abilityModifier`, `savingThrowBonus`, …) are in `characterSheetRules.ts`.
- **Dice**: `useDice().roll(RollRequest)` with `characterId` and `label` rolls on the server and shares to the campaign log.
- **Realtime**: `character_sheets` is already in the `supabase_realtime` publication (`20261122200000_add_realtime_publications.sql`), so the new status columns are live with no publication change.

### 1.2 Conventions inherited from M03 (mandatory)

Revoke-then-grant in every migration; `private` SECURITY DEFINER helpers with `set search_path = ''`; explicit `EXECUTE` on every function; column grants for immutable keys; stable error codes (`22023` for bad input, `P0001` for rule failures); generated types (`npm run db:types`, then Prettier); TanStack Query for remote data; integration tests create their own accounts and clean up in `finally`.

## 2. Database schema

### 2.1 New columns on `public.character_sheets` (L2, L10)

| Column | Type | Rule |
| --- | --- | --- |
| `conditions` | `text[] not null default '{}'` | At most 20 entries, each 1–40 characters, trimmed, no control characters, no duplicates (case-insensitive). Checked by `private.character_conditions_are_valid(text[])`. |
| `exhaustion` | `smallint not null default 0` | 0–6 |
| `death_save_successes` | `smallint not null default 0` | 0–3 |
| `death_save_failures` | `smallint not null default 0` | 0–3 |
| `concentration` | `text` | null, or 1–80 characters, trimmed |
| `inspiration` | `boolean not null default false` | — |
| `body_revision` | `integer not null default 0` | Incremented by a `before update` trigger when `new.sheet is distinct from old.sheet`. Never granted to clients. |

Existing rows get the defaults; no data changes.

### 2.2 `public.character_resources` (L1, L4)

```sql
create table public.character_resources (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  kind text not null,               -- 'spell_slots' | 'hit_dice' | 'tracker'
  name text,                        -- required for 'tracker'; optional label otherwise
  slot_level smallint,              -- 1–9, only for 'spell_slots'
  die smallint,                     -- 6, 8, 10, 12, only for 'hit_dice'
  maximum integer not null,         -- 0–999
  current integer not null,         -- 0–maximum
  reset text not null,              -- 'short' | 'long' | 'none'
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- Checks enforce the per-kind columns (`slot_level` set only for slots, `die` only for hit dice, `name` required for trackers, 1–60 characters).
- `current` is clamped on `maximum` changes by the guard trigger, so lowering a maximum never violates `current <= maximum`.
- A guard trigger refuses more than **40 resources per character** and any change to `id` or `character_id`.
- Index on `(character_id, position)`.
- Added to `supabase_realtime`. Replica identity stays default (inserts and updates; deletes refetch on the next focus, as in M03.7).

### 2.3 Relationships and delete behaviour

Deleting a character cascades to its resources. Leaving a campaign changes nothing here: the sheet's existing select policy already hides it from everyone else, and the owner loses access with their membership.

## 3. RLS policies and authorization matrix

### 3.1 Grants

- `character_sheets`: add `update (conditions, exhaustion, death_save_successes, death_save_failures, concentration, inspiration)` to `authenticated`. The existing owner update policy applies. `body_revision` is not granted.
- `character_resources`: revoke all; grant `select, delete`, `insert (character_id, kind, name, slot_level, die, maximum, current, reset, position)`, and `update (name, maximum, current, reset, position)` to `authenticated`. Direct `current` updates exist for typed corrections in the edit view; taps use the RPC.
- `EXECUTE` on `apply_character_hp`, `adjust_character_resource`, `take_character_rest`, and `record_death_save` to `authenticated` only.

### 3.2 Policies on `character_resources`

- **Select**: the same rule as sheets: `exists (select 1 from characters c where c.id = character_id and (c.owner_id = auth.uid() or c.sheet_visibility = 'campaign'))`, filtered by the characters select policy (current members only).
- **Insert, update, delete**: owner of the character, while a current member (same `using` and `with check` as "Owners update their sheets").

### 3.3 Matrix

| Actor | Read status and resources | Change them | Rest, HP RPCs |
| --- | --- | --- | --- |
| Owner, current member | Yes | Yes | Yes |
| Other member, sheet shared | Yes, live | No | No |
| Other member, sheet private | No (no rows, no counts) | No | No |
| Campaign owner (not the character's owner) | Only if shared | No | No |
| Former member, anon | No | No | No |

## 4. RPCs

Every RPC runs the M03.2 §4.1 prelude (caller owns the character and is a current member; else `P0001` / `character_unavailable`), locks the sheet row `for update`, and returns the changed values plus `updated_at`.

### 4.1 `apply_character_hp(p_character_id uuid, p_kind text, p_amount integer)` (L3)

Returns `(current_hp, temp_hp, death_save_successes, death_save_failures, damage_taken, concentration, updated_at)`.

| Step | Rule | Failure |
| --- | --- | --- |
| 1 | `p_kind` in `damage`, `heal`, `temp`; `p_amount` 1–9999 | `22023` / `hp_change_invalid` |
| 2 | `max_hp` or `current_hp` is null (for `damage`/`heal`) | `P0001` / `hp_not_set` |
| 3 | `damage`: take from `temp_hp` first, then `current_hp`, floor 0. Damage while already at 0 HP adds one death-save failure. Critical hits at 0 HP (two failures) and massive damage (instant death) are left to the player; see §12. | — |
| 4 | `heal`: `current_hp = least(max_hp, current_hp + amount)`; from 0, clear both death-save counters | — |
| 5 | `temp`: `temp_hp = greatest(temp_hp, amount)` | — |

`damage_taken` (after temp HP) lets the client offer the concentration save (L9).

### 4.2 `adjust_character_resource(p_resource_id uuid, p_delta integer)`

Returns `(current, updated_at)`. Delta −999 to 999, not 0. A spend below 0 is refused (`P0001` / `resource_empty`, "None left"); a restore above the maximum is clamped. Same lock-then-apply pattern as `adjust_character_currency`.

### 4.3 `take_character_rest(p_character_id uuid, p_kind text, p_plan jsonb)` (L5)

`p_plan` lists what the confirmed preview applies:

```jsonc
{
  "hp": "max",               // or an integer to set, or omitted
  "temp_hp": 0,              // or omitted
  "resources": [{ "id": "…", "current": 4 }],
  "exhaustion": -1,          // delta, or omitted
  "clear_death_saves": true
}
```

The RPC checks that every resource id belongs to the character, that each value is within 0–maximum, and that `p_kind` is `short` or `long`; then applies everything in one transaction and returns the new sheet vitals and resource rows. Hit dice spent during a short rest are already applied by L6's calls, so the short-rest plan only covers resets.

### 4.4 `record_death_save(p_character_id uuid, p_result text)` (L7)

Refused unless `current_hp = 0` (`P0001` / `not_dying`). `critical_success` sets HP to 1 and clears both counters. `critical_failure` adds two failures. Counters cap at 3. Returns the counters and HP.

### 4.5 Error copy (frontend)

| Code | Copy |
| --- | --- |
| `hp_not_set` | "Set max and current HP on the sheet first." |
| `resource_empty` | "None left. Take a rest or restore one by hand." |
| `not_dying` | "Death saves are only rolled at 0 HP." |
| `resource_limit` | "A character can have up to 40 trackers." |
| `character_unavailable` | Existing copy. |

## 5. Data shapes and rules (frontend)

- `characterTypes.ts`: `CharacterStatusState` (the six columns), `CharacterResource`, `ResourceKind`, `ResetRule`, `standardConditions` (key, label, reminder).
- `resourceRules.ts` (new, pure): `restPreview(sheet, resources, kind)` → the default plan (L5); `concentrationDc(damage)`; `hitDieRoll(die, conMod)` → `RollSpec`; `suggestSpellSlots(spellsText, existing)` and `suggestHitDice(className, level, existing)` (L11), each returning suggestions that do not duplicate existing rows.
- `resourceValidation.ts` (new): mirrors the SQL checks so the forms show errors before saving.

## 6. Frontend architecture

### 6.1 Files (`src/features/characters/`)

| File | Role |
| --- | --- |
| `resourceService.ts` | Queries and RPC calls; error mapping |
| `resourceQueries.ts` | `characterResourcesOptions(characterId)`; Realtime subscription merged into the existing live-sheet channel |
| `useResourceActions.ts` | Spend, restore, HP, rest, death save; writes returned values and `updated_at` into the sheet cache |
| `HpControls.tsx` | Damage, Heal, Temp buttons with an amount field; replaces the typed quick-HP form in the play view |
| `ResourceTrackers.tsx` | Pips (maximum ≤ 10) or a counter with −/+ (above 10); grouped as Spell slots, Hit dice, Features |
| `ConditionsBar.tsx` | Chips with reminders; add from the list or type a custom one; exhaustion stepper; concentration and inspiration toggles |
| `DeathSaves.tsx` | Shown at 0 HP; pips and "Roll death save" |
| `RestDialog.tsx` | Short and long rest preview with editable lines; hit-die spending on a short rest |
| `ResourceEditor.tsx` | Edit-view section: add, rename, reorder, maximum, reset, delete, and the L11 suggestions |

### 6.2 Play view layout

The vitals card becomes the "at the table" card: HP bar with Damage / Heal / Temp, conditions and concentration directly under it, then the trackers, then the two rest buttons. On phones it stays one column and the pips are at least 32 px touch targets. Other members' shared sheets show the same card read-only, with no buttons.

### 6.3 Feel and failure

Taps are optimistic: the pip or HP bar changes at once and rolls back with the error copy if the RPC fails. Rapid taps on one tracker are queued so they apply in order. Rest is not optimistic: the dialog shows "Resting…" until the RPC returns, then a notice ("Long rest taken.").

## 7. Membership departure, rejoin, and lifecycle

No new rules. Resources follow the character: kept while it exists, hidden with the sheet, deleted with it. Retired and deceased characters keep their trackers; the play controls are hidden on non-active characters.

## 8. Non-destructive migration strategy

### 8.1 Files (timestamps after `20261124110000`)

1. `…_add_character_status_columns.sql` — §2.1 columns, checks, `body_revision` trigger, column grants.
2. `…_add_character_resources.sql` — §2.2 table, guard trigger, RLS, grants, Realtime publication.
3. `…_add_live_resource_rpcs.sql` — §4 functions and `EXECUTE` grants.

### 8.2 Pre-flight and checks (read-only)

Before: count `character_sheets` rows. After: the same count, every row with the defaults, `body_revision = 0`, and `character_resources` in `pg_publication_tables`.

### 8.3 Rollback

Compensating migration only: drop the RPCs, the table, and the columns. No existing data is touched by the forward migrations.

## 9. Testing

### 9.1 Integration — `e2e/local-supabase-resources.spec.ts` (new, added to `test:local-supabase`)

- Owner creates, spends, restores, and deletes trackers; spending past 0 is refused; restoring past the maximum clamps.
- Another member can read a shared sheet's trackers and status and cannot write them by table or RPC; on a private sheet they see no rows.
- A former member and anon can do nothing.
- `apply_character_hp`: temp HP absorbs first; floor 0; heal caps at max; heal from 0 clears death saves; two concurrent damage calls both apply.
- `take_character_rest` rejects a resource id from another character and values above the maximum.
- `record_death_save` refuses above 0 HP; natural 20 sets HP to 1.
- A body save made with an old `body_revision` still succeeds after HP, coin, and tracker changes; it fails after another body save (L10).
- Realtime: a second member subscribed to a shared sheet receives a tracker update.

### 9.2 Unit — Vitest

`resourceRules.test.ts` (rest previews, half hit dice minimum 1, concentration DC, suggestions), `resourceValidation.test.ts`, and component tests for `HpControls`, `ResourceTrackers`, `RestDialog`, `DeathSaves`, and `ConditionsBar`.

### 9.3 Browser e2e — mocked

A new case in `campaigns.spec.ts` for damage, spend a slot, and long rest. Per project feedback, written but not run in full; only the light checks run.

### 9.4 Verification per phase

`npm run lint`, `npm run format:check`, `npm run build`, `npm test`, and `npm run test:local-supabase` from Phase 2 on.

## 10. Phased implementation plan

### Phase 0 — Baseline (no changes)

Record migration list, sheet row count, and the light checks passing.

### Phase 1 — Status columns and body revision (L2, L10)

Migration 1, `db:types`, switch `updateCharacterSheetBody` to `body_revision`. Integration test for the conflict change. Ships a real fix on its own.

### Phase 2 — Resources table and RPCs (L1, L3, L4, L5, L7)

Migrations 2 and 3, `db:types`, the integration spec.

### Phase 3 — Data layer

`resourceService.ts`, `resourceQueries.ts`, `useResourceActions.ts`, `resourceRules.ts`, `resourceValidation.ts`, with unit tests.

### Phase 4 — Play view: HP, trackers, conditions, death saves

`HpControls`, `ResourceTrackers`, `ConditionsBar`, `DeathSaves`, wired into the play view and read-only shared sheets.

### Phase 5 — Rests and the editor (L5, L6, L11)

`RestDialog` with hit-die rolls, `ResourceEditor` with suggestions.

### Phase 6 — Optional: imports and exports (L12)

Character document version 4, reader accepts 3 and 4, prompts updated, import review shows tracker differences.

## 11. Acceptance criteria

1. The owner can take damage, heal, and gain temp HP in one tap each from the play view, and two devices tapping at once lose nothing.
2. The owner can add spell slots, hit dice, and named trackers, spend and restore them, and see the result live on another device.
3. Short and long rests show a preview, can be adjusted, and apply in one step.
4. Conditions, exhaustion, concentration, inspiration, and death saves can be set, are shown on the sheet, and death saves and hit dice roll through the shared dice log.
5. Another member sees all of this on a shared sheet and none of it on a private one, and cannot change it.
6. HP, coin, status, and tracker changes no longer cause a `sheet_conflict` on an open body edit.
7. Nothing is created, reset, or marked automatically without the player confirming it.

## 12. Risks and edge cases

### Risks

- **Play-view crowding.** The vitals card gains a lot. Mitigation: trackers are grouped and collapsible; conditions show as chips only when set.
- **Realtime volume.** Each tap is one row event. Within limits for a table of 4–6 players; the existing channel is reused, not one per tracker.
- **Rules editions.** 2014 and 2024 differ on long-rest hit dice and exhaustion effects. The preview is editable (L5) and exhaustion is tracked as a level only, with no automatic penalties.

### Edge cases covered

- Lowering a tracker's maximum below its current value clamps `current`.
- Max HP lowered below current HP is refused by the existing check; the editor shows the existing copy.
- Damage at 0 HP adds a death-save failure; healing from 0 clears saves.
- Massive damage (instant death) is not automated; the player marks it with the existing lifecycle control.
- Deleting a tracker that a rest dialog has open: the RPC refuses the stale id, and the dialog reloads.

### Follow-ups (no M04 action)

- **Initiative tracker** for the party, using these HP and condition values.
- **Party status strip**: HP and conditions visible to the party by explicit opt-in, without sharing the full sheet.
- **Cast from the spell list**, spending the matching slot.
- **Class presets** for common trackers.
