# Galaxy Campaign Selection Redesign: "The Wayfinder's Orrery"

## Status

**Paused (2026-11-14).** Implementation steps 1–4 shipped (shared logic, orrery model, scene, and ledger/annotation DOM layer). Steps 5–8 (create/edit/delete and the formation sequence in the galaxy, responsive sheets, motion polish, and docs) are not built.

## Context

The campaign selector at `/app/campaigns` is built as a carousel. A fixed camera shows three planets on a shallow arc. A glass list sits at the left, a glass details card at the right, and Previous/Next buttons at the bottom. It works and is well tested, but the galaxy is mostly a backdrop behind three floating panels. Only three worlds are ever visible, so there's no sense of your campaigns sharing one place. The same choice can be made in three separate spots. The latest Impeccable critique scored the selector 23/40 and recorded two P1 issues:

- Load and error states are hidden inside the collapsed phone list.
- Compact panels cut off the information you need to choose a campaign.

It also recorded two P2 issues:

- The list and the orbit use different orders.
- Create is visually louder than selecting a world.

You asked for a full redesign that keeps every working behavior. Phase 1 (investigation) is below, then the Phase 2 creative direction. Implementation waits for your approval.

---

## Phase 1: Findings

### Routes (`src/App.tsx`)

- `/app` (ProtectedRoute → `AuthAppShell`) → `campaigns` (`CampaignSelectorLayout`), with the child route `new` (`CreateCampaignPage`).
- `campaigns/:campaignId` (`CampaignWorkspacePage`) is a sibling route outside the galaxy.
- `AuthAppShell` uses `useMatch` to switch to the `galaxy-shell` styling on the selector and create routes. On those routes it hides the nav and footer and keeps the brand, the account name, Sign out, and the skip link.

### Data (`features/campaigns/campaignService.ts`)

The UI calls these through TanStack Query directly; there are no custom hooks yet.

- `listAccessibleCampaigns(userId)`: campaigns plus the user's role. Query key `['campaigns','list',userId]`.
- `createCampaign(input)`: returns `{id}`.
- `getCampaign`, `getCampaignRoster` (RPC `get_campaign_roster`), `getCampaignMemberCount`.
- `updateCampaign(id, input)` and `deleteCampaign(id)`: both throw if RLS returns no row.

### What currently works and must keep working

- **List and selection.** The list shows loading, error with retry, empty, and populated states. Selection is in memory only. If a refresh removes the selected campaign, the selection clears. The details show the name, description, role, and a member count (with its own retry). **Enter campaign** links to `/app/campaigns/:id` and passes `campaignTransition` state, which drives the React `ViewTransition` title morph. **Return to galaxy overview** clears the selection. A "Campaign deleted." notice arrives via route state.
- **Creation.** `/app/campaigns/new` shows `CampaignForm`:
  - Name is required; whitespace-only names are rejected and focus returns to the field.
  - Description is optional.
  - Pending state, duplicate-submit guard, and a safe error message.
  - Success invalidates `['campaigns']` and navigates to the workspace with `campaignCreated` set, which shows the "Campaign created." notice.
- **Editing and deletion.** Owner-only, and only in the workspace today. Edit reuses `CampaignForm`. Delete needs an explicit confirmation ("Yes, delete campaign" / "Keep campaign"), then returns to the selector with the deleted notice.
- **Workspace.** Roster, owner username, role, and states for not found, error, and loading.
- **Scene.** One lazily loaded R3F Canvas, kept alive across selection and the create route.
  - The `GalaxyRenderBoundary` error boundary and a static fallback cover context loss and missing WebGL.
  - Device pixel ratio is capped and the frameloop is on-demand. Rendering stops while the tab is hidden.
  - Reduced motion is respected, and there's a **Pause ambient motion** toggle.
- **Planet identity.** `planetModel.planetAppearance(uuid)` derives a versioned, deterministic look from the UUID: six world types, palettes, rings, tilt. `orderPlanets` sorts oldest first.
- **Backend.** Membership and authorization are enforced entirely by RLS: owner and member read access, owner-only update and delete, and `get_campaign_roster`. **No backend changes are needed for this redesign.**

### Reusable assets

- The planet surface and ring shaders (`planetShaders.ts`) and the `DeepSpace` starfield, nebula, and streak shader.
- The visibility and frameloop handling and the error boundary in `GalaxyBackdrop` and `GalaxyCanvas`.
- Pose math in `campaignTravel.ts` (`interpolatePose`, `travelProgress`, `mix`, `clamp`, `projectedSphereExtent`) and the retarget-from-current-pose approach in `useGalaxyTravel.ts`.
- The DOM label projection in `CampaignPlanets`.
- `CampaignForm` and `campaignValidation`.

### Constraints

- Stack: React 19.3, R3F 9.8, three 0.187, Tailwind 4, React Router 8. No new dependencies are needed.
- Vite already warns that a chunk is over 500 kB. Three.js loads only from the lazily loaded galaxy chunk.
- About 25 Chromium e2e tests in `e2e/campaigns.spec.ts` find elements by accessible name. `e2e/local-supabase.spec.ts` expects create to end on the workspace URL and edit and delete to happen in the workspace.
- `docs/archive/M02-Galaxy-Campaign-Selector.md` Phase 5 already planned: create in a modal over the galaxy, a planet "formation" sequence, an inert background, and focus restoration. This design delivers that plan.

---

## Phase 2: Creative direction

### 1. Concept: The Wayfinder's Orrery

An orrery is a brass clockwork model of a star system, the kind of instrument you'd find in a wizard's tower or a navigator's cabin. The selector becomes a living orrery hanging in deep space. **A warm hearth star sits at the center, and each campaign is a world on its own orbit around it.** Over that 3D scene sits a light layer of **cartographer's engraving**: hairline orbit rings with tick marks, serif inscriptions, catalogue numbers, and leader lines that point from a note to its world. That layer is what ties the space setting to D&D. The effect is somewhere between an astronomer's star atlas and an illuminated chart. It isn't sci-fi HUD and it isn't SaaS.

The narrative mapping is simple: **your oldest campaign orbits closest to the hearth, and newer ones sit farther out.** Your history reads from the center outward. List order and orbit order are the same thing, which resolves the critique's ordering issue.

Why this is stronger than the carousel:

- Every world is visible at once in one coherent space. The carousel showed three at a time.
- Moving between campaigns is real travel: the camera flies to a world and swings around the star to reach the next.
- The UI stops being floating cards and becomes annotation drawn on the sky.
- Each control has one obvious home.

### 2. The environment

- **Backdrop.** Keep the existing `DeepSpace` starfield and nebula layers for depth and parallax.
- **Hearth star.** An emissive core with a soft, slowly breathing corona sprite in warm starlight (about `#ffd9a0`). It is the scene's only key light.
- **Planet lighting.** Change the planet shaders so light comes from the star's position instead of a fixed `sunlight` constant. Each world then has a true day side and night side facing the hearth, and terminators turn as worlds orbit. This is the biggest single gain in how believable the planets look.
- **Worlds.** Keep the existing seeded appearance model, so each UUID keeps the same look it has today. Add a faint atmospheric rim glow on the lit side.
- **Orbits.** Hairline rings in parchment ink at low alpha, with engraved tick marks, all drawn as one `LineSegments` geometry. The focused world's ring brightens to starlight brass.
- **Moons.** The focused world gets small instanced moons, one per campaign member (shown up to 6, then "+n" in the text). The member count from the existing query becomes something you can see. The number is always written out in text as well.
- **Camera.** The overview is a 3/4 view looking down about 35° at the orrery. On portrait phones it tilts to a steeper, almost top-down angle so the system fits the width.
- **Scaling.** Ring radii grow sub-linearly. Past 8 rings, additional worlds share outer rings at evenly offset angles. The existing 32-campaign test fixture stays legible.

### 3. Navigation

- **The Chart (overview).** Every world is shown with an engraved label: catalogue numeral plus name. Pointer hover or keyboard focus brightens the world's orbit and label. Clicking or tapping a world travels to it.
- **Approach (focused).** The camera flies in and frames the world off-center using the camera's view offset, which keeps space clear for the annotation. Ways to travel to another world:
  - **Previous campaign** and **Next campaign**, which step from the focused world (outward or inward along the orbit order).
  - The **←** and **→** keys.
  - A horizontal swipe on the scene on touch screens.
  - The Ledger (the campaign list).
- **Return.** **Return to galaxy overview** (or **Esc**) pulls the camera back to the Chart.
- **Landfall.** **Enter campaign** goes to the workspace immediately. A circular atmospheric bloom expands from the planet as a CSS view transition, and the existing title morph still plays. Navigation itself isn't delayed.
- **The Ledger.** "Your campaigns" is a typeset index in the style of a book's contents or a star catalogue. Each row has a numeral (I, II, III…), the name, and an owner mark, in the same oldest-first order as the orbits.
  - It is the main keyboard and screen-reader entry point, and it works without WebGL.
  - A "Find a world" filter appears only when there are more than 8 campaigns. It filters the loaded list on the client and makes no new queries.
- **Overview prompt.** With nothing selected, a quiet inscription near the star reads "Choose a world to approach". The innermost world also has a visible, keyboard-operable **View {name}** action. This makes selecting a world the clearest first move, which fixes the critique's P2.

### 4. Campaign information: the chart annotation

When a world is focused, an annotation is drawn onto the sky beside it. It is a dark ink plate with a single engraved hairline border, and a leader line traces from the plate to the planet's limb, the edge of its visible disc. It is not a glass card. Contents, top to bottom:

- The catalogue numeral and role inscription in small caps ("I · OWNER").
- The campaign name in large Source Serif 4.
- The member count in words ("3 members"), matching the moons, with its existing retry.
- The description, scrollable within the plate.
- Actions: **Enter campaign** (primary, warm starlight), **Return to galaxy overview**, and, for owners only, a quiet **Owner tools** row with **Edit details** and **Delete campaign**.

The plate keeps the accessible name "Campaign details", and the heading receives focus when the plate opens.

### 5. Campaign management

- **Create: "Chart a new world".**
  - `/app/campaigns/new` opens a native `<dialog>` drafting plate over the live orrery. A direct visit to that URL works too.
  - The background becomes inert automatically and focus returns to **Create campaign** when the dialog closes.
  - While it's open, a dashed orbit and a swirling dust protoplanet appear at the next free ring, previewing where the world will go. Its final look can't be previewed because it comes from the UUID, which only exists after the insert.
  - On a successful save: show the "Campaign created." status right away, refresh the list, then play a ~1.2 s formation sequence where the dust condenses into the seeded planet and the camera settles on it. Then land in the workspace exactly as today (same URL, same `campaignCreated` notice).
  - If the list refresh fails, or under reduced motion, or without WebGL, skip formation and navigate immediately.
  - Validation, pending state, the duplicate-submit guard, and the error copy all come unchanged from `CampaignForm` and `CreateCampaignPage`.
- **Edit (owner).** **Edit details** in the annotation opens the same drafting dialog pre-filled. Saving updates the label in place and announces "Campaign details saved." The world keeps its look, because appearance is UUID-based.
- **Delete (owner).** A confirmation step inside the dialog: "Delete {name}? Its campaign details and member list will be removed." with **Yes, delete campaign** / **Keep campaign**. On success the world dims and drifts off its orbit (instant under reduced motion), the camera returns to the overview, and "Campaign deleted." is announced.
- **Workspace.** The workspace keeps its own edit and delete controls unchanged. Both surfaces will use a new shared `useCampaignManagement` hook so the logic lives in one place.
- **Members.** Members never see the owner tools. RLS still enforces this regardless of what the UI hides.

### 6. Motion

All motion is driven by a single camera rig that always starts from the last rendered pose, so rapid re-selection is smooth.

| Moment | Motion | Duration |
|---|---|---|
| Ambient | Worlds orbit slowly (periods measured in minutes), the corona breathes, the starfield drifts; pausable | continuous |
| Chart → world | Curved dolly with a slight field-of-view narrowing; the leader line draws in after arrival | 900 ms + 250 ms |
| World → world | Camera swings around the hearth in the direction of travel; the existing star-streak shader adds brief streaks at peak speed | ~800 ms |
| World → Chart | Pull back and rise | 600 ms |
| Landfall | Atmospheric circular bloom plus the existing title morph | ~350 ms |
| Formation | Dust spirals inward and the world resolves | ~1.2 s |

- **Reduced motion.** Camera cuts with a 150 ms crossfade, no orbiting and no streaks. Formation and bloom are replaced by a simple fade.
- **Hidden tab.** Rendering stops; when the tab returns, the scene jumps straight to the current destination.

### 7. Responsive behavior

Each size gets its own composition; the desktop layout isn't just scaled down.

- **Desktop (≥1100 px).** The orrery is centered left. The annotation is anchored to the right of the focused world with its leader line. The Ledger is a slim, collapsible rail on the left edge. The header stays minimal: brand, account name, and sign out.
- **Tablet (700–1099 px).** The orrery fills the screen. The annotation docks as a bottom plate at about 40% height, and the leader line rises to the planet. The Ledger becomes a slide-over drawer.
- **Phone (<700 px).** The orrery uses the steep top-down camera.
  - The annotation becomes a **bottom sheet with two detents**. Peek shows the name, role, **Enter campaign**, and Prev/Next as large touch targets. Expanded adds the description, members, and owner tools.
  - The Ledger opens as a full-height sheet from an "All campaigns (n)" button.
  - Loading, error with **Try again**, and empty states always appear in the visible chrome, never inside a collapsed list. This fixes the critique's P1.
- **Short landscape phones (e.g. 844×390).** The sheet becomes a side panel so the planet keeps the vertical space.

### 8. Accessibility

- The Canvas stays `aria-hidden`. The Ledger, the annotation, and the controls are the semantic interface, and every action works without WebGL.
- Keyboard:
  - Tab order: Ledger, then the scene controls, then the annotation.
  - **←** / **→** step between worlds and **Esc** returns to the overview.
  - Visible focus rings that meet contrast on dark backgrounds.
- A polite live region announces the selected campaign and status changes.
- Text on dark surfaces keeps a contrast ratio of at least 4.5:1.
- The native `<dialog>` handles focus trapping and inert.
- Reduced motion and the Pause control are kept.

### 9. Technical approach

- **No new dependencies.** Keep one lazily loaded R3F Canvas.
- **Replace** the carousel model (`campaignOrbit.ts`) and the screen-slot carousel renderer (`CampaignPlanets.tsx`) with world-space modules:
  - `orreryLayout.ts`: a pure, unit-tested function for ring index, radius, phase from UUID, and shared-ring rules.
  - `HearthStar.tsx`
  - `OrbitRings.tsx`
  - `OrreryWorlds.tsx`: planets, instanced moons, label projection.
  - `useOrreryCamera.ts`: the pose rig, adapted from `useGalaxyTravel` and the `campaignTravel` math.
  - `Protoplanet.tsx`: the formation effect.
- **Modify** `planetShaders.ts` to take a `uSunPosition` uniform for star-relative lighting and an atmospheric rim term.
- **Keep** `planetModel.ts` unchanged (the versioned seed), `DeepSpace.tsx`, and the `GalaxyBackdrop` boundary and fallback.
- **DOM layer.** Split `CampaignSelectorLayout.tsx` into:
  - `CampaignSelectorLayout`: owns state and the queries.
  - `WorldLedger`
  - `WorldAnnotation`
  - `ChartDialog`: create and edit.
  - `useCampaignManagement`: shared update and delete mutations, also used by `CampaignWorkspacePage`.
- **Styling.** Replace `galaxy.css` with `orrery.css`. Tokens: deep indigo-black, parchment ink lines, warm starlight accent, muted ember for destructive actions. Source Serif 4 for names and small-caps inscriptions, system sans for controls.
- **Leader line.** One absolutely positioned SVG, updated from the projected planet position in the same frame callback the labels already use.
- **Docs.** Update the "Campaign selector" section of `DESIGN.md` and `docs/archive/M02-Galaxy-Campaign-Selector.md`.
- **Out of scope.** No Supabase schema, migration, RLS, Auth, or service-contract changes.

---

## Phase 3: Implementation order

Each step leaves the app working, and lint, unit, and e2e tests stay green or are updated in the same step.

1. **Shared logic.** Extract `useCampaignManagement` from the workspace, with no visual change.
2. **Model and lighting.** Add `orreryLayout.ts` with unit tests, and add star-relative lighting to the shaders.
3. **Scene.** Build the hearth star, orbit rings, worlds and moons, labels, and the camera rig. Swap it in behind the existing selector DOM so behavior stays the same, then delete the carousel modules and their tests.
4. **DOM layer.** Ledger, annotation with leader line, keyboard stepping, always-visible status, and the overview prompt.
5. **Management in the galaxy.** The `ChartDialog` for create and edit, the protoplanet and formation sequence, owner delete inside the selector.
6. **Responsive.** Phone bottom sheet, tablet dock, landscape side panel.
7. **Motion polish.** Landfall bloom; Impeccable `animate`, `adapt`, `polish`, and `audit` passes on the rendered result. Run `impeccable context --target src/features/campaigns/CampaignSelectorLayout.tsx` first, and read `craft-floor.md` before UI edits.
8. **Tests and docs.** Rewrite the carousel-specific e2e tests (orbital geometry, starfield pans, framing convergence) for the orrery. Keep the accessible-name contracts the specs rely on: Your campaigns, Enter campaign, Return to galaxy overview, Previous/Next campaign, Create campaign, Campaign details, Pause ambient motion, Edit details, Delete campaign. Then update the docs.

## Phase 4: Verification

Run these from `implementation/frontend`:

- `npm run lint`
- `npm run format:check`
- `npm run build` (check the galaxy chunk size against today's ~244 kB gzip)
- `npm test`
- `npm run test:e2e`
- `npm run test:local-supabase` (needs the local stack: `npm run supabase:start` in `implementation/backend`)

Covered by these runs:

- Creating a campaign lands on the workspace URL with its notice.
- Edit and delete work in both the workspace and the selector.
- Member and non-member boundaries hold.
- Direct URLs and Back work.
- Sign-out works.
- Loading, empty, and error states, with retry.
- WebGL unavailable and context loss.
- Reduced motion and pause.
- Keyboard: ←/→, Esc, dialog focus restoration.
- 32 campaigns on a 375×568 viewport.

Visual review with captures at 375×568, 768×900, 1440×960 and 844×390, with an Impeccable critique and detector pass. Mobile GPU performance on physical hardware can't be verified here; I'll say so in the report.

## Risks and decisions

- **Creation now lands later.** After a save, the world forms before landing, so you reach the workspace about 1.2 s later than today. The destination and notice stay the same, and the delay is skipped under reduced motion, without WebGL, or if the refresh fails.
- **Edit and delete in two places.** They're added to the selector as a convenience; the workspace keeps its own. To keep them only in the workspace, drop that part of step 5.
- **Densest case.** The 32-campaign fixture is the stress test for shared outer rings. Labels will be culled by priority (focused, then hovered, then inner rings), as the current label culling already does.
