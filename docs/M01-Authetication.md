# M01 — Authentication

## Status

**Phase 1 complete — awaiting user verification**

This document tracks the authentication milestone, its decisions, acceptance criteria, and verification results. Update the status and record actual command results as each phase is completed.

## Phase gates

Complete one phase at a time. After a phase's acceptance checks are run, update this document with the results, report the completed work, and stop for the user's verification. Do not begin the next phase until the user verifies the current phase and directs work to continue.

## Decisions

- Use Supabase email/password authentication and immediate sign-in after registration. Email confirmation remains disabled for this local-first milestone.
- Keep anonymous sign-in disabled and refresh-token rotation enabled. Require passwords of at least 8 characters without imposing character-composition rules.
- Allow redirects only for the local Vite development origin (`http://localhost:5173`) and the Playwright origin (`http://127.0.0.1:4173`).
- Keep campaigns private to their owner through PostgreSQL RLS. No schema migration is planned unless a security test identifies a concrete grant or policy defect.
- Do not add custom password storage, authentication endpoints, a separate backend, campaign CRUD, or legacy prototype UI.
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

- [ ] Use Impeccable discovery and new-work direction selection before changing the auth UI. Do not use the archived prototype as the design source.
- [ ] Add session initialization and auth-state subscription around the existing Supabase client; rely on Supabase browser persistence and refresh behavior.
- [ ] Add `/login`, `/register`, a protected `/app` shell, and session-aware root routing. Keep `/dev/status` available for diagnostics.
- [ ] Add validated, accessible login and registration forms with loading, success, and safe error states.
- [ ] Add the authenticated shell with account identity and logout; keep its content a minimal placeholder.
- [ ] Add reusable visual tokens and form/shell components for responsive layouts, clear focus, and sufficient contrast.
- [ ] Add Vitest coverage for auth state, routing, validation, loading, and errors.
- [ ] Add Playwright coverage for UI routing and persistent sessions.

### Acceptance

- Existing sessions restore after reload.
- Signed-out users cannot enter protected routes; successful login routes to `/app`.
- Registration, login, and logout produce clear and accessible feedback at mobile and desktop widths.

## Phase 3 — Integration and Verification

### Work

- [ ] Run the real local flow: register, log out, log in, reload, and log out again.
- [ ] Run two-user and anonymous campaigns RLS tests against local Supabase.
- [ ] Inspect keyboard access, labels, errors, visible focus, contrast, and mobile/desktop layouts.
- [ ] Run frontend lint, formatting, build, unit tests, browser tests, and local Supabase integration tests.
- [ ] Record each command and its actual result below; list any blocked checks or unresolved issues.

### Acceptance

- All listed checks pass against the local Supabase instance.
- Browser code contains only the publishable Supabase key; no service-role credential is added to frontend configuration or tests.
- No campaign CRUD or unrelated product features are introduced.

## Verification log

| Check | Result |
| --- | --- |
| `npm run supabase:start` (`implementation/backend`) | Passed; local Supabase started with the updated configuration |
| `npm run supabase:status -- --output env` (`implementation/backend`) | Passed on an escalated retry; local API URL reported, with `supabase_imgproxy_backend` and `supabase_pooler_backend` stopped (pooler is disabled and image transformation is not configured) |
| Local Supabase Auth and campaigns RLS API checks (temporary Node scripts, `implementation/frontend`) | Passed; tested seven-character rejection, immediate signup session, login/logout, owner create/update/delete, denial of all anonymous table operations, other-user read/update/delete denial, and forged owner insert denial |
| `npm run supabase:stop` (`implementation/backend`) | Not run; stack remains running for user verification |
| `npm run test:local-supabase` (`implementation/frontend`) | Pending; Phase 3 |
| `npm run lint` (`implementation/frontend`) | Pending |
| `npm run format:check` (`implementation/frontend`) | Pending |
| `npm run build` (`implementation/frontend`) | Pending |
| `npm test` (`implementation/frontend`) | Pending |
| `npm run test:e2e` (`implementation/frontend`) | Pending |

## Risks and safeguards

- Frontend guards are navigation behavior, not authorization. Campaign access must continue to be enforced by PostgreSQL RLS and verified through API requests.
- Local test accounts may remain in the local Auth database because tests use only the publishable key and no admin credential. Do not reset the local database as routine cleanup.
- The first local Supabase CLI status attempt could not write its telemetry file under `/Users/ton/.supabase` in the sandbox; an escalated retry succeeded. The status output listed the pooler and image proxy as stopped. Pooling is disabled and image transformation is not configured for this milestone.
- The temporary local test accounts remain in the local Auth database. The test campaign was deleted after the owner-operation checks. No service-role key was used by the test script.

## Unresolved issues

- No Phase 1 authentication or campaigns RLS defects were identified. The stack and API behavior were verified; optional pooler and image proxy services are stopped. Phase 2 remains gated on user verification of Phase 1.
