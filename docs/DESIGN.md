# The Goober's Guide: interface direction

This is the proposed visual and interaction system for the local MVP. [PRODUCT.md](PRODUCT.md) and [MVP_SCOPE.md](MVP_SCOPE.md) remain authoritative for product behavior and scope. Campaign, character, and note management use saved local records. Dice rolls and recent history are kept in the current page session.

## Design idea

Treat the application as a field ledger carried to the game table. The dark campaign index stays stable while the selected character appears on a continuous light sheet. A single deep-green combat band makes live-session values easy to find. Thin rules and aligned rows organize information; they are not decoration. There are no parchment textures, ornamental runes, animated flourishes, or repeated dashboard cards.

The character sheet is the main working surface. Its first screen shows identity, HP, AC, initiative, speed, proficiency, ability scores, and attacks. Less frequently changed material sits in clear tabs. The sheet should remain usable with a laptop beside dice and notes, as well as on a phone during play.

## Visual tokens

| Token       | Value     | Use                                                   |
| ----------- | --------- | ----------------------------------------------------- |
| Forest      | `#183936` | Sidebar, combat band, primary actions, major headings |
| Soft forest | `#254B46` | Navigation hover and emphasis                         |
| Paper       | `#F8F9F5` | Character sheet and reading surfaces                  |
| Ground      | `#E6EBE8` | Workspace background                                  |
| Ink         | `#1C2B2D` | Primary text                                          |
| Muted ink   | `#526763` | Secondary text and labels                             |
| Rule        | `#CBD5CF` | Dividers and field boundaries                         |
| Brass       | `#A37942` | Small active markers and progress accents             |

Semantic colors for later feature states: success `#2F6F56`, warning `#A37942`, error `#A33F3A`, and information `#345E73`. State text must be paired with words or icons; color alone is insufficient. Brass is an accent, not body text on paper.

### Typography

- Display: `Iowan Old Style`, then `Palatino Linotype`, then Georgia. Use for the product name, campaign and character names, section headings, and prominent values. Its bookish shape carries the fantasy tone without a downloaded font or faux manuscript styling.
- Interface: `Avenir Next`, then `Segoe UI`, then sans-serif. Use for navigation, body copy, labels, buttons, and forms.
- Character name: 37–58 px, depending on width. Section headings: about 23 px. Body: 14–16 px with 1.5–1.6 line height. Small metadata: 12–13 px. Most reading copy should stay under 65 characters per line.
- Use sentence case. Avoid decorative all-caps labels, dense abbreviations, and stylized copy that obscures an action.

### Spacing and shape

Use an 8 px base rhythm, with 4 px adjustments for compact controls. Major content sections use 28–42 px gaps; related rows use 10–16 px. The desktop index is 244 px wide. Reading surfaces should stay within roughly 1,100 px, while the full workspace can be wider. Use mostly square corners with subtle 3–4 px rounding on controls. The character sheet has one structural edge and a very light shadow, rather than a stack of floating cards.

## Application shell and navigation

```text
Desktop
┌─ Campaign index ───┬─ Active campaign / Dice roller ──────────────┐
│ Campaign library   │                                                │
│ Overview           │ Character sheet or selected campaign view      │
│ Party              │                                                │
│ Character sheets   │                                                │
│ Campaign notes     │                                                │
└────────────────────┴────────────────────────────────────────────────┘

Mobile
┌─ Menu / active campaign / Dice roller ─┐
│ Selected view                           │
│ Full-width content, no hidden controls  │
└─────────────────────────────────────────┘
```

The campaign library is always reachable from the index. Within a selected campaign, the index shows overview, party, character sheets, and notes. Show the active campaign name in both the index and top bar so context is never ambiguous. The mobile menu overlays the page and closes after a destination is selected. The dice roller opens in a side dialog from any page and returns the player to the same view when closed. Use the same names for destinations and page headings.

The application opens at the campaign library. Campaign-aware hash links carry the selected campaign ID across views and browser refreshes. Character links also carry the character ID.

## Character sheet

```text
Character name, level, class, species                 Edit sheet
Short description and sample/status message
┌─ HP current / maximum ─┬─ AC ┬─ Initiative ┬─ Speed ┬─ Proficiency ┐
└────────────────────────┴──────┴──────────────┴───────┴─────────────┘
Overview | Skills & saves | Gear & features | Notes & spells
Ability scores: six aligned cells, score and modifier shown together
Attacks: name, damage expression, and manually entered hit bonus
```

Combat values stay above the tabs because they are frequently consulted. The HP readout is largest. Its bar is a secondary cue; the numbers remain the source of truth. Ability modifiers appear prominently, with raw scores beside them. The tab groups follow gameplay use rather than the order of a paper form:

- **Overview:** identity, combat, abilities, and attacks.
- **Skills & saves:** compact rows with modifier and proficiency state.
- **Gear & features:** inventory quantities, currency, and user-entered feature text.
- **Notes & spells:** background, personal notes, and optional freeform spell reference.

All gameplay values remain manually adjustable, including skills, saves, attack bonuses, and ability modifiers. The design does not assume a rules engine. Character records remain attached to one campaign; there is no character privacy or ownership control in this MVP.

## Other core views

- **Campaign library:** one row per saved campaign with name, party, and optional location/status. The whole row opens the campaign. Creation, editing, and confirmed deletion are available alongside each row.
- **Campaign overview:** a short title and description, a narrow summary line for party and location, then party members and recent notes. It should direct players to their sheet in one step.
- **Party:** compact character rows with class, level, HP, and AC where available. Selecting a row opens that character's sheet.
- **Campaign notes:** a readable list of titles, categories, and excerpts, scoped to the active campaign. Full note editing follows the MVP scope.
- **Dice roller:** a persistent top-bar entry opens a focused side panel with standard dice, count, modifier, individual results, total, and recent history.

## Reusable interface patterns

| Element        | Convention                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Primary button | Forest fill, white text, plain verb such as “Save changes”                                           |
| Quiet button   | Paper or transparent fill with a visible outline, used for cancel and secondary actions              |
| Inputs         | Persistent labels, clear borders, visible focus ring, and enough width for the value                 |
| Numeric values | Right or center aligned where rows are compared; include units in the label or adjacent text         |
| Tabs           | Short names, active underline, keyboard-accessible selection, horizontal scrolling on narrow screens |
| Ledger rows    | Thin dividers and aligned values for attacks, skills, saves, and inventory                           |
| Campaign entry | A full-row target, distinct from the character sheet surface                                         |
| Feedback       | Specific action and outcome; errors explain what to fix, saves confirm completion                    |
| Empty state    | State what is missing and provide one clear action to create the first record                        |

The character editor keeps a draft separate from saved data. Save changes explicitly or cancel; HP fields in the combat band save when committed. Character deletion requires confirmation. Character records persist in LocalStorage.

## Responsive and accessible behavior

At desktop widths, the index remains visible and the sheet uses two-column detail sections. Below about 1,050 px, the index becomes an overlay menu. Below about 850 px, section helper text moves beneath each heading. Below about 760 px, the character sheet sections become one column, HP takes a full row, and abilities wrap into two rows of three. Below about 520 px, the header becomes compact so combat values appear sooner; the description remains in Notes & spells. Tabs scroll horizontally rather than clipping.

Use semantic headings, labeled fields, a primary navigation landmark, current-page indication, and a native dialog for the dice panel. Preserve visible keyboard focus and Escape-to-close behavior. Proficiency must be indicated by a checkbox state and text, not color alone. Maintain readable contrast and 40 px or larger tap targets where practical. Respect reduced-motion preferences. Before feature release, test keyboard order, screen reader labels, desktop and mobile widths, and color contrast with the final content.

## Design verification

Chrome responsive emulation was reviewed at 375 px, 768 px, and 1,440 px. The document and body scroll widths matched each viewport width; the 375 px edit state and 768 px edit state also had no page-level horizontal overflow. The sheet tabs have an intentionally scrollable row on narrow screens. The mobile menu, campaign navigation, sheet tab selection, HP preview edit, and dice panel open and Escape-to-close behavior were exercised.

The review led to a shorter phone header so combat values and abilities appear sooner, helper text below section headings at tablet widths, and 44 px menu and dice-close targets. Small text colors were darkened where sampled contrast against paper or ground fell below 4.5:1. This is browser emulation, not physical-device or full screen-reader testing. Persistent records and full MVP flows remain for later phases.

## Design review

Review the forest/paper palette and serif/sans pairing; the compact combat band; the four sheet tabs; the mobile menu; and the side-panel dice placement. Also confirm whether the sample character's information density feels right for a live session. These are design proposals, not changes to the product requirements. Campaign management uses the existing shell and visual tokens.
