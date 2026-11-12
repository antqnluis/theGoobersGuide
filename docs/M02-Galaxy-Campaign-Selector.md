# M02 — Galaxy Campaign Selector

## Status

**Proposed for review. Implementation has not started.**

The current Choose Campaign screen is the **Your campaigns** page at `/app/campaigns`, rendered by [CampaignDashboardPage.tsx](../implementation/frontend/src/features/campaigns/CampaignDashboardPage.tsx). It lists campaigns through a user-scoped TanStack Query backed by Supabase. Selecting a campaign currently opens `/app/campaigns/:campaignId` directly. The existing create form at `/app/campaigns/new` validates and saves a campaign, then opens its workspace. The workspace also supports owner editing and deletion and displays the authorized roster. Source inspection confirmed these paths, and the [M02 verification log](M02-Campaign-Management.md#verification-log) records passing browser and local Supabase checks. Those suites were not rerun during planning.

## Phase gates

Complete one phase at a time. Run its acceptance checks, record actual results in this document, and stop for user verification before starting the next phase.

## Decisions

- **Routes and lifetime.** Add a selector layout inside the protected `/app` shell. It owns the campaign query, selected campaign ID, and one lazily loaded Canvas across `/app/campaigns` and `/app/campaigns/new`. Keep the workspace route a sibling. Planet selection and opening or closing the create form preserve the scene. Entering a workspace or leaving the authenticated selector releases it.
- **Exploration and entry.** Start in a galaxy overview. Clicking a planet or activating its campaign-list button selects the same campaign and starts guided camera travel. A **Galaxy overview** control returns to the wide view. The selected campaign panel shows its name, description, and role. **Open workspace** explicitly enters the existing workspace URL. Keep selection in memory and start in overview on a fresh visit.
- **Rendering.** Use Three.js with React Three Fiber v9 and the corresponding `@types/three` development dependency. Fiber v9 targets React 19, which matches the app’s React major. Verify the exact installed peer range and production build in Phase 2. Use one WebGL Canvas, procedural visuals, and Fiber’s frame loop for camera and planet motion. Keep the existing app shell and typography, with a dark galaxy viewport and a readable campaign list beside it on desktop and below it on mobile. [React Three Fiber installation](https://r3f.docs.pmnd.rs/getting-started/installation)
- **Planet identity.** Derive surface palette, pattern, size, tilt, and ring treatment from a deterministic, versioned seed based on the campaign UUID. Assign overview positions using creation time and UUID as a stable tie-breaker, independently of the display sort. Renames update labels without changing planet appearance. Keep the model derived in the frontend. Supabase Auth, campaign records, membership rules, and RLS require no schema or API changes.

## Phase 1 — Selector and navigation

### Work

- [ ] Move the existing list query and its loading, empty, error, retry, and deletion-feedback states into the selector layout. Build the accessible campaign list and selected-campaign panel first. Clear selection if a successful refresh removes that campaign from the accessible list.
- [ ] Make list selection a keyboard-operable button action and preserve the existing workspace route through **Open workspace**. Keep the standalone creation behavior until Phase 5.

### Acceptance

- [ ] Selection updates the panel on the selector URL. Only the explicit workspace action opens the workspace. Direct workspace links, browser Back, owner/member behavior, and sign-out still work.

## Phase 2 — Persistent galaxy environment

### Work

- [ ] Lazy-load the Canvas from the selector and keep the list usable during loading. Build a wide view with batched star points, layered nebulae, and directional and ambient lighting. Cap device pixel ratio, reuse geometry where practical, and suspend rendering while the tab is hidden.
- [ ] Isolate renderer and module errors to the viewport. Unsupported WebGL or context loss shows a static backdrop while the list and all campaign actions remain available.

### Acceptance

- [ ] The galaxy renders in a WebGL-capable browser. Changing selection preserves the Canvas DOM node. Forced renderer failure leaves the campaign list and workspace entry usable. Production build output confirms Three.js loads from the selector rather than the login or workspace entry path.

## Phase 3 — Campaign planets and labels

### Work

- [ ] Map each authorized campaign to one UUID-keyed animated planet using the seeded appearance model. Project the campaign name above its planet in a DOM overlay. Keep labels inside the viewport, cull occluded or overlapping labels with priority for the selected planet, and show full names in the list.
- [ ] Connect planet hit targets to the same selection action as the list. Use stable React keys and keep the list as the keyboard and assistive-technology entry point.

### Acceptance

- [ ] Every accessible campaign has a planet. Pointer selection updates the corresponding list item and panel. Test duplicate names, long names, refresh, rename, and insertion of another campaign. The same UUID retains its appearance across those changes.

## Phase 4 — Guided camera travel

### Work

- [ ] Interpolate camera position and look target from the current pose to a radius-aware view of the selected planet. Retarget from the current pose on rapid switching. Use the same controller for the overview action and keep per-frame changes outside React state.
- [ ] Respect `prefers-reduced-motion` by snapping the camera and disabling ambient motion. Provide a pause control for continuous scene animation.

### Acceptance

- [ ] List and planet selections produce the same camera destination. Rapid selection lands on the last target. Returning to overview, resizing, reduced motion, and paused animation preserve usable framing and controls.

## Phase 5 — Create campaign and form a planet

### Work

- [ ] Render the existing `CampaignForm` in an accessible modal at `/app/campaigns/new`, including direct navigation to that URL. Keep the galaxy mounted behind it, make the background inert, and restore focus to **Create campaign** on close. Preserve validation, pending state, duplicate-submit prevention, and save-error feedback.
- [ ] After a successful Supabase insert, store the returned ID in transient selector state, close the modal, and refresh the user’s campaign list. When that ID appears, select it and play one formation sequence. Particles gather, the planet resolves, and the camera settles on it. Show a status message immediately. If list refresh fails after the save, retry the list without resubmitting creation. Reduced motion or unavailable 3D reveals the selected campaign immediately when it appears. Workspace entry stays available during formation.

### Acceptance

- [ ] Cancel creates no record. A failed save preserves form input and creates no planet. A successful save creates one persistent campaign and plays formation once without remounting the scene or opening the workspace. Refresh shows the same planet without replaying formation.

## Phase 6 — Integration and verification

### Work

- [ ] Update the existing browser and local Supabase tests for the new selection and creation flow. Cover empty/loading/error states, keyboard and modal focus, touch selection, renderer fallback, reduced motion, and a larger campaign list. Review at 375px, 768px, and 1440px with Impeccable.
- [ ] Re-run the real Auth and campaign workflows, including session restoration, sign-out, owner CRUD, member visibility, and non-member and anonymous denial. Check Canvas cleanup after leaving the selector and confirm the scene stays responsive on representative mobile hardware.
- [ ] Run `npm run lint`, `npm run format:check`, `npm run build`, `npm test`, `npm run test:e2e`, and `npm run test:local-supabase` from `implementation/frontend`.

### Acceptance

- [ ] The campaign list supports the complete flow with or without WebGL. The galaxy supports synchronized exploration, explicit workspace entry, and creation with stable planet appearances. Existing Auth and RLS checks pass against local Supabase.

## Verification log

| Check | Result |
| --- | --- |
| Repository, routes, source, package scripts, Supabase configuration, and migrations | Inspected on `milestone/m02-campaign-management` with a clean working tree. |
| Existing selector design | Reviewed the saved desktop campaign dashboard capture. |
| Three.js and Fiber compatibility | Official documentation confirms the React 19 pairing. Exact peer resolution, build, and runtime checks are pending Phase 2. |
| Automated checks | Pending implementation. Existing M02 results are recorded in the campaign-management milestone. |

## Risks and safeguards

- The existing build already records a Vite chunk-size advisory. Compare initial-route and galaxy chunk sizes in Phase 2 and Phase 6.
- Shared state stays inside the authenticated selector, keyed by the active user. The scene consumes only campaigns returned by the existing authorized query, and Supabase RLS continues to enforce access to campaign data.
