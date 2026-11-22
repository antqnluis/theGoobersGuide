# M02 — Persistent Galaxy and Campaign Planet Assignment: Implementation Plan

## Status

**Implemented (Phases 0–6, 2026-11-22), D1–D4 as approved:** D1 planet look by slot, with the camp biome following it; D2 creating a campaign still lands in the workspace; D3 extra planets beyond six disappear when the outermost one is released; D4 creating from an uncharted planet tries that planet first. The per-phase record, with what was run and what was not, is in the [implementation log](M02-Persistent-Galaxy-Planet-Assignment-Implementation-Log.md).

The sections below are the plan as approved. Where the built version differs, the log says so (for example, the invitation-inbox invalidation moved from Phase 5 to Phase 4, and `orreryLayout(ids)` was removed rather than made slot-keyed, with `galaxyLayout(count)` added in its place).

Evidence for the plan was gathered on 2026-11-22 using read-only operations only: all 29 migrations, `config.toml`, the `features/campaigns` galaxy and camp code, `e2e/support/*`, and the docs listed below.

Related docs:
- [M02 Galaxy Redesign Plan (Orrery)](../paused/M02-Galaxy-Redesign-Plan.md): steps 1–4 are shipped. This plan supersedes two of its points: "keep `planetModel.ts` unchanged" and "no backend changes".
- [M03 Audit](../completed/M03-Campaign-Functionality-Audit.md) and [M03.1 Membership Lifecycle](../completed/M03.1-Membership-Lifecycle.md): the retention rules and the departure hook.
- [Database schema](../reference/DATABASE_SCHEMA.md).

## Context

Today the galaxy has exactly one planet per accessible campaign, so a new user sees only an empty sun. This change makes the galaxy independent of campaigns:
- Every user always has at least six permanent planets.
- A campaign *occupies* one of the user's planets. The assignment is per user, stored in the database, and stable.
- Membership stays the only thing that grants access. A planet assignment never grants access to anything.

---

## 1. Current implementation audit (Existing)

### 1.1 How planets are produced today
Paths are under `implementation/frontend/src/features/campaigns/`.

| Step | Code | Behaviour |
| --- | --- | --- |
| List | `campaignService.ts:14-34` `listAccessibleCampaigns` | Two parallel reads: `campaigns` (RLS-scoped, `created_at desc`) and the caller's `campaign_members` roles. Key `['campaigns','list',userId]` (`campaignQueries.ts`). Prefetched on sign-in (`arrival/ArrivalProvider.tsx:20`). Disabled while on `/new` (`CampaignSelectorLayout.tsx:77-80`). |
| Order | `planetModel.ts:101` `orderPlanets` | Oldest first by `created_at`, then `id`. |
| Count | `CampaignSelectorLayout.tsx:119` | **Planet count = campaign count.** Zero campaigns gives no planets (`orreryLayout([])` returns an empty layout). The only empty state is the ledger copy at `WorldLedger.tsx:131-136`. |
| Position | `orreryLayout.ts` | `orreryLayout(ids)` gives one ring per world up to `maxRings = 8`, then `ringCounts` shares outer rings. Phase comes from the campaign UUID (`phaseFromId`), with seats spread evenly by ring count. |
| Look | `planetModel.ts:68` `planetAppearance(id)` | Seeded from `campaign-planet-v1:${id}`. Picks one of six kinds (terrestrial, desert, volcanic, gas, frozen, rocky), a palette, size, tilt and ring. |
| Look reuse | `CampaignWorkspacePage.tsx:144`, `camp/campPalette.ts` | The Landfall Camp biome colours come from `planetAppearance(campaign.id)`. |
| Render | `GalaxyCanvas.tsx`, `OrreryWorlds.tsx`, `OrbitRings.tsx`, `HearthStar.tsx`, `DeepSpace.tsx`, `planetShaders.ts` | One lazy R3F canvas with an on-demand frameloop. Labels are HTML (`.galaxy-planet-label`). Moons show on the selected planet only. |
| Camera | `useOrreryCamera.ts`, `orreryCamera.ts` | Chart pose and focus pose, swinging around the hearth. Reduced motion cuts straight to the destination. A hidden tab settles at once. |
| Selection | `CampaignSelectorLayout.tsx:67,142-191` | In-memory `{id, direction}`. Set by clicking a planet, the ledger, "View …", Previous/Next, or ←/→. Esc returns to the overview. Selecting never enters a campaign. |
| Panel | `WorldAnnotation.tsx` (`aria-label="Campaign details"`) | Shows name, role, chart numeral, member count (with retry), description, **Enter campaign** and **Return to galaxy overview**. |
| Selector | `WorldLedger.tsx` | "Your campaigns" list, invitation inbox, **Create campaign** link, pause toggle. |
| Create | `CreateCampaignPage.tsx` at `/app/campaigns/new`, an overlay on the same canvas | `from('campaigns').insert().select('id')`, then invalidate `['campaigns']`, then navigate to the workspace with `campaignCreated`. |

### 1.2 Backend facts this design relies on
- **Membership writes.** There are exactly two insert paths:
  - the `campaigns_add_owner_membership` AFTER INSERT trigger, in the same transaction as the campaign insert;
  - `respond_to_campaign_invitation`, which locks the campaign `FOR NO KEY UPDATE`, inserts the member row, and uses `on conflict do nothing`.
- **Membership deletes are hard deletes.** They happen through `leave_campaign` and `remove_campaign_member`, each of which then calls `private.handle_campaign_member_departure`. They also happen by cascade when a campaign is deleted (a direct table `DELETE` under RLS) or when a profile is deleted. **No trigger fires on membership deletes, so cascades skip the hook.**
- **Invitation statuses** are `pending`, `accepted`, `declined` and `cancelled`. There is **no expiry**. Only `accepted` creates membership.
- **No galaxy or planet columns exist anywhere.** The closest precedent is `campaign_appearances`: per-player cosmetic data keyed `(campaign_id, profile_id)`. It references `campaigns` and `profiles` directly, never `campaign_members`, so it survives leaving and rejoining.
- **Conventions to follow:**
  - Functions are `SECURITY DEFINER` with `search_path = ''`, then `revoke all … from public, anon, authenticated, service_role` and an explicit grant.
  - Lock the campaign row first. Advisory locks are already used for per-scope caps.
  - Error codes: `22023` for bad arguments, `P0001` for state errors, `42501` for authorization.
  - Default privileges are hardened, so new objects have no grants until a migration adds them.

### 1.3 What must change
The planet count, position and look must stop depending on the campaign list. A persisted per-user slot assignment must take over. Ledger, Enter, create, invitations and the membership RPCs are reused unchanged, except for small invalidation additions.

---

## 2. Proposed architecture

**A planet is a slot** (`0, 1, 2, …`) in the user's galaxy, and its position and look are pure functions of the slot. **An assignment** links one of the user's campaigns to one slot. Membership stays authoritative, and the galaxy is derived from the campaign list plus the assignments.

| Layer | Responsibility |
| --- | --- |
| `public.galaxy_planets` (new) | Per-user campaign → slot rows. The source of truth across sessions and devices. |
| Triggers on `campaign_members` (new) | Claim a planet when a membership row appears and release it when the row goes. Assignment follows confirmed membership, whatever the write path. |
| `public.move_galaxy_planet` (new RPC) | Moves the caller's campaign onto a chosen free planet ("create from this world"). |
| `galaxyPlanets.ts` (new) | Query options (`['campaigns','planets',userId]`) and RPC wrapper. |
| `galaxyModel.ts` (new, pure) | `buildGalaxy(campaigns, assignments)` → `GalaxyPlanet[] = {slot, campaign \| null}`. |
| `orreryLayout.ts`, `planetModel.ts` (modified) | Keyed by slot, with stable placement as the galaxy grows. |
| Galaxy DOM and scene (modified) | Selection by slot, an uncharted panel state, claimed and unclaimed presentation. |

---

## 3. Assignment and persistence design (New; database implications)

### 3.1 Why a new table
No existing structure can hold a per-user position for a shared campaign:
- `campaigns` is shared by every member.
- `campaign_members` rows are hard-deleted on departure, so the "rejoin restores my planet" memory would be lost, and adding columns there would mix cosmetic data into the authorization table.
- `campaign_appearances` is a different concern (the camp look).

One small table is the minimal solution. It mirrors the `campaign_appearances` retention pattern.

### 3.2 `public.galaxy_planets`

| Column | Type and rule |
| --- | --- |
| `profile_id` | `uuid not null` → `profiles(id) on delete cascade` |
| `campaign_id` | `uuid not null` → `campaigns(id) on delete cascade` (never `campaign_members`, per the retention rules) |
| `slot` | `smallint not null`, `check (slot >= 0)` |
| `released_at` | `timestamptz`, null while the campaign occupies the planet. Set on departure and kept as the rejoin preference. |
| `created_at`, `updated_at` | `updated_at` is maintained by `private.set_updated_at()` |

Constraints:
- **PK `(profile_id, campaign_id)`**: a campaign has at most one planet per user, whether active or remembered.
- **Partial unique index `(profile_id, slot) where released_at is null`**: one campaign per planet. Released rows never reserve a slot.
- An index on `campaign_id` for the FK cascade.

RLS and grants:
- RLS is enabled, and all access is revoked from `public, anon, authenticated, service_role`. `authenticated` gets `select` only.
- One policy: `profile_id = (select auth.uid()) and released_at is null and campaign_id in (select private.current_campaign_ids())`.
- No insert, update or delete grants. Rows are written only by the definer functions below, so a user cannot read or change anyone else's galaxy, or even their own except through `move_galaxy_planet`.

### 3.3 Functions and triggers

**`private.assign_galaxy_planet(p_profile_id, p_campaign_id, p_preferred smallint default null) returns smallint`** (DEFINER, executable by `postgres` only):
1. Take `pg_advisory_xact_lock(hashtextextended('galaxy_planets:' || p_profile_id, 0))`, which serializes every galaxy write for one user.
2. If an active row already exists, return its slot. This makes the function idempotent.
3. Otherwise pick the first candidate that is free (no active row with that slot), in this order:
   - `p_preferred`;
   - the slot on this campaign's released row;
   - the lowest non-negative integer not used by an active row.
4. Upsert the row with `released_at = null`.

**Trigger `campaign_members_assign_galaxy_planet`** (AFTER INSERT, for each row) calls `assign_galaxy_planet(new.profile_id, new.campaign_id)`. It covers creation (through the owner trigger), invitation acceptance, and any future authorized membership path. It runs inside the same transaction, so a failed or rolled-back create or accept claims nothing.

**Trigger `campaign_members_release_galaxy_planet`** (AFTER DELETE, for each row):
- If the campaign or profile row no longer exists (a cascade from deleting a campaign or account), return without doing anything. Those rows go with the FK cascade, and this avoids taking advisory locks for every member.
- Otherwise take the user's advisory lock and set `released_at = now()`.

This covers leave, remove and administrative deletes. The M03 departure hook stays unchanged, and `DATABASE_SCHEMA.md` documents the trigger next to it.

**`public.move_galaxy_planet(p_campaign_id uuid, p_slot integer) returns integer`** (DEFINER, granted to `authenticated`):
1. Validate the arguments: null raises `galaxy_planet_required` (`22023`).
2. Take the caller's advisory lock.
3. Require an active row for the caller and campaign. An active row implies current membership, because release takes the same lock. Otherwise raise `galaxy_planet_campaign_unavailable` (`P0001`). Unknown, inaccessible and departed campaigns all get the same error.
4. Require `0 <= p_slot <= greatest(5, highest active slot)`, so only planets the user can see. Otherwise raise `galaxy_planet_invalid` (`22023`).
5. If the slot is free, move the row there. Return the final slot, which is unchanged if the slot was taken. This is the fallback.

### 3.4 Concurrency and lock order
- Every write for one user holds that user's advisory lock, so two simultaneous acceptances get different slots. The partial unique index is the backstop.
- Lock order is always campaign row first, then the user's advisory lock (accept, leave and remove already hold the campaign lock when the trigger fires). `move_galaxy_planet` takes only the advisory lock and never waits on a campaign lock, so no lock cycle can form.
- Repeated acceptance is a no-op twice over. The RPC refuses a non-pending invitation, and `on conflict do nothing` means the insert trigger never fires again.

### 3.5 Backfill for existing users (same migration)
```sql
insert into public.galaxy_planets (profile_id, campaign_id, slot)
select m.profile_id, m.campaign_id,
       row_number() over (partition by m.profile_id order by c.created_at, c.id) - 1
from public.campaign_members m join public.campaigns c on c.id = m.campaign_id
on conflict do nothing;
```
- It uses the same order as today's `orderPlanets`, so existing users keep their ring order.
- It only reads `campaigns` and `campaign_members`. No campaign, membership, ownership or character row is touched.
- Apply it with `npm run db:migrate`, never `db:reset`. The local-stack tests check that every current membership has exactly one active row.

### 3.6 Reads
- `from('galaxy_planets').select('campaign_id,slot')` under key `['campaigns','planets',userId]`.
- The existing invalidation of `['campaigns']` (create, delete, transfer) already refreshes it.
- It is prefetched on sign-in next to the list, and disabled on `/new` like the list.
- Galaxy size is `max(6, highest occupied slot + 1)` (D3).

---

## 4. Invitation integration
- Assignment is driven by the membership insert trigger, not by the frontend.
- **Pending, declined and cancelled** invitations never insert membership, so they never claim a planet. **Expired** invitations don't exist in this schema; if expiry is ever added, it will create no membership and therefore claim nothing.
- An acceptance that fails rolls back the whole transaction, including the claim.
- A membership added on another device or by a backend workflow is picked up the same way, and appears on the next fetch.
- Frontend: `CampaignInvitationInbox.tsx` currently invalidates only the list key on accept. Add the planets key next to it. No other change to the invitation UI.

## 5. Campaign lifecycle integration

| Event | Effect on `galaxy_planets` | Frontend |
| --- | --- | --- |
| Create (ledger) | Owner membership → trigger → lowest free slot | Unchanged |
| Create from an uncharted planet | Same, then `move_galaxy_planet(id, slot)` as a best-effort call after the insert succeeds. A failure is ignored, because the campaign exists and simply stays on its first-free planet. | `CreateCampaignPage` reads `?planet=<slot>` |
| Create fails or is cancelled | No insert, so no trigger and no claim | Unchanged |
| Accept invitation | Member row → trigger → restored or first free slot | Add the planets key to the inbox invalidation |
| Leave or removal | Row released (`released_at`); other rows untouched | `useCampaignMembership.leave` also invalidates the planets key. Removal affects only the removed user's galaxy. |
| Delete campaign | Every member's row cascades away | `['campaigns']` invalidation already covers it |
| Transfer ownership | None (role update only) | — |
| Rejoin | The released row is reactivated in its old slot if that slot is free, otherwise the first free slot. Nothing is ever displaced. | — |
| Delete account | Rows cascade with the profile | — |

Historical preference is the released row. It never blocks another campaign, is never visible through RLS, and grants nothing. It is cleaned up with the campaign or the account.

---

## 6. Visual and navigation design (Modified and New)

### 6.1 Planets by slot (D1)
- `planetAppearance` becomes `planetAppearanceForSlot(slot)`, seeded from `galaxy-planet-v1:slot-${n}`.
- Slots 0–5 are authored: one of each kind (terrestrial, desert, volcanic, gas, frozen, rocky), with fixed palettes, so the six starter worlds are always distinct. Slots 6 and above are seeded, kind included, using the same shaders.
- Existing users' worlds change look once. Afterwards a campaign takes its planet's look, and claiming or leaving never changes how a planet looks.
- **The camp follows.** `CampaignWorkspacePage` reads the caller's slot from the planets query, which is usually already cached, and passes `planetAppearanceForSlot(slot)` to the camp. While loading the planet is null, which the camp already handles. If the query fails, it falls back to the UUID look. Members of a shared campaign may see different camp biomes, which is intended.

### 6.2 Stable layout
- `orreryLayout` takes slots.
- Slots 0–7 get rings 0–7.
- From slot 8 on, the ring sequence comes from the existing incremental `ringCounts` rule. That rule depends only on how many planets came before, so it is stable.
- Phase comes from the slot hash. Later planets on a shared ring are offset by the golden angle from the ring's first planet, rather than re-spaced by count.
- Adding a planet therefore never moves an existing one. The galaxy only grows or shrinks at its outer edge (D3).
- React elements and material maps are keyed by slot, so claiming a planet doesn't remount it.

### 6.3 Claimed and unclaimed presentation
- **Claimed:** the current label (numeral and name), the brighter focused orbit, and moons for members when focused. A new `uClaimed` shader uniform adds faint warm settlement lights on the night side.
- **Unclaimed ("Uncharted"):** the same planet, lit the same way. Its orbit hairline is dashed with lower alpha, and its label reads "Uncharted · III" in italic small caps. No moons and no member-count query.
- The galaxy still feels complete with zero campaigns: six lit worlds on six rings.

### 6.4 Selection and panels
- Selection becomes `{slot, direction}`. The ledger maps a campaign to its slot. If a refresh empties the selected slot, the panel switches to the uncharted state, so the camera doesn't reset.
- **Claimed panel:** `WorldAnnotation` as today (name, description, role, member count, **Enter campaign**). Selecting never enters a campaign.
- **Uncharted panel:** `aria-label="Uncharted world details"` with:
  - the heading "Uncharted World";
  - the text "An unexplored world awaiting its first adventure.";
  - the primary link "Create campaign", with accessible name "Create campaign on Uncharted World III" so it doesn't collide with the ledger link, pointing to `/app/campaigns/new?planet=<slot>`;
  - **Return to galaxy overview**.
- **Ledger:** real campaigns only, ordered by slot, and each numeral is its planet's numeral (slot + 1). List order and orbit order still agree (the critique's P2).
- **Navigation:** ←/→ and Previous/Next step through every planet, uncharted ones included. Their accessible names become "Previous world" and "Next world", and the specs are updated to match.
- **Overview:** the focal world is the first claimed planet, or planet I when there are none ("View Uncharted World I").
- The camera, reduced motion, pause, hidden-tab handling and WebGL fallback are unchanged.

### 6.5 Resilience
`buildGalaxy`:
- Ignores assignments whose campaign isn't in the list (stale).
- Places listed campaigns that lack an assignment, which can only happen in a race, in the next free slots, for display only.
- If the planets query errors, falls back to oldest-first slots.

The ledger never depends on assignments, so no campaign becomes unreachable.

---

## 7. Implementation phases

| Phase | Work | Depends on | Independently testable by |
| --- | --- | --- | --- |
| 0 | Baseline: run lint, format:check, build, unit and `test:local-supabase`, and record the results. No changes. | — | Recorded results |
| 1 | Migration `<ts>_add_galaxy_planets.sql`: table, indexes, RLS, the two triggers, `assign_galaxy_planet`, `move_galaxy_planet`, backfill. Then `npm run db:migrate`, `npm run db:types`, prettier, and a Galaxy planets section in `DATABASE_SCHEMA.md`. | 0 | SQL checks |
| 2 | `e2e/local-supabase-galaxy.spec.ts`, added to the `test:local-supabase` script list | 1 | Local stack |
| 3 | Pure model: `galaxyModel.ts`, slot-keyed `orreryLayout` and `planetModel`, unit tests | — (can run alongside 1–2) | Vitest |
| 4 | Data layer and galaxy UI: `galaxyPlanets.ts`, prefetch, selection by slot, uncharted panel, labels and orbits, `uClaimed`, ledger numerals, camp follows the slot | 1 (types), 3 | Vitest and targeted e2e |
| 5 | Create from a planet (`?planet=`, `move_galaxy_planet`), plus the inbox and leave invalidations | 4 | Vitest and local stack |
| 6 | Mocked e2e updates: `mockCampaignApi` serves `galaxy_planets` and `move_galaxy_planet`; the six-materials test now uses slots. Responsive captures, implementation log, docs close-out. | 4–5 | Targeted e2e |

The safest order is 0 → 1 → 2 → 3 → 4 → 5 → 6. The backend lands and is proven before any UI depends on it, and each phase leaves the app working.

---

## 8. Testing strategy and acceptance criteria

### 8.1 Local stack (`local-supabase-galaxy.spec.ts`, real multi-account clients via `newPlayers`, `invite`, `rpcOk`/`rpcError`, `localDatabaseQuery`)
- A new account has no rows, and the UI shows six uncharted planets.
- Create claims slot 0, then 1, then 2. Existing slots don't change.
- A failed create (blank name) claims nothing.
- Pending, declined and cancelled invitations claim nothing. Accepting claims the first free slot. A repeated accept raises `campaign_invitation_unavailable` with still one row.
- Two concurrent accepts (`Promise.all`) get distinct slots, and the invariant query finds no duplicates.
- Leave releases. Remove releases only the removed user's row, and the owner's galaxy is unchanged.
- Rejoin restores the old slot when free, and falls back to first free when taken, without displacing anything.
- Deleting a campaign removes every member's row. Others' rows are untouched.
- The same campaign sits in different slots for two users.
- `move_galaxy_planet`:
  - free slot → moves;
  - taken slot → returns the current slot;
  - out-of-range slot → `22023`;
  - someone else's campaign or a departed campaign → `galaxy_planet_campaign_unavailable`.
- RLS: no reads of other users' rows or released rows. Direct insert, update and delete are denied. Anon gets `42501`. `has_table_privilege` and `has_function_privilege` checks pass.
- Backfill invariant: every current membership has exactly one active row, ordered by `created_at, id`.
- Existing M03 local suites still pass: membership, characters, appearances and the rest.

### 8.2 Vitest
- `galaxyModel.test.ts`: 0, 1, 3, 6, 7 and 10 campaigns give 6/6/6/6/7/10 planets with the right claimed counts. Also: gaps, stale assignments, missing-assignment fallback, query-error fallback.
- `orreryLayout.test.ts`: slot parameters are deterministic, and adding planet N+1 never changes planets 0..N (up to 40).
- `planetModel.test.ts`: slots 0–5 are six distinct kinds, with a snapshot to prove determinism.
- `CreateCampaignPage.test.tsx` (new):
  - `?planet=` calls the move RPC after a successful insert;
  - no call on failure or cancel;
  - a move failure still navigates with the notice.
- Updated `useCampaignMembership` and inbox tests assert the planets key is invalidated.

### 8.3 Mocked browser (`e2e/campaigns.spec.ts`)
- Zero campaigns render six labels (`data-claimed="false"`), and selecting one shows the uncharted panel, whose create link opens `/new?planet=n`.
- One or three campaigns give the claimed and unclaimed split.
- Seven campaigns give seven planets.
- Selecting a claimed planet never navigates.
- ←/→ crosses claimed and uncharted planets, and Esc returns to the overview.
- The ledger lists only campaigns.
- The reduced-motion and no-WebGL fallbacks still work.
- Responsive captures at 375, 768 and 1440.
- Following your earlier preference, I'll run only the new and changed galaxy specs, not the full graphical suites, and take GPU captures through e2e rather than pane screenshots.

### 8.4 Acceptance criteria
- All expected states in the brief's table hold.
- Assignments persist across refreshes and devices.
- No campaign ever moves unless the user moves it.
- Invitations claim a planet only once accepted.
- The lifecycle rules in §5 hold.
- No campaign, membership, ownership or character data changes.
- RLS prevents cross-user access.
- Lint, format, build, unit and local-stack suites pass, and the targeted galaxy specs pass.

---

## 9. Architectural risks and mitigations

| Area | Risk | Mitigation |
| --- | --- | --- |
| Supabase / migrations | The backfill misses or duplicates rows | It runs in the migration transaction with `on conflict do nothing`, plus the invariant test. It uses `db:migrate`, never a reset. |
| Concurrency | Two claims race for one slot | Per-user advisory lock and the partial unique index. Covered by the concurrent-accept test. |
| Lock order | A deadlock between a membership RPC and a move | Campaign lock first, then the advisory lock. The move RPC takes no campaign lock. |
| Invitation acceptance | Claiming on a frontend event diverges from the backend | The claim is tied to the membership insert trigger in the same transaction. |
| Membership sync | Cascades skip the departure hook | The release is a trigger on `campaign_members`, with a cascade short-circuit. |
| Existing data | Planet looks change for existing users (D1, accepted) | One-time change, called out in the release note. Ring order is preserved. |
| RLS | Leaking a former campaign's id | The select policy hides released rows and non-member campaigns. |
| Cross-device | Stale galaxy until the next fetch (`refetchOnWindowFocus` is off app-wide) | The same behaviour as the campaign list today. Every membership mutation invalidates both queries. |
| Rendering | Remounts or material churn when claiming; six planets for every user | Keyed by slot, appearance memoized per slot. Six planets is under today's 32-campaign stress case. |
| Tests | Mock fixtures choose planet kinds by UUID | Rewritten to slots in Phase 6. |
| Two queries | The list and assignments briefly disagree | `buildGalaxy` fallbacks, and a shared `['campaigns']` invalidation. |

Unresolved, and deliberately out of scope:
- Invitation expiry (none exists).
- Letting users rearrange planets by drag.
- Per-user variation of the six starter looks.
- Soft-deleted Auth users (they keep their rows, as they keep their memberships).

## Verification (to run during implementation)
- Frontend: `npm run lint`, `npm run format:check`, `npm run build`, `npm test`, `npm run test:local-supabase`.
- Backend: `npm run supabase:start` and `npm run db:migrate`.
- Targeted Playwright runs of the new and changed galaxy specs.
- Results are recorded per phase in `M02-Persistent-Galaxy-Planet-Assignment-Implementation-Log.md`.
