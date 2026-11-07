# The Goober's Guide: UI/UX Blueprint

**Phase:** Information Architecture and UI Expansion Planning  
**Audience:** Product and implementation team  
**Status:** Planning reference; proposals below do not describe shipped behavior

## Purpose and evidence

This blueprint describes the player-facing application using the current repository as its baseline. `docs/PRODUCT.md` describes the product experience, `docs/MVP_SCOPE.md` defines required behavior and exclusions, and `docs/DESIGN.md` sets the visual system. `docs/MVP_VERIFICATION.md` records the tested MVP paths and their limits. The recommendations preserve working MVP behavior and label proposed UI and future functionality separately.

The current MVP is ready for local use in the tested browser. The verification record found no blocking required-flow defects and confirmed responsive behavior at phone, tablet, and desktop widths. Full screen-reader testing and physical-device testing remain open. The audit also records fixes already made for draft-loss warnings, phone roster HP/AC visibility, invalid quick-HP edits, and blocked browser storage; these are current protections, not roadmap items.

The application is a player-maintained companion. It does not read a DM's private campaign material or infer hidden information. LocalStorage and the two demo sign-ins demonstrate local persistence and ownership flows; they are not secure shared storage or authentication.

## Adventures direction and current baseline (November 7, 2026)

[PRODUCT.md](PRODUCT.md) is the canonical v0.2 target. [MVP_SCOPE.md](MVP_SCOPE.md) remains the existing local runtime contract. The existing app still has Library, Overview, Party, My Character, Notes, and global Dice; it has no live Adventures destination. The Overview map UI is dormant, while its stored data and supporting code remain intact. Older map walkthrough instructions below are historical requirements, not evidence of current rendering.

The proposed campaign navigation adds Adventures, connecting characters, party context, and player-maintained objectives. Notes remain optional support. Invitations, unanimous consent, and party sharing are target workflows, not existing secure capabilities. A1 exposes only Adventures capture/detail/return inside a separate synthetic preview. It does not change live navigation, persistence, or the MVP contract.

## 1. Existing local information architecture

```text
The Goober's Guide
├── Sign in (signed-out entry)
├── Campaign library
│   ├── Create campaign (inline form)
│   ├── Edit campaign (inline form)
│   └── Selected campaign workspace
│       ├── Overview
│       ├── Party
│       ├── My Character
│       │   ├── Character selector / create / import
│       │   └── Selected character sheet
│       │       ├── Overview
│       │       ├── Skills & saves
│       │       ├── Gear & features
│       │       ├── Notes
│       │       └── Spells
│       └── Campaign notes
│           ├── Journal index
│           └── Selected, new, or edited note
└── Global utility: Dice roller dialog (available from every signed-in view)
```

The shared shell provides the campaign library link, active-campaign context, campaign navigation, signed-in demo-player identity, sign-out, and the global dice entry. Campaign creation and editing remain actions in the library; party creation and renaming remain in Party; current location and status remain in Overview. Character selection, import, and editing are parts of My Character. Note selection and editing are parts of Campaign notes. These are workflows within existing destinations, not new navigation items.

For the existing local baseline, no separate Settings, Session, or Character List destination is proposed. The target Adventures destination described above is preview-only during A1. During-session actions should be placed in My Character, Overview, Campaign notes, and the global dice dialog. The dice dialog closes back to the same route and campaign context.

## 2. Shared design and interaction rules

Retain the established field-ledger identity: forest navigation and combat emphasis, paper reading surfaces, muted ground, thin rules, aligned rows, serif display headings, and sans-serif interface text. Keep the current color tokens, sentence case, compact page headers, readable line lengths, and restrained use of brass accents described in `docs/DESIGN.md`. Avoid parchment textures, decorative runes, excessive cards, or any treatment that reduces at-the-table readability.

Standardize these patterns before adding screens or expanding content:

| Pattern                       | Convention to use                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Application shell             | Persistent campaign context, current-page indication, library return path, mobile menu, signed-in identity, and global dice trigger. |
| Page and section headings     | Consistent title, optional campaign breadcrumb/context, short helper text, and one primary action.                                   |
| Buttons and forms             | Forest primary action, outlined quiet action, persistent labels, visible focus, inline field errors, and save feedback.              |
| Ledger rows and stat groups   | Thin dividers, aligned values, explicit labels and units, and no reliance on color alone.                                            |
| Empty and error states        | Explain what is missing or what failed, then give one useful next action.                                                            |
| Tabs and disclosures          | Short labels, keyboard operation, visible active state, and contained horizontal scrolling on phones.                                |
| Dialogs and overlays          | Clear title and close action, Escape support, focus return, and usable touch targets.                                                |
| Ownership and read-only state | Text label and absent edit controls; never use color alone to communicate ownership.                                                 |

The latest browser checks found no page-level horizontal overflow at 375, 768, or 1,440 px in reviewed screens. Keep the current responsive behavior: sidebar becomes an overlay below about 1,050 px, sheet sections stack below about 760 px, and sheet tabs scroll within their own row. Treat full screen-reader and physical-device checks as validation work for the future prototype, not as completed audit evidence.

## 3. Screen-by-screen specification

### 3.1 Sign in

- **Current:** Focused paper sign-in sheet on a forest background. It displays the two fixed demo credentials, username and password fields, validation feedback, and a notice that sign-in does not secure or encrypt browser data.
- **Recommended hierarchy:** Brand and purpose; labeled credentials; primary sign-in action; demo-account reference; local-data notice. Keep this as a short entry gate, not a marketing page.
- **Retain:** The focused form, visible demo credentials, password masking, clear invalid-credential message, and honest local-data notice.
- **Proposed additions:** No new content is needed for the prototype. Keep storage failure feedback adjacent to the form and explain that the browser cannot save or read data when the repository reports that state.
- **Actions:** Sign in with either fixed demo user; correct invalid credentials; continue to Campaign library. Registration and account recovery are out of scope.
- **States:** Empty credentials rely on required fields. Invalid sign-in shows a form error. Storage failure shows a blocking notice. There is no asynchronous loading state in the current local flow. Character read-only state does not apply.
- **Responsive:** Keep a single narrow form column, full-width primary action, readable demo details, and no horizontal scrolling on phones. Center the sheet on wider displays.

### 3.2 Shared application shell

- **Current:** Desktop has a 244 px campaign index with Campaign library and, when a campaign is active, Overview, Party, My Character, and Campaign notes. The top bar shows campaign context, demo-player identity, sign-out, and Dice roller. At narrower widths the sidebar becomes a menu overlay.
- **Recommended hierarchy:** Keep campaign identity at the top of the index and in the top bar. Keep the campaign library reachable at all times. On mobile, make the menu clearly show which campaign is active and close after destination selection. Keep global dice independent from the current route.
- **Retain:** Current destination names, active-campaign label, current-page indication, mobile overlay behavior, sign-out, storage warning, and global dice trigger.
- **Proposed additions:** No new top-level destinations. When a campaign is active, a future prototype may give the top bar a compact “quick note” action, provided it opens the existing Campaign notes workflow and does not obscure dice or campaign context.
- **Actions:** Navigate among existing destinations, return to Campaign library, open/close the mobile menu, open Dice roller, and sign out.
- **States:** Signed-out users see Sign in instead of the shell. Invalid or missing campaign context returns to the library. A storage warning appears above page content. No loading state is needed for synchronous local routing. Read-only status is communicated inside character views rather than by changing shell navigation.
- **Responsive:** Preserve the fixed desktop index and overlay menu below the existing breakpoint. Keep the campaign name visible in the compact phone header and ensure account controls do not crowd out the dice action.

### 3.3 Campaign library

- **Current:** One row per campaign shows its name and description, opens the campaign on selection, and exposes Edit and Delete actions. Create and edit use an inline form with campaign name and description. Delete is confirmed. The empty state offers campaign creation.
- **Recommended hierarchy:** Page title and short instruction; primary Create campaign action; campaign list; each campaign row's name and description as the main target, with secondary Edit and Delete actions. Keep rows focused on those two campaign fields.
- **Retain:** Full-row campaign entry, name/description-only records, inline create/edit, confirmation before deletion, and clear empty state.
- **Proposed additions:** Add subtle campaign context only if it can be derived from existing records (for example, character and note counts); do not add party name, location, or status to the library row. These optional summaries are secondary to opening the campaign.
- **Actions:** Create, open, edit, cancel an edit, and confirm or cancel campaign deletion.
- **States:** Empty library directs the player to create the first campaign. Validation and storage errors stay near the form. A save shows completion feedback. Data is read synchronously, so there is no current loading state. Campaigns are shared between demo users in this local prototype; ownership does not make a campaign read-only.
- **Responsive:** Keep each row's open target and Edit/Delete controls distinct. Stack description and controls under the campaign name on narrow screens; never place destructive action inside the open link target.

### 3.4 Campaign overview

- **Current:** Shows campaign name and description; party, current location, and status; edit controls for location/status; dormant map support without a rendered map; a gallery of all campaign characters with identity, ownership, party status, HP, and AC; recent notes; shortcuts to My Character, Party, and Campaign library.
- **Recommended hierarchy:** Campaign title and description; compact campaign context (party/location/status); top-level actions to open My Character, Party, and Campaign notes; character gallery; map and recent notes as reference sections. Preserve a useful empty campaign overview instead of presenting blank modules.
- **Retain:** Campaign-scoped summaries, clear party setup link, all-character gallery, party membership and owner labels, recent notes, editable location/status, local map preview, and existing shortcuts.
- **Proposed additions:** Surface a short “recently used” character shortcut using existing character records. A later mock prototype may show player-entered objectives beside recent notes, but it must identify them as player-maintained and should not imply DM-provided facts.
- **Actions:** Edit location/status, create party, open a character, open My Character, open Party, view/create notes, add/replace/remove a map, and return to the library.
- **States:** Empty party, character gallery, notes, and map sections each explain the missing item and offer one relevant action. Map processing shows progress; invalid file, image-load, and save errors explain recovery. Campaign detail form errors and save feedback remain local to that section. There is no whole-page loading state. Character cards indicate owner/read-only status.
- **Responsive:** Keep the campaign summary readable before the gallery. Stack campaign details and map at phone/tablet widths; use a single-column character gallery as space narrows. Keep HP/AC values visible and do not shrink them into unreadable card footers.

### 3.5 Party

- **Current:** Allows creation or renaming of one party in the campaign. Shows party members separately from campaign characters outside the party. Rows link to character sheets and show identity, owner, HP, and AC. Only the current character owner sees Add to party or Remove controls. Characters are not created on this screen.
- **Recommended hierarchy:** Party name and member count; roster; “Characters outside the party” list; an explicit link to My Character for creation or editing. Keep party membership mechanics visible without suggesting the party owns a character.
- **Retain:** Single party per campaign, member/outside-party distinction, owner-controlled membership, read-only labels, and character sheet links.
- **Proposed additions:** In a mock-data prototype, allow a simple role-free reordering preview for the roster only if it does not change party membership semantics. Do not introduce tactical roles or a rules-driven formation.
- **Actions:** Create/rename party, open a member sheet, add or remove an owned character, and navigate to My Character to create one.
- **States:** No-party state leads to Create party. Empty roster points to characters outside the party or My Character. No available characters explains that characters can be created in My Character. Other players' characters remain visible but their membership controls are absent. Name validation, storage errors, and save feedback appear in context. No loading state is needed for local synchronous data.
- **Responsive:** Keep member and available-character lists scannable. Let identity and combat summary wrap to separate lines on phones, with membership actions remaining reachable and at least 40 px tall where practical.

### 3.6 My Character and character sheet

- **Current workspace:** Shows campaign name, My Character heading, a character selector containing every character in the campaign with owner/read-only labels, Create character, JSON import, and a Markdown conversion guide. Import is reviewed in an editable sheet before saving. Saved characters can be exported as JSON or Markdown. One character selection is remembered per campaign.
- **Current sheet:** The top region shows identity and edit controls, a combat band with HP, AC, initiative, speed, and proficiency, then five in-page tabs: Overview, Skills & saves, Gear & features, Notes, and Spells. Owners can edit and delete; other players' sheets are visible read-only. HP can be changed from the combat band, while broader changes use an explicit edit/save/cancel draft.
- **Recommended hierarchy:** Keep the selected character and Create character actions visible first. Keep the identity and combat band above tabs. In the Overview tab, prioritize ability scores/modifiers and attacks alongside key identity details. Put lower-frequency detail in the existing tabs. Make the owner/read-only state prominent before the sheet actions.
- **Retain:** Five tab groups, manually adjustable values and homebrew content, selected-character persistence, explicit draft save/cancel, direct HP adjustment, import review, export, portrait support, and read-only sheets for other users.
- **Proposed additions:** Prototype an in-place “table actions” strip in the combat band for commonly used values and a quick note entry point that opens Campaign notes. Keep these as UI concepts until the data flow is designed. Do not add automated character-sheet parsing or a rules engine.

| Sheet section   | Current information                                                           | Recommended emphasis                                                                                |
| --------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Overview        | Identity, combat values, ability scores and modifiers, attacks.               | Put frequently checked combat and ability information first; keep attack bonuses manually entered.  |
| Skills & saves  | Skill and saving throw values with proficiency states.                        | Keep compact aligned rows and make manual values and proficiency states explicit.                   |
| Gear & features | Inventory quantities, currency, and custom feature descriptions.              | Keep inventory and currency quick to scan; avoid hiding quantities or edit controls in dense cards. |
| Notes           | Background, character description, and freeform character notes.              | Keep narrative material distinct from campaign journal notes and preserve readable line lengths.    |
| Spells          | Structured, manually editable spells grouped by level with expandable detail. | Preserve readable summaries, expanded details, and prepared/concentration/ritual states.            |

- **Actions:** Select/create/import/export, edit/save/cancel, update HP, switch sheet tabs, manage gameplay values, delete an owned character, and return to the workspace after canceling creation/import. Other users may inspect but not change or delete a sheet.
- **States:** No-character state offers manual creation or import. Invalid import remains in review with an actionable error. A missing character route offers a return link. Unsaved changes warn before navigation and preserve the draft when canceled. Storage errors are reported globally. Other-owner sheets show read-only status and no write controls. There is no async sheet-loading state in the current local model.
- **Responsive:** Keep the current combat band near the top, give HP a full row on phones, wrap abilities into two rows of three, stack sheet sections below 760 px, and allow tabs to scroll within their row. Avoid page-level horizontal scrolling. On desktop use two-column detail sections and the continuous paper-sheet surface.

### 3.7 Campaign notes

- **Current:** A campaign-scoped journal combines an entry index and selected-note reading/editing area. Entries show category, title, content excerpt, and updated time. A note has title, category, and freeform content; create/edit saves locally, delete is confirmed, and unsaved edits are guarded. Recent notes also appear on Overview.
- **Recommended hierarchy:** Campaign context and Create note action; journal index; selected note with title/category/date and readable content; edit/delete actions. On phones, show the index first and make the selected note view easy to return from.
- **Retain:** Campaign isolation, recent-note ordering, category labels, readable note content, explicit save/cancel, and delete confirmation.
- **Proposed additions:** Add client-side title/content search and category filters when the notes list grows. Add a “Session recap” template inside the existing note composer, pre-filling a title and prompts while saving as an ordinary note. These additions do not create a new destination.
- **Actions:** Browse, create, read, edit, categorize, search/filter when implemented, save/cancel, delete, and follow links to recent notes from Overview.
- **States:** Empty journal offers Create note. No selected note prompts selection or creation. A stale or wrong-campaign note route shows “Note not found” with a create/return action. Missing title/content and storage errors show in the editor. An unsaved draft prompts before route change. No loading state is needed for local synchronous data. Campaign notes are shared between demo users in the local prototype.
- **Responsive:** Keep the journal index and note readable at narrow widths by stacking the columns. Do not force the note body into a narrow split pane on a phone. Preserve full-width editor fields and usable save/cancel controls.

### 3.8 Global dice roller

- **Current:** A top-bar trigger opens a native dialog from any signed-in campaign view. It supports d4, d6, d8, d10, d12, d20, and d100; count and modifier entry; an expression preview; individual results, total, and a newest-first history capped at ten for the current page session. It closes by button, Escape, or backdrop click and returns focus to its trigger.
- **Recommended hierarchy:** Die selection; count and modifier; expression preview; Roll action; latest result; recent history. Keep the roll result visually dominant and details immediately adjacent.
- **Retain:** Global access, standard dice, multiple dice, modifiers, individual results, total, session-only history, validation, focus handling, and campaign-context preservation.
- **Proposed additions:** In a mock prototype, show optional prefilled roll buttons from the selected character sheet (for example, a manually entered attack or check modifier). Any functional integration must remain based on player-entered values and general dice arithmetic, not rules inference.
- **Actions:** Select die/count/modifier, roll, inspect prior results, close, and return to the originating view.
- **States:** Before the first roll, explain how to start. Invalid values show a clear form error. A failed roll shows retry guidance. There is no loading state for local rolls. The utility is the same for all players and has no read-only variation.
- **Responsive:** Keep the dialog within the viewport with scrollable content when needed. Make die buttons and close action touch-friendly; preserve visibility of the latest result and do not create page-level horizontal overflow.

## 4. Player workflows and friction

### Before a session

1. Open Campaign library and select the campaign.
2. Review Overview for campaign location/status, map, party context, character gallery, and recent notes.
3. Open Party to scan the roster and identify characters outside the party.
4. Open My Character to review the selected character's combat values, abilities, attacks, inventory, features, spells, and notes.
5. Review Campaign notes for player-recorded discoveries, quests, locations, and prior session notes.

**Current friction:** Party, sheet inventory, and full notes live in different destinations or tabs. The overview already provides shortcuts and recent notes, but a player preparing several characters must move between the gallery, party list, and sheets. Keep those destinations, but make links from summaries direct and consider a compact “return to last character” shortcut that uses the existing selection preference.

### During a session

1. Open My Character and keep the Overview tab's combat values in view.
2. Use the dice dialog without leaving the current campaign or character route.
3. Move to Gear & features or Spells when checking equipment, currency, features, or spell details.
4. Use Campaign notes to record what the group learned.

**Current friction:** Moving between the sheet, inventory/spells tabs, and journal costs navigation and tab changes. HP is quick to update, while other class resources or condition markers are not represented as dedicated trackers. Proposed quick table actions should sit within the existing sheet and dice dialog; proposed quick note capture should open the existing Campaign notes workflow. Do not add a Session destination.

### After a session

1. Update character identity, level, combat values, inventory, features, and spells in My Character.
2. Save a session recap in Campaign notes using the proposed template.
3. Update campaign location/status in Overview and party membership in Party when the player-managed records have changed.
4. Use the campaign library to switch to another campaign or create one.

**Current friction:** Generic note creation gives no recap structure, and character progression has no change history. Provide a recap template in the existing journal. Treat progression history as a later, separate capability that requires a data model; do not imply that a level-up engine is included.

## 5. UI expansion opportunities

Priority is relative: **P1** supports immediate table use; **P2** improves organization; **P3** is a later convenience. “Backend” means a remote service; the current product is local-first and none of these recommendations requires one by default.

| Priority / effort                                              | Player problem and placement                                                                                                                                                                                  | Interaction                                                                                                                                     | Mock-data prototype?                                      | Later data or backend need                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1 — Low effort: Quick table actions**                       | Players must cross the sheet to use common combat values. Place a compact action strip in My Character's existing combat band and connect it visually to the global Dice roller.                              | Show player-entered attacks/checks as prefilled roll choices; retain direct manual dice controls.                                               | Yes; fixtures can demonstrate states and result feedback. | Basic dice prefill can use current character values and dice utility; richer saved roll presets may need a small character preference structure. No backend. No rules engine. |
| **P1 — Low effort: Session recap template**                    | Players need a prompt to capture events after play. Place it inside the Campaign notes create flow.                                                                                                           | Choose “Session recap” to prefill a title and prompts such as events, discoveries, unresolved questions, and next steps; save as a normal note. | Yes; demonstrate with sample note data.                   | Existing note fields can hold the template output; no new entity or backend required unless structured dates/sections are later needed.                                       |
| **P1 — Medium effort: Quick note capture**                     | Leaving the sheet interrupts play when recording a detail. Place an action in My Character and optionally the shell, opening the existing note composer with campaign context retained.                       | Draft a note, then save into Campaign notes; make the destination and unsaved state clear.                                                      | Yes; prototype the composer and return path.              | Existing note model is sufficient for a simple title/category/content draft; persistence wiring is functional work. No backend.                                               |
| **P2 — Low effort: Journal search and filters**                | Long lists become harder to scan. Place controls above the Campaign notes index.                                                                                                                              | Filter by category and search note title/content; clear filters in one action.                                                                  | Yes; fixture notes show filtered and no-match states.     | Existing note fields suffice for client-side search/filter. No backend.                                                                                                       |
| **P2 — Medium effort: Manual resource and condition trackers** | Players need a visible place for hit dice, class resources, or conditions that currently live in freeform notes. Place compact user-configured counters/markers within the character combat band or Overview. | Add, label, increment/decrement, reset manually; no rules automation.                                                                           | Yes; show sample counters, depleted, and reset states.    | Requires new character-owned fields and validation in local storage/export formats. No backend unless later shared online.                                                    |
| **P2 — Medium effort: Player-known objectives**                | Groups want to scan their own open tasks without relying on a DM's private notes. Place a small optional section on Overview, with full editing in Campaign notes.                                            | Add an objective in the player's own words and mark it open/completed.                                                                          | Yes; mock statuses and empty states.                      | A dedicated objective record/status is clearer than overloading note text. Local data model only; no backend. Keep all content player-entered.                                |
| **P3 — Medium effort: Campaign backup and restore**            | Browser-only storage can be lost or isolated to one browser profile. Place import/export actions in Campaign library or a campaign's existing overview actions.                                               | Export one campaign's player-maintained records and restore them with a review step.                                                            | Yes; prototype confirmation and review screens.           | Requires a versioned campaign bundle and conflict/recovery behavior. No backend for file-based backup; sync would be a separate decision and is not proposed here.            |

Do not propose DM file access, hidden-information discovery, automatic session summaries, linked-note graphs, or a rules engine. Any future shared service would require a separate product and security decision; it is not implied by a mock UI or this roadmap.

## 6. UI-first prototype roadmap

### Stage 1 — Refine existing screens

- Preserve every required MVP flow and the current campaign-centered sitemap.
- Align page headings, primary actions, ownership labels, errors, save feedback, and empty states across the library, Overview, Party, My Character, Campaign notes, and Dice roller.
- Improve quick paths from the overview and party summaries into the correct character, note, or utility without adding destinations.
- Keep campaign name and campaign-scoped content visible during navigation; keep dice dismissal returning to the same route.
- Recheck mobile layout, keyboard use, and high-density sheet content. Include physical-device and full screen-reader review because those remain unverified.

### Stage 2 — Demonstrate new UI concepts with mock data

- Build a navigable prototype of quick table actions within the existing character sheet and Dice roller.
- Demonstrate quick note capture and the session recap template inside Campaign notes.
- If included in the prototype review, show optional manual resource/condition trackers and player-entered objectives using clearly marked fixture data.
- Provide empty, populated, read-only, validation-error, and narrow-screen examples for each concept. Do not write prototype fixture changes to the user's saved campaign data.

### Stage 3 — Implement selected capabilities later

- After the prototype is reviewed, choose which additions merit functional work.
- Prefer capabilities that fit the current local architecture first: recap templates, note search/filter, and quick note capture can build on existing note fields; campaign backup can use a versioned local file format.
- Add resource/condition and objective persistence only with explicit field ownership, validation, export compatibility, and migration decisions.
- Reassess backend need only if users explicitly require cross-browser sharing or synchronized group edits. Do not add DM data ingestion as a shortcut.

## 7. Blueprint acceptance checklist

- The existing local sitemap retains its library and campaign destinations, in-page sheet sections, and global dice dialog. Adventures is proposed separately in the synthetic preview.
- Every current screen and the shared shell has current behavior, recommended hierarchy, retained elements, proposed additions, actions, states, and desktop/mobile guidance.
- Sign-in and ownership are accurately described as local demo behavior, and other players' character sheets remain read-only.
- Before-, during-, and after-session workflows identify current friction and place improvements in existing destinations.
- Every expansion recommendation describes the player problem, placement, interaction, mock-data feasibility, local-data implications, backend need, priority, and effort.
- Existing MVP functionality is separated from mock concepts and later functional implementation.
- No proposal assumes access to private DM information or introduces an unapproved rules engine, sync service, or separate Session destination.
- Forest-and-paper styling, current typography, responsive behavior, and known verification limits remain explicit.
