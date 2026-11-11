# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are private groups of friends playing ongoing Dungeons & Dragons campaigns. Players use the application during sessions to reference and manage their characters, campaign, and party, and between sessions to maintain notes and coordinate personal, small-group, and party-wide adventures.

## Product Purpose

The Goober's Guide is a collaborative, player-facing D&D companion that brings character management, campaign and party information, gameplay utilities, notes, and adventure tracking together. It should make useful campaign information easy to find and frequent player actions quick during a session, while helping players continue the stories and objectives they choose to track between sessions.

The product is intended to grow into a complete companion through incremental milestones. The current setup/status screen is development infrastructure, not the intended product experience.

## Positioning

The product connects practical character and campaign tools with private and collaborative adventure tracking in one player-centered workspace. It complements the Dungeon Master: it does not replace the DM, recreate the DM's private campaign records, or claim authority over campaign events, rulings, and narrative outcomes.

## Operating Context

Players use the application during and between sessions in ongoing campaigns, primarily within private friend groups. They may consult character sheets, campaign and party information, and dice tools during play, then choose which notes, objectives, and adventure details to maintain afterward. Optional DM-provided handoffs may supply information for players to review and incorporate.

## Capabilities and Constraints

The long-term product direction includes campaign and party management; interactive character sheets and progression; dice and other gameplay utilities; campaign notes and journals; personal, small-group, and party-wide adventures; collaborative tracking of shared adventures and objectives; and optional imports of character sheets or DM-provided Markdown or JSON handoffs.

These are product goals, not a claim that the current application already provides them. Development proceeds by explicit milestone. The active implementation is a local development foundation using React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, and local Supabase with PostgreSQL, Auth, Storage, and Row Level Security. Local-first describes the development environment, not a permanent offline-only product requirement. Implemented production features must use real persistent storage; fixtures and simulated responses must not be presented as completed functionality. Keep the existing architecture and avoid adding a separate application server without a concrete need.

The Dungeon Master remains authoritative for campaign events, rulings, and narrative outcomes. Players are not required to duplicate or maintain the DM's private campaign records. Players choose which notes, objectives, and adventure details to keep; the product should avoid exhaustive logging and unnecessary manual entry. Imported material must be reviewed before it is incorporated and must remain distinguishable from player-maintained information.

Personal and small-group adventures are private to their accepted participants by default. A new invitee must accept before gaining access. Sharing with the wider party requires explicit approval from every involved participant. Backend permissions must enforce access; hiding information in the frontend is not sufficient. Accepted participants can collaboratively maintain shared adventure information, and collaboration must not expose unrelated private content.

## Brand Commitments

The product name is The Goober's Guide. The archived prototype's visual direction is not a constraint for the active application; no binding visual identity has been established for it.

## Evidence on Hand

The active implementation currently has a development setup/status screen that checks frontend initialization and local Supabase Auth connectivity. It does not yet provide the product workflows listed above. The local Supabase migration `implementation/backend/supabase/migrations/20261111230000_create_campaigns.sql` defines an owner-scoped campaigns table with Row Level Security; this is implementation groundwork, not a complete campaign or collaboration experience.

The archived product and MVP documents contain requirements and prototype history, not evidence that those features are present in the active implementation. No user research, customer testimonials, adoption metrics, or external validation are established here; do not invent them.

## Product Principles

- Keep the Dungeon Master authoritative and avoid requiring players to duplicate the DM's private records.
- Let players decide what to record, and make frequent session-time tasks quick to reach.
- Connect characters, campaign context, party information, and player-led adventures in a coherent companion.
- Default personal and small-group information to participant-only access, enforced by backend permissions and explicit consent for wider sharing.
- Deliver features incrementally with real persistence, accessible interaction, and practical desktop and mobile support.

## Accessibility & Inclusion

Support desktop and mobile layouts, readable information, accessible interaction patterns, sufficient contrast, and clear feedback. Keep common gameplay actions efficient and avoid decoration that interferes with use during a session. No specific conformance standard has been established.
