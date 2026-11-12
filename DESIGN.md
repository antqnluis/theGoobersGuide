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

## Do's and Don'ts

### Do:

- **Do** keep sign-in and account creation equally weighted in the current auth layout.
- **Do** retain standard labeled fields, visible keyboard focus, and clear text states.
- **Do** stack the account panels in reading order on small screens.
- **Do** reserve the panel shadow for the auth panel and use paper tones and rules for surrounding structure.

### Don't:

- **Don't** turn standard form controls into decorative props.
- **Don't** let fantasy ornament or surface decoration compete with the form labels and actions.
- **Don't** use the focus and success colors as general-purpose accents.
