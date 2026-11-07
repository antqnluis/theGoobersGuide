# Repository Guidelines

## Authoritative Specifications

Read [docs/PRODUCT.md](docs/PRODUCT.md) for the product vision and user experience, and [docs/MVP_SCOPE.md](docs/MVP_SCOPE.md) for the initial release requirements, acceptance criteria, data relationships, and exclusions. These two documents are the authoritative project specifications. If a broad product idea conflicts with an MVP boundary, follow `docs/MVP_SCOPE.md` for the initial release. Do not treat future opportunities or optional enhancements as required MVP work.

See [docs/DESIGN.md](docs/DESIGN.md) for the proposed interface system. It guides visual work but does not change the product or MVP requirements.

The Goober's Guide is a local D&D campaign companion. The character sheet is its centerpiece: after selecting a campaign, players should reach and update their character's gameplay information quickly. The campaign dashboard is the entry point, and the party roster, campaign notes, and dice roller support that experience.

## MVP Priorities and Boundaries

Build a functioning local application covering every required feature in `docs/MVP_SCOPE.md`: campaign library and dashboard, party roster, editable character sheets, campaign notes, dice roller, local persistence, and responsive navigation. Prioritize the character sheet experience, campaign management and separation, and dice rolling while completing the other required flows.

All character and campaign information is entered and maintained manually. Support user-entered values and homebrew content. Ability modifiers may be derived from scores, but skills, saving throws, attacks, and other gameplay values must remain manually adjustable. Do not build a full D&D rules engine.

The local prototype includes two fixed demo sign-ins and character ownership labels so the per-player editing flow can be demonstrated. This is client-side behavior only: do not describe it as secure authentication or data protection. Do not add real account registration, passwords for characters, cloud storage, synchronization, AI integrations, sheet parsing, DM tools, or other excluded systems listed in `docs/MVP_SCOPE.md`. Keep all character sheets visible in the local application, with sheets owned by another demo user read-only. Optional enhancements in that document come only after required MVP workflows work end to end.

## Technology and Architecture

Use React, TypeScript, Vite, and Tailwind CSS. Run the MVP locally; deployment and a backend are not required. Prefer built-in browser and React capabilities over extra packages. Add a dependency only when it clearly simplifies a required feature, and avoid complex state frameworks and premature infrastructure.

Organize `src/` by feature, with clear boundaries for authentication, campaigns, characters, notes, and dice. Keep shared UI and domain types in small, purpose-specific modules. Separate presentation and application behavior from persistence code. Use typed models and a dedicated LocalStorage adapter so a future storage implementation can replace it without rewriting feature UI. Keep the architecture modular without adding abstractions for hypothetical features.

Model campaigns, characters, and campaign notes as the main persistent entities. Every campaign may have one optional party, with membership stored separately from its campaign characters. New characters remain in My Character until their owner adds them to the party; only the owner may add or remove their character. Every character belongs to exactly one campaign and one fixed demo user; every note belongs to exactly one campaign. Filter records by the active campaign in every relevant view. Confirm deletion of campaigns, characters, and notes; deleting a character also removes its party membership, and deleting a campaign removes its associated local characters and notes. Dice rolls are client-side and need no permanent campaign association; recent roll history may last only for the current session.

Keep campaign creation and campaign library entries focused on campaign name and description. Create or rename a campaign's party inside that campaign. Current location and status are campaign details maintained from the overview.

Persist campaigns, characters, notes, and any implemented preferences locally. Keep the mock signed-in user ID in `sessionStorage`. Include a basic schema version, validate data read from storage, handle missing or malformed data without crashing, and preserve unrelated campaigns when editing or switching. LocalStorage and the mock sign-in provide persistence and a UI demonstration, not secure data protection.

## Repository Structure and Tooling

This repository has `src/` for application code, `tests/` for feature and persistence tests, and `docs/` for documentation. Group source files by feature in `src/`. Keep setup notes, decisions, and user-facing explanations in `docs/`. Add `assets/` only if checked-in static files are needed. Exclude generated output and local dependencies from version control.

From the repository root, run `npm install` to install dependencies, `npm run dev` to start Vite, `npm run build` to type-check and build, `npm test` to run tests, `npm run format:check` to check formatting, and `npm run format` to apply formatting. See [docs/SETUP.md](docs/SETUP.md) for local setup. Use TypeScript and React conventions, and keep Prettier configuration current. Name modules for their features rather than collecting unrelated code in broad `utils` files.

## Interface and Verification

Keep character statistics, HP, inventory, currency, and dice rolling quick to reach and edit. Make the dice roller accessible without losing the selected campaign context. Show clear empty states and basic feedback. Keep essential controls usable at desktop and mobile widths. A fantasy journal style may support the interface, but readability and accessibility take priority.

When behavior is implemented, test its important paths and failure cases using one consistent test location and document the test command. Pay particular attention to sign-in and logout, owner-only character edits and deletion, campaign isolation, refresh persistence, invalid stored data, confirmed deletions, quick character edits, and dice ranges, modifiers, and totals. Verify the end-to-end scenario and definition of done in `docs/MVP_SCOPE.md` before calling the MVP complete.

## Commits and Pull Requests

There is no Git history or established commit convention. Use short, imperative commit subjects that describe the change. Keep pull requests focused, with a summary, checks performed, relevant issue links, screenshots for visible interface changes, and any setup changes.

## Subagent Delegation

Available project-scoped reviewers:

- `qa_reviewer` reviews functional correctness, regressions, import and persistence behavior, data isolation, and test coverage after substantial behavior or data changes.
- `ui_reviewer` reviews consistency, responsive behavior, interactions, and accessibility after substantial UI changes or roadmap phases.

Invoke reviewers by the configured names `qa_reviewer` and `ui_reviewer`. Use only the reviewer relevant to the change; skip both for trivial changes unless requested. After a substantial UI phase, run both independent reviews in parallel when their scopes do not conflict. Reviewers are read-only: they report findings and never edit or fix implementation files. The main agent consolidates findings, resolves confirmed in-scope issues, and runs relevant checks; do not have agents edit the same files concurrently.

After completing a UI roadmap phase and its checks, stop for the user's manual visual review and explicit approval before starting another phase.

## Agent-Specific Instructions

Do not use emojis in repository documentation or contributor communication.
