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
    backgroundColor: "{colors.light-paper}"
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

The ledger now has three rooms that share one ink and one accent. Sign-in and account pages are the **plain ledger**: light paper, charcoal ink, oxblood folios. The campaign galaxy and the camp are **night scenes**: midnight violet chrome with starlight and brass. Everything a player reads or edits inside the camp (Overview, Party, Campaign settings, My characters, the character sheet) is the **adventurer's journal**: a leather cover around parchment pages, with brass fittings and a lantern accent. Oxblood runs through all three; the journal is where the ledger became a physical book.

**Key Characteristics:**

- Warm paper and charcoal ink establish a quiet reading surface; in the journal the same role is played by parchment and brown-black ink.
- Serif display type and sans-serif interface text balance print character with quick scanning.
- Oxblood folios mark primary actions and active routes; supporting colors stay tied to states.
- Light paper panels receive a restrained lift, and form controls remain conventional.
- The journal's controls are tactile (pressed-key buttons, double-ruled plates, dashed stitching) but always at least 44px and always labelled in words.
- Small pixel icons, drawn in one weight, mark places and states; they never replace a label.

## Colors

The palette pairs warm paper neutrals with an oxblood accent, reserving other hues for focus and status feedback. Night scenes and the journal each add a small, self-contained set of tokens.

### Primary

- **Oxblood Folio** (`#7a2932`): The page rule, active route, panel folios, primary buttons in every room, icon accents in the journal, and text selection. **Oxblood Deep** (`#571a22`) is its pressed and hover shade and the journal's error text.

### Secondary

- **Focus Blue** (`#235c7a`): Keyboard focus and supporting links on plain paper. **Journal Focus** (`#1b5f8c`) is the same job on parchment.
- **Forest Green** (`#315b44`): Successful form feedback and journal notices; the journal's own green is `#2d5a41`.
- **Starlight Focus** (`#ffe7ac`): Focus ring on every dark surface (camp chrome, leather cover, save bar).

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

### Named Rules

**The Oxblood Folio Rule.** Use oxblood for the main route and action cues; keep focus blue and success green tied to their specific states.

**The Three Rooms Rule.** Plain paper, night scene, and journal each keep their own tokens. Do not carry a journal color onto the auth pages, or a `--camp-*` color onto parchment.

**The Words Beside Color Rule.** Status chips, save state, and errors always pair color with an icon and words.

## Typography

**Display Font:** Source Serif 4 (400 and 600; Georgia, serif fallback)
**Body Font:** The system UI sans (`ui-sans-serif, system-ui, sans-serif`)

**Character:** A bookish serif for titles, names, and numerals; a plain sans for dense labels, fields, and supporting copy. In the journal, ability modifiers and the character's initial use the serif so numbers read like printed figures.

### Hierarchy

- **Display** (600, `clamp(2.75rem, 5vw, 3.6rem)`, 1.06, -0.025em): Large serif page headings on the auth pages.
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

On wider screens, the plain-ledger pages center content in a frame capped at 1264px with two equal form columns. The header, title, and footer align to the same frame. The page uses generous outer gutters; they step down to 32px below 900px and to 22px on small screens. At widths below 680px, the account columns become one vertical stack, the header navigation moves to its own row, and the footer links stack. Keep both routes visible in normal page flow. The current title and form descriptions use readable line lengths rather than stretching across the frame.

Inside the camp, the scene fills the viewport and the journal is a modal sheet, docked to the side of the screen the scene is not framed on at 900px and above (with at least 481px of height) and full-screen otherwise. Journal pages pad `clamp(18px, 3vw, 28px)` and stack on a 16px rhythm. The journal responds to its own width, not the viewport's: the tent is a container, and Adventures and Notes open a wider journal (`data-variant='wide'`, 70vw, 640 to 1200px) whose boards list in two or more columns and whose detail pages put the story or note beside its side column (people and sharing, or the note's actions) at 40rem of their own width; the character sheet becomes a two-page spread at 720px and above, tightens its header tools under 860px, and shows one page at a time with full-width save buttons under 560px. Vitals sit two to a row; ability cards fill the width at a 9.5rem minimum.

## Elevation & Depth

Depth is mostly carried by paper tone and fine rules. The auth panels use one restrained shadow to lift the shared form surface from the page; the header and surrounding page remain flat. In the camp, depth is physical: the journal cover lifts off a dimmed scene, and parchment is inset into it.

### Shadow Vocabulary

- **Auth panel lift** (`0 8px 18px rgb(34 41 34 / 10%)`): A soft, low-contrast shadow under the shared account panel.
- **Journal cover** (`0 0 0 2px #8f6b34, 0 24px 70px rgb(11 9 18 / 0.65)`): A brass rim and a deep fall onto the scene.
- **Printed plate** (`inset 0 0 0 3px parchment, inset 0 0 0 4px journal-rule`): A double rule inside a 1px line. Used by `journal-panel`, vitals, and ability cards.
- **Pressed key** (`0 3px 0` in the button's own darker shade, dropping to `0 1px 0` and a 2px shift on press): The journal button only; it is a control state, not a surface effect.
- **Save bar and toasts** (`0 -8px 18px rgb(11 9 18 / 0.28)` and `0 6px 18px rgb(11 9 18 / 0.5)`): Leather pieces floating over parchment.

### Named Rules

**The Quiet Lift Rule.** Keep the shadow on the auth panel and let paper contrast and rules do the remaining work on plain pages.

**The Plate Not Card Rule.** Group parchment content with a double rule, a divider, or a ribbon, not nested rounded cards.

## Shapes

Controls use a single subtle radius (3px), while larger plain-ledger surfaces stay square. The journal cover alone takes an 8px corner, and the appearance drawer's tab rounds only the corners that face away from the journal. Circles are reserved for portraits and ability modifiers (a brass double-ring). Thin rules and panel dividers provide structure; dashed lines mean either stitching (the cover), a page break, or a destructive zone. Avoid ornamental silhouettes around ordinary web controls.

## Components

The components feel refined and restrained: familiar controls sit inside a calm, editorial frame. In the journal they become a little more tactile, but never less legible.

### Buttons

- **Shape:** Nearly square control corners, shared across all variants.
- **Primary:** Oxblood fill with light-paper text and compact, clear padding. In the journal: 44px minimum height, 2px oxblood-deep border, cream text, pressed-key shadow.
- **Hover / Focus:** Hover deepens the primary fill. Keyboard focus uses a visible blue outline with offset (starlight on dark surfaces).
- **Secondary:** Transparent at rest with a quiet border; on hover it becomes a charcoal-filled action. In the journal: parchment-shade fill with a brown line.
- **Ghost, danger, solid-danger (journal):** Ghost for quiet or cancel actions; outlined oxblood for destructive choices; solid oxblood only for the confirmation step of retiring, killing, or deleting.
- **Disabled:** Flat, no shadow, muted fill; `cursor: progress` while a request is in flight (`aria-busy`).

### Cards / Containers

- **Corner Style:** The auth panel remains square; journal plates take the 3px control radius.
- **Background:** Light Paper separates the auth form area from Warm Paper. Journal plates are a translucent parchment-field wash over the page.
- **Shadow Strategy:** Use the shadow vocabulary above; do not add new ones.
- **Border:** A thin center divider separates the equal desktop auth columns; the oxblood top rule identifies each route. Journal plates use the double rule.
- **Internal Padding:** Generous on desktop (auth) and `clamp(18px, 3vw, 28px)` (journal); both tighten on mobile.

### Inputs / Fields

- **Style:** Familiar full-width fields with a near-white fill, thin muted stroke, and shared control corners. In the journal: parchment-field fill, a 2px brown border, a faint inset top shadow, 44px minimum height; placeholders stay at `#6b5a4a`.
- **Focus:** A clear blue outline and border change identify keyboard focus.
- **Error / Disabled:** Invalid fields receive an oxblood border and nearby error text. Disabled fields use a muted fill and text; in the journal they also go dashed.

### Navigation

- **Style:** The brand uses serif display type. Account links use compact sans-serif text with a fine underline for the current route; hover adds an underline and oxblood text.
- **Mobile:** Navigation moves to its own full-width row beneath the brand.
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

### Empty states

The empty tent is a dashed parchment plate with a drawn tent, flame, and lantern, a serif title, and one short line pointing to the next action.

## Campaign selector

The protected campaign selector is a full-screen galaxy. The starfield extends behind the header, list, and campaign details. The Adventure Ledger is the default style for the app's forms and reading surfaces.

Use Source Serif 4 for the brand and campaign names. Floating controls use translucent midnight violet surfaces (`#111021` at about 85%), light text (`#f4efff`, muted `#c3bdd7`), and warm starlight accents (`#f5d3ae`) for the selected campaign and primary action; focus is a lilac `#d2baff` on a `#080714` night. Keep the center open for the scene. The campaign list sits at the left and scrolls within its disclosure; campaign details appear beside the selected planet at widths of 960px and above. At narrower widths, the card sits below the orbit controls. On phones, start with the list collapsed. The standalone create form uses the same dark palette with familiar light input fields.

## Individual campaign camp

The campaign page at `/app/campaigns/:campaignId` is a pixel-art camp at night: a campfire ringed by the seated party, a steward's wagon, a tent for the viewer's characters, and a panorama of layered hills and sky that the player pans by dragging, swiping, or scrolling sideways. The campaign's own planet colours the landscape through a palette swap, with that landscape's particles drifting through the firelight. Arriving from the galaxy plays a short descent once; reduced motion skips it, and the scene holds still. Seated figures carry the characters' names on plates and wear the looks their players chose.

Places reachable from the scene and from the Places list beneath it (a compact row at the bottom left on wide screens): **Overview** (campfire), **Party** (bedroll circle), **My characters** (tent), and, for the owner, **Campaign settings** (steward's wagon). Each scene button carries a name plate and a 3px starlight focus ring. The Places list is the complete, keyboard-first route; the scene buttons and the seated-party name plates are conveniences, and the plates are decorative.

Opening a place frames it on the side of the screen the journal does not cover, dims the scene, then opens the journal as a modal sheet (docked at the side on wide screens, full-screen on phones). Clicking outside the sheet on wide screens returns to camp. The journal is the adventurer's journal described above, with a "Back to camp" link. Status messages sit in persistent live regions, one on the camp and one in the journal.

A gear in the app header opens "Camp background": the campaign's world or one of six landscapes (grass and pines, dunes, ash and basalt, snow, scree, cloud reef). The choice is saved on this device only, per campaign. A player's own adventurer look is set from the Party journal's appearance drawer.

### Firelight

The campfire is the scene's light. Two overlay canvases sit above the art: a **light map** multiplied over it (the night's ambient colour, cool and dim, with the fire's pool of warm light cut into it) and a **glow** screened over it (a warm bloom in the same pool). The pool is drawn in about eight hard bands with an ordered dither, so it reads as pixel-art lighting, and it flickers across six pre-drawn levels. Figures and props (not the bedrolls or the pit) cast flattened shadows away from the flames, strongest in the brightest light and gone at its edge. On arrival the ambient eases from dusk to night over about 4.5 seconds; under reduced motion it is night from the first frame and the light holds one level. The outline and the flame sit above both canvases and keep their own colours. Tokens live in `campLight.ts`; do not tint the camp's art or chrome to fake it.

### Camp colours

Camp chrome (header, Places, name plates, the settings popover) is dark and warm, defined as `--camp-*` tokens in `camp.css`:

- **Night** `#181628`: the page behind the scene, and the shadow base.
- **Surface** `#1d192d` and **Hover** `#353142`: the header, popover, and hovered rows.
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

- **Do** keep sign-in and account creation equally weighted in the current auth layout.
- **Do** retain standard labeled fields, visible keyboard focus, and clear text states.
- **Do** stack the account panels in reading order on small screens.
- **Do** reserve the panel shadow for the auth panel and use paper tones and rules for surrounding structure.
- **Do** keep camp colours in `--camp-*` tokens, journal colours in `--journal-*` tokens, and status text in always-mounted live regions.
- **Do** build new camp pages from `CampPanel` and the `journal-*` primitives (button, field, input, section title, chip, status, alert) so they inherit the cover, parchment, and 44px targets.
- **Do** pair every status color with an icon and words, and keep touch targets at 44px or more in the journal.
- **Do** put a destructive action behind an inline confirmation in the dashed oxblood zone.

### Don't:

- **Don't** turn standard form controls into decorative props.
- **Don't** let fantasy ornament or surface decoration compete with the form labels and actions.
- **Don't** use the focus and success colors as general-purpose accents.
- **Don't** let camp name plates or scene art carry information the Places list and the journal do not also provide.
- **Don't** put a journal skin (leather, brass, parchment) on the auth pages or the galaxy.
- **Don't** nest plates inside plates, or use the pressed-key shadow outside buttons.
- **Don't** use Lantern as a fill or for large areas; it is a small warm signal.
