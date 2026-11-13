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
rounded:
  control: "3px"
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
---

# Design System: The Goober's Guide

## Overview

**Creative North Star: "The Adventure Ledger"**

A calm, personal player record for quick use during and between sessions. The visual language takes the form of a contemporary player handbook spread: warm uncoated paper, charcoal serif display type, narrow folio rules, and restrained oxblood accents.

The mood is a personal campaign journal with softer earth tones and lightly lifted sections. Familiar web controls stay clear and central; the forms share equal weight and stack in reading order on small screens.

**Key Characteristics:**

- Warm paper and charcoal ink establish a quiet reading surface.
- Serif display type and sans-serif interface text balance print character with quick scanning.
- Oxblood folios mark primary actions and active routes; supporting colors stay tied to states.
- Light paper panels receive a restrained lift, and form controls remain conventional.

## Colors

The palette pairs warm paper neutrals with an oxblood accent, reserving other hues for focus and status feedback.

### Primary

- **Oxblood Folio**: Identifies the page rule, active route, panel folios, primary buttons, and text selection.

### Secondary

- **Focus Blue**: Marks keyboard focus and supporting links so focus remains distinct from the primary accent.
- **Forest Green**: Communicates successful form feedback.

### Neutral

- **Warm Paper**: The page background and the ground behind the content.
- **Light Paper**: Auth panel surfaces and light button text.
- **Charcoal Ink**: Main headings and primary text.
- **Soft Ink**: Explanatory copy and secondary navigation.
- **Stone Rule**: Header separators and quiet dividers.

**The Oxblood Folio Rule.** Use oxblood for the main route and action cues; keep focus blue and success green tied to their specific states.

## Typography

The pairing uses a bookish serif for display and section headings, with a plain sans-serif for forms, labels, links, and supporting copy.

### Hierarchy

- **Display**: Large serif page headings establish the screen's reading entry.
- **Headline**: Serif form headings separate the two equal account routes.
- **Body**: Sans-serif descriptions and feedback stay easy to scan.
- **Label**: Bold sans-serif labels keep each standard field explicit.

## Layout

On wider screens, center the content in a frame capped at 1264px with two equal form columns. The header, title, and footer align to the same frame. The page uses generous outer gutters; they step down to 32px below 900px and to 22px on small screens. At widths below 680px, the account columns become one vertical stack, the header navigation moves to its own row, and the footer links stack. Keep both routes visible in normal page flow. The current title and form descriptions use readable line lengths rather than stretching across the frame.

## Elevation & Depth

Depth is mostly carried by paper tone and fine rules. The auth panels use one restrained shadow to lift the shared form surface from the page; the header and surrounding page remain flat.

### Shadow Vocabulary

- **Auth panel lift**: A soft, low-contrast shadow under the shared account panel; use for the paired auth surface.

**The Quiet Lift Rule.** Keep the shadow on the auth panel and let paper contrast and rules do the remaining work.

## Shapes

Controls use a single subtle radius, while the larger page and panel surfaces stay square. Thin rules and panel dividers provide structure; the oxblood top folio gives each route a small, consistent edge. Avoid ornamental silhouettes around ordinary web controls.

## Components

The components feel refined and restrained: familiar controls sit inside a calm, editorial frame.

### Buttons

- **Shape:** Nearly square control corners, shared across both button variants.
- **Primary:** Oxblood fill with light-paper text and compact, clear padding.
- **Secondary:** Transparent at rest with a quiet border; on hover it becomes a charcoal-filled action.
- **Hover / Focus:** Hover deepens the primary fill. Keyboard focus uses a visible blue outline with offset.

### Cards / Containers

- **Corner Style:** The panel remains square.
- **Background:** Light Paper separates the form area from Warm Paper.
- **Shadow Strategy:** Use the single restrained auth panel lift described above.
- **Border:** A thin center divider separates the equal desktop columns; the oxblood top rule identifies each route.
- **Internal Padding:** Each route has generous desktop padding that tightens on mobile.

### Inputs / Fields

- **Style:** Familiar full-width fields with a near-white fill, thin muted stroke, and shared control corners.
- **Focus:** A clear blue outline and border change identify keyboard focus.
- **Error / Disabled:** Invalid fields receive an oxblood border and nearby error text. Disabled fields use a muted fill and text.

### Navigation

- **Style:** The brand uses serif display type. Account links use compact sans-serif text with a fine underline for the current route; hover adds an underline and oxblood text.
- **Mobile:** Navigation moves to its own full-width row beneath the brand.

## Campaign selector

The protected campaign selector is a full-screen galaxy. The starfield extends behind the header, list, and campaign details. The Adventure Ledger is the default style for the app’s forms and reading surfaces.

Use Source Serif 4 for the brand and campaign names. Floating controls use translucent midnight violet surfaces, light text, and warm starlight accents for the selected campaign and primary action. Keep the center open for the scene. The campaign list sits at the left and scrolls within its disclosure; campaign details appear beside the selected planet at widths of 960px and above. At narrower widths, the card sits below the orbit controls. On phones, start with the list collapsed. The standalone create form uses the same dark palette with familiar light input fields.

## Individual campaign camp

The campaign page at `/app/campaigns/:campaignId` is a pixel-art camp at night: a campfire ringed by the seated party, a steward's wagon, and a panorama of layered hills and sky that the player pans by dragging, swiping, or scrolling sideways. The campaign's own planet colours the landscape through a palette swap, with that landscape's particles drifting through the firelight. Arriving from the galaxy plays a short descent once; reduced motion skips it, and the scene holds still.

Three places are reachable from the scene and from the Places list beneath it (a compact row at the bottom left on wide screens): **Overview** (campfire), **Party** (bedroll circle), and, for the owner, **Campaign settings** (steward's wagon). Each scene button carries a name plate and a 3px starlight focus ring. The Places list is the complete, keyboard-first route; the scene buttons and the seated-party name plates are conveniences, and the plates are decorative.

Opening a place frames it on the side of the screen the journal does not cover, then opens the journal as a modal sheet (docked at the side on wide screens, full-screen on phones). The journal is Adventure Ledger: light paper, charcoal ink, serif headings, an oxblood top rule, familiar form controls, and a "Back to camp" link. Status messages sit in persistent live regions, one on the camp and one in the journal.

A gear in the app header opens "Camp background": the campaign's world or one of six landscapes (grass and pines, dunes, ash and basalt, snow, scree, cloud reef). The choice is saved on this device only, per campaign.

### Camp colours

Camp chrome (header, Places, name plates, the settings popover) is dark and warm, defined as `--camp-*` tokens in `camp.css`:

- **Night** `#181628`: the page behind the scene, and the shadow base.
- **Surface** `#1d192d` and **Hover** `#353142`: the header, popover, and hovered rows.
- **Cream** `#fff0d7`: text and the title, over the scene with a soft shadow.
- **Brass** `#dab98a` and **Brass soft** `#e1c6a4`: hover accents, headings, and secondary text.
- **Edge** `#b99969`: hairline borders on floating controls and plates.
- **Plate** `#291c24`, **Plate hot** `#4a2b28`, **Plate hot edge** `#fff0c9`: name plates at rest and when hovered, focused, or open.
- **Starlight focus** `#ffe7ac`: the focus ring on dark chrome (the journal uses Focus Blue on paper).
- **Ledger bar, rule, edge, back, scroll**: the journal's own light-paper accents (`--camp-ledger-*`).

Text on camp chrome measures at least 7:1; do not introduce a colour in `camp.css` without adding it here as a token. The camp has no dark/light switch: the scene is always night.

### Camp behaviour

- Touch: horizontal drags pan; vertical drags still scroll the page. Every scene button, Places row, and the gear is at least 44px.
- Motion: idle effects run at roughly 14 draws a second, none while the tab is hidden or under reduced motion.
- The waystone on the high road is a pointer-only shortcut back to the galaxy (hidden from assistive tech and the tab order); "Back to campaigns" in the header is the accessible route.
- Scene buttons outside the visible frame leave the tab order; focusing a Place in the list pans the camera to it.

See the [camp plan](docs/M02-Landfall-Camp.md) for the destination map, camera, and interaction details.

## Do's and Don'ts

### Do:

- **Do** keep sign-in and account creation equally weighted in the current auth layout.
- **Do** retain standard labeled fields, visible keyboard focus, and clear text states.
- **Do** stack the account panels in reading order on small screens.
- **Do** reserve the panel shadow for the auth panel and use paper tones and rules for surrounding structure.
- **Do** keep camp colours in `--camp-*` tokens and status text in always-mounted live regions.

### Don't:

- **Don't** turn standard form controls into decorative props.
- **Don't** let fantasy ornament or surface decoration compete with the form labels and actions.
- **Don't** use the focus and success colors as general-purpose accents.
- **Don't** let camp name plates or scene art carry information the Places list and the journal do not also provide.
