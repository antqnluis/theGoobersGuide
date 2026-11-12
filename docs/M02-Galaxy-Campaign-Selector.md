# M02 — Galaxy Campaign Selector

## Status

**Phases 1 and 2 implemented and verified. Awaiting user verification before Phase 3.**

The selector at `/app/campaigns` is rendered by [CampaignSelectorLayout.tsx](../implementation/frontend/src/features/campaigns/CampaignSelectorLayout.tsx). It lists campaigns through a user-scoped TanStack Query backed by Supabase. Selecting a campaign displays its details on the same page. **Enter campaign** opens the existing workspace route. The standalone create form still opens the workspace after saving.

## Phase gates

Complete one phase at a time. Run its acceptance checks, record actual results in this document, and stop for user verification before starting the next phase.

## Decisions

- **Routes and lifetime.** Add a selector layout inside the protected `/app` shell. It owns the campaign query, selected campaign ID, and one lazily loaded Canvas across `/app/campaigns` and `/app/campaigns/new`. Keep the workspace route a sibling. Selection and opening or closing the create form preserve the scene. Future planet selection uses the same scene. Entering a workspace or leaving the authenticated selector releases it.
- **Exploration and entry.** Start in a galaxy overview. In Phase 2, list selection opens details over a fixed overview. Phase 3 adds planet selection to the existing list selection. Phase 4 adds guided travel. **Return to galaxy overview** clears the selection and, once travel exists, returns to the wide view. The selected campaign panel shows its name, description, and role. **Enter campaign** explicitly enters the existing workspace URL. Keep selection in memory and start in overview on a fresh visit.
- **Rendering.** Use Three.js with React Three Fiber v9 and the corresponding `@types/three` development dependency. Fiber 9.8.2 accepts React and React DOM versions `>=19 <19.4` and Three.js `>=0.156`. The app resolves React and React DOM 19.3.1 and Three.js 0.187.0. Use one WebGL Canvas with procedural visuals. Phase 2 renders on demand and suspends rendering while hidden; later phases use Fiber’s frame loop for camera and planet motion. Keep the existing typography and route protection. The scene fills the viewport behind a compact branded account header and floating DOM controls. The collapsible campaign list floats at the left, and details appear only when a campaign is selected, at the bottom right. On phones, the list starts collapsed and the details use a compact bottom sheet. The create route remains a standalone form in front of the persistent galaxy until the Phase 5 modal and save-flow change. Workspace pages retain the existing shell. [React Three Fiber installation](https://r3f.docs.pmnd.rs/getting-started/installation)
- **Planet identity.** Derive surface palette, pattern, size, tilt, and ring treatment from a deterministic, versioned seed based on the campaign UUID. Assign overview positions using creation time and UUID as a stable tie-breaker, independently of the display sort. Renames update labels without changing planet appearance. Keep the model derived in the frontend. Supabase Auth, campaign records, membership rules, and RLS require no schema or API changes.

## Phase 1 — Selector and navigation

### Work

- [x] Move the existing list query and its loading, empty, error, retry, and deletion-feedback states into the selector layout. Build the accessible campaign list and selected-campaign panel first. Clear selection if a successful refresh removes that campaign from the accessible list.
- [x] Make list selection a keyboard-operable button action and preserve the existing workspace route through **Open workspace**. Keep the standalone creation behavior until Phase 5.

### Acceptance

- [x] Selection updates the panel on the selector URL. Only the explicit workspace action opens the workspace. Direct workspace links, browser Back, owner/member behavior, and sign-out still work.

## Phase 2 — Persistent galaxy environment

### Work

- [x] Replace the dashboard frame with a full-viewport galaxy, responsive floating controls, and selector-only navigation styling. Keep campaign actions and standalone creation behavior intact.
- [x] Lazy-load the Canvas from the selector and keep the list usable during loading. Build a wide view with batched star points, layered nebulae, and directional and ambient lighting. Cap device pixel ratio, reuse geometry where practical, and suspend rendering while the tab is hidden.
- [x] Isolate renderer and module errors to the viewport. Unsupported WebGL or context loss shows a static backdrop while the list and all campaign actions remain available.

### Acceptance

- [x] The galaxy renders in a WebGL-capable browser. Changing selection, toggling the list, and opening or closing the standalone creation form preserve the Canvas DOM node. Desktop, tablet, and phone layouts keep the controls usable without shrinking the scene. Forced renderer failure leaves the campaign list and workspace entry usable. Production build output confirms Three.js loads from the selector rather than the login or workspace entry path.

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
| Three.js and Fiber compatibility | Official documentation confirms the React 19 pairing. Phase 2 verified the installed peer ranges and runtime rendering. |
| Phase 1 static checks | `npm run lint`, `npm run format:check`, and `npm run build` passed. The build reported the existing Vite chunk-size advisory. |
| Phase 1 unit tests | `npm test` passed all 22 tests. |
| Phase 1 browser tests | `npm run test:e2e -- --workers=3` passed all 15 tests, covering keyboard selection, explicit workspace entry, Back, direct URLs, access changes, owner/member behavior, creation, and sign-out. |
| Phase 1 local integration | `npm run test:local-supabase -- --output=/private/tmp/goobers-galaxy-phase1-local-results` passed both tests against local Supabase, including campaign and roster access rules. |
| Phase 1 responsive review | Reviewed selected-campaign captures at 375px, 768px, and 1440px. No horizontal overflow. Impeccable reported no findings for the changed selector files. |
| Phase 2 static checks | `npm run lint`, `npm run format:check`, and `npm run build -- --manifest` passed. The manifest lists the galaxy as a dynamic import. The app entry went from 155.25 kB to 156.69 kB gzip; the separate galaxy chunk is 243.98 kB gzip. Vite reported its chunk-size advisory. |
| Phase 2 unit tests | `npm test` passed all 22 tests. |
| Phase 2 browser tests | `npm run test:e2e -- --workers=3 --output=/private/tmp/goobers-galaxy-phase2-e2e` passed all 18 tests. Coverage includes Canvas identity through selection, disclosure, and creation; workspace entry after context loss or unavailable WebGL; and keyboard and scroll behavior with 32 campaigns on a short phone viewport. |
| Phase 2 local integration | `npm run test:local-supabase -- --output=/private/tmp/goobers-galaxy-phase2-local-results` passed both tests against the running local stack, including authentication and campaign access rules. |
| Phase 2 responsive review | Reviewed Chromium captures at 375px, 768px, and 1440px, including the selected campaign and standalone create form over the rendered galaxy. Physical mobile GPU performance remains for Phase 6. |

## Risks and safeguards

- The existing build already records a Vite chunk-size advisory. Recheck initial-route and galaxy chunk sizes in Phase 6.
- Shared state stays inside the authenticated selector, keyed by the active user. The scene consumes only campaigns returned by the existing authorized query, and Supabase RLS continues to enforce access to campaign data.
