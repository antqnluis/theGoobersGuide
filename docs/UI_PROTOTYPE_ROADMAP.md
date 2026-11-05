# The Goober's Guide: UI Prototyping Roadmap

**Status:** Planning only; no application implementation is included here.  
**Purpose:** Turn the approved parts of [UI_UX_BLUEPRINT.md](UI_UX_BLUEPRINT.md) into small, reviewable UI phases while preserving the local MVP.

## 1. Baseline and guardrails

The current application is a React, TypeScript, and Vite client with feature components under `src/features/`. `src/App.tsx` owns hash navigation, active campaign selection, demo-user session state, application-level actions, and the native dice dialog. Feature services call the `AppRepository` interface; `LocalStorageRepository` validates and persists campaign, character, note, and preference data. There is no backend or real authentication.

Existing destinations are Sign in, Campaign library, Overview, Party, My Character, and Campaign notes. Dice roller is a global dialog. The first review journey is:

**Campaign Library → Campaign Overview → My Character → Character Sheet → Dice Roller → same Character Sheet**

Keep the current forest-and-paper field-ledger identity: forest `#183936`, paper `#F8F9F5`, muted ground, ink and thin rules, serif display headings, sans-serif interface text, compact headings, and restrained brass accents. Keep the 244 px desktop index, its mobile overlay behavior below roughly 1,050 px, two-column sheet details at wide widths, stacked sheet sections below roughly 760 px, phone-width HP emphasis, and contained horizontal scrolling for sheet tabs. Readability, visible focus, explicit labels, and state text remain requirements.

The existing `src/design/sampleData.ts` fixture is not loaded into application persistence. Any new mock records must stay in an isolated preview fixture or prototype harness and must never be merged into `AppData`, the live repository, or a user's LocalStorage records.

### Scope classification

| Blueprint proposal | Where it belongs | Can be shown with mock data? | Later implementation boundary |
| --- | --- | --- | --- |
| Consistent shell, headings, actions, feedback, empty states, and current destinations | Existing screens and shared components | Not needed for the live screens; use isolated fixtures only for hard-to-reach visual states | UI and interaction refinement over current behavior |
| Campaign library and Overview hierarchy; recent-character shortcut derived from saved records | Existing screens | Yes, in isolated visual examples | Existing campaign, character, and note records suffice |
| Character selector, sheet hierarchy, read-only indicator, import/review/export states | Existing My Character workflow | Yes, for visual states; actual workflows must keep using current records and import services | UI refinement; no new backend or data model |
| Dice result emphasis and same-route return | Existing global dialog | Yes, for static examples; live roll remains current client-side behavior | UI refinement; do not replace dice arithmetic or session history |
| Party roster role-free reordering preview | Existing Party screen only | Yes | Do not save order or imply membership, ownership, or tactical role changes without a later decision |
| Quick table actions and suggested character-based rolls | Existing sheet combat band and global dice dialog | Yes | Any live prefill must use explicit player-entered values; saved presets may require a small character preference model. No rules engine |
| Quick note capture and Session recap template | Existing Campaign notes workflow; may open its composer in campaign context | Yes | Plain note drafts/templates can use the existing note fields; persist only after a separately approved functional phase |
| Journal search and category filters | Existing Campaign notes index | Yes | Current note fields are sufficient; no backend or schema change expected |
| Manual resource/condition trackers | Existing sheet combat band or Overview | Yes | Persistence requires new character fields, validation, migration, and character export compatibility; no backend by default |
| Player-entered objectives | Existing Overview summary, with editing in Campaign notes | Yes | Prefer a dedicated local objective model and status validation; no backend by default |
| Campaign backup/restore review flow | Actions within Campaign Library or Overview, not a permanent sidebar item | Yes | Requires a versioned campaign bundle and conflict/recovery behavior; no backend for file-based backup |

### Blueprint change inventory

- **Existing screens needing visual improvement:** Sign in and shared shell; Campaign Library; Campaign Overview; Party; My Character and its sheet; Campaign notes; global Dice Roller. The initial review path focuses on Library, Overview, My Character/sheet, and Dice Roller, then aligns Party, notes, and sign-in.
- **New UI components or sections:** Consistent page/section heading patterns, ownership/read-only labels, aligned empty/error/save feedback, an Overview recently-used-character shortcut (derived from existing records), optional table-action strip in the sheet combat band, optional quick-note entry point, recap-template choice in the journal composer, journal search/filter controls, optional resource/condition and objective summaries, and a backup/restore review step.
- **New proposed standalone screens:** None. The blueprint explicitly keeps the existing sitemap. Note creation, recap, search/filter, trackers, objectives, roll suggestions, and backup/restore belong inside existing destinations or the global dialog. A development-only mock harness, if needed for fixture previews, is not an application destination.
- **Features suitable for isolated mock-data prototypes:** Suggested roll choices; quick note capture; recap prompts; search/filter; role-free roster ordering preview; resource/condition counters; player-entered objective states; backup/restore confirmation and conflict examples. Static fixture results may also illustrate dice layout, but are not live rolls.
- **Future data-model work:** Persisted trackers, objectives, saved roll presets, and campaign bundles require model/validation/export or recovery decisions as listed above. Simple recap templates, search/filter, and note drafts can use current note fields. No proposal requires a backend by itself. A remote backend becomes relevant only after a separate decision for cross-browser synchronization or shared online editing.

### Navigation and specification conflicts to resolve by preserving current behavior

| Risk | Roadmap rule |
| --- | --- |
| Turning each suggestion into a destination would crowd campaign navigation | Do not add Settings, Session, Character List, Objectives, or another sidebar destination. Place concepts inside existing screens or the global dice dialog. |
| Quick note controls could crowd the top bar or compete with dice and campaign context | Defer shell placement until the base journey is reviewed. Keep the character-sheet action and note composer inside their existing workflow first. |
| Reordering the Overview could bury the map, location/status editing, all-character gallery, recent notes, or empty-state actions | Retain each current module and its behavior; hierarchy changes only affect emphasis and order. Keep location/status editing in Overview and party setup in Party. |
| Reorganizing the sheet could hide import, export, portrait, HP, or read-only controls | Keep the five current tabs, direct HP behavior, explicit save/cancel draft, owner-only controls, JSON/Markdown export, portrait flow, and review-before-save import. Do not add parsing or rules automation. |
| `docs/DESIGN.md` has one review sentence referring to “four sheet tabs,” while the current app and blueprint define five | Keep all five: Overview, Skills & saves, Gear & features, Notes, and Spells. Treat the singular “four” reference as a documentation inconsistency, not a proposal to remove a tab. |
| A dice dialog launched from any route could lose campaign or character context | Preserve the hash route and active campaign on open, close, Escape, and return focus to the trigger. Keep rolls and history client-side and session-only. |
| Responsive redesign could hide roster values or introduce page overflow | Preserve HP/AC visibility, touch-sized actions, campaign context, and page-width containment at phone and tablet widths. Only the sheet tab row may scroll horizontally. |
| Demo ownership may be mistaken for security | Retain visible owner/read-only wording and absent edit/delete controls for another demo user's character. Do not imply authentication or data protection. |

## 2. Ordered implementation sequence

Each phase ends with a visual review and the stated regression checks before the next phase begins. The first four phases complete the prioritized connected journey. The remaining current screens and then mock-only concepts follow after that path is visually validated.

### Phase 1 — Establish the campaign entry path (first UI development phase)

**Screens and components:** Shared shell and top bar in `App.tsx`; Campaign Library; Campaign Overview; their existing heading, action, empty-state, and feedback patterns.

**Visual changes:** Align title/context hierarchy and primary actions. Keep campaign rows focused on name and description with distinct open, Edit, and Delete targets. On Overview, lead with campaign identity and party/location/status, then retain shortcuts, character gallery, map, and recent notes as clear sections. Improve empty-state wording and action placement without adding cards or changing the visual tokens.

**Interactions to demonstrate:** Sign in using either existing demo user; create/open/edit/cancel/delete a campaign; open Overview; use Overview shortcuts to My Character, Party, and Campaign notes; return to the library; edit location/status; add, replace, zoom/pan/reset, or remove the campaign map. Dice remains reachable from both library and campaign context.

**Must remain operational:** Campaign CRUD and delete confirmation; campaign isolation and campaign context in the URL; location/status editing only in Overview; party name/membership only in Party; all-character ownership/read-only labels; map local storage and error handling; recent campaign notes; global dice; draft-loss protection.

**Mock data:** Use actual saved campaigns for the live screen. For empty, full, long-name, or error examples that cannot safely be created in the review account, use fixture-only data in a non-persistent preview. Do not seed or save example campaigns into user records.

**Desktop acceptance:** At 1,440 px, the campaign index remains 244 px, active campaign context is visible, row actions do not overlap the open target, and Overview sections read in the recommended order. Campaign shortcuts reach the correct existing destinations.

**Mobile acceptance:** At 375 px, no page-level horizontal overflow; campaign name/description and separate actions wrap cleanly; menu opens and closes after navigation; active campaign remains clear; Overview details stack before the gallery/map; character HP and AC remain legible; touch controls are at least 40 px where practical. Recheck at 768 px for tablet layout and at the existing ~1,050 px menu breakpoint.

**Completion and verification:** Review populated and empty states at 375, 768, and 1,440 px. Walk library → Overview → My Character and back; verify campaign CRUD, map controls, Overview shortcuts, storage/error feedback, navigation guard, and unchanged dice route. Record visual approval before Phase 2. Do not proceed automatically.

### Phase 2 — Clarify My Character selection and entry workflows

**Screens and components:** My Character workspace, character selector, create-character entry, JSON paste/upload import section, Markdown conversion guide, import-review sheet entry and return paths.

**Visual changes:** Make current campaign, selected character, Create character, and import actions easy to identify. Clarify selected character owner/read-only status. Keep import paste primary and upload available, with review-before-save and conversion guidance visible without making this workspace a separate navigation destination.

**Interactions to demonstrate:** Select an owned or another player's character; start and cancel manual creation; paste JSON or choose a JSON file; review the imported fields; cancel without saving or confirm save through the existing character service; open/copy the Markdown conversion guide; export a saved character in JSON or Markdown.

**Must remain operational:** Character selection remembered per campaign; multiple characters; all campaign characters visible; owner assigned from active demo user rather than imported owner data; no automatic party membership; importer validation, 1 MB file limit, review before persistence, import cancellation, export limits, and read-only behavior.

**Mock data:** Use existing character records in the active campaign. Invalid, empty, long-name, and other-owner states may use isolated fixture data. Imported samples must remain drafts until the existing explicit save action succeeds; visual test data must not enter the user's LocalStorage.

**Desktop acceptance:** Selection and create/import controls are clear before the sheet; the import review state is visually distinct from a saved character; format guide remains readable and copy feedback visible; ownership is conveyed in text.

**Mobile acceptance:** At 375 px, selector/actions stack without clipping; paste area and upload control remain usable; review/cancel/save controls remain reachable; long character names wrap; no horizontal overflow. Recheck 768 px and keyboard focus order.

**Completion and verification:** Walk selection, manual creation/cancel, JSON paste review/cancel/save, JSON upload review, conversion-guide copy, and both exports. Verify that cancel does not persist, imported ownership is ignored, selected campaign and character remain correct, and read-only characters expose no mutation controls. Review at 375, 768, and 1,440 px before Phase 3.

### Phase 3 — Refine the live character sheet for table use

**Screens and components:** CharacterSheetPreview and its identity header, combat band, five sheet tabs, portrait crop dialog, edit controls, status/error feedback.

**Visual changes:** Make identity and ownership/read-only state clear above the sheet controls. Keep HP, AC, initiative, speed, and proficiency near the top. In Overview, emphasize the six ability scores/modifiers and attacks. Keep aligned, manually editable rows for skills/saves, inventory/currency/features, narrative notes, and grouped structured spells. Preserve the continuous paper-sheet surface and avoid dense floating cards.

**Interactions to demonstrate:** Direct quick HP edit; full edit/save/cancel; tab switching by pointer and keyboard; inventory, currency, skill/save/attack, feature, and spell edits; portrait add/crop/remove; confirmed delete for owner; inspect but do not edit/delete another player's sheet; navigate away from a dirty draft and cancel the leave prompt.

**Must remain operational:** Five tab groups; manually adjustable values and homebrew content; ability modifier display rules; no rules engine; HP validation; structured spell details; portrait restrictions and export omission; save/cancel and unsaved-change guard; owner-only edit/delete/quick HP; read-only sheets remain visible.

**Mock data:** Use actual saved sheets for live interactions. Use isolated fixtures for sparse, populated, read-only, long-content, and large-inventory visual states. Never use a fixture as a saved application character.

**Desktop acceptance:** At 1,440 px, combat band is immediately scannable, Overview shows key stats and attacks without excessive scrolling, details use two columns where suitable, and edit/read-only states are unmistakable.

**Mobile acceptance:** At 375 px, HP receives a full row; abilities wrap two rows of three; sections stack below roughly 760 px; tab labels scroll within their own row; spells stack key facts; content and controls do not create page-level horizontal overflow. At 768 px, confirm intermediate columns do not become cramped.

**Completion and verification:** Verify owner and read-only variants, all five tabs, quick HP valid/invalid inputs, full save/cancel, draft-loss protection, portrait flow, spell disclosure keyboard operation, export omission of portrait, and character delete confirmation. Review 375, 768, and 1,440 px before Phase 4.

### Phase 4 — Complete the sheet-to-dice return loop

**Screens and components:** Global top-bar dice trigger, native Dice Roller dialog, character sheet combat/attack display, dialog focus and close behavior.

**Visual changes:** Keep die selection, count/modifier, expression, Roll action, dominant latest total, individual results, and recent history in that reading order. Keep the dialog within the viewport and make close/roll targets touch-friendly. A later mock may preview suggested roll choices, but this phase keeps the existing manual dice controls only.

**Interactions to demonstrate:** From a selected sheet, open dice; choose d4/d6/d8/d10/d12/d20/d100; enter multiple dice and positive/negative modifiers; roll; inspect results/history; close by button, Escape, or backdrop; return to the same sheet, campaign, and scroll context where supported.

**Must remain operational:** Existing dice validation and client-side randomization; correct individual faces/totals; session-only newest-first history capped at ten; opening dice from any signed-in route; no persisted roll history; focus returns to the dice trigger; campaign and character routes stay unchanged.

**Mock data:** No character mock data is needed for manual rolls. Use fixed visual-only result snapshots for layout examples if needed; do not represent them as actual random rolls or store them as history.

**Desktop acceptance:** At 1,440 px, dialog controls and results are readable without covering critical route context; latest result is prominent; focus returns to the opener.

**Mobile acceptance:** At 375 px, dialog stays within viewport with internal scrolling if needed, all dice and close controls are usable, result/history do not overflow, and no page-level horizontal scroll is introduced. Recheck at 768 px.

**Completion and verification:** Complete the full priority journey from Campaign Library through Overview, My Character, the selected sheet, Dice Roller, and return. Confirm URL hash, selected campaign/character, focus handling, all die sizes, count/modifier errors, and session-history behavior. Review at 375, 768, and 1,440 px before marking the primary journey visually reviewed.

### Phase 5 — Align Party, Campaign notes, and sign-in support screens

**Screens and components:** PartyWorkspace; CampaignJournal; Sign in; Overview's roster/recent-note links and related empty/error states.

**Visual changes:** Party heading, member count, separate member/outside-party lists, owner-controlled membership actions, and a clear My Character link. Journal index and selected note hierarchy, readable content, full-width phone editor, and return-to-index path. Sign-in remains a focused short form. Keep all as existing destinations/workflows.

**Interactions to demonstrate:** Create/rename party; add/remove only an owned character; open member sheets; browse/create/edit/delete notes; confirm deletion; preserve dirty note draft when navigation is canceled; use current sign-in validation and sign-out.

**Must remain operational:** Single party per campaign; membership separate from campaign characters; owner-only membership; campaign-scoped notes; note categories and recent ordering; save/cancel and deletion confirmation; sign-in/logout session behavior; no real authentication claims.

**Mock data:** Use active campaign records. Empty party, mixed ownership, long roster, empty journal, long note, and validation states may use isolated fixture data only.

**Desktop acceptance:** At 1,440 px, Party and journal lists remain scannable; selected note has readable line length; membership and note actions are distinct; sign-in sheet stays focused.

**Mobile acceptance:** At 375 px, roster identity and HP/AC can wrap to separate lines; membership targets remain reachable; journal index precedes the selected note and offers a clear return; editor fields and save/cancel controls use available width without horizontal page scroll.

**Completion and verification:** Check both demo users, member/outside-party lists, campaign isolation, note create/edit/cancel/delete, dirty-draft protection, sign-in errors, sign-out, and responsive layout at 375, 768, and 1,440 px.

### Phase 6 — Review isolated mock prototypes for selected expansions

This phase follows review of the core journey and existing MVP screens. Each concept is a standalone review slice inside an existing destination. If a visual harness is needed, keep it out of production routes and persistence. Clearly label fixtures as sample content. Select concepts individually; do not build the whole expansion set as one phase.

#### 6A. Quick table actions (P1)

- **Screens/components:** Existing character combat band and Dice Roller.
- **Visual change and demonstration:** Show a compact strip of player-entered attack/check labels and optional suggested rolls; keep manual dice entry available.
- **Preserve:** Attacks and modifiers stay manually authored; no inferred proficiency or game rules; no new destination.
- **Mock data:** Isolated character/roll-choice fixture. Show populated, empty, and read-only sheets.
- **Acceptance:** Desktop strip is compact and adjacent to combat values. On mobile it wraps without pushing HP below the first screen or creating page overflow. Read-only variant has no write controls.
- **Later boundary:** Functional prefill can use explicit sheet values; saved presets would need an agreed preference model. No backend.
- **Completion:** Review the fixture interactions, routing, return focus, and desktop/mobile states before deciding whether to implement live prefill.

#### 6B. Quick note capture and Session recap template (P1)

- **Screens/components:** Character sheet action and existing CampaignJournal composer.
- **Visual change and demonstration:** Prototype a note draft entry point retaining active campaign context, plus a “Session recap” choice that pre-fills prompts for events, discoveries, unresolved questions, and next steps.
- **Preserve:** Save as an ordinary campaign note only after explicit confirmation; keep journal as the destination and keep unsaved-state warning.
- **Mock data:** Fixture campaign and sample recap text, isolated from saved notes.
- **Acceptance:** Desktop and mobile layouts make destination, campaign, save/cancel, and unsaved state clear; phone editor remains full width.
- **Later boundary:** Existing note fields support the simple recap. Functional quick capture requires wiring to the note service; no backend or new entity is needed.
- **Completion:** Review create/cancel/save preview, campaign context, and return path at 375, 768, and 1,440 px.

#### 6C. Journal search and category filters (P2)

- **Screens/components:** CampaignJournal index controls and no-match state.
- **Visual change and demonstration:** Search note titles/content and filter by category with a one-action clear state.
- **Preserve:** Search remains campaign-scoped and does not change saved note contents or order.
- **Mock data:** Fixture notes across several categories, plus no-match and empty-journal examples.
- **Acceptance:** Controls fit above the list on desktop and stack on mobile; note content remains readable; no page overflow.
- **Later boundary:** Existing note fields are enough for client-side filtering; no backend or schema change.
- **Completion:** Review matching, category-only, combined, clear, and no-match states before live implementation is considered.

#### 6D. Manual resource/condition trackers and player-entered objectives (P2)

- **Screens/components:** Optional tracker section in the existing sheet/Overview; objective summary on Overview with editing inside Campaign notes.
- **Visual change and demonstration:** Show user-labeled counters/markers with increment, decrement, and reset examples; show objective open/completed examples in the player's own words.
- **Preserve:** No class automation, tactical roles, DM-provided claims, or separate Session/Objectives destination. Label all content player-maintained.
- **Mock data:** Isolated sample counters and objectives showing empty, active, depleted, and completed states.
- **Acceptance:** Desktop and mobile examples expose labels and state text without relying on color; controls remain reachable and do not crowd core HP/AC or campaign summary.
- **Later boundary:** Trackers need character fields plus validation, migration, and character export changes. Objectives are clearer as a dedicated local model. Neither requires a backend by default.
- **Completion:** Review empty/populated/edit/reset/complete states and agree on field ownership and export behavior before any persistence work.

#### 6E. Campaign backup/restore concept (P3)

- **Screens/components:** Review/confirmation subflow launched from Campaign Library or Overview, not a permanent navigation destination.
- **Visual change and demonstration:** Show a versioned campaign bundle export, pre-restore summary, conflict/error explanation, and explicit confirmation.
- **Preserve:** Do not overwrite live records in a mock; do not suggest that existing character JSON import is campaign backup.
- **Mock data:** An isolated bundle fixture with preview-only campaign/character/note counts and a simulated conflict.
- **Acceptance:** Desktop and mobile review steps identify target campaign and consequences before a user would confirm; all controls remain within viewport.
- **Later boundary:** Requires a versioned bundle format and conflict/recovery semantics. File-based backup needs no backend; synchronization is a separate product decision.
- **Completion:** Review the simulated flow and document bundle/conflict decisions before implementation planning.

## 3. Cross-phase regression checklist

Run these checks against the real application data after each phase that touches the corresponding area. Keep dedicated fixture previews separate from the real-data pass.

- Sign in and sign out with both fixed demo users; retain the local-data notice and storage-failure handling.
- Create, open, edit, cancel, and confirm-delete campaigns; verify unrelated campaigns and records stay intact.
- Confirm campaign context and correct destination after navigation, direct hash load, refresh, and mobile-menu selection.
- Keep party name creation in Party and location/status editing in Overview; verify party membership remains separate from campaign characters.
- Verify each character belongs to one campaign and owner; all campaign sheets remain visible; another user's sheet is read-only and has no edit, quick-HP, party membership, or delete controls.
- Create, edit, and delete a character; verify HP validation, full draft save/cancel, unsaved-change protection, and character deletion confirmation.
- Paste/upload character JSON, review before saving, cancel import without persistence, ignore imported ownership, retain the 1 MB limit, and verify JSON/Markdown exports and portrait omission.
- Retain all five tabs, manual skill/save/attack values, structured spells, inventory/currency, and homebrew descriptions.
- Create/edit/delete campaign notes; keep notes campaign-scoped, preserve recent-note links, and retain unsaved drafts when navigation is canceled.
- Roll each supported die with multiple dice and modifiers; inspect faces, total, and session-only history; close by button/Escape/backdrop and restore focus without changing route or campaign.
- Test empty, populated, validation-error, read-only, long-content, and storage-error states as appropriate.
- At 375 px, 768 px, and 1,440 px, confirm no page-level horizontal overflow, visible essential controls, legible values, and contained tab scrolling. Add keyboard and focus checks for changed controls; full screen-reader and physical-device testing remain open until performed.

At the end of each implementation phase, review the relevant existing feature tests, run the applicable project build/format checks, and perform the browser acceptance steps above. Do not report a mock-only interaction as persistent or implemented behavior.

## 4. UI-only and future implementation boundary

The first five phases refine and visually validate current screens and current local behavior. They do not require backend work, new persisted fields, new destinations, or fake records in live storage. Existing LocalStorage services remain the source of truth for live campaign, character, and note interactions.

Phase 6 is a visual research track. Mock interactions stay isolated and are labeled as demonstrations. A concept advances to functional work only after separate selection and scope approval. Recap templates, note search/filter, and basic quick-note capture can likely use the current local note model. Quick roll suggestions use only entered character values. Trackers and objectives require explicit local schema, validation, migration, and export decisions. Campaign backup requires its own versioned bundle and recovery rules. None of these implies a backend; cross-browser synchronization or shared online editing requires a separate product and security decision.

No implementation is authorized by this roadmap alone. Stop after each phase for visual review and an explicit instruction before starting the next phase.
