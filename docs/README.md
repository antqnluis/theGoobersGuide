# Docs

Docs are grouped by status. When a doc's status changes, move it to the matching folder with `git mv`, update its **Status** section, and update the table below.

| Folder | Holds |
| --- | --- |
| [`in-progress/`](in-progress/) | Plans and logs for work under way |
| [`completed/`](completed/) | Milestones that shipped, with their verification logs |
| [`paused/`](paused/) | Plans partly built and then set aside |
| [`archive/`](archive/) | Superseded plans and briefs, kept for history |
| [`reference/`](reference/) | Docs that describe the current system and are kept up to date |
| [`art/`](art/) | Review images and art references used by the plans |

## In progress

| Doc | Status |
| --- | --- |
| [M03 — Campaign Functionality Audit and Roadmap](in-progress/M03-Campaign-Functionality-Audit.md) | Roadmap for M1–M8. M1–M3 are done; M4–M8 are not started. |

## Completed

| Doc | Status |
| --- | --- |
| [M01 — Authentication](completed/M01-Authentication.md) | Phases 1–3 done. |
| [M02 — Campaign Management](completed/M02-Campaign-Management.md) | Phases 1–3 done. |
| [M02 — Landfall Camp](completed/M02-Landfall-Camp.md) | Phases 0–7 done. Firefox, VoiceOver, and real-device checks were not run. |
| [M03.1 — Membership Lifecycle](completed/M03.1-Membership-Lifecycle.md) | Phases 0–7 done. |
| [M03.2 — Characters and Party](completed/M03.2-Characters-and-Party.md) | Phases 0–6 done. The full browser suite was last run after Phase 5; Phase 6 re-ran only lint, format, build, unit, and local-stack tests. |
| [M03.2 — Implementation Log](completed/M03.2-Implementation-Log.md) | Per-phase record of the M03.2 work. |
| [M03.3 — Inventory and Currency](completed/M03.3-Inventory-and-Currency.md) | Phases 0–5 done. The full browser suite and local-stack suite pass; the camp-scene tests are timing-flaky under load and pass alone. |
| [M03.3 — Implementation Log](completed/M03.3-Implementation-Log.md) | Per-phase record of the M03.3 work, including the later change requests. |

## Paused

| Doc | Status |
| --- | --- |
| [M02 — Galaxy Redesign Plan ("The Wayfinder's Orrery")](paused/M02-Galaxy-Redesign-Plan.md) | Steps 1–4 shipped; steps 5–8 not built. |

## Archive

| Doc | Why it was archived |
| --- | --- |
| [M02 — Galaxy Campaign Selector](archive/M02-Galaxy-Campaign-Selector.md) | The carousel it describes was replaced by the orrery. |
| [M02 — Campaign World Redesign Plan (Lantern Village)](archive/M02-Campaign-World-Redesign-Plan.md) | Superseded by Landfall Camp. |
| [M03.2.0 — Characters and Party brief](archive/M03.2.0-Characters-and-Party-Brief.md) | Planning brief; the plan itself lives in `completed/`. |

## Reference

| Doc | Covers |
| --- | --- |
| [Database schema](reference/DATABASE_SCHEMA.md) | Profiles, campaigns, membership, invitations, characters and party, access rules, and retention |
