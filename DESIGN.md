---
name: The Goober's Guide
description: A calm, personal player record for quick use during and between sessions.
colors:
  warm-paper: "#eee8d9"
  charcoal-ink: "#222922"
  oxblood-folio: "#7a2932"
  stone-rule: "#a89f8c"
  light-paper: "#f7f3e9"
  soft-ink: "#4e554e"
  forest-green: "#315b44"
  focus-blue: "#235c7a"
  journal-parchment: "#f3e8cf"
  parchment-shade: "#e7d8b5"
  parchment-field: "#fbf5e4"
  parchment-edge: "#c9b48a"
  journal-ink: "#2a1c13"
  journal-ink-soft: "#5a4535"
  journal-rule: "#b79f74"
  journal-line: "#6f5a45"
  journal-cream: "#fff4e0"
  leather: "#3a2420"
  leather-deep: "#221310"
  leather-light: "#5b3b31"
  brass: "#dab98a"
  brass-deep: "#8f6b34"
  oxblood-deep: "#571a22"
  lantern: "#f2b04a"
  lantern-wash: "#fbe6b8"
  journal-focus: "#1b5f8c"
  starlight-focus: "#ffe7ac"
  camp-night: "#181628"
  camp-cream: "#fff0d7"
  galaxy-night: "#080714"
  galaxy-ink: "#f4efff"
  galaxy-accent: "#f5d3ae"
  galaxy-focus: "#d2baff"
  starlight-accent: "#f5d3ae"
  doorway-surface: "#111021"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "clamp(2.75rem, 5vw, 3.6rem)"
    fontWeight: 600
    lineHeight: 1.06
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1.9rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  journal-title:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "clamp(1.8rem, 3.4vw, 2.4rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.015em"
  journal-heading:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1.4rem"
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
  button:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 700
    lineHeight: 1.25
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 700
  journal-label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.06em"
  journal-section:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  control: "3px"
  cover: "8px"
  round: "50%"
spacing:
  touch: "44px"
  stack: "16px"
  page-pad: "28px"
components:
  auth-panel:
    backgroundColor: "{colors.doorway-surface}"
    textColor: "{colors.galaxy-ink}"
    rounded: "14px"
    padding: "36px 42px 38px"
  auth-button:
    backgroundColor: "{colors.starlight-accent}"
    textColor: "#261826"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "11px 22px"
  button-primary:
    backgroundColor: "{colors.oxblood-folio}"
    textColor: "{colors.light-paper}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "11px 22px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.charcoal-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "11px 22px"
  input-field:
    backgroundColor: "#fffdf8"
    textColor: "{colors.charcoal-ink}"
    rounded: "{rounded.control}"
    padding: "10px 13px"
  navigation-link:
    textColor: "{colors.soft-ink}"
    padding: "8px 0"
  journal-button:
    backgroundColor: "{colors.oxblood-folio}"
    textColor: "{colors.journal-cream}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: "{spacing.touch}"
    padding: "8px 18px"
  journal-button-hover:
    backgroundColor: "{colors.oxblood-deep}"
  journal-button-secondary:
    backgroundColor: "{colors.parchment-shade}"
    textColor: "{colors.journal-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: "{spacing.touch}"
    padding: "8px 18px"
  journal-input:
    backgroundColor: "{colors.parchment-field}"
    textColor: "{colors.journal-ink}"
    rounded: "{rounded.control}"
    height: "{spacing.touch}"
    padding: "8px 10px"
  journal-page:
    backgroundColor: "{colors.journal-parchment}"
    textColor: "{colors.journal-ink}"
    padding: "{spacing.page-pad}"
  journal-cover:
    backgroundColor: "{colors.leather}"
    rounded: "{rounded.cover}"
  journal-toast:
    backgroundColor: "{colors.leather-deep}"
    textColor: "{colors.camp-cream}"
    rounded: "{rounded.control}"
    height: "{spacing.touch}"
  sheet-savebar:
    backgroundColor: "{colors.leather-deep}"
    textColor: "{colors.camp-cream}"
---

# Design System: The Goober's Guide

## Overview

**Creative North Star: "The Adventure Ledger"**

A calm, personal player record for quick use during and between sessions. The visual language takes the form of a contemporary player handbook spread: warm uncoated paper, charcoal serif display type, narrow folio rules, and restrained oxblood accents.

The mood is a personal campaign journal with softer earth tones and lightly lifted sections. Familiar web controls stay clear and central; the forms share equal weight and stack in reading order on small screens.

The ledger now has three rooms. Sign-in, account creation and the session check are the **doorway**: the galaxy's own midnight sky seen from outside, with the hearth star burning in the half of the page the form leaves open. The campaign galaxy and the camp are **night scenes**: midnight violet chrome with starlight and brass. Everything a player reads or edits inside the camp (Overview, Party, Campaign settings, My characters, the character sheet) is the **adventurer's journal**: a leather cover around parchment pages, with brass fittings and a lantern accent. The doorway and the galaxy share one sky and one starlight accent; the journal is where the ledger became a physical book. Plain warm paper and oxblood remain for the development status and not-found pages, which are outside the player's path.

**Key Characteristics:**

- Warm paper and charcoal ink establish a quiet reading surface on the remaining plain pages; in the journal the same role is played by parchment and brown-black ink, and at the doorway by a midnight plate with cream ink.
- Serif display type and sans-serif interface text balance print character with quick scanning.
- Starlight marks primary actions and the active route at the doorway and in the galaxy; oxblood marks them on plain paper and in the journal. Supporting colors stay tied to states.
- The auth plate takes one restrained lift, and form controls remain conventional light fields.
- The journal's controls are tactile (pressed-key buttons, double-ruled plates, dashed stitching) but always at least 44px and always labelled in words.
- Small pixel icons, drawn in one weight, mark places and states; they never replace a label.

## Colors

The palette pairs warm paper neutrals with an oxblood accent, reserving other hues for focus and status feedback. Night scenes and the journal each add a small, self-contained set of tokens.

### Primary

- **Oxblood Folio** (`#7a2932`): The page rule, active route, panel folios, primary buttons on plain paper and in the journal, icon accents in the journal, and text selection there. The doorway and the galaxy use Starlight Accent for the same jobs. **Oxblood Deep** (`#571a22`) is its pressed and hover shade and the journal's error text.

### Secondary

- **Focus Blue** (`#235c7a`): Keyboard focus and supporting links on plain paper. **Journal Focus** (`#1b5f8c`) is the same job on parchment.
- **Forest Green** (`#315b44`): Successful form feedback and journal notices; the journal's own green is `#2d5a41`.
- **Starlight Focus** (`#ffe7ac`): Focus ring on every dark surface (camp chrome, leather cover, save bar).
- **Starlight Accent** (`#f5d3ae`, hover `#ffe2c4`, ink `#261826`): The primary button, the active route, the route's bookmark rule and links at the doorway, and the same role in the galaxy. **Doorway Focus** (`#d2baff`) is its focus ring, with the galaxy's `#d2baff` on `#080714`.

### Tertiary

- **Lantern** (`#f2b04a`) and **Lantern Wash** (`#fbe6b8`): The tent's glow. Toast marks, the appearance-drawer icon, the "away" chip, and unsaved-change dots. A small warm signal, never a fill for large areas.

### Neutral

- **Warm Paper** (`#eee8d9`): The page background and the ground behind the content.
- **Light Paper** (`#f7f3e9`): Auth panel surfaces and light button text.
- **Charcoal Ink** (`#222922`): Main headings and primary text.
- **Soft Ink** (`#4e554e`): Explanatory copy and secondary navigation.
- **Stone Rule** (`#a89f8c`): Header separators and quiet dividers.
- **Journal Parchment** (`#f3e8cf`), **Parchment Shade** (`#e7d8b5`), **Parchment Field** (`#fbf5e4`), **Parchment Edge** (`#c9b48a`): The journal page, its wells and secondary buttons, its input fill, and its page edge.
- **Journal Ink** (`#2a1c13`), **Journal Ink Soft** (`#5a4535`): Text on parchment; both read at 4.5:1 or better on every page surface. **Journal Rule** (`#b79f74`) and **Journal Line** (`#6f5a45`) draw dividers and control borders.
- **Leather** (`#3a2420`), **Leather Deep** (`#221310`), **Leather Light** (`#5b3b31`): The journal cover, toasts, and save bar.
- **Brass** (`#dab98a`) and **Brass Deep** (`#8f6b34`): Fittings: cover rim, drawer tab, medallion ring, ability rings, the save bar's top rule.
- **Item rarity** (`--rarity-*` on `.camp`): an edge, a wash, and an ink for each step above common: uncommon green (`#2d6a45`), rare blue (`#2a5f9e`), very rare violet (`#6b3fa0`), legendary amber (`#b4650f`), artifact red (`#a32a2a`). An inventory row above common is inked in its colour and its frame grows with the tier: uncommon a 1px edge and a faint wash; rare a stepped pixel frame (a border plus four hard 2px rings, so the corners are notched) and a four-point pixel sparkle on its chip; very rare adds **foil**, two hard diagonal stripes that cross the row behind the text on a slow stepped loop (7s); legendary adds an inner mount frame and lantern-gold foil (6s); artifact swaps its frame between red and brass and sweeps fastest (5s). The chip names the rarity with a pixel gem (ink on wash at 8:1 or better); common shows nothing. Under reduced motion the foil holds still as a static stripe; under forced colours it is dropped. An equipped row keeps its brass left edge whatever its rarity. Colour never carries rarity alone.

### Named Rules

**The Oxblood Folio Rule.** Use oxblood for the main route and action cues; keep focus blue and success green tied to their specific states.

**The Three Rooms Rule.** The doorway (and galaxy), the camp, and the journal each keep their own tokens. Do not carry a journal color onto the auth pages, or a `--camp-*` color onto parchment.

**The Words Beside Color Rule.** Status chips, save state, and errors always pair color with an icon and words.

## Typography

**Display Font:** Source Serif 4 (400 and 600; Georgia, serif fallback)
**Body Font:** The system UI sans (`ui-sans-serif, system-ui, sans-serif`)

**Character:** A bookish serif for titles, names, and numerals; a plain sans for dense labels, fields, and supporting copy. In the journal, ability modifiers and the character's initial use the serif so numbers read like printed figures.

### Hierarchy

- **Display** (600, `clamp(2.75rem, 5vw, 3.6rem)`, 1.06, -0.025em): Large serif page headings on the auth pages, in cream ink over the sky.
- **Headline** (600, 1.9rem, 1.15, -0.02em): Serif form headings separating the two account routes.
- **Journal title** (600, `clamp(1.8rem, 3.4vw, 2.4rem)`, 1.05, -0.015em): The `h2` of each camp page, balanced wrapping.
- **Journal heading** (600, 1.4rem, 1.15): Character names and sub-views inside the tent; long names wrap anywhere.
- **Body** (400, 1rem, 1.65): Sans-serif descriptions and feedback; journal copy runs 1.55 to 1.65.
- **Label** (700, 0.82rem): Bold sans-serif labels keep each standard field explicit.
- **Journal label** (700, 0.8rem, 0.06em, uppercase): Field labels on parchment. Optional hints inside the label drop to regular weight, no tracking, no capitals.
- **Journal section** (700, 0.9rem, 0.12em, uppercase): Section titles, set over a 2px rule with an oxblood pixel icon. The smaller place marker above a camp page title (0.75rem, 0.14em, uppercase) and the sheet's ribbon tabs (0.8rem, 0.08em) follow the same voice.

### Named Rules

**The Serif Is For Names Rule.** Titles, character names, and numerals take the serif. Labels, buttons, hints, and anything a player edits take the sans.

## Layout

On wider screens, the doorway centers content in a frame capped at 1264px with two equal halves: the form plate and the open half, which swap sides between sign-in and registration while the sky follows the star. The header, title, and footer align to the same frame. The page uses generous outer gutters; they step down to 32px below 900px and to 22px on small screens. At widths below 680px, the account columns become one vertical stack, the header navigation moves to its own row, and the footer links stack. Keep both routes visible in normal page flow. The current title and form descriptions use readable line lengths rather than stretching across the frame.

Inside the camp, the scene fills the viewport and the journal is a modal sheet, docked to the side of the screen the scene is not framed on at 900px and above (with at least 481px of height) and full-screen otherwise. Journal pages pad `clamp(18px, 3vw, 28px)` and stack on a 16px rhythm. The journal responds to its own width, not the viewport's: the tent is a container, and Adventures and Notes open a wider journal (`data-variant='wide'`, 70vw, 640 to 1200px) whose boards list in two or more columns and whose detail pages put the story or note beside its side column (people and sharing, or the note's actions) at 40rem of their own width; the character sheet becomes a two-page spread at 720px and above, tightens its header tools under 860px, and shows one page at a time with full-width save buttons under 560px. Vitals sit two to a row; ability cards fill the width at a 9.5rem minimum.

## Elevation & Depth

Depth is mostly carried by tone and fine rules. The auth plate uses one restrained shadow to lift the form from the sky; the header and surrounding page remain flat. In the camp, depth is physical: the journal cover lifts off a dimmed scene, and parchment is inset into it.

### Shadow Vocabulary

- **Auth plate lift** (`0 24px 60px rgb(3 2 10 / 55%)`): A deep, soft fall under the account plate, as the journal cover falls onto the scene.
- **Journal cover** (`0 0 0 2px #8f6b34, 0 24px 70px rgb(11 9 18 / 0.65)`): A brass rim and a deep fall onto the scene.
- **Printed plate** (`inset 0 0 0 3px parchment, inset 0 0 0 4px journal-rule`): A double rule inside a 1px line. Used by `journal-panel`, vitals, and ability cards.
- **Pressed key** (`0 3px 0` in the button's own darker shade, dropping to `0 1px 0` and a 2px shift on press): The journal button only; it is a control state, not a surface effect.
- **Save bar and toasts** (`0 -8px 18px rgb(11 9 18 / 0.28)` and `0 6px 18px rgb(11 9 18 / 0.5)`): Leather pieces floating over parchment.

### Named Rules

**The Quiet Lift Rule.** Keep the shadow on the auth plate and let tone and rules do the remaining work on the doorway.

**The Plate Not Card Rule.** Group parchment content with a double rule, a divider, or a ribbon, not nested rounded cards.

## Shapes

Controls use a single subtle radius (3px), while larger plain-paper surfaces stay square. The doorway plate takes the galaxy's 14px corner, as the standalone create form does. The journal cover alone takes an 8px corner, and the appearance drawer's tab rounds only the corners that face away from the journal. Circles are reserved for portraits and ability modifiers (a brass double-ring). Thin rules and panel dividers provide structure; dashed lines mean either stitching (the cover), a page break, or a destructive zone. Avoid ornamental silhouettes around ordinary web controls.

## Components

The components feel refined and restrained: familiar controls sit inside a calm, editorial frame. In the journal they become a little more tactile, but never less legible.

### Buttons

- **Shape:** Nearly square control corners, shared across all variants.
- **Primary:** Oxblood fill with light-paper text and compact, clear padding; at the doorway and in the galaxy, a Starlight Accent fill with `#261826` text and 48px height. In the journal: 44px minimum height, 2px oxblood-deep border, cream text, pressed-key shadow.
- **Hover / Focus:** Hover deepens the primary fill. Keyboard focus uses a visible blue outline with offset (starlight on dark surfaces).
- **Secondary:** Transparent at rest with a quiet border; on hover it becomes a charcoal-filled action. In the journal: parchment-shade fill with a brown line.
- **Ghost, danger, solid-danger (journal):** Ghost for quiet or cancel actions; outlined oxblood for destructive choices; solid oxblood only for the confirmation step of retiring, killing, or deleting.
- **Disabled:** Flat, no shadow, muted fill; `cursor: progress` while a request is in flight (`aria-busy`).

### Cards / Containers

- **Corner Style:** The auth plate takes a 14px corner; journal plates take the 3px control radius.
- **Background:** The auth plate is midnight violet (`#111021` at about 90%, lightly blurred so type stays legible over stars). Journal plates are a translucent parchment-field wash over the page.
- **Shadow Strategy:** Use the shadow vocabulary above; do not add new ones.
- **Border:** A hairline in `#d8cbff32` frames the auth plate; a short starlight rule (56px by 3px) at its top edge identifies the route, like the tip of a bookmark ribbon. Journal plates use the double rule.
- **Internal Padding:** Generous on desktop (auth) and `clamp(18px, 3vw, 28px)` (journal); both tighten on mobile.

### Inputs / Fields

- **Style:** Familiar full-width fields with a near-white fill, thin muted stroke, and shared control corners; on the dark doorway they stay light (`#fffdf8`, 48px) so they read as fields, as the create-campaign form does. In the journal: parchment-field fill, a 2px brown border, a faint inset top shadow, 44px minimum height; placeholders stay at `#6b5a4a`.
- **Focus:** A clear blue outline and border change identify keyboard focus (lilac `#d2baff` on the doorway).
- **Error / Disabled:** Invalid fields receive a red 2px border (an oxblood border on plain paper) and nearby error text that pairs a warning icon with words, in `#ffc6bf` on dark. Disabled fields use a muted fill and text; in the journal they also go dashed.

### Navigation

- **Style:** The brand uses serif display type. Account links use compact sans-serif text with a fine underline for the current route (starlight at the doorway); hover adds an underline and the accent color.
- **Mobile:** Navigation moves to its own full-width row beneath the brand.
- **Ribbon tabs:** the notes' Notes and NPCs, the Maker's Visions views, and the library browser share one ribbon (`.notebook-tabs` in `journal.css`): an oxblood pixel icon and an uppercase label on a rule, the current view underlined in oxblood.
- **Sheet ribbons:** The character sheet has a sticky strip of section tabs (icon plus uppercase label, 44px, a 4px oxblood underline on hover) that scrolls sideways without a visible scrollbar.

### Journal page

The camp's reading and editing surface. A leather cover (with a brass rim and dashed stitching 5px inside the edge) holds a "Back to camp" bar and a parchment page with a faint highlight, a warm lower-right shade, and fine ruling. Each camp page opens with a pixel icon and the place name, then a serif title (`CampPanel`). Content sits in `journal-section-title` blocks and printed plates.

### Character sheet

A folio opens as an open book: the tent container turns into a two-page spread with a binding down the middle on wide journals, each page its own stack so neither has a gap. The left page is what you roll: vitals as a readout (a hit-point plate with a bar, then armor class, initiative, and speed as large tiles, with proficiency bonus and passive Perception as quieter dashed ones), six ability plates each with a brass-ringed modifier, skills read down two columns (trained skills tinted and bold, with proficiency pips: empty, filled, ringed-and-filled for expertise), then features and notes. The right page is what you carry: attacks (name, to-hit, and damage in large figures), spells, alignment, coins, and inventory. The **save bar** is a leather strip pinned to the bottom with a brass top rule, a status dot that lights when changes are unsaved, and Save buttons; errors sit above it. The lifecycle zone (retire, mark deceased, delete) is set apart at the foot in a dashed oxblood border over a faint oxblood wash.

### Status chips and portrait

Chips (active, retired, deceased, party, away, shared, private) pair a pixel icon with words on a tinted fill and a matching edge. The portrait stand-in is a leather medallion with the character's initial in brass; a fallen character's medallion desaturates.

### Toasts

Brief notes from the bottom of the journal: leather-deep fill, brass 2px border, cream text, a lantern mark, and a dismiss button; hovering or focusing one holds it open. The live region is always mounted.

### Appearance drawer

A vertical leather tab with a lantern icon sits on the Party journal's outer edge and opens a parchment panel beside it (19rem wide at most). It previews the adventurer sprite (hard-edged pixels, a two-frame breath unless motion is reduced) and offers cloak swatches and headwear, pack, and skin choices as labeled radio options. Below 900px it becomes a pill at the bottom with a sheet above it.

### Dice dock and tray

One object in every room, so it carries its own `--dice-*` tokens (the journal's values, scoped to `.dice-dock` in `dice.css`) instead of borrowing a room's. A leather key (brass 2px rim, pressed-key shadow, d20 icon and the word "Dice", 48px) sits bottom right on the galaxy, the camp, and every journal. While a journal is open the dock renders inside that modal dialog, because everything outside a modal dialog is inert; it sits above the pinned save bar. A lantern count on the key marks rolls others made while the tray was shut. After a roll made with the tray shut, a leather **peek** (title and total in the serif) shows for six seconds, held while hovered or focused, and opens the tray. A failed roll shows its notice with Retry instead.

The tray is a parchment plate with a leather header (title, a live-state line with an icon: "Live with the table", "Live updates paused", or "On this device only — not saved") and a brass rule. Top to bottom: the latest roll on a double-ruled plate (title, who, face tiles, the total at 3rem serif), the roll field with a primary Roll key, quick dice d4 to d100, a three-way Normal / Advantage / Disadvantage group for a d20, "Only I can see my rolls" and Roll again, then the table's log grouped by minute. Faces are 36px tiles in the serif: a dropped die is dashed and struck through, a natural 20 gets a brass inner rule, a natural 1 oxblood text, and each is also named in words ("Natural 20", "Natural 1") and to screen readers. "Only you" and "Not saved" chips pair a lock or device icon with words. While a server roll is in flight the tiles rest with no numbers; on arrival they settle left to right (the one motion, off under reduced motion). On phones the tray is a bottom sheet (up to 82dvh) and the key hides while it is open. Escape closes the tray and not the journal behind it; `R` toggles it outside text fields.

### Roll buttons

On your own sheet's display view, the numbers that can roll are buttons: an ability modifier and its saving throw, each skill, initiative, an attack's to-hit, and its damage when it has dice. They keep the sheet's layout and add a 2px brown line on a parchment-shade fill (44px minimum), which deepens to oxblood on hover. A bonus or damage that is not plain dice stays plain text, and others' sheets and the edit view have no roll buttons. A press rolls; Shift-click rolls with advantage and Alt-click with disadvantage; a long press, right-click, or the context-menu key opens a small leather menu (advantage, disadvantage, roll privately, as they apply) that returns focus to the button. The result appears in the dice tray, or in its peek when the tray is shut; after a natural 20 on an attack, "Roll critical damage" sits beside it.

### Sealed visions

What a long rest brings to a player arrives sealed, in the Maker's Visions journal page. Each new vision and fragment is a leather plate with a brass 2px rim, a double inner rule, and a pixel wax seal (oxblood, outlined in brass the way the camp outlines its sprites) beside a serif line, "A vision stirs" or "A fragment stirs", and the words "Break the seal". It names only what is behind it. A leather strip above the list says how many things stir and offers **Break all seals**; what the rest did not bring is never sealed.

Breaking a seal is the one authored moment. The wax cracks along a jagged line into two halves that fall away, eight ember pixels burst out in lantern and brass, and a lantern-wash flash passes over the plate (about 0.5s, stepped for the embers). The card then unfurls top to bottom in its place: the title inks in left to right in steps, the rarity chip and "New" pop, one bright pass in the rarity's edge colour crosses it, each material line on its face slides in in turn with its tick catching lantern, and "still to pay" totals up in whole-coin steps. Opening several at once staggers them by 220ms. A fragment's `???` clears from a smudge and its held names ink in. Focus moves to a card opened alone; a polite live region names what was revealed.

The cards sit side by side in a **rail**: each group (Visions, Fragments, Saved) is a row with its heading and two 44px arrow keys on the right, which appear only when more cards wait, and a thin brass scrollbar. The row bleeds to the page edge and its far edge fades, so a half-seen card says there is more; cards snap to their starts, the row is a focusable, labelled region the arrow keys scroll, and under reduced motion the arrows jump instead of gliding. A card is a portrait folio, `min(19rem, 82%)` wide (fragments `min(16rem, 76%)`), set on the journal's printed plate like every other plate in the area (the DM's libraries and the library browser's rows too): the name in the serif at the journal heading size, the rarity and "New" chips ("New" is a lantern chip with a pixel star, the same chip anatomy as the rarity and status chips), the amount still to pay, then one line per material (a tick or cross, the name, held of needed), and a "Recipe details" pointer that opens the whole costing, table, tools, and notes inside the card. A fragment is built the same way: "Unknown item: ???" in the serif, a "New" chip, then one line per key material held (a tick, the name, "held") and one for what is not found (a cross, `???`, `×N`). A sealed card is the same width and stands taller, so a broken seal changes in place. Views of the page (My visions and the DM's libraries and rests, the library browser's Items and Recipes) switch with the journal's ribbon tabs, never a pair of toggle buttons. Within a card the costing table is always its two-line stacked form.

- **Once per rest.** Which seals are broken is remembered on this device, per character and rest (`goobers-visions-opened:*`), so a reload keeps them open and a new rest seals the new ones. "Replay the reveal" seals them again. The record is a nicety; the database still decides what is new.
- **The shrine follows the seals.** The scene's lit sprite, its ember motes, and the Places count ("Visions, N new") count what is still sealed, so reading it puts the glow out.
- **Reduced motion:** the seals stay, and breaking one opens its folio at once with no crack, unfurl, sweep, or count; every animation lives under `prefers-reduced-motion: no-preference`.
- **On a phone** (a card under 34rem) the materials table becomes two-line rows (name, then what is held and the sum) and the unit price is dropped.
- **Colour:** leather, brass, lantern, and the rarity edges only; no new tokens.

### Empty states

The empty tent is a dashed parchment plate with a drawn tent, flame, and lantern, a serif title, and one short line pointing to the next action.

## The doorway (sign in and create account)

Sign-in and account creation open onto the galaxy's own sky. `AuthSky` draws the deep sky (stars, nebulae), the hearth star and the six faint orbits of the orrery full-bleed behind the page; no worlds are charted, since the visitor has no campaigns yet, and one small starlight traveller circles the third orbit. The plate holds the form; the **open half** holds the invitation to the other route over the star's warm pool: "New to the Guide?" or "Already have an account?" The star sits in the open half's upper middle, so the invitation reads below it and the star never sits under type. When the routes swap sides, the panel slides across and the camera's view offset carries the star to the new open half with the stars at different depths slipping by different amounts. On phones the routes stack and the star keeps to the top right, in the brand's row.

- **Moving parts:** the pointer leans the camera a few degrees; the traveller circles slowly and hurries while a sign-in or registration request is pending (the button's busy state and label carry the same news in words). Nothing else moves.
- **The hearth answers the form:** a refusal (wrong password, name taken, no connection) dims the star at once and stills the traveller, and both rekindle over about two seconds; the plate shakes a few pixels, the password clears and the field to retype takes focus. An account made with no session yet (email to confirm) flares the star once. Signing in flares it as the still dissolves into the galaxy. The words and icons always carry the news; under reduced motion the star keeps its resting light and the plate does not shake.
- **Fallbacks:** without WebGL 2 or after a context loss the sky is the painted night (`#080714` with the galaxy's two faint tints) and a warm radial glow stands in for the star. Under reduced motion the sky draws only when something changes and the traveller rests.
- **Colours:** `--auth-*` tokens in `auth.css` mirror the galaxy shell: night `#080714`, ink `#f4efff`, muted `#d2cce6`, rule `#d8cbff32`, surface `#111021e6`, starlight accent, focus `#d2baff`, danger text `#ffc6bf`, success text `#bfe8cc`. Fields stay light. The browser's own surfaces (page ground, scrollbar, selection) take the night palette.
- **The session check** (`AuthStatus`) is the same night without the sky, so the wait before the form does not flash paper.
- **The arrival:** one continuous move, with no cut. The doorway hands its camera pose, the star's screen position and the stars' drift to the galaxy, which starts drawing that exact view under a still of the sky. The form, words and rules lift away (about 0.5s, the form first); the still and its ground then dissolve over the live galaxy while the camera glides (2.4s, `glideDuration`) from the doorway's view to the chart, the star travelling from the open half to the middle and the orbits already drawn. The worlds grow in as before. The wordmark glides to the header and swaps with the header's own when the controls begin to arrive, about 1.35s into the glide, in the order account, index, orbit controls, labels (0.64s each). Skip, Escape-free keys and pointer press fast-forward it; Skip sits at the bottom left, since the dice key owns the bottom right. Under reduced motion the page crossfades in 0.25s and nothing travels.

## Campaign selector

The protected campaign selector is a full-screen galaxy. The starfield extends behind the header, list, and campaign details. The Adventure Ledger is the default style for the app's forms and reading surfaces.

Use Source Serif 4 for the brand and campaign names. Floating controls use translucent midnight violet surfaces (`#111021` at about 85%), light text (`#f4efff`, muted `#c3bdd7`), and warm starlight accents (`#f5d3ae`) for the selected campaign and primary action; focus is a lilac `#d2baff` on a `#080714` night. Keep the center open for the scene. The campaign list sits at the left and scrolls within its disclosure; campaign details appear beside the selected planet at widths of 960px and above. At narrower widths, the card sits below the orbit controls. On phones, start with the list collapsed. The standalone create form uses the same dark palette with familiar light input fields.

## Individual campaign camp

The campaign page at `/app/campaigns/:campaignId` is a pixel-art camp at night: a campfire ringed by the seated party, a steward's wagon, a tent for the viewer's characters, and a panorama of layered hills and sky that the player pans by dragging, swiping, or scrolling sideways. The campaign's own planet colours the landscape through a palette swap, with that landscape's particles drifting through the firelight. Arriving from the galaxy plays a short descent once; reduced motion skips it, and the scene holds still. Seated figures carry the characters' names on plates and wear the looks their players chose.

Places reachable from the scene and from the Places list beneath it (a compact row at the bottom left on wide screens): **Overview** (campfire), **Party** (bedroll circle), **My characters** (tent), and, for the owner, **Campaign settings** (steward's wagon). Each scene button carries a name plate and a 3px starlight focus ring. The Places list is the complete, keyboard-first route; the scene buttons and the seated-party name plates are conveniences, and the plates are decorative.

A **Sheet tag** (pixel sheet icon and the word "Sheet", on the camp's plate colours) sits on the bedroll of each seated player whose party character has shared their sheet with the campaign, and is gone when the sheet is private. Unlike the name plates it is a real button (44px target, starlight focus ring, outlines the bedroll circle on hover or focus) that opens that sheet in the Party journal; the Party list's "Sheet shared" chip and "View sheet" button carry the same information. It is static, so reduced motion needs nothing, and it shares the name plates' minimum scale.

Opening a place frames it on the side of the screen the journal does not cover, dims the scene, then opens the journal as a modal sheet (docked at the side on wide screens, full-screen on phones). Clicking outside the sheet on wide screens returns to camp. The journal is the adventurer's journal described above, with a "Back to camp" link. Status messages sit in persistent live regions, one on the camp and one in the journal.

A gear in the app header opens "Camp background": the campaign's world or one of six landscapes (grass and pines, dunes, ash and basalt, snow, scree, cloud reef). The choice is saved on this device only, per campaign. A player's own adventurer look is set from the Party journal's appearance drawer.

### Firelight

The campfire is the scene's light. Two overlay canvases sit above the art: a **light map** multiplied over it (the night's ambient colour, cool and dim, with the fire's pool of warm light cut into it) and a **glow** screened over it (a warm bloom in the same pool). The pool is drawn in about eight hard bands with an ordered dither, so it reads as pixel-art lighting, and it flickers across six pre-drawn levels. Figures and props (not the bedrolls or the pit) cast flattened shadows away from the flames, strongest in the brightest light and gone at its edge. On arrival the ambient eases from dusk to night over about 4.5 seconds; under reduced motion it is night from the first frame and the light holds one level. The outline and the flame sit above both canvases and keep their own colours. Tokens live in `campLight.ts`; do not tint the camp's art or chrome to fake it.

### Camp colours

Camp chrome (header, Places, name plates, the settings popover) is dark and warm, defined as `--camp-*` tokens in `camp.css`:

- **Night** `#181628`: the page behind the scene, and the shadow base.
- **Surface** `#1d192d` and **Hover** `#353142`: the popover and hovered rows. The header has no surface: it is transparent over the scene, with a shade of Night fading from 78% to nothing behind its controls and a soft text shadow.
- **Cream** `#fff0d7`: text and the title, over the scene with a soft shadow.
- **Brass** `#dab98a` and **Brass soft** `#e1c6a4`: hover accents, headings, and secondary text.
- **Edge** `#b99969`: hairline borders on floating controls and plates.
- **Plate** `#291c24`, **Plate hot** `#4a2b28`, **Plate hot edge** `#fff0c9`: name plates at rest and when hovered, focused, or open.
- **Starlight focus** `#ffe7ac`: the focus ring on dark chrome (the journal uses Journal Focus on parchment, and starlight on its leather parts).
- **Ledger bar, rule, edge, back, scroll**: older light-paper accents (`--camp-ledger-*`) that the leather cover now overrides inside the journal.

Journal colours are `--journal-*` tokens on `.camp` in `journal.css`. Text on camp chrome measures at least 7:1; do not introduce a colour in `camp.css` or `journal.css` without adding it here as a token. The camp has no dark/light switch: the scene is always night.

### Camp behaviour

- Touch: horizontal drags pan; vertical drags still scroll the page. Every scene button, Places row, journal control, and the gear is at least 44px.
- Motion: idle effects run at roughly 14 draws a second, none while the tab is hidden or under reduced motion. Button presses and dot changes in the journal are the only other motion, and they are disabled under reduced motion.
- The waystone on the high road is a pointer-only shortcut back to the galaxy (hidden from assistive tech and the tab order); "Back to campaigns" in the header is the accessible route.
- Scene buttons outside the visible frame leave the tab order; focusing a Place in the list pans the camera to it.
- Leaving a sheet with unsaved changes raises a modal "unsaved changes" question over the journal.

See the [camp plan](docs/completed/M02-Landfall-Camp.md) for the destination map, camera, and interaction details.

## Do's and Don'ts

### Do:

- **Do** keep sign-in and account creation equally weighted in the current auth layout: a form plate and an open half that swap sides.
- **Do** retain standard labeled fields, visible keyboard focus, and clear text states.
- **Do** stack the account panels in reading order on small screens.
- **Do** reserve the panel shadow for the auth plate and use tone and rules for surrounding structure.
- **Do** keep camp colours in `--camp-*` tokens, journal colours in `--journal-*` tokens, and status text in always-mounted live regions.
- **Do** build new camp pages from `CampPanel` and the `journal-*` primitives (button, field, input, section title, chip, status, alert) so they inherit the cover, parchment, and 44px targets.
- **Do** pair every status color with an icon and words, and keep touch targets at 44px or more in the journal.
- **Do** put a destructive action behind an inline confirmation in the dashed oxblood zone.

### Don't:

- **Don't** turn standard form controls into decorative props.
- **Don't** let fantasy ornament or surface decoration compete with the form labels and actions.
- **Don't** use the focus and success colors as general-purpose accents.
- **Don't** let camp name plates or scene art carry information the Places list and the journal do not also provide.
- **Don't** put a journal skin (leather, brass, parchment) on the auth pages or the galaxy, and don't put paper and oxblood back on the doorway.
- **Don't** let the sky carry information, place the star under type, or add a second moving thing to the doorway.
- **Don't** nest plates inside plates, or use the pressed-key shadow outside buttons.
- **Don't** use Lantern as a fill or for large areas; it is a small warm signal.
