# Campaign Dashboard Redesign: "Landfall Camp"

## Context

`/app/campaigns/:campaignId` currently renders an **uncommitted** "Lantern Village" (`CampaignVillage.tsx`, `campaignVillage.css`, `art/` ≈2 MB): one static AI image with three hotspot buttons that open a single `<dialog>`. It works and is tested, but it's a picture with buttons, not a place. You asked for a dashboard that feels like entering a living pixel-art RPG, as ambitious as the Galaxy orrery, without losing any function.

Decisions already made with you:
- **Replace the village world entirely** (it is evidence, not authority).
- **Direction: Landfall Camp** (chosen over Guild Hall Cutaway, Expedition Overworld, and the classic Tavern hub).
- **Art: AI-generated, then cleaned** through a scripted pixel pipeline, with every asset approved by you.
- **Future features (journals, adventures, characters) appear only as dormant, unlabeled scenery.** Nothing implies a feature that doesn't exist.

Impeccable note: its seed roll and decision page write files and run a server, which plan mode forbids, so the direction round ran through structured questions instead. The surface brief, direction contract, comps, finish review, and DESIGN.md update happen during implementation.

### What exists and must keep working (verified in code)
- **Data:** `getCampaign` and `getCampaignRoster` (TanStack keys `['campaigns','detail'|'roster',id,userId]`), `useCampaignManagement` (save/remove), `CampaignOutgoingInvitations` (owner send/cancel), `CampaignForm`, plus the states for loading, error/retry, missing/unauthorized, and an empty roster.
- **Flows:**
  - The `campaignCreated` and "Campaign details saved." notices.
  - The `ViewTransition` title morph from the galaxy (`campaignTransition` state).
  - Delete returns you to the galaxy with the deleted notice.
  - Browser Back to the selector, and sign out.
- **Live destinations:** Overview (description, owner, your role), Party (roster, plus owner invites), and Campaign settings (owner only: edit and delete with confirmation).
- **Out of scope:** schema, RLS, RPCs, Auth, the galaxy, and creation. No backend changes.

---

## 1. Creative direction

**Thesis.** The galaxy is where you *choose* an adventure; the camp is where you *are* in it. You land on the very planet you clicked, and the party has made camp for the night.

**Continuity mechanism (unique to this product).** `planetAppearance(campaign.id)` already gives every campaign a seeded world type (terrestrial, desert, volcanic, gas, frozen, rocky) and palette. The camp uses the **same function**, so the ground, foliage, rock, and sky are recolored from that palette, and each world type gets its own sky and ambient particles:

| Type | Sky | Particles |
|---|---|---|
| Terrestrial | Grass and pines | Fireflies |
| Desert | Dunes | Drifting sand |
| Volcanic | Ash and basalt | Embers |
| Frozen | Snow | Snowfall |
| Rocky | Scree | Dust motes |
| Gas giant | Cloud-reef highland under a banded giant | Wisps |

The colour you saw from orbit is the ground under your boots. Overhead, the orrery's warm hearth star hangs low on the horizon.

**Look.** True pixel art on a strict grid: a ~270 px tall base panorama about 960 px wide, scaled by an integer number of *device* pixels with `image-rendering: pixelated`. The style is 16-bit-inspired with modern detail: limited material ramps, hue-shifted shadows, and a warm firelight falloff against cool night. Animation is native to the medium: low frame rates (~10–12 fps) and pixel-snapped motion, never smooth sub-pixel blur.

**The scene (side view, layered parallax, left to right):**

| Element | Role | Accessible name |
|---|---|---|
| Steward's wagon with lantern and ledger chest | Campaign settings (owner only; for members it stays parked and unlabeled) | `Campaign settings` |
| Circle of bedrolls with one pixel adventurer per **real** roster member | Party | `Party` |
| Campfire (center, focal light source) | Overview: the campaign's story and facts | `Overview` |
| Starlit waystone | Back to the galaxy (pointer shortcut; the header link stays the single accessible "Back to campaigns") | — (aria-hidden) |
| Map table, journal crate, empty tent | Dormant scenery reserved for future milestones | none, not focusable |

**Party representation.** `adventurerAppearance(profile_id)` is a seeded, cosmetic-only variant: cloak ramp, hood or hat, pack, skin ramp. It shows **no invented class, level, or stats**. Each sprite gets its username label (or "Player"). Up to 10 sit around the fire; beyond that a "+N" marker appears by the tents. The text roster in the Party panel stays the authoritative, accessible list. *Optional, Phase 6:* for owners, each pending outgoing invitation shows as a lantern-carrying traveller on the road (real data from the invitations query), labeled "Invitation pending".

**Panels: the Field Journal.** Panels keep the native `<dialog>` and all current content. They're framed in a pixel 9-slice leather-and-brass border (`border-image`) around a full-resolution reading surface. Headings use Source Serif 4, and body text and forms use the existing system sans and controls, so text stays crisp and readable. Each heading has a small pixel glyph: fire, bedroll, or wagon. Scene labels sit on pixel plank plates in bold system sans, not a pixel font, for legibility. **No new font dependency.**

## 2. Interaction and motion

| Moment | Behavior | Timing | Reduced motion |
|---|---|---|---|
| **Landfall** (only on PUSH from the galaxy with `campaignTransition`) | The title morph plays, then the camera starts on the night sky and the hearth star, pans down through the parallax layers, and the fire flares as it settles | ~1.1 s, never delays data or navigation | Instant still frame |
| Direct load or refresh | Short fade, no descent | 200 ms | None |
| Ambient | Fire (procedural), embers and smoke, biome particles, idle breathing (1 px torso bob, 2 fps), occasional blinks, twinkling stars | ~12 fps sprite clock | Single static frame |
| Hover or focus a destination | 1 px warm outline mask on the object, label plate lifts, fire brightens slightly; Party sprites look up | Instant or 120 ms | Outline only |
| Open a destination | Camera pans to frame the place on the opposite third (pixel-snapped ease), and the journal slides in from the other side | ~350 ms | Opens in place |
| Close (Back to camp / Esc) | Camera returns and focus goes back to the opener (`preventScroll`) | ~300 ms | Instant |
| Phone panning | Drag or swipe the panorama (clamped); focusing or tapping a Place pans to it | Native drag | Jump |

Rules:
- One camera rig retargets from its current position, so rapid clicks never queue animations.
- Redraw only when the integer camera x changes or the sprite clock ticks.
- Pause entirely when `document.hidden`; drop the frame rate while a panel is open.
- The "descent played" flag is keyed on `location.key`, so StrictMode, HMR, and Back never replay it.

## 3. Layout and responsiveness

- **Header (all sizes):** Back to campaigns, the campaign name (h1, inside the eager shell so the morph works), account, and Sign out.
- **Desktop (≥1100):**
  - The scene fills the viewport and the camera centers on the fire, with all three destinations in view.
  - A compact "Camp places" `nav` sits bottom-left.
  - The journal docks opposite the destination at about 440 px.
  - On ultra-wide screens, the panorama edges extend with sky and ground fill.
- **Tablet (700–1099):** Same scene; the journal docks at about 50%.
- **Phone (<700, portrait):**
  - The scene takes the top ~55svh as a window onto the panorama, centered on the fire and pannable.
  - Camp places sit below as large (≥44 px) buttons and are the primary navigation.
  - The journal opens as a full-screen sheet.
- **Short landscape:** The scene runs full height and Places become a side rail.
- **Off-frame buttons:** Scene buttons outside the camera frame get `visibility:hidden`, which keeps them out of tab order and click targets. The Places list is always the complete, semantic navigation.

## 4. Technical architecture

- **Eager shell** (`CampaignCamp.tsx`, replacing `CampaignVillage.tsx`) holds the heading slot, the notices live region, the Places nav, the single dialog (all sections stay mounted and `hidden`, which preserves drafts), the focus logic in `useDestinationDialog`, and the DOM scene buttons. `CampaignWorkspacePage` keeps its queries, management, and states. It only swaps the child component.
- **Lazy renderer** (`camp/CampLandscape.tsx` via `React.lazy`):
  - One Canvas 2D at base resolution, plus about six `drawImage` layers with parallax.
  - Integer device-pixel scaling from `ResizeObserver` `devicePixelContentBoxSize`, with a fallback of `round(css×dpr)` for WebKit, and re-measure when the resolution or zoom changes.
  - Button positions are written through refs from a shared pure `projection`, never through React state per frame.
  - An error boundary and Suspense wrap it, following the `GalaxyBackdrop.tsx` pattern.
  - Failure modes (chunk error, null context, image error, no canvas) set `data-art-failed` and show a CSS gradient built from the planet palette. Every flow still works.
- **Palette swap at runtime:** done once per world type and palette (12 variants max), on the main thread, using a Uint32 → ramp lookup table (≈10 ms) and cached in a module-level promise map.
  - Decode with `createImageBitmap(..., {colorSpaceConversion:'none', premultiplyAlpha:'none'})`.
  - Pass unmatched pixels through unchanged.
  - Assets are same-origin.
- **Procedural pixels:** fire, embers, smoke, stars, particles, idle bobs, and outline masks are drawn in code. AI generation is used only for static layers and static sprite parts, which avoids inconsistent AI animation frames.
- **Pure, unit-tested modules:**
  - `campLayout.ts`: locations, anchors, seats, owner gating; this one table drives the buttons, Places, and hit areas.
  - `campCamera.ts`: clamping, framing per viewport, retargeting.
  - `campProjection.ts`
  - `campPalette.ts`: ramps per world type, using `planetAppearance`.
  - `adventurerAppearance.ts`: FNV hash with its own salt.
- **Dependencies:** no new runtime dependencies (no PixiJS; three stays galaxy-only). `sharp` is added as a **devDependency** for the art pipeline only.
- **Art pipeline:**
  - Lives in `implementation/frontend/scripts/camp-art/`, with sources and provenance prompts in `implementation/frontend/art-src/camp/`.
  - Steps: detect the grid, take the most common colour per cell, quantize to the master material-ramp palette in OKLab, strip gAMA/iCCP chunks, use 1-bit alpha, and write indexed PNG plus a JSON manifest (sizes, anchors, seats).
  - `npm run art:check` fails on any off-palette colour, partial alpha, or grid violation.
  - Image generation uses the Higgsfield tools available here. It is an external, credit-using service, so I'll confirm before each batch.
- **AuthAppShell:** rename the uncommitted `isVillage` branch to the camp, with the same behavior.
- **Removed:** `CampaignVillage.tsx`, `campaignVillage.css`, `art/lantern-village*`. The old plan doc is marked superseded.

## 5. Phased roadmap

Each phase leaves the app working. At each phase end: focused unit tests, the relevant e2e specs, `lint`, `format:check`, `build`, viewport checks at 375/768/1440, console and network review, a performance note, and a short status entry in the docs file. **I stop for your review after every phase.**

**Phase 0: Baseline and docs**
- Save this proposal as `docs/M02-Campaign-Landfall-Camp-Plan.md` and mark `docs/M02-Campaign-World-Redesign-Plan.md` as superseded.
- Run `lint`, `format:check`, `build` (record chunk gzip sizes and image bytes), `test`, `test:e2e`, and `test:local-supabase` (requires `npm run supabase:start`).
- Record coverage gaps.
- *Decision for you:* commit the current village first as a checkpoint so the replacement diff is reviewable. I won't commit without your OK.
- **Done when:** every baseline result is recorded, including any pre-existing failures.

**Phase 1: Shell and test contract (no visual change yet)**
- Add `CampaignCamp.tsx` (still rendering the old picture as a temporary backdrop), `campLayout.ts`, and `useDestinationDialog`.
- Rename the contracts once:
  - `Back to village` becomes `Back to camp`.
  - `Village places` becomes `Camp places`.
  - The Places names become "Overview Campfire", "Party Bedroll circle", and "Campaign settings Steward's wagon".
- Replace CSS-class selectors in the e2e specs with data hooks: `data-camp-state`, `data-camera-x`, `data-animating`.
- Add `checkVisibility` and dialog polyfills to `src/test/setup.ts`, plus an RTL focus-restore test.
- **Done when:** all of `campaigns.spec.ts` and `local-supabase.spec.ts` pass with the new names, with no weakened assertions.

**Phase 2: Pure modules and art pipeline**
- Add `campCamera`, `campProjection`, `campPalette`, `adventurerAppearance`, the `scripts/camp-art` pipeline, `art:check`, and placeholder art marked `PLACEHOLDER`.
- Unit tests cover:
  - determinism
  - clamping at every viewport
  - framing on the opposite third
  - seat overflow
  - a palette round-trip for all 6 types × 2 palettes
  - owner gating
- **Done when:** the unit tests and `art:check` pass, with no UI change.

**Phase 3: Art direction and production (your approval gate)**
- Three full-scene style comps (16:9 desktop), each anchored on the same terrestrial palette. You pick one.
- Then generate the layers (sky ×6, far ridge, mid trees, ground, props, wagon, waystone, dormant props) and sprite parts on flat backgrounds.
- Run them through the pipeline, check them at 1× and 4× zoom, and embed provenance.
- **Done when:** you approve the plates and `art:check` passes. Art budget: **≤150 KB first load**, versus ~770 KB today.

**Phase 4: Static renderer and biome**
- Add `CampLandscape` (lazy), the recolour cache, the error boundary and fallback, the scene buttons from the projection, and the dormant props. Delete the village art and CSS.
- e2e:
  - Visit each of 320/375/768/1440/844×390. Buttons must be in the viewport, ≥44 px, with no horizontal scroll.
  - Art or chunk abort leads to the fallback with full flows.
  - Each world type renders its recolor, using a seeded campaign fixture per type.
  - The camp chunk contains no three.
- **Done when:** the scene is static, crisp, and correctly recolored, with all flows green.

**Phase 5: Party and destinations**
- Roster sprites, labels (aria-hidden, outside lists), the "+N" overflow, the owner wagon gating, and hover/focus outlines.
- e2e:
  - A 32-member roster, a null username, and a roster error (empty bedrolls plus retry).
  - Members see no wagon control.
  - An unrelated account gets "Campaign not available" (the existing test is kept).
- **Done when:** party visuals match real data across all states.

**Phase 6: Motion**
- Landfall descent, pan to destination, procedural fire and particles, idle animation, focus-driven camera, phone drag pan, pause while hidden or while a panel is open, and reduced motion. Optional: invitation travellers.
- e2e:
  - The descent runs only on PUSH with transition state, not on goto, refresh, or Back.
  - Rapid open, close, and Escape mid-pan leave a consistent state and correct focus.
  - Keyboard Tab and Enter work during animation.
  - Reduced motion gives `data-animating="false"` and an instant camera.
  - The draw count drops to 0 when hidden.
  - The title morph still appears (manual check).
- **Done when:** no queued or stuck states, and listeners, timers, and rAF are cleaned up (verified with a mount/unmount loop).

**Phase 7: Performance, cross-browser, and final QA**
- Performance:
  - A separate `playwright.perf.config.ts` (workers 1, `vite preview`).
  - Count draws via a `drawImage`/rAF wrapper.
  - Use CDP `Performance.getMetrics` and `HeapProfiler.collectGarbage` heap samples at 5 s and 60 s, over 60 s idle followed by 50 open/close/pan cycles.
  - Watch long-animation-frames, image bytes from resource timing, and a chunk gzip table.
- Budgets:
  - Camp chunk under 25 KB gzip.
  - Idle around 12 draws/s, and 0 when hidden or under reduced motion.
  - Heap growth under 2 MB.
  - No frames over 50 ms after load.
  - SwiftShader numbers are relative only.
- Cross-browser: move the swiftshader flags into the chromium project and add opt-in Firefox, WebKit, and Mobile Safari projects behind `PW_ALL=1` (`npm run test:e2e:browsers`). This needs `npx playwright install firefox webkit`, a ~200 MB download that I'll ask about first.
- Impeccable audit, polish, and the finish review. Then update DESIGN.md (asking how to merge), contrast checks, 200% zoom, and a VoiceOver smoke test of the Places, dialog, and forms.
- Finish with the full suite plus `test:local-supabase` and a final report.
- **Done when:** the final report clearly separates automated, manual, and unverified checks.

## 6. Verification matrix (summary)

- **Functional and security:**
  - Covered by `test:local-supabase` against the real local stack: owner, member, and unrelated account; invite, accept, and cancel; edit validation and save; delete cancel and confirm; direct-URL denial.
  - Mocked e2e covers loading, error, retry, empty, and missing states.
- **Journeys** (in `local-supabase.spec.ts`): sign in → galaxy → select → Enter campaign → camp → each destination → owner action → Back to campaigns → sign out.
- **Accessibility:**
  - Keyboard-only paths, visible focus on the dark scene, ≥44 px targets, and 4.5:1 label contrast measured on the plank plates.
  - Reduced motion, 200% zoom, a VoiceOver smoke test, and an aria-hidden canvas with complete DOM equivalents.
- **Responsive:** 320, 375, 768, 1024, 1440, 1920, 3440×1440, 844×390, and 768×1024 portrait, with screenshots captured by e2e (pane screenshots mangle canvases, per project memory).
- **Not verifiable here:** physical-device GPU and battery behavior, and Safari on iOS hardware. These will be stated as unverified.

## 7. Risks

- **AI art consistency across layers.** Mitigated by approving a style comp first, keeping animation procedural, enforcing the palette with `art:check`, and planning a cleanup pass. Some hand cleanup may still be needed.
- **Palette-swap fidelity across browsers** (colour management). Mitigated by stripped PNGs, decode flags, pass-through for unmatched pixels, and a Firefox/WebKit check in Phase 7.
- **Gas giants aren't landable in reality.** They're rendered as a cloud-reef highland: a stylistic choice, flagged here.
- **Intentional e2e renames happen in Phase 1.** No assertions are removed.
---

## Status log

### Phase 0: Baseline (13 November 2026)

Measured on the uncommitted Lantern Village working tree, branch `feature/individual-campaign-redesign`.

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run format:check` | Pass |
| `npm run build` | Pass |
| `npm test` | Pass: 10 files, 79 tests |
| `npm run test:e2e` | 33 pass, 1 fail (flaky, see below) |
| `npm run test:local-supabase` | Pass: 3 tests against the running local stack |

**Pre-existing flake:** `auth.spec.ts:241` "crossfades instead of travelling when motion is reduced" failed once in the full run (`.arrival-layer` still present after 2 s). It then passed 3 of 3 repeats and once with the working tree stashed, so it is timing-sensitive under load and unrelated to the village. Watch it in later phases.

**Build sizes (gzip):** main `index` JS 576 kB (167 kB), `GalaxyCanvas` chunk 956 kB (255 kB), CSS 66 kB (14 kB). Village images today: 788 kB WebP / 765 kB AVIF full, 256 kB / 255 kB small. The art budget for the camp is ≤150 kB first load.

**Coverage gaps to close:** no unit tests for the village or its dialog focus logic; e2e uses CSS-class selectors for the scene; no per-world-type, viewport, or art-failure coverage; no performance or cross-browser projects.

**Open decision:** commit the current village as a checkpoint before replacing it (not done, awaiting approval).
