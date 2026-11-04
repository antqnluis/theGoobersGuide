# Repository Guidelines

## Authoritative Specifications

Read [docs/PRODUCT.md](docs/PRODUCT.md) for the product vision and user experience, and [docs/MVP_SCOPE.md](docs/MVP_SCOPE.md) for the initial release requirements, acceptance criteria, data relationships, and exclusions. These two documents are the authoritative project specifications. If a broad product idea conflicts with an MVP boundary, follow `docs/MVP_SCOPE.md` for the initial release. Do not treat future opportunities or optional enhancements as required MVP work.

See [docs/DESIGN.md](docs/DESIGN.md) for the proposed interface system. It guides visual work but does not change the product or MVP requirements.

The Goober's Guide is a local D&D campaign companion. The character sheet is its centerpiece: after selecting a campaign, players should reach and update their character's gameplay information quickly. The campaign dashboard is the entry point, and the party roster, campaign notes, and dice roller support that experience.

## MVP Priorities and Boundaries

Build a functioning local application covering every required feature in `docs/MVP_SCOPE.md`: campaign library and dashboard, party roster, editable character sheets, campaign notes, dice roller, local persistence, and responsive navigation. Prioritize the character sheet experience, campaign management and separation, and dice rolling while completing the other required flows.

All character and campaign information is entered and maintained manually. Support user-entered values and homebrew content. Ability modifiers may be derived from scores, but skills, saving throws, attacks, and other gameplay values must remain manually adjustable. Do not build a full D&D rules engine.

Do not add login, user accounts, character passwords, character-level privacy, access control, cloud storage, synchronization, AI integrations, sheet import or parsing, DM tools, or the other excluded systems listed in `docs/MVP_SCOPE.md`. All character information is accessible in the local application. Optional enhancements in that document come only after the required MVP works end to end.

## Technology and Architecture

Use React, TypeScript, Vite, and Tailwind CSS. Run the MVP locally; deployment and a backend are not required. Prefer built-in browser and React capabilities over extra packages. Add a dependency only when it clearly simplifies a required feature, and avoid complex state frameworks and premature infrastructure.

Organize `src/` by feature, with clear boundaries for campaigns, characters, notes, and dice. Keep shared UI and domain types in small, purpose-specific modules. Separate presentation and application behavior from persistence code. Use typed models and a dedicated LocalStorage adapter so a future storage implementation can replace it without rewriting feature UI. Keep the architecture modular without adding abstractions for hypothetical features.

Model campaigns, characters, and campaign notes as the main persistent entities. Every character belongs to exactly one campaign, and every note belongs to exactly one campaign. Filter records by the active campaign in every relevant view. Confirm deletion of campaigns, characters, and notes; deleting a campaign also removes its associated local characters and notes. Dice rolls are client-side and need no permanent campaign association; recent roll history may last only for the current session.

Persist campaigns, characters, notes, and any implemented preferences locally. Include a basic schema version, validate data read from storage, handle missing or malformed data without crashing, and preserve unrelated campaigns when editing or switching. LocalStorage provides persistence, not secure data protection.

## Repository Structure and Tooling

This repository has `src/` for application code, `tests/` for feature and persistence tests, and `docs/` for documentation. Group source files by feature in `src/`. Keep setup notes, decisions, and user-facing explanations in `docs/`. Add `assets/` only if checked-in static files are needed. Exclude generated output and local dependencies from version control.

From the repository root, run `npm install` to install dependencies, `npm run dev` to start Vite, `npm run build` to type-check and build, `npm test` to run tests, `npm run format:check` to check formatting, and `npm run format` to apply formatting. See [docs/SETUP.md](docs/SETUP.md) for local setup. Use TypeScript and React conventions, and keep Prettier configuration current. Name modules for their features rather than collecting unrelated code in broad `utils` files.

## Interface and Verification

Keep character statistics, HP, inventory, currency, and dice rolling quick to reach and edit. Make the dice roller accessible without losing the selected campaign context. Show clear empty states and basic feedback. Keep essential controls usable at desktop and mobile widths. A fantasy journal style may support the interface, but readability and accessibility take priority.

When behavior is implemented, test its important paths and failure cases using one consistent test location and document the test command. Pay particular attention to campaign isolation, refresh persistence, invalid stored data, confirmed deletions, quick character edits, and dice ranges, modifiers, and totals. Verify the end-to-end scenario and definition of done in `docs/MVP_SCOPE.md` before calling the MVP complete.

## Commits and Pull Requests

There is no Git history or established commit convention. Use short, imperative commit subjects that describe the change. Keep pull requests focused, with a summary, checks performed, relevant issue links, screenshots for visible interface changes, and any setup changes.

## Agent-Specific Instructions

Do not use emojis in repository documentation or contributor communication.
