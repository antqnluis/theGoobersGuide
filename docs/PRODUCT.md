# The Goober's Guide
## Product Vision & Requirements

**Project:** The Goober's Guide

**Product Type:** Collaborative Dungeons & Dragons adventuring companion

**Primary Audience:** Private D&D friend groups

**Current Implementation:** Local browser MVP / prototype

**Product Definition:** v0.2 — integrated character, party, and adventures direction

**Document Status:** Canonical target product direction; implementation scope and architectural designs remain subject to validation

---

## 1. Executive Product Summary

The Goober's Guide is a **player-centered, collaborative adventuring platform** for D&D groups. It combines interactive character management, a shared view of the party, and lightweight adventure coordination in a single campaign workspace.

Players use it to manage their characters during gameplay and to coordinate the *personal, duo, trio, and other side adventures* that take place alongside the group's main storyline. They can record an objective, invite collaborators, track what remains pending, and optionally attach a summary supplied by their AI Dungeon Master (DM).

**The Goober's Guide is not a second DM campaign database.** The DM remains authoritative for the game world, narrative outcomes, and official character changes. The app is a player-facing interaction and coordination layer that works even when players have no direct access to the DM's private files or AI project.

**Proposed product promise:** *Your character, your party, your adventures — connected in one place.*

## 2. Problem and Opportunity

The group plays a primary campaign together, typically once a week. Individual characters also pursue their own objectives, encounter NPCs, and sometimes go on smaller adventures with selected other characters.

The group's curated AI DM tracks the authoritative campaign and character information. However, players generally do not receive persistent access to those records after a session; they can request their own character sheets when needed. Players may therefore forget pending NPC interactions, personal goals, and which companions were involved in side adventures.

A conventional character sheet viewer helps with character reference, but does not provide an easy way to coordinate or revisit player-led activities. Conversely, requiring players to re-document all DM-managed events would create duplicate data entry and discourage adoption.

**Opportunity:** Give players a low-friction place to use their character information and coordinate *only the adventures and objectives they choose to maintain*, with private-by-default collaboration and optional DM-provided handoffs.

## 3. Vision and Positioning

### 3.1 Vision

> The Goober's Guide gives D&D players one connected place to use their characters, collaborate with their party, and follow the personal and shared adventures unfolding around their main campaign — without having to recreate the Dungeon Master's records.

### 3.2 Three product pillars

1. **Interact:** Turn player-provided character sheets into usable gameplay workspaces for statistics, abilities, inventory, resources, and dice.
2. **Coordinate:** Help players understand their party and collaborate on selected objectives, missions, and smaller adventures.
3. **Carry forward:** Keep player-tracked objectives and approved character updates accessible between sessions; support reviewed imports of DM-provided material without pretending to sync with the DM.

### 3.3 Distinctive value

The app must do more than place separate tools on adjacent tabs. Its value comes from connecting **who is involved**, **what they are trying to do**, and **which character information or resources they choose to use or share**.

A personal mission can involve a single character, expand to a duo or trio, remain hidden from other players, and later become party-visible with participant approval. The shared campaign dashboard shows each signed-in player only what they are authorized to see.

### 3.4 Product boundaries

**In scope:** Interactive character profiles; campaign and party navigation; lightweight adventure threads; participant invitations and collaboration; privacy-aware adventure views; optional handoff imports; basic gameplay utilities.

**Not required:** A comprehensive DM-style quest encyclopedia; full NPC/world-state tracking; mandatory session recaps; automatic narrative adjudication; autonomous quest completion; a virtual tabletop; direct access to a friend's private ChatGPT project.

The app supports homebrew rules and should not silently rewrite user-confirmed mechanics.

## 4. Target Users and Responsibilities

| Actor | Primary need | Scope of authority |
|---|---|---|
| Player / character owner | Use a character and track personally relevant objectives | Controls their character's editable data and their participation in adventures |
| Adventure participant | Coordinate a solo or group thread | Contributes to an accepted adventure and approves changes to its audience |
| Party member | See approved party information | Views main and explicitly shared adventures, never undisclosed private threads |
| Campaign organizer | Maintain campaign shell and party roster | Organizes the workspace but has **no automatic override** to read private adventures |
| AI Dungeon Master (external) | Run and remember the campaign | Remains authoritative for narrative outcomes and official game state; has no assumed connection to the app |

DM-facing features may be considered in a later release, but are not required for the defined player workflows.

## 5. Core Product Capabilities

### 5.1 Campaign Library and Separation

Users can create and enter separate campaign workspaces. Each campaign has independent characters, one optional party, and its own player-managed adventures. Switching campaigns does not mix their records.

For the **current local prototype**, campaign creation focuses on name and description; party setup follows inside the campaign. Preserve this behavior unless a later UX decision explicitly changes it.

### 5.2 Campaign Overview

The dashboard should answer three questions quickly:

- **Who am I playing?** Provide a clear path to the player's character workspace.
- **What can I act on?** Show a small selection of pending or active adventures the user may see, including any next steps.
- **Who is with me?** Show the current party roster and approved character summaries.

Main adventures appear as party-wide context. Private adventures appear **only for their accepted participants**. Shared side adventures appear to authorized party members. Private adventures must not appear as locked placeholders, leaked titles, activity indicators, or counts to nonparticipants.

The dashboard should be a concise launch point, not a mandatory campaign journal or a complete quest editor.

### 5.3 Party Management

Each campaign currently supports one optional party. The roster is a subset of that campaign's characters. A character may exist in the campaign without joining the party; only its owner can add or remove it from the roster.

The party view shows approved general character information and links to character profiles where access is permitted. Its future collaboration features must respect character privacy independently of adventure visibility.

### 5.4 Character Workspace

A character profile organizes identity, level, class/species, ability scores and modifiers, skills and saves, combat data, attacks, features, spells, equipment, currency, and other applicable or homebrew content.

Players should be able to adjust current resources and access common gameplay actions without repeatedly editing a static sheet. Imported values must be reviewable, and explicitly entered modifiers take precedence over automatic assumptions.

**Character import and reconciliation:** Player-provided Markdown character sheets may be imported and reviewed; later imports should propose differences rather than silently overwrite local changes. The authoritative status of an imported snapshot depends on what the DM actually supplied.

### 5.5 Adventures — the Collaboration System

An **Adventure Thread** is a lightweight, player-managed record of a goal, NPC-related follow-up, mission, or developing story involving one or more characters. It may be informal and does not have to be an official DM-issued quest.

**Adventure types** (presentation categories, not rigid participant counts):

- **Main:** The group's party-wide storyline or shared objective.
- **Side:** An activity involving selected characters, including duos or trios.
- **Personal:** A character-specific objective; it can gain participants without being recreated.

A thread can be created in seconds, updated collaboratively, and optionally enriched with a DM-provided text or Markdown handoff. The player-facing status is a coordination aid, not an assertion that the DM has adjudicated an outcome.

### 5.6 Lightweight Notes

Notes remain available for player convenience but are **optional**, not a required campaign-documentation workflow. Adventure updates or a short 'next step' should meet most coordination needs. Rich NPC directories, location indexes, or timeline tools are future possibilities, not assumptions underlying the initial Adventures feature.

### 5.7 Dice Roller and Gameplay Utilities

The dice roller remains globally accessible and supports standard polyhedral dice, multi-die rolls, modifiers, individual results, totals, and recent session history. Future character-specific shortcuts may prefill saved modifiers and respect campaign-specific/homebrew rules.

### 5.8 Multi-user Collaboration

The **target shared product** requires real accounts, campaign membership, server-enforced authorization, and durable shared storage. The **current prototype** uses two fixed demo sign-ins and LocalStorage. Those demo identities and client-side checks do **not** secure private data or implement genuine multiplayer collaboration.

## 6. Adventures: Minimum Data and Defaults

The first creation form should request as little information as possible. Some required data can be inferred from the current context.

| Field | Requirement | Default / behavior |
|---|---|---|
| Title | Required user input | Short plain-language objective |
| Campaign | Required, inferred | Current campaign |
| Creator / owner account | Required, inferred | Signed-in user |
| Type | Required | Personal or Side for a private thread; Main for party-wide context |
| Participating character(s) | Required | Start with creator's selected character; invite others separately |
| Status | Required | `Pending` by default; other options: `In progress`, `On hold`, `Completed` |
| Visibility | Required, inferred | `Participants only` for Personal/Side; `Party` for Main |
| Description | Optional | Blank |
| Next step | Optional | Blank |
| NPC or location reference | Optional | Free text initially; structured links can come later |
| Updates / handoffs | Optional | Added after creation |
| Timestamps / source provenance | Required system metadata | Generated automatically |

**Important distinctions:** `type` describes the activity; `visibility` determines who may view it; `participants` identifies the characters involved. These must not be the same field or derived permanently from one another.

## 7. Finalized Adventure Collaboration Rules

The following rules express the selected **collaborative management** model. They describe the **intended shared product**, not a security guarantee of today's local prototype.

### 7.1 Participation and invitations

1. An adventure begins with at least one accepted participant: the creating player's selected character.
2. A participant may propose inviting another campaign character. An invitation does not immediately grant access to private thread content.
3. For a private thread with multiple accepted participants, **all current accepted participants must approve expanding the participant list before the invitation is sent**. This prevents one participant from disclosing a secret activity unilaterally.
4. The invited character's owner may accept or decline. Only acceptance adds that character as an active participant and grants the associated account access.
5. A participant may leave an adventure. Removing another accepted participant requires their agreement, except for separately designed abuse-handling or account-deletion mechanisms. Disputes about membership should not silently expose information.
6. Participation is recorded by character, while actual data access is authorized through the account that owns that character. A user with multiple characters does not gain implicit participation for every character.

### 7.2 Collaborative editing

Accepted participants can update the thread title, description, player-tracked status, next step, and optional linked references. They can add short updates, attach reviewed DM handoffs, and see the thread's participant-visible change history.

Changes are attributable to the actor. An edit must not silently modify another character's sheet or any DM-authoritative record. A basic audit history is recommended for shared release to support conflict resolution.

### 7.3 Privacy and party-wide sharing

1. **Personal and Side adventures start private.** Only accepted participants can access the thread's details.
2. A participant can **propose** sharing with the party; sharing is not activated by a single person's toggle.
3. **Every currently accepted participant must approve** before a private thread becomes party-visible. Any decline leaves it private.
4. Any accepted participant may **withdraw their sharing consent**, returning the thread to participants-only visibility. This cannot erase information already seen or copied outside the application.
5. If participants change, the app must revalidate sharing consent. A newly joining participant must agree to party-wide visibility before the thread remains shared; otherwise it reverts to private until everyone approves.
6. The Main adventure is party-visible by design. It is not a suitable place for secret side-mission content.
7. Campaign organizers have no automatic exception for viewing private adventures. No secret titles, participant lists, counts, search results, notifications, or activity metadata are exposed to unauthorized viewers.
8. The server must check authorization on every read, update, search, export, attachment, and notification operation; frontend-only hiding is insufficient.

**Definition of party-visible:** Accounts controlling characters currently on the campaign's party roster can see the shared thread. Campaign membership alone is not sufficient unless the user is also a participant. A future permissions design may expand audiences deliberately, but should not do so implicitly.

### 7.4 Deletion and lifecycle

Participants can mark a thread completed or reopen it as a player-tracked status change. For the first shared release, destructive deletion is restricted to the creator with confirmation and a recoverable archive/soft-delete approach; other participants can leave or request removal. This avoids one participant irreversibly deleting group contributions.

A completed adventure remains accessible to its authorized audience unless archived or removed according to the permission rules.

### 7.5 DM handoffs and authority

Players may paste or upload DM-provided text/Markdown. The system proposes an adventure title, description, status, next step, and related NPC references for review. A player chooses whether to create a new thread or attach the source to an existing one.

**Never publish imported private content automatically.** Importing, parsing, and applying proposed changes must preserve the destination thread's access rules; a new side/personal thread starts private. The original handoff or a source reference should remain attached where feasible, with provenance and import date.

The app must never treat a parser's guesses as definitive lore or silently convert an unverified player objective into an officially completed DM quest.

## 8. End-to-End Player Workflows

### W1 — Create a private objective

1. Open a campaign and choose `New Adventure`.
2. Enter a short title; default to the selected character, Pending, and Participants-only visibility.
3. Save immediately. Optionally enter a next step, NPC name, or description.
4. The new thread appears on the creator's **My Adventures** list and personal dashboard, not on other players' feeds.

### W2 — Invite and collaborate on a side mission

1. From the private thread, propose another character.
2. Obtain required approval from existing accepted participants before any invitation reveals the thread to the new person.
3. The invited character's owner accepts or declines.
4. Accepted participants can update progress, next steps, and short notes.
5. The thread appears in each participant's authorized view.

### W3 — Share a private adventure with the party

1. An accepted participant requests `Share with party`.
2. All accepted participants explicitly approve.
3. The thread becomes visible in the shared Adventures area and party-facing dashboard.
4. Revoked consent or a newly unapproved participant returns the thread to private.

### W4 — Import an AI DM handoff

1. Paste or upload an available Markdown/text handoff.
2. Review extracted fields and any ambiguous information.
3. Attach it to a permitted existing thread or create a new one.
4. Confirm the proposed updates. The import does not change audience, membership, or unrelated character records automatically.

### W5 — Return before the weekly main session

1. Open the campaign dashboard.
2. See the main storyline card and relevant pending/in-progress threads the viewer may access.
3. Open a personal objective or shared side mission to see its next step and participants.
4. Jump to the character workspace or other gameplay utility as needed.

## 9. Information Architecture and UI Direction

**Application level:** Campaign Library; Campaign Creation.

**Campaign level:** Campaign Overview; My Character / Character Profiles; Party; **Adventures**; optional Notes; Campaign Settings.

**Global utilities:** Dice Roller.

### Campaign Overview sections

- **My Character:** Direct access to a chosen character and immediate gameplay information.
- **My Adventures:** A short, permission-filtered list of the player's personal and shared threads, with status/next step.
- **The Party:** Approved party roster and general character summaries.
- **Shared Adventure context:** The party's main objective and explicitly shared side adventures, where relevant.

### Adventures page

A single page can support `Mine`, `Shared with party`, and `Completed` views or equivalent filters. Private information is filtered **before** producing dashboard results, search results, counts, sorting, or notification previews.

### Adventure detail screen

Display a title, category, player-tracked status, visibility, approved participants, description, next step, short update feed, optional NPC/reference text, and handoff sources. Only authorized participants see editing and invite/share controls.

### UX principles

- **Low-friction capture:** A title and an inferred creator/campaign should be enough to save a personal objective.
- **No mandatory double-entry:** Don't require full session histories, quest stages, or NPC biographies.
- **Progressive disclosure:** Advanced fields appear when useful, not on the initial creation form.
- **Privacy by default:** Secret adventures are absent rather than displayed as locked silhouettes.
- **Useful during play:** Character actions and campaign context are reachable with minimal navigation.
- **Fantasy identity, modern usability:** Theme enhances rather than obscures readability and accessibility.

## 10. Conceptual Data Responsibilities (Not Yet a Physical Schema)

| Concept | Core responsibility | Important relationship |
|---|---|---|
| User | Authenticated account and ownership | May own several characters |
| Campaign | Independent workspace | Has characters, party, adventures |
| Campaign membership | Defines membership and general workspace access | User ↔ Campaign |
| Party | The campaign's one optional party | Includes a subset of its characters |
| Character | Player-facing gameplay identity and state | Owned by user, belongs to campaign |
| Adventure | Title, type, status, audience, next step | Belongs to one campaign; creator account |
| Adventure participant | Invitation, acceptance, consent, role | Adventure ↔ Character (many-to-many) |
| Sharing approval | Explicit agreement to party visibility | Tied to adventure, accepted participant, and consent state |
| Adventure update | Attributed short progress note/change | Belongs to adventure; author user |
| Handoff import | Source, parser proposal, reviewed application | References one adventure and importing actor |

**Data flow boundary:** AI DM → player-provided export (if available) → reviewed import → player-managed adventure/character records. No assumed API connection or automatic synchronization.

**Architecture note:** The ERD should support multi-character ownership, many-to-many adventure participation, secure authorization, provenance, and status history without hardcoding solo/duo/trio as separate table types. Define the physical schema **after** validating these screens and workflows.

## 11. Prioritization (MoSCoW)

These are **target product priorities**, not claims about what has already shipped.

| Priority | Capability | Rationale |
|---|---|---|
| **Must** | Campaign separation and party roster | Reliable context for everything else |
| **Must** | Editable interactive character workspace and core dice tools | Everyday gameplay utility |
| **Must** | Quick private adventure creation, status, next step, and viewer-filtered dashboard | Minimal useful Adventures experience |
| **Must** | Account-backed participant invitations, collaborative editing, server-side access controls, unanimous sharing approval for a shared deployment | Collaboration cannot be shipped safely without real privacy |
| **Should** | DM Markdown/text handoff import with review and source provenance | Chosen second creation path; can follow the basic manual vertical slice |
| **Should** | Character update comparison/reconciliation | Makes recurring DM character handoffs easier |
| **Should** | Search/filter adventures and browse short updates | Useful as stories accumulate |
| **Could** | Structured NPC references, item-to-adventure links, party capability comparisons | Richer cross-feature integration |
| **Could** | Notifications, transfer workflows, export/backup, richer adventure history | Adds convenience after core collaboration works |
| **Won't yet** | Direct private AI DM project access, automated lore capture, mandatory campaign chronicle, autonomous quest resolution, full virtual tabletop | Outside current problem and permissions |

## 12. Proposed Development and Validation Stages

**Stage A — Product/UX validation (now):** Validate dashboard, new-adventure flow, invitation/consent states, private and shared list views, handoff review, and character-to-adventure navigation using synthetic/mock data.

**Stage B — Local vertical slice:** Implement create/view/edit/status for adventures in the local prototype. Make privacy limitations conspicuous; simulate multiple viewpoints for UX testing but **do not claim secret data is protected**.

**Stage C — Secure shared foundation:** Implement real authentication, campaign membership, storage, participant invitations, backend authorization, sharing approvals, and privacy-focused tests before exposing genuine private adventures to multiple users.

**Stage D — Import and integration:** Add reviewed DM handoff imports, character snapshot reconciliation, improved filtering, and optional structured links.

Avoid finalizing a full production database schema solely from screen layouts; define domain relationships and authorization invariants first, then design persistence around validated workflows.

## 13. Acceptance Criteria and Success Signals

### Essential workflow checks

- A player can create a personal objective with minimal input and find it again after navigating away.
- An unauthorized player cannot discover a private adventure through dashboard cards, list counts, search, previews, URLs, or API calls in the shared product.
- A new participant cannot read a private thread until existing participants authorize disclosure and the invitee accepts.
- Accepted collaborators can edit the thread and see who contributed updates.
- A proposal to share with the party does nothing until every accepted participant approves it.
- Revoking consent removes further in-app party-wide access, subject to the limitation that previously copied information cannot be recalled.
- A DM handoff can be imported through a review step without silently changing access or overwriting unrelated player data.
- A character owner can reach their character workspace and common gameplay utilities from the campaign overview.

### Qualitative success signals

- Players use Adventures to remember and coordinate real side activities rather than maintaining duplicate comprehensive campaign notes.
- The group can answer "What am I involved in, and what is my next step?" without needing to query the DM for basic player-maintained reminders.
- Creating a basic objective feels fast enough to do mid-session.
- Players trust that private missions remain private to the people they selected.

## 14. Decisions and Deferred Questions

### Agreed product decisions

- Integrated platform: character interaction **and** meaningful party collaboration.
- AI DM remains authoritative; no assumed access to its private campaign records.
- Side/personal adventures are private to their accepted participants by default.
- Players can opt to share those adventures with the party with **all participant approvals**.
- Adventures can be created manually or enriched/created from a **reviewed** DM-provided handoff.
- **Collaborative management**: accepted participants can jointly maintain a thread; secret-sharing and participant expansion need explicit consent.

### Defaults proposed here for implementation review

- Main adventures are party-visible, while Personal/Side adventures start private.
- Participant-list expansion of an existing secret thread needs approval from all current participants before the invitation is sent.
- Destructive deletion is creator-controlled and recoverable; ordinary progress editing is collaborative.
- Party visibility is tied to current party-member accounts, not every campaign account.

These defaults are conservative privacy-preserving interpretations of the agreed direction. If the group later wants lighter approval mechanics, revise the requirements **before** schema/API implementation rather than weakening authorization accidentally.

### Not necessary to settle yet

- Exact visual theme, navigation arrangement, and responsive screen composition.
- Whether the party needs advanced resource transfer or synchronized inventory features.
- Whether NPC references graduate from simple text to separate structured records.
- Integration method or export conventions for any future DM-provided files.
- Production database technology and detailed table/column definitions.

## 15. Product Statement

The Goober's Guide is not an AI Dungeon Master and is not intended to reconstruct the entire campaign from memory.

It is a **player-owned, privacy-conscious adventuring companion**: a place to use characters during sessions and to coordinate the personal and shared stories that unfold around the main adventure.

**Guiding principle:** *Spend less time managing the adventure, and more time being part of it.*

## Implementation boundary

[MVP_SCOPE.md](MVP_SCOPE.md) remains the contract for the existing local application. The approved Stage A work covers the isolated, synthetic A1–A2 Adventures preview described in [UI_PROTOTYPE_ROADMAP.md](UI_PROTOTYPE_ROADMAP.md). A1 has been user-confirmed and verified; A2 adds simulated invitations and participation only. Real accounts, secure privacy, multiplayer collaboration, imports, and shared storage are not shipped features or authorization to implement them. No backend, live Adventures persistence, or migration is included.
