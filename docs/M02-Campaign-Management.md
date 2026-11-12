# M02 — Campaign Management

## Status

**Phase 1 complete locally — awaiting user verification**

This document tracks the campaign management milestone, its decisions, acceptance criteria, and verification results. Update the status and record actual command results as each phase is completed.

## Phase gates

Complete one phase at a time. After a phase's acceptance checks are run, update this document with the results, report the completed work, and stop for the user's verification. Do not begin the next phase until the user verifies the current phase and directs work to continue.

## Decisions

- Use the existing Supabase authentication and protected `/app` shell from M01. Keep campaigns private and enforce access through PostgreSQL Row Level Security (RLS), not frontend route guards alone.
- Let authenticated players create campaigns with a required name and optional description. The creator is the owner; only owners can edit or delete campaign details.
- Show campaigns a player owns or is explicitly a member of. Keep invitation links, joining flows, and member administration out of this milestone.
- Inspect the actual schema before implementation. M01 verified owner-only campaign RLS and a private username mapping; do not assume that a public `profiles` table or `campaign_members` table has already been deployed. Reuse compatible tables and add only the migrations required for this milestone.
- Use the registered username as the player-facing identity. Preserve the private username lookup and authentication behavior established by M01; do not expose private account records or add a separate display-name requirement.
- If campaign membership infrastructure is missing, add the minimal `campaign_members` relationship, securely backfill existing owners, and make campaign creation plus owner membership atomic. Do not introduce invitations or new member-management UI.
- Reuse the visual direction documented in `DESIGN.md` and `.impeccable/design.json`. Use Impeccable to review the new campaign surfaces before frontend implementation and again during visual verification.

## Phase 1 — Backend Campaign Management

### Work

- [x] Review the current Supabase migrations, campaign schema, username/profile representation, existing RLS policies, and frontend Supabase client. Confirm the M01 authentication and ownership guarantees remain intact.
- [x] Verify or add campaign fields for `id`, `owner_id`, `name`, optional `description`, `created_at`, and `updated_at`, preserving existing campaign records and owners.
- [x] Verify or add the minimum campaign-membership table with a unique campaign/profile-or-user pair and an `owner`/`member` role, using the existing stable Auth-linked user identifier. Preserve compatible schema already in place.
- [x] Backfill owner membership for existing campaigns if needed; ensure creating a campaign and establishing its owner membership succeeds or fails as one transaction.
- [x] Implement and verify persistent campaign create, list, detail, update, and delete operations. Reject blank or whitespace-only campaign names in the database. The Phase 2 form will prevent duplicate submissions.
- [x] Ensure owners can edit/delete their campaigns, members can read campaigns they belong to, and non-members and anonymous clients cannot read or mutate private campaigns. Prevent forged ownership, membership creation, and role escalation.
- [x] Provide authorized member-roster reads with usernames without exposing the private username-resolution table. Avoid recursive RLS and broad security-definer privileges.
- [x] Verify campaign deletion removes only the campaign and dependent membership data as intended; it must not delete users, authentication records, or unrelated data.
- [x] Add automated local Supabase/API tests for positive and negative authorization paths. Use versioned, non-destructive migrations where changes are required.

### Acceptance

- Local Supabase starts with all required migrations. Applying the migration preserves existing accounts, usernames, and campaigns.
- Campaign create, list, detail, update, and delete operations persist and respect ownership and membership. Owners are registered as members without partial writes.
- Real local API checks demonstrate that anonymous users and non-members cannot access private campaigns; regular members cannot edit/delete campaigns or elevate their permissions.
- Username lookup and M01 login, registration, session restoration, and logout continue working.

## Phase 2 — Frontend Campaign Management

### Work

- [ ] Inspect existing routes, authenticated shell, components, and M01 design artifacts. Use Impeccable discovery/review to align the campaign UI with the established visual direction.
- [ ] Add a campaign dashboard inside the protected app, listing accessible campaigns with name, optional description, the current player's role, and a Create Campaign action.
- [ ] Add a Create Campaign form with a required name, optional description, inline validation, cancel navigation, loading state, safe errors, and duplicate-submit prevention.
- [ ] After successful creation, navigate to the new campaign workspace. Keep campaign IDs in navigable URLs and support direct links and refreshes.
- [ ] Add a campaign workspace displaying campaign information, owner username, current members, and navigation back to the campaign dashboard. Show owner/member distinctions clearly.
- [ ] Add owner-only editing and deletion controls. Confirm destructive deletion explicitly; provide success/error feedback and return to the dashboard after successful deletion.
- [ ] Handle empty campaign lists, loading states, unavailable campaigns, insufficient permissions, and network failures without exposing private data.
- [ ] Add accessible labels, keyboard operation, visible focus indicators, and responsive layouts at 375px, 768px, and 1440px.
- [ ] Add Vitest and Playwright coverage for creation, navigation, validation, dashboard states, editing, deletion, and permission-based UI behavior.

### Acceptance

- An authenticated player can create a campaign, see it in the dashboard, enter its workspace, update its details, and delete it with confirmation.
- Campaigns and their changes remain visible after refresh and new sessions. Direct campaign URLs work for authorized users.
- Members see only their authorized campaigns and member information; regular members do not receive owner controls. Backend RLS remains the source of authorization.
- The campaign UI follows the existing design contract and works with keyboard navigation and mobile/desktop layouts.

## Phase 3 — Integration and Verification

### Work

- [ ] Run real local Supabase flows with two users and an anonymous client. Test campaign creation, owner membership, listing, update, deletion, and cross-user isolation.
- [ ] Verify an authorized member can read a campaign while non-members cannot; verify denial of forged ownership, membership insertion, unauthorized updates, and role escalation. If member enrollment is not exposed yet, use controlled test setup rather than adding a joining feature.
- [ ] Verify existing M01 authentication and username flows are not broken, including login, registration, session restoration, sign-out, and private username lookup permissions.
- [ ] Test dashboard and workspace navigation, direct-link refresh, form validation, empty/loading/error states, and delete confirmation.
- [ ] Inspect accessibility, focus, contrast, and responsive behavior at 375px, 768px, and 1440px. Record Impeccable detector/finish-review outcomes for affected UI surfaces.
- [ ] Run frontend lint, formatting, build, unit tests, browser tests, and local Supabase integration tests using the actual repository commands.
- [ ] Update this document with the commands run, actual results, failures, and any deferred issues. Update database or design documentation if implementation changes their documented contracts.

### Acceptance

- [ ] All required campaign management flows pass against local Supabase and remain functional across refreshes.
- [ ] Campaign and membership RLS tests demonstrate owner, member, non-member, and anonymous boundaries; browser code contains no service-role credentials.
- [ ] Existing M01 authentication flows remain functional and no invitation, character, party-management, note, adventure, or dice feature is introduced.
- [ ] Verification results are recorded below; the phase stops for user verification before further milestone work.

## Verification log

| Check | Result |
| --- | --- |
| `npm run db:migrate` (`implementation/backend`) | Passed on the running local stack. Before-and-after row counts and content fingerprints matched for profiles, campaigns, and memberships. The database contained one profile and no campaigns or memberships before migration. The name constraint validated with no legacy names to correct. |
| Campaign CRUD, roster, and RLS checks | Passed in the real local API suite. Verified owner enrollment, campaign and roster isolation, read-only membership access, username visibility, whitespace validation, and deletion cascades. |
| M01 authentication and username regression checks | Passed in the real local suite, including registration, case-insensitive username sign-in, email sign-in, session restoration, sign-out, and private lookup permissions. |
| `npm run lint` (`implementation/frontend`) | Passed. |
| `npm run format:check` (`implementation/frontend`) | Passed. |
| `npm run build` (`implementation/frontend`) | Passed. Vite reported a chunk larger than 500 kB after minification. |
| `npm test` (`implementation/frontend`) | Passed, 20 tests. |
| `npm run test:e2e` (`implementation/frontend`) | Passed, 5 tests. |
| `npm run test:local-supabase` (`implementation/frontend`) | Passed, 2 tests. The suite cleaned up its campaigns and their memberships. Test accounts remain in local Auth. |
| Responsive and accessibility review (375px, 768px, 1440px) | Pending campaign UI. |
| Impeccable detector and finish review | Pending campaign UI. |

## Risks and safeguards

- M01's documented campaign policies were owner-only. Before allowing member reads, update and test the RLS model deliberately; do not accidentally broaden access to all authenticated users.
- M01's username mapping was private. Display campaign owner/member usernames only through an explicitly authorized query or narrowly scoped interface; do not expose the private authentication lookup table.
- Creating a campaign and its owner membership must be atomic. Existing owner records must be backfilled before foreign-key or policy changes make them inaccessible.
- Frontend hiding is not permission enforcement. Verify negative authorization cases with authenticated and anonymous API requests.
- Preserve the existing local database and accounts; do not run destructive resets or use service-role credentials in browser code. Inspect dependent foreign keys before implementing deletion.
- Keep invitations, join requests, character sheets, notes, adventures, party management, and AI-DM data outside M02. The workspace may reserve navigation space but must not imply those features are implemented.

## Unresolved issues

- Verify the application's current routing conventions before choosing final campaign URLs beneath `/app`.
- Phase 1 verification used the running local stack. A clean stack startup was not exercised.
