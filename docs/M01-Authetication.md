# M01 — Authentication

## Status

**Phase 3 integration and verification complete — awaiting user verification**

This document tracks the authentication milestone, its decisions, acceptance criteria, and verification results. Update the status and record actual command results as each phase is completed.

## Phase gates

Complete one phase at a time. After a phase's acceptance checks are run, update this document with the results, report the completed work, and stop for the user's verification. Do not begin the next phase until the user verifies the current phase and directs work to continue.

## Decisions

- Use Supabase password authentication and immediate sign-in after registration. New accounts require a unique username and may include an email. Existing email-only accounts retain email sign-in. Email confirmation remains disabled for this local-first milestone.
- Keep anonymous sign-in disabled and refresh-token rotation enabled. Require passwords of at least 8 characters without imposing character-composition rules.
- Allow redirects only for the local Vite development origin (`http://localhost:5173`) and the Playwright origin (`http://127.0.0.1:4173`).
- Keep campaigns private to their owner through PostgreSQL RLS. Record new usernames transactionally in a private table linked to the Auth user ID.
- Keep password storage and verification in Supabase Auth. A Supabase Edge Function handles username resolution and passes verification to Auth.
- Establish the new authentication visual direction through Impeccable before implementing frontend UI. The direction should support clear, quick account entry during and between sessions.

## Phase 1 — Backend Authentication

### Work

- [x] Review local Supabase Auth configuration and existing campaigns RLS migration.
- [x] Align local Auth redirect URLs with the app and Playwright origins.
- [x] Set the server-side minimum password length to 8.
- [x] Verify local email/password registration, login, and logout against Supabase Auth.
- [x] Verify owners can manage their own campaigns, other users cannot read or mutate those rows, forged owner inserts fail, and anonymous access is denied.
- [x] No database migration was needed; the security checks found no grant or policy defect.

### Acceptance

- Local Supabase starts with the configuration and migrations.
- Registration returns an authenticated session immediately; login and logout work against the local Auth API.
- Campaign RLS tests prove owner isolation and anonymous denial using real local API requests.

## Phase 2 — Frontend Authentication

### Work

- [x] Use Impeccable discovery and new-work direction selection before changing the auth UI. Do not use the archived prototype as the design source.
- [x] Add session initialization and auth-state subscription around the existing Supabase client; rely on Supabase browser persistence and refresh behavior.
- [x] Add `/login`, `/register`, a protected `/app` shell, and session-aware root routing. Keep `/dev/status` available for diagnostics.
- [x] Add validated, accessible login and registration forms with loading, success, and safe error states. Require password confirmation and provide separate reveal controls at registration.
- [x] Add the authenticated shell with account identity and logout; keep its content a minimal placeholder.
- [x] Add reusable visual tokens and form/shell components for responsive layouts, clear focus, and sufficient contrast.
- [x] Add Vitest coverage for auth state, routing, validation, loading, and errors.
- [x] Add Playwright coverage for UI routing and persistent sessions.
- [x] Persist the selected visual contract and document the implemented design tokens.

### Acceptance

- [x] Existing sessions restore after reload.
- [x] Signed-out users cannot enter protected routes; successful login routes to `/app`.
- [x] Registration, login, and logout produce clear and accessible feedback at mobile and desktop widths.

## Phase 3 — Integration and Verification

### Work

- [x] Run the real local flow with and without an email. Verify username and email sign-in, session restoration, sign-out, duplicate username rejection, and private lookup permissions.
- [x] Run two-user and anonymous campaigns RLS tests against local Supabase.
- [x] Inspect keyboard access, labels, errors, visible focus, contrast, and mobile/desktop layouts.
- [x] Run frontend lint, formatting, build, unit tests, browser tests, and local Supabase integration tests.
- [x] Record each command and its actual result below; list any blocked checks or unresolved issues.

### Acceptance

- [x] All listed checks pass against the local Supabase instance.
- [x] Browser code contains only the publishable Supabase key; no service-role credential is added to frontend configuration or tests.
- [x] No campaign CRUD or unrelated product features are introduced.

## Verification log

| Check                                                                                                | Result                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run supabase:start` (`implementation/backend`)                                                  | Passed; local Supabase started with the updated configuration                                                                                                                                                                |
| `npm run supabase:status` (`implementation/backend`)                                                 | Earlier `--output env` run passed on an escalated retry; the fresh plain status attempt was blocked when the CLI tried to write `/Users/ton/.supabase/telemetry.json`. The live API was confirmed by the Phase 3 integration test. |
| Local Supabase Auth and campaigns RLS API checks (temporary Node scripts, `implementation/frontend`) | Passed; tested seven-character rejection, immediate signup session, login/logout, owner create/update/delete, denial of all anonymous table operations, other-user read/update/delete denial, and forged owner insert denial |
| `npm run supabase:stop` (`implementation/backend`)                                                   | Not run; stack remains running for user verification                                                                                                                                                                         |
| `npm run lint` (`implementation/frontend`)                                                           | Passed                                                                                                                                                                                                                       |
| `npm run format:check` (`implementation/frontend`)                                                   | Passed                                                                                                                                                                                                                       |
| `npm run build` (`implementation/frontend`)                                                          | Passed; Vite reported a 519.07 kB minified JavaScript chunk (150.25 kB gzip), above its 500 kB warning threshold                                                                                                             |
| `npm test` (`implementation/frontend`)                                                               | Passed; 2 files and 14 tests                                                                                                                                                                                                 |
| `npm run test:e2e` (`implementation/frontend`)                                                       | Passed; 4 Chromium tests covering diagnostics, registration, mocked Auth session restore/login/logout, and mobile form navigation                                                                                            |
| Responsive auth captures (`.impeccable/review/`)                                                     | Reviewed at 1440px, 768px, and 375px; no horizontal overflow; mobile registration navigation brings the focused form and submit action into view                                                                             |
| Impeccable detector on changed UI files                                                              | Passed; returned no findings (`[]`)                                                                                                                                                                                          |
| Impeccable finish review                                                                             | `ship` for the two scored fixes: saved direction contract/seed and mobile registration navigation. The chosen pick had no persisted QUALITY BAR board, so the verdict was scoped to those fixes                              |
| Design documentation                                                                                 | Added root `DESIGN.md` and `.impeccable/design.json` with the user-confirmed visual language and extracted tokens                                                                                                            |
| Phase 3 `npm run lint` (`implementation/frontend`)                                                   | Passed                                                                                                                                                                                                                       |
| Phase 3 `npm run format:check` (`implementation/frontend`)                                           | Passed                                                                                                                                                                                                                       |
| Phase 3 `npm run build` (`implementation/frontend`)                                                  | Passed; Vite reported a 522.76 kB minified JavaScript chunk (151.58 kB gzip), above its 500 kB warning threshold                                                                                                             |
| Phase 3 `npm test` (`implementation/frontend`)                                                       | Passed; 2 files and 20 tests                                                                                                                                                                                                 |
| Phase 3 `npm run test:e2e` (`implementation/frontend`)                                               | Passed; 5 Chromium tests covering diagnostics, registration, mocked Auth session restore/login/logout, and mobile and desktop navigation                                                                                       |
| Phase 3 `npm run test:local-supabase` (`implementation/frontend`)                                    | Passed; 2 Chromium tests against local Supabase covered both registration paths, username and email sign-in, session restore/sign-out, duplicate username rejection, private lookup denial, and campaign RLS isolation            |
| Phase 3 auth accessibility and layout review                                                         | Passed; semantic labels, announced errors, keyboard password reveal, visible focus, 375px mobile layout without horizontal overflow, and 1280px desktop layout. Sampled text contrast was at least 6.29:1 and focus contrast at least 5.96:1. |
| Browser credential scan                                                                              | Passed; no service-role or secret-key references in frontend source, tests, example configuration, or built assets                                                                                                          |

## Risks and safeguards

- Frontend guards are navigation behavior, not authorization. Campaign access must continue to be enforced by PostgreSQL RLS and verified through API requests.
- Local test accounts may remain in the local Auth database because tests use only the publishable key and no admin credential. Do not reset the local database as routine cleanup.
- The first local Supabase CLI status attempt could not write its telemetry file under `/Users/ton/.supabase` in the sandbox; an escalated retry succeeded. The status output listed the pooler and image proxy as stopped. Pooling is disabled and image transformation is not configured for this milestone.
- The temporary local test accounts remain in the local Auth database. The test campaign was deleted after the owner-operation checks. No service-role key was used by the test script.

## Username update verification

- `npm run db:migrate` applied the username migration to the existing local database. `npm run supabase:stop` and `npm run supabase:start` reloaded the Edge Function with local data preserved.
- Frontend `npm run lint`, `npm run format:check`, and `npm run build` passed. Vite reported a 522.23 kB minified JavaScript chunk.
- `npm test` passed 20 tests. `npm run test:e2e` passed 5 Chromium tests. The registration form was reviewed at 375 px and 1280 px. Browser checks covered keyboard operation of the password reveal control and the mobile form focus and layout.
- `npm run test:local-supabase` passed 2 tests. The live flow verified both registration paths, both sign-in identifiers, duplicate username rejection, generic invalid-credential errors, session restoration, private lookup permissions, and campaign isolation.
- A separate local Auth check signed in and out with an email-only account created before the migration. Test accounts remain in local Auth. The integration test removed its test campaigns.

## Unresolved issues

- No Phase 1 authentication or campaigns RLS defects were identified. Phase 2 was verified by the user; Phase 3 checks pass and this final phase awaits user verification.
- The production build still reports a JavaScript chunk above the 500 kB warning threshold. The build succeeds; code splitting has not been added in this milestone.
- No local QUALITY BAR board was persisted for the selected field-guide pick. The finish review returned `ship` for the two fixes it scored, and its verdict did not claim a full-surface ceiling review.
