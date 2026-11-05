# MVP verification and readiness

**Reviewed:** November 5, 2026

**Scope:** Required local MVP in [MVP_SCOPE.md](MVP_SCOPE.md)

**Result:** Ready for local MVP use in the tested browser, with the limitations below.

## Evidence and test environment

- **Browser:** Interactive test at `http://127.0.0.1:5175/`, a separate origin from the usual `localhost:5173` setup. It began with no saved campaigns. Test records were created only on that isolated origin.
- **Journey:** Created Journey to Asterholm / The Bad Company and Western Reach / The Wayfarers; created multiple characters and notes; edited campaign, character, inventory, HP, and note values; switched campaigns; refreshed; deleted a note, a character, and Western Reach. Journey to Asterholm and its remaining records survived the cascade deletion.
- **Responsive:** Inspected the library, overview, roster, My Character empty and saved states, sheet, structured spell reference, and journal at phone, tablet, and desktop widths. The dice panel was inspected at those widths. Document scroll width did not exceed the viewport's content width in the tested views. The five sheet tabs intentionally scroll within their own row on narrow screens.
- **Automated:** `npm test` passed 53 of 53 tests; `npm run build`, `npm run format:check`, and `git diff --check` passed. Tests use Vitest from the repository root.
- **Party follow-up:** On November 5, the campaign/party workflow was checked at a separate `http://127.0.0.1:4173/` origin. The library uses only campaign name and description; party creation, owner-only membership, and location/status editing were exercised. Player Two saw Player One's member read-only and an add action only for their own unassigned character. At a 375 px viewport, page scroll width matched the viewport; the party name form accepted keyboard focus, Tab, and Enter. Follow-up data is isolated to that test origin.
- **Methods:** “Browser” below means the interactive journey and accessibility tree inspection. “Tests” means Vitest. “Code” means direct inspection of the implementation. A Pass can rest on more than one method.

## Requirement-by-requirement acceptance checklist

### F01 — Campaign library

| Requirement and acceptance criterion                                                                                                         | Status | Evidence                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Display all saved campaigns; create and open multiple campaigns independently.                                                               | Pass   | Browser: both campaigns appeared and opened from the library.                                                                                                                                                |
| Edit campaign name and description in the library; create or rename its party inside the campaign; edit location and status in the overview. | Pass   | Follow-up browser: the library exposed only name and description; overview location/status remained intact after a campaign edit; party setup was available in the campaign. Tests cover field preservation. |
| Store unique IDs and creation and modification timestamps.                                                                                   | Pass   | Code and tests: campaign service creates IDs and timestamps and preserves creation time on update.                                                                                                           |
| Save changes locally and preserve campaigns after refresh.                                                                                   | Pass   | Browser refresh and repository round-trip tests.                                                                                                                                                             |
| Confirm campaign deletion and remove only its associated characters and notes.                                                               | Pass   | Browser: confirmation appeared; Western Reach was removed while Journey remained. Tests assert both cascade removal and preservation of the other campaign.                                                  |

### F02 — Campaign dashboard

| Requirement and acceptance criterion                                            | Status | Evidence                                                                                                   |
| ------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| Show selected campaign title, party, description, and optional location/status. | Pass   | Browser: Journey's edited values appeared on its overview.                                                 |
| Show party summaries, recent campaign notes, and shortcuts to main features.    | Pass   | Browser: Soren and Ceryn, the recent note, and links appeared. Tests check recent-note ordering and links. |
| Reflect campaign, character, and note changes in the selected campaign.         | Pass   | Browser: HP and campaign details updated on the overview; isolated second-campaign data did not appear.    |
| Show a useful empty state for a new campaign.                                   | Pass   | Browser: empty party and notes were explained with navigation to create records.                           |

### F03 — Party roster

| Requirement and acceptance criterion                                                                        | Status | Evidence                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep characters outside the party until their owner adds them; show only assigned characters in the roster. | Pass   | Follow-up browser: new characters appeared outside the party; each player saw only their own membership controls. Service tests reject another owner's changes and preserve characters after removal. |
| Show name, class, level, species, HP, and AC in each summary.                                               | Pass   | Browser and code: the values appeared; the phone layout now wraps HP and AC onto a visible line.                                                                                                      |
| Open the correct full sheet when a character is selected.                                                   | Pass   | Browser: selected Soren and Ceryn from the roster.                                                                                                                                                    |
| Reflect character edits and deletion in the roster.                                                         | Pass   | Browser: quick HP appeared in summaries and Ceryn was removed while Soren remained. Tests cover record-specific deletion.                                                                             |

### F04 — Character management

| Requirement and acceptance criterion                                                                                    | Status | Evidence                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create, view, edit, and delete a character belonging to exactly one campaign; require deletion confirmation.            | Pass   | Browser journey, confirmation prompt, and character service tests. Cross-campaign reassignment is rejected.                                                                                      |
| Edit and persist identity fields: character/player names, class, subclass, species, level, background, and description. | Pass   | Browser: entered these fields for Soren and reloaded. Code exposes each field.                                                                                                                   |
| Edit six ability scores, display their modifiers correctly, and preserve manual modifier overrides.                     | Pass   | Browser: Strength 17 and a manual +5 modifier persisted. Tests confirm that a score of 17 normally derives +3 and that manual values are preserved.                                              |
| Edit combat values, including current, maximum, and temporary HP, AC, initiative, speed, proficiency, and attacks.      | Pass   | Browser: combat and a custom attack were saved; quick HP and temporary HP survived refresh. Code exposes the remaining combat fields; tests cover character round trips.                         |
| Keep skill and saving-throw modifiers and proficiency states manually adjustable.                                       | Pass   | Browser: Athletics and Strength save values persisted; tests cover manual values.                                                                                                                |
| Add, edit, and remove inventory; edit quantities and currency.                                                          | Pass   | Browser: Rope quantity changed from 2 to 3 and persisted after refresh; gp balance persisted. Tests cover inventory and currency changes.                                                        |
| Maintain custom features, freeform character notes, and structured spell references.                                    | Pass   | Browser: added and saved a structured spell, reviewed its level group and expandable details, and confirmed prepared and concentration states. Tests cover persistence and validation.           |
| Switch sheet tabs and characters without carrying over unrelated values or losing saved edits.                          | Pass   | Browser: the separate Notes and Spells tabs responded to clicks and arrow keys; tab changes retained the draft, and Soren and Ceryn remained distinct.                                           |
| Remember one selected character per campaign and fall back safely when a selection is stale or deleted.                 | Pass   | Browser refresh preserved the My Character destination; tests cover campaign-specific selection, cross-campaign rejection, deletion fallback, and preference recovery.                           |
| Export a saved character as portable JSON or readable Markdown without exporting unsaved drafts.                        | Pass   | Browser downloaded a version-2 JSON file and showed specific feedback. Tests cover round-trip import, regenerated IDs, safe filenames, every Markdown section, multiline text, and empty values. |

### F05 — Campaign notes

| Requirement and acceptance criterion                                                                   | Status | Evidence                                                                                                                   |
| ------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------- |
| Create, view, edit, categorize, and delete notes with ID, campaign ID, title, content, and timestamps. | Pass   | Browser: created, recategorized, edited, and deleted notes. Code and tests check fields, timestamps, and validation.       |
| Keep notes independent by campaign and persistent after refresh.                                       | Pass   | Browser: Journey and Western Reach had separate notes; refresh retained them. Tests check cross-campaign edits and reload. |
| Confirm deletion and show recent notes on the dashboard.                                               | Pass   | Browser deletion prompt and overview; tests check recent-note ordering and cascade deletion.                               |
| Preserve an unfinished note when navigation is canceled.                                               | Pass   | Browser: leaving a dirty note showed a confirmation; dismissing it retained the draft.                                     |

### F06 — Integrated dice roller

| Requirement and acceptance criterion                                                                    | Status | Evidence                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Roll d4, d6, d8, d10, d12, d20, and d100 with valid integer faces.                                      | Pass   | Browser rolled every die; tests cover inclusive ranges and random-source rejection sampling.                |
| Roll multiple dice and apply positive and negative whole-number modifiers.                              | Pass   | Browser used 2 dice with +4 and 3d100 − 2; tests check calculations and invalid inputs.                     |
| Show individual results, modifier, total, and newest-first recent history capped at 10.                 | Pass   | Browser showed the result details and history; tests assert order and the 10-roll cap.                      |
| Open from any main view without changing campaign context; close by button or Escape and restore focus. | Pass   | Browser: roller opened over a note and dashboard; closing preserved the hash route and focused the trigger. |
| Keep rolling client-side; allow history to reset after refresh.                                         | Pass   | Code uses browser random values and in-memory React state; browser refresh reset history.                   |

### F07 — Local data persistence

| Requirement and acceptance criterion                                                                                                    | Status | Evidence                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Store campaigns, characters, notes, party membership, and character preferences through the LocalStorage adapter with schema version 5. | Pass   | Code and repository tests. Version-4 party rosters migrate with their characters and preserve the original-data backup; existing demo owners remain unchanged.                           |
| Initialize without saved data and retain edits after refresh.                                                                           | Pass   | Browser began empty, then retained records and quick edits after refresh. Tests cover empty and round-trip cases.                                                                        |
| Preserve unrelated campaigns when editing, switching, or deleting.                                                                      | Pass   | Browser two-campaign journey and service/repository isolation tests.                                                                                                                     |
| Handle missing, incomplete, malformed, duplicate, or unknown-version data without crashing or silently overwriting original bytes.      | Pass   | Tests: malformed and future-version data blocks writes; damaged version-2 data recovers valid records; version-1 data upgrades without legacy spell text and is backed up on first save. |
| Handle unavailable browser storage without crashing.                                                                                    | Pass   | Code wraps storage access; test verifies a blocked, non-writable state.                                                                                                                  |

### F08 — Navigation and responsive layout

| Requirement and acceptance criterion                                                                                 | Status | Evidence                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigate among library, overview, Party management, My Character, notes, and the global dice roller.                 | Pass   | Browser journey and follow-up exercise the Party page's create, rename, add, and remove controls.                                                         |
| Display active campaign context and a clear path back to the library.                                                | Pass   | Browser: sidebar/top bar and library links reflected the selected campaign.                                                                               |
| Preserve saved data during navigation and warn before discarding unsaved campaign, character, or note drafts.        | Pass   | Browser: canceled navigation retained each draft; refresh and switching retained saved data.                                                              |
| Keep essential controls accessible at desktop, tablet, and phone widths without overlapping or clipped page content. | Pass   | Browser screenshots and scroll-width checks; the five sheet tabs scroll inside their row and structured spell details reflow without page-level overflow. |
| Provide empty states, action feedback, and consistent controls.                                                      | Pass   | Browser: empty library/party/notes, save feedback, input errors, and common buttons were inspected.                                                       |

## Defects fixed during Phase 6

1. **Unsaved drafts could be lost.** The journal had no leave warning, the character guard could run after the app changed routes, and switching campaign forms could replace a draft. A shared guard now runs before route changes; same-page campaign form replacement also asks. Browser cancellation retained each draft.
2. **Unreadable saved data could be replaced by an empty save.** Malformed JSON and unknown schema versions now block writes and show a warning. Damaged current-version records are recovered when possible, duplicate IDs are removed, and the original bytes are copied to a browser recovery key before the first save. Version-1 data follows the same backup path during its schema upgrade.
3. **Clearing quick HP could save zero.** Blank or invalid quick HP now restores the saved value and shows an error. HP and currency saves require nonnegative whole numbers.
4. **Phone roster summaries hid HP and AC.** They now wrap onto a second line. Character names and class details have separate lines, and small combat text is more readable.
5. **Inactive sheet tabs referenced missing panel IDs.** All tabs now reference the one live sheet panel.
6. **Blocked access to `window.localStorage` could crash startup.** The app now enters a visible, non-writable state.

## Responsive and accessibility findings

- No page-level horizontal overflow was measured in the tested library, dashboard, roster, sheet, or journal views. The 375 px roster and sheet, 768 px journal, and 1440 px journal were visually inspected; the dice panel fit at all three widths.
- Mobile navigation opened and closed; all five sheet tabs responded to arrow keys; spell disclosures expanded from the keyboard; the dice dialog closed with Escape and returned focus to its trigger. Form controls and deletion buttons exposed usable names in the browser accessibility tree.
- Sampled text contrast ratios were 13.86:1 for ink on paper, 5.71:1 for muted text on paper, 9.77:1 for navigation on forest, 8.31:1 for combat labels, 6.01:1 for status text, and 5.97:1 for errors on paper.
- A full screen-reader session and physical-device testing were not performed. Browser emulation and accessibility-tree inspection are the evidence for this review.

## Known limitations and readiness

- LocalStorage belongs to one browser profile and origin. Clearing browser data removes records. Character JSON import and JSON/Markdown export are available; campaign-wide backup and cloud sync remain outside the MVP.
- If stored data is malformed or from an unsupported schema version, the app protects it by refusing new saves until the browser data is repaired or removed. Version-1 data is supported only as a one-way upgrade: legacy spell text is discarded, and the original payload remains in LocalStorage under a recovery key after the first save. There is no in-app restore tool.
- Native deletion prompts were observed in the browser. Cancellation was checked for unsaved-draft prompts; deletion cancellation was not separately exercised. The services have record-specific deletion tests and the UI uses `window.confirm` before calling them.

All required MVP acceptance criteria above pass, and no known blocking defect remains. The app is **ready for local MVP use in the tested browser**. This assessment does not claim full screen-reader or physical-device verification.
