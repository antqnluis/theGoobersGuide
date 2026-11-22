# Interactive Campaign World — Pixel-Art Village

**Status** · Superseded by [M02-Landfall-Camp.md](../completed/M02-Landfall-Camp.md), 13 November 2026. Kept as historical reference for the uncommitted Lantern Village.

This revision of the Lantern Market plan covers the individual dashboard at `/app/campaigns/:campaignId`. It replaces the painterly village and builds on its Places menu and live feature panels. The galaxy at `/app/campaigns`, standalone creation, and the existing authenticated routes and Supabase contracts are outside the redesign scope.

## Art direction

The [supplied 1,672 × 941 village PNG](../art/lantern-village-reference.png) is the primary reference and source asset. Its foreground tavern and quest board frame a cobbled street that leads past hanging lanterns to bridges, waterfalls, and a hilltop castle. The timber framing, banners, flowers, visible interiors, and amber reflections against blue-violet dusk give the scene the detail and atmosphere of a classic fantasy RPG with modern pixel-art fidelity. Preserve that composition, palette, and pixel texture. Use the player’s campaign name in the interface to establish where they are.

Keep the title, **Back to campaigns**, account controls, and **Places** compact. Put high-contrast text labels beside the artwork’s existing signs and entrances. Use the existing Adventure Ledger typography and form controls when players open a feature. Keep the village visible alongside the feature panel when space allows.

## Destinations backed by the current workspace

| Location in the reference                                | Control label     | Existing feature                                                                                          |
| -------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| Left-hand tavern with the ale-mug sign                   | Overview          | Campaign description, owner, and the viewer’s role.                                                       |
| Center-left stone arch under the crossed-swords banner   | Party             | Campaign roster. Owners can also send invitations by username, view pending invitations, and cancel them. |
| Small right-of-center house with the house-emblem banner | Campaign settings | Use this house as the Steward’s Office. Owners can edit campaign details and confirm or cancel deletion.  |

The library and quest board remain scenery until the active app supports notes, journals, and adventures. Character sheets and character quarters also wait for their own feature work. Only the live destinations receive labels, focus targets, and hover effects. Incoming invitations remain in the campaign selector.

## Asset strategy

- **Start with one image.** Archive the supplied PNG as the source at implementation time and serve a locally bundled, optimized derivative. Its native proportions define the scene. Reserve the image’s space before it loads and fit the whole composition on arrival. Use a dusk-colored surround on mismatched aspect ratios. Keep the source resolution available for wide layouts and test a smaller same-ratio export for phones if it preserves the artwork’s detail.
- **Choose the encoding by inspecting the pixels.** Compare lossless WebP and a high-quality AVIF export against the PNG at native and rendered sizes. Check roof and banner edges, violet shadow detail, and amber highlights for smearing or color shifts. Let the browser pick one suitable derivative on the initial load. Use the prior plan’s 800 KiB landscape and 450 KiB phone targets as budgets to test against, with visible fidelity guiding the final choice.
- **Use the same composition on mobile first.** Fit the entire illustration and surface the Places controls directly below it. Keep in-scene buttons where they fit without overlap at a 44 × 44 CSS-pixel tap size. If the three entrances read too small in phone review, consider a portrait companion composed from the supplied reference, with the same landmark identities and its own anchors. A center crop would lose the tavern and the right-hand landmarks.
- **Keep layers minimal.** The supplied image already has foreground, middle distance, and skyline depth. Start with the flat scene and a few small local light overlays. Consider layered parallax only if separately authored art can support it and there is a visible improvement in review.

## Interaction and implementation

1. **Register the hotspots against the artwork.** Update `CampaignVillage.tsx` and `campaignVillage.css` within the campaign feature. Define each location’s ID, label, access condition, image-relative hit area, and camera anchor together. Render native HTML buttons on the same aspect-ratio plane as the `<picture>` so the controls stay aligned through resize and camera transforms. Generate the Places list from the same definition. If the image fails, show the Places list with all available actions.
2. **Make entrances discoverable.** Give live entrances a short visible label at rest. On pointer hover or keyboard focus, raise a soft amber highlight around the sign or doorway. Give keyboard focus a distinct, high-contrast outline. Activation by click, tap, Enter, or Space opens the same feature immediately. Keep tab order predictable and remove any offscreen or overlapping scene controls from keyboard navigation when the Places list serves that layout.
3. **Frame the selected doorway.** Use a bounded CSS translate and modest zoom of the image plane, around 250 ms, to keep the selected entrance visible beside the desktop panel. Dock the panel opposite the doorway when space allows and limit the framing change if it would expose an empty edge. On narrow or short screens, open a scrollable full-screen panel. With reduced motion, open the feature in place and keep the scene still.
4. **Keep the existing panel and data flows.** Retain the native dialog, move focus inside on open, and restore focus to the opening control or its Places equivalent on **Back to village** or Escape. Preserve in-progress edit and invitation drafts within the same campaign and cancel an idle delete confirmation when leaving Settings. Keep pending deletion protected from accidental dismissal. Continue using `CampaignWorkspacePage`, the existing TanStack Query reads, `CampaignForm`, `CampaignOutgoingInvitations`, and `useCampaignManagement`. Preserve loading, empty, retry, unavailable, and mutation feedback, including the campaign-title handoff and the create, save, and delete notices. Keep the same URL for opening locations and preserve browser Back to the selector after entry from it.
5. **Add atmosphere after the core flow works.** Test a slow opacity change on one or two existing lanterns or windows with small, pointer-transparent overlays tied to the image plane. Keep the animation subtle, stop it when the page is hidden, and disable it for reduced motion. Defer smoke sprites and parallax until the static scene and its interactions pass review. React, CSS, and the existing browser primitives cover the initial scene.

## Verification

- Review the village and open panels at 320, 375, 768, and 1440 CSS pixels and in short landscape. Compare pixel texture with the PNG, confirm the resting scene keeps all landmarks in view, and verify labels and highlights track their entrances during resize and focus transitions. Inspect delivered image size and loading on a throttled connection.
- Exercise mouse, keyboard, and touch. Check target sizes, focus visibility, dialog focus and return, Places parity, failed artwork, and reduced motion. Include long names and rosters, direct entry and refresh, selector entry and return, browser Back, and sign-out.
- Verify owner, member, and unrelated-account behavior against local Supabase. Exercise roster loading and errors, invite and cancel, edit validation and save, and delete cancellation and confirmation. Retain the existing Auth, selector, and RLS regression coverage.
- Run `npm run lint`, `npm run format:check`, `npm run build`, `npm test`, `npm run test:e2e`, and `npm run test:local-supabase` from `implementation/frontend`.

The implementation ships the full-resolution AVIF (747 KiB) and WebP fallback (770 KiB). Viewports up to 480 CSS pixels use the 836-pixel-wide exports (249–250 KiB). Phones use the same full composition with Places below it, and short landscape places the list alongside the image. Two lantern overlays provide the ambient motion.

The frontend lint, format, and production build checks passed, along with 79 unit tests, 34 Chromium end-to-end tests, and three local Supabase integration tests. At 375 CSS pixels on a throttled 1.6 Mbps connection with 150 ms latency, the production build loaded one 249 KiB AVIF. Places was usable before the artwork finished downloading and stayed in position when it arrived.
