# M02 — Persistent Galaxy and Campaign Planet Assignment: Implementation Log

Plan: [M02-Persistent-Galaxy-Planet-Assignment-Plan.md](M02-Persistent-Galaxy-Planet-Assignment-Plan.md)

## Phase 0 — Baseline (2026-11-22)

No code, schema, migration or test was changed. Run on `main` with the local Supabase stack already up (Docker running; `imgproxy` and `pooler` stopped, which is unused). All 29 migrations are applied locally (last `20261122210000`).

| Command (from `implementation/frontend`) | Result |
| --- | --- |
| `npm run lint` | Pass, no output |
| `npm run format:check` | Pass |
| `npm run build` | Pass. Only the existing chunk-size warning (`index` 941 kB, `GalaxyCanvas` 956 kB) |
| `npm test` | Pass: 108 files, 1751 tests |
| `npm run test:local-supabase` | 212 passed, 1 failed (see below) |

### Known flake

`e2e/local-supabase.spec.ts:16` ("registers and signs in by username or email…") failed once in the full run at line 53: after signing in with an upper-cased email username, the URL stayed on `/login` for the 5 s `toHaveURL` timeout. Re-running that spec file alone passed 3/3 (the test took 24.9 s), so it is load-sensitive under the parallel full run, not a regression. Treat a single failure of this test in later phases as a flake, and re-run the file alone before investigating.

### Baseline for later phases

- Unit: 1751 tests. Local stack: 213 tests.
- Phase 2 adds `local-supabase-galaxy.spec.ts` to the `test:local-supabase` script, so the total there will grow.
- Mocked `test:e2e` and the camp-scene browser suites were not run, per the standing preference to avoid full graphical suites.

## Phase 1 — Database (2026-11-22)

Added `implementation/backend/supabase/migrations/20261122220000_add_galaxy_planets.sql`, applied with `npm run db:migrate` (no reset). It contains the `galaxy_planets` table, the partial unique index and the `campaign_id` index, the `set_updated_at` trigger, RLS (select only, own active rows of current memberships), `private.assign_galaxy_planet`, the AFTER INSERT and AFTER DELETE triggers on `campaign_members`, `public.move_galaxy_planet`, and the backfill. `src/types/database.ts` was regenerated with `npm run db:types` and formatted with prettier. Only the new table and RPC were added to the file. `DATABASE_SCHEMA.md` has a new "Galaxy planets" section.

Implementation notes:
- The migration is `20261122220000`, the next timestamp after the last applied one.
- Trigger functions are `private.claim_galaxy_planet_on_join` and `private.release_galaxy_planet_on_leave`. Both are executable by `postgres` only, like `assign_galaxy_planet`.
- `move_galaxy_planet` also raises `galaxy_planet_sign_in_required` (`42501`) for a null caller, following `set_campaign_appearance`.
- The departure hook, the membership RPCs and the existing tables were not changed.

### Verification

A throwaway SQL script ran in one rolled-back transaction against the local database (nothing persisted). It passed all assertions:
- Create claims slots 0, 1, 2 in order. The same campaign gets different slots for two players.
- Leave releases only that player's row. A freed slot is reused by a new campaign.
- Rejoin falls back to the first free slot when the old one is taken, and restores it when free. `assign_galaxy_planet` is idempotent.
- Deleting a campaign cascades its rows away and leaves the rest. Every membership has exactly one active row, with no duplicate active slots.
- `move_galaxy_planet`: a free slot moves, a taken slot returns the current one, and slots −1 and 6 (past the highest in use) and a null argument raise `22023`. Another player's campaign and a departed campaign raise `P0001`.
- RLS and grants: the caller sees only their own active rows, and released rows are hidden. Direct insert, update and delete raise `42501`, as does `anon`. Privilege checks pass for tables and functions.

| Command | Result |
| --- | --- |
| `npm run db:migrate` (backend) | Applied `20261122220000`. A second run applied nothing. |
| `npm run lint`, `npm run format:check` (frontend) | Pass |
| `npx tsc -b` | Pass |
| `npm test` | Pass, 108 files and 1751 tests |
| `npm run test:local-supabase` | Pass, 213 of 213 (the Phase 0 flake did not recur) |

Not yet covered, by design: the concurrent-accept race and the end-to-end flows through the real RPCs and API clients. Both belong to Phase 2's `local-supabase-galaxy.spec.ts`. The local database had only 4 memberships, so the backfill ordering for multi-campaign users was checked by the query's logic and not against real data.

`DATABASE_SCHEMA.md` already fails `prettier --check` on `HEAD`. It is outside the `format:check` glob, so that is unchanged.

## Phase 2 — Local-stack spec (2026-11-22)

Added `implementation/frontend/e2e/local-supabase-galaxy.spec.ts` (9 tests) and listed it in the `test:local-supabase` script after the appearances spec. No application code or schema changed.

Coverage, using real multi-account clients through the API:
- **Privileges:** `has_table_privilege` and `has_function_privilege` checks, including that the private functions are not executable by `authenticated`.
- **Backfill invariant:** every membership has exactly one active row and there are no duplicate active slots. The migration's backfill statement is also replayed in a rolled-back transaction for one player with out-of-order campaigns, and gives oldest, middle, newest as slots 0, 1, 2. The replay is a copy of the statement, so it must be updated if the migration changes.
- **Create:** a new account has no rows. Creating claims slots 0, 1, 2. A blank-name create claims nothing. Deleting one campaign leaves the others in place, and a new campaign takes the freed slot.
- **Invitations:** pending, declined and cancelled claim nothing. Accepting claims the first free slot. A repeated accept raises `campaign_invitation_unavailable` with still one row. The same campaign sits on different planets for two players. No player can read another's rows.
- **Concurrency:** four invitations accepted with `Promise.all` give slots 0–3 with no duplicates.
- **Leave and remove:** leave keeps a hidden released row. Rejoin restores the old slot when free and falls back to the first free slot, with nothing displaced. Removal releases only the removed player's row, and a departed campaign can't be moved.
- **Delete:** deleting a campaign removes every member's row and leaves the rest.
- **`move_galaxy_planet`:** a free slot moves; a taken slot returns the current one; slots −1, 6 and 100 and null arguments raise `22023`; an unknown or foreign campaign raises `P0001`.
- **RLS:** direct insert, update and delete raise `42501`, as does anon read or RPC.

Not covered here: the UI half of "a new account shows six uncharted planets" (Phases 4 and 6). The race test passes but has not been run against a version without the advisory lock, so it shows correct results under concurrency and not that the lock is what provides them.

| Command (from `implementation/frontend`) | Result |
| --- | --- |
| `npx playwright test e2e/local-supabase-galaxy.spec.ts` | Pass, 9 of 9 |
| `npm run test:local-supabase` | Pass, 222 of 222 (213 existing plus 9 new) |
| `npm run lint`, `npm run format:check`, `npx tsc -b` | Pass |

One setup mistake along the way: the first draft matched invitations by `campaign_id`, which `list_my_campaign_invitations` does not return. It now matches by campaign name.

## Phase 3 — Pure model (2026-11-22)

Added the slot-keyed model beside the existing campaign-keyed one, so the app is unchanged until Phase 4 switches over. Under `implementation/frontend/src/features/campaigns/`:
- **`galaxyModel.ts` (new):** `buildGalaxy(campaigns, assignments)` returns `{slot, campaign | null}[]`, with `minPlanets = 6`. It ignores stale assignments, keeps the older campaign in place when two claim one slot, treats a negative or fractional slot as unassigned, and gives unassigned campaigns the lowest free slots, oldest first. With no assignments (loading, error or empty) this reduces to the old oldest-first order. The galaxy grows to the outermost occupied slot and shrinks when it is released (D3).
- **`orreryLayout.ts`:** added `galaxyLayout(count)` and `planetKey(slot)`. Slots 0–7 take rings 0–7. Later slots join rings by the existing crowding rule, which was extracted as `roomiestRing` so `ringCounts` and the slot layout share it. Phase comes from a slot hash, and later planets on a shared ring sit a golden angle further on, so no seat depends on how many planets share the ring. Existing `orreryLayout(ids)` is unchanged, apart from `phaseFromId` now calling a general `phaseFromKey` with the same hash.
- **`planetModel.ts`:** added `planetAppearanceForSlot(slot)`, seeded from `galaxy-planet-v1:slot-${n}`. Slots 0–5 force one of each kind (terrestrial, desert, volcanic, gas, frozen, rocky) with the first palette. Draws happen in the same order as before, so `planetAppearance(id)` keeps its pinned values.
- **Not yet done:** `orreryLayout(ids)`, `planetAppearance(id)` and `orderPlanets` stay until Phase 4 moves the components over, then they can be deleted if nothing else uses them.

Tests added: `galaxyModel.test.ts` (11), plus new cases in `orreryLayout.test.ts` and `planetModel.test.ts`. They cover 0/1/3/6/7/10 campaigns giving 6/6/6/6/7/10 planets with the right claimed counts, gaps, shrinking, stale and colliding assignments, the missing-assignment and query-error fallbacks, and no planet moving when planet N+1 is added (every size up to 40). They also cover six distinct starter kinds and inline snapshots for slots 0 and 6.

| Command (from `implementation/frontend`) | Result |
| --- | --- |
| `npm test` | Pass, 109 files and 1772 tests (was 1751) |
| `npm run lint`, `npm run format:check`, `npx tsc -b` | Pass |

No browser, local-stack or build check was run, because nothing the app loads changed yet.

## Phase 4 — Data layer and galaxy UI (2026-11-22)

The galaxy now renders by slot. Under `implementation/frontend/src/features/campaigns/` unless noted:

- **Data layer:** `galaxyPlanets.ts` (new) has `listGalaxyPlanets` and `galaxyPlanetsOptions(userId)` under the key `['campaigns','planets',userId]`, so the existing `['campaigns']` invalidations refresh it. `features/arrival/ArrivalProvider.tsx` prefetches it next to the list. `CampaignInvitationInbox.tsx` also invalidates it on accept. The plan listed that under Phase 5, but without it an accepted invitation would show a stale galaxy, so I pulled it forward. Phase 5 still needs its test.
- **Selector (`CampaignSelectorLayout.tsx`):** `buildGalaxy(campaigns, assignments)` gives the planets. Selection is `{slot, direction}`, and the ledger takes only claimed planets. If a refresh empties the selected slot, the panel switches to the uncharted state without resetting the camera. The selection only clears if the galaxy shrinks below it. The overview action waits for the campaign list, so it never offers a planet that is about to be claimed. It reads "View Uncharted World I" when there are no campaigns, and the focal world is the first claimed planet or planet I. Previous/Next step through every planet and are named "Previous world" and "Next world". The nav landmark is now "World orbit". Escape and the arrow keys work on any planet.
- **Panels:** `UnchartedAnnotation.tsx` (new) is `aria-label="Uncharted world details"`, with the heading "Uncharted World". Its create link is named "Create campaign on Uncharted World III" and points at `/app/campaigns/new?planet=<slot>`. Phase 5 reads that parameter. `WorldAnnotation` takes a slot, and its `LeaderLine` is exported and shared.
- **Scene:** `GalaxyCanvas` builds `galaxyLayout(planets.length)`, memoised on the count, so claiming a planet never moves or remounts one. `OrreryWorlds` keys by `planet-<slot>` and takes appearances from `planetAppearanceForSlot`. A claim changes only the `uClaimed` uniform on that planet's material. The label sizing now uses `data-planet-key`.
- **Labels:** claimed labels keep `data-campaign-id` and add `data-claimed`. Unclaimed labels read "Uncharted · III" in italic small caps (CSS only).
- **Orbits:** unclaimed rings are drawn dashed at lower weight, while claimed ones are solid. A shared ring counts as claimed if any planet on it is.
- **`uClaimed` in `planetShaders.ts`:** adds faint warm settlement lights on the night side of claimed non-gas planets.
- **Camp (`CampaignWorkspacePage.tsx`):** the camp's biome follows the caller's slot through the cached planets query. While it loads the camp waits for the planet. If the query fails, or has no row for the campaign, it uses the old UUID look.
- **Tests:** `galaxyPlanets.test.ts` (4) is new.

### Verification

| Command (from `implementation/frontend`) | Result |
| --- | --- |
| `npx tsc -b`, `npm run lint`, `npm run format:check` | Pass |
| `npm run build` | Pass |
| `npm test` | Pass, 110 files and 1776 tests |
| `npm run test:local-supabase` | Pass, 222 of 222 |
| Targeted mocked specs, run as-is (4 tests) | 2 passed. 2 failed for reasons the plan assigns to Phase 6, below. |
| Temporary copy of the six-materials spec, renamed to "Next world" | Passed with no WebGL shader errors, which covers the new shader code. |
| Temporary specs for zero and one campaign, with screenshots | Passed. They confirmed six unclaimed labels and the uncharted panel and link. Also confirmed the dashed rings, the claimed split, the Escape return, and the framing of a claimed and an uncharted planet once the camera settles. |

The temporary specs were deleted. Nothing new is committed, and I looked at the screenshots by eye only.

### Known gaps, all for Phase 6 unless noted

- `e2e/campaigns.spec.ts` still has the old expectations, and `mockCampaignApi` does not serve `galaxy_planets`. Without a mock the planets query fails and the galaxy falls back to oldest-first slots, so the app works. I ran only 4 specs there, not the full mocked suite, so other specs may also need updating.
- "clears selection when a refresh removes access to the campaign" asserts the old behaviour. The planet now stays selected and is shown as uncharted, as the plan intends.
- The six-materials spec looks for "Next campaign", which is now "Next world".
- `orreryLayout(ids)`, `getOrbitTarget` and `orderPlanets`' own export are no longer used by the app (only by tests and `galaxyModel`). They can be removed in the Phase 6 cleanup. `planetAppearance(id)` stays, as the camp's fallback look and for the camp tests.
- Responsive captures at 375, 768 and 1440 are Phase 6. I only looked at 1440.

## Phase 5 — Create from a planet (2026-11-22)

Under `implementation/frontend/src/features/campaigns/` unless noted:

- **`galaxyPlanets.ts`:** added `moveGalaxyPlanet(campaignId, slot)`, a wrapper for the `move_galaxy_planet` RPC, and `parsePlanetParam`, which accepts only 1–5 digit whole numbers.
- **`CreateCampaignPage.tsx`:** reads `?planet=<slot>`. After the insert succeeds it calls `moveGalaxyPlanet` as a best-effort step (a failure is swallowed), then invalidates `['campaigns']` and navigates with the created notice. The move comes before the invalidation, so the galaxy refetches the moved planet. No move happens when the param is missing or bad, or when the create fails or is cancelled.
- **`useCampaignMembership.ts`:** `leave` also marks the planets key stale, without refetching, like the list key. Removal deliberately does not touch it, because removal affects only the removed player's galaxy.
- **Accepted invitations:** the inbox invalidation was added in Phase 4. Phase 5 adds the test.

Tests:
- `CreateCampaignPage.test.tsx` (new, 10): move after a successful insert and before the refresh; no move without `?planet=` or for `''`, `-1`, `abc`, `1.5` and `999999`; no move on a failed insert, an invalid form or a cancel; a failed move still navigates with the created notice and no alert.
- `CampaignInvitationInbox.test.tsx` (new, 2): accepting marks the list and planets keys stale, and declining touches neither. I checked it fails when the planets invalidation is removed.
- `useCampaignMembership.test.tsx`: leave marks the planets key stale, and removal leaves it alone.
- `e2e/local-supabase-galaxy.spec.ts`: one UI test on the real stack. A player signs in, steps to Uncharted World IV, creates a campaign from it and lands on slot 3. A second create via `?planet=0` (taken) falls back to the first free slot (1), with the existing campaigns unmoved.

| Command (from `implementation/frontend`) | Result |
| --- | --- |
| `npx tsc -b`, `npm run lint`, `npm run format:check`, `npm run build` | Pass |
| `npm test` | Pass, 112 files and 1788 tests |
| `npm run test:local-supabase` | Pass, 223 of 223 |

The mocked specs in `e2e/campaigns.spec.ts` were not run in this phase. They are Phase 6.

## Phase 6 — Mocked browser specs and close-out (2026-11-22)

Changes under `implementation/frontend/`:

- **`e2e/support/campMocks.ts`:** `mockCampaignApi` now serves `galaxy_planets` and `move_galaxy_planet`. It behaves like the database: a campaign gets the first free planet, oldest first, when it appears; a move onto a taken planet changes nothing; deleting a campaign drops its planet. New options are `planets` (explicit slots by campaign id), `shouldFailPlanets` and `onMovePlanet`.
- **`e2e/campaigns.spec.ts`, updated to the new galaxy:**
  - Renamed "Next campaign", "Previous campaign" and the "Campaign orbit" landmark to "Next world", "Previous world" and "World orbit".
  - Six planets are always there, so label counts and the orbit nav are always present.
  - Stepping crosses uncharted planets, so specs that wrapped between two or three campaigns now step with the ledger or in the other direction.
  - "Clears selection when a refresh removes access" became "keeps the planet selected when a refresh removes its campaign, and shows it as uncharted", per the plan.
  - The six-materials spec puts six campaigns on slots 0–5.
  - The two camp-colour specs use `planetAppearanceForSlot`, since the camp now follows the slot.
- **New specs:** an account with no campaigns (six uncharted labels, the panel and its create link at 1440, 768 and 375 with captures and no horizontal overflow, and choosing a planet by pointer); claimed and uncharted planets together (label split, the ledger listing campaigns only, selecting never navigating, ←/→ across both, wrap-around and Escape); seven campaigns giving seven planets; and creating from planet III, which asks for slot 2 and lands on it.
- **Removed:** `orreryLayout(ids)` and `phaseFromId`, which nothing used. Their tests moved to `galaxyLayout`, and `orreryCamera.test.ts` now builds its layouts with `galaxyLayout`. `planetAppearance(id)` stays as the camp's fallback look, `orderPlanets` is used by `galaxyModel`, and `getOrbitTarget` is used by `stepCampaign`.

### Verification

| Command (from `implementation/frontend`) | Result |
| --- | --- |
| `npx tsc -b`, `npm run lint`, `npm run format:check`, `npm run build` | Pass |
| `npm test` | Pass, 112 files and 1783 tests (the drop from 1788 is the removed `orreryLayout(ids)` cases) |
| `npm run test:local-supabase` | Pass, 223 of 223 |
| 24 mocked specs in `e2e/campaigns.spec.ts`: the galaxy and selector specs, the camp-colour specs, and the new ones | Pass, 24 of 24 |

Not run, by choice: the full `npm run test:e2e` and the other camp-scene browser specs. Specs that open a camp through the mock now also read `galaxy_planets`, which the mock serves, but I only ran the two camp-colour specs, so other camp specs could still need a touch. Firefox, WebKit, a screen reader and a real device were not run either.

### Observed, not fixed

At 375 px with no campaigns, the "My invitations" row and the "Create campaign" link overlap in the ledger. The ledger is capped at a fixed height on phones, and the empty-state copy fills it. This code path (the empty-state message and the ledger height cap) is unchanged by this work, and the CSS diff is only the uncharted label styles. I did not run the old code to confirm it was there before. The overview captures at 375 and 768 show the six planets, dashed orbits and "Uncharted · III" labels, but with the Dice button overlapping the navigation at 375.

### Close-out

- The plan and this log moved to `docs/completed/`, and the README index and the plan's Status were updated. The paused galaxy-redesign plan has a note that two of its points were superseded.
- `DATABASE_SCHEMA.md` has had a Galaxy planets section since Phase 1.
- **Release note:** existing players' planets change look once (D1), because looks now come from the slot and not the campaign's id. Ring order is preserved by the backfill.
- Nothing is committed.
