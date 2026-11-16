# M03 — Campaign Functionality Audit and Roadmap

## Status

**Architecture approved (2026-11-13).** The decisions are recorded under [Approved decisions](#approved-decisions). **M1 (membership lifecycle) is implemented** (Phases 0–7 of the plan below, including display names); **M2 (characters and party) is implemented** ([plan](../completed/M03.2-Characters-and-Party.md), [log](../completed/M03.2-Implementation-Log.md), Phases 0–6); **M3 (inventory and currency) is implemented** ([plan](../completed/M03.3-Inventory-and-Currency.md), [log](../completed/M03.3-Implementation-Log.md), Phases 0–5); **M4 (notes) is implemented** ([plan](../completed/M03.4-Notes.md), [log](../completed/M03.4-Implementation-Log.md), Phases 0–5); **M8 character imports are implemented** ([plan](../completed/M03.8-Character-Imports.md), [log](../completed/M03.8-Implementation-Log.md), Phases 0–5; DM handoffs are deferred until after M5); **M5 (adventures core) is implemented** ([plan](../completed/M03.5-Adventures-Core.md), [log](../completed/M03.5-Implementation-Log.md), Phases 0–5); M6–M7 are not started. The implementation-ready plan for M1 is [M03.1 — Membership Lifecycle](../completed/M03.1-Membership-Lifecycle.md). This document remains the overarching architecture reference and roadmap for M1–M8.

## Method and evidence

The sources of truth were the migrations in `implementation/backend/supabase/migrations/`, the running local database, the frontend data layer in `implementation/frontend/src/features/`, the e2e and integration suites, and the current docs. `legacy/docs/PRODUCT.md` was used only as a reference for the intended product rules (adventure consent, party visibility, character privacy).

Checks actually run:

| Check | Result |
| --- | --- |
| Read-only catalog queries against `supabase_db_backend` (`begin transaction read only … rollback`) | All 6 migrations applied. 4 public tables, all with RLS enabled. 7 policies, 11 functions, no Storage buckets or Storage policies, an empty Realtime publication. Local data: 158 profiles, 9 campaigns, 10 memberships, 1 invitation. Every campaign has a matching owner membership row. |
| `npx vitest run` (`implementation/frontend`, with the working tree's uncommitted camp changes) | 280 tests passed. |
| `npm run test:local-supabase`, `test:e2e`, `lint`, `build` | **Not run.** The integration suite creates local accounts, which the audit was not allowed to do. The other checks are irrelevant to a document-only change. |

## 1. Current-state functionality audit

### Implemented and working

| Area | Database | Frontend |
| --- | --- | --- |
| Accounts | `profiles` (id = `auth.users.id`, case-insensitive unique `username`, unused `display_name`/`avatar_url`). An Auth trigger creates the profile. The service-role-only `resolve_username_email` RPC and the `sign-in-with-username` Edge Function handle username sign-in. | Registration, sign-in by username or email, session restore, sign-out (`features/auth`). |
| Campaign CRUD | `campaigns` (owner_id, name with a non-blank check, description, timestamps). Owners can update `name` and `description` (column grants) and delete. Owners and members can read. | Create form, galaxy selector, workspace, owner-only edit and delete with confirmation (`campaignService.ts`, `useCampaignManagement.ts`). |
| Membership | `campaign_members` (owner/member role, one owner per campaign, a unique pair). The owner row is created atomically by a trigger. Clients have **read-only** access. `private.current_campaign_ids()` is a SECURITY DEFINER helper that avoids RLS recursion. `get_campaign_roster` returns `profile_id`, `role`, `username`. | The Party panel lists members, and the camp seats up to 10 roster members as cosmetic sprites (`campParty.ts`). |
| Invitations | `campaign_invitations`, which clients cannot access directly. Owner-only `send_` / `list_campaign_outgoing_` / `cancel_` RPCs. Recipient-only `list_my_` / `respond_to_` RPCs. Acceptance inserts the membership in the same transaction. | Inbox in the selector, outgoing invitations in the Party panel (owner only). |
| Camp preferences | None (by design). | Background and hue are stored per campaign in `localStorage` as a per-device convenience. This is acceptable under AGENTS.md because they are not presented as synced. |

### Reserved in the UI but not implemented

`camp/campLayout.ts` keeps three **dormant, unlabeled props**: `empty-tent`, `map-table`, and `journal-crates`. The M02 docs reserve them for characters, adventures, and journals. `CampLocationId` is a closed union (`overview | party | settings`), and `outlineTargets` and `useDestinationDialog` handle only those three. New destinations plug into the existing `campLocations` table and the dialog's `hidden` sections, so no redesign is needed.

### Not implemented at all

Characters, character sheets, the party roster as characters, inventory, currency, notes, adventures, quests, objectives, dice, Storage (portraits or avatars), Realtime, leaving a campaign, removing members, and transferring ownership.

### Risks and defects found in the current foundation

1. **Default privileges are wide open.** `pg_default_acl` for `public` grants `arwdDxtm` on new tables and `EXECUTE` on new functions to `anon` and `authenticated`. Existing migrations correctly `revoke all … from public, anon, authenticated, service_role` before granting. Every new migration **must** do the same, or new tables and RPCs will be exposed before their policies are reviewed.
2. **Membership is a one-way door.** No RPC or policy lets a member leave or an owner remove a member. Every future feature (characters, notes, adventures) needs a defined outcome for a departing member.
3. **Deleting the owner's account deletes the campaign for everyone** (`campaigns.owner_id → profiles ON DELETE CASCADE`). Today this loses only a roster. Once characters, shared notes, and adventures exist, it would cascade other players' data. This needs a decision before M2 (see Decisions).
4. **Ownership is stored twice** (`campaigns.owner_id` and the `campaign_members` row with `role = 'owner'`). Today this is safe because neither can change. An ownership transfer must update both in one transaction (demote, then promote, because of the one-owner partial index).
5. **Members can see each other only by username.** `profiles` is readable only by its owner, and the roster RPC omits `display_name`. `display_name` and `avatar_url` exist and are updatable, but no UI uses them.
6. **No generated database types.** `campaignTypes.ts` is maintained by hand. As the schema grows, drift between the frontend and the schema becomes likely.
7. **Minor issues:** the insert column grants on `campaigns` let clients choose `id` and `created_at`. This is harmless but inconsistent. Invitations never expire. The integration suite leaves its test accounts in local Auth (158 local profiles). The root `PRODUCT.md` "Evidence on Hand" section is out of date.

## 2. Gap analysis

| Feature | Exists | Missing | DB change? | Frontend |
| --- | --- | --- | --- | --- |
| Campaign details/settings | Name, description, edit, delete | Optional session metadata (e.g. next session date). Ownership transfer. | Small: RPCs. Optional column. | Settings panel (wagon): transfer control. |
| Ownership & permissions | Owner/member roles, owner-only invitations | Leave, remove, transfer. Defined behavior when an account is deleted. | Yes: RPCs, and possibly an FK change (decision) | Party/Settings actions with confirmations |
| Invitations & membership | Full invite lifecycle | Removing members, leaving. (Optional: members proposing invites, expiry.) | RPCs only | Party panel |
| Party roster & characters | Roster of *accounts* only | `characters` table, a party flag, a sheet, campaign-scoped ownership | Yes: new tables | Tent destination ("My character"), Party panel lists characters |
| Inventory & currency | — | Items table, five denominations, atomic adjustments | Yes | Inside the character sheet |
| Notes (personal/shared) | — | `notes` with private/campaign visibility | Yes | Journal crates destination |
| Adventures/quests/objectives | — | Adventures, character-based participants, objectives, updates, consent-based sharing | Yes (largest) | Map table destination |
| Session utilities | — | Dice roller, live party updates, portraits | Dice: none. Realtime/Storage: config and policies. | Global dice control, portrait upload |

## 3. Recommended database architecture

### Principles

- **Campaign ownership and character ownership are separate.** `campaigns.owner_id` controls the campaign shell (details, invitations, membership). `characters.owner_id` controls a character. Being the campaign owner grants **no** read or write access to other players' private sheets, private notes, or private adventures.
- **All access requires current membership.** Every policy on new tables includes `campaign_id in (select private.current_campaign_ids())`, so leaving or being removed revokes access immediately without deleting data.
- **Follow the existing patterns.** Use `private` SECURITY DEFINER helpers with `set search_path = ''` to avoid recursive RLS. Use RPCs for multi-row state transitions (as the invitation RPCs do). Use column-level `UPDATE` grants so immutable keys (`campaign_id`, `owner_id`, `created_by`) cannot be rewritten. Reuse `private.set_updated_at()`.
- **Enforce integrity declaratively where possible.** Composite FKs (`unique (id, campaign_id)`, `unique (id, owner_id)`) guarantee that participants and items belong to the same campaign and owner without triggers.

### Membership lifecycle (no new tables)

- `leave_campaign(p_campaign_id)`: a member only (the owner must transfer first). It removes the membership, sets the member's characters to `in_party = false`, and removes the leaver from any adventures they participate in (once those exist).
- `remove_campaign_member(p_campaign_id, p_profile_id)`: owner only, cannot target the owner row. It has the same side effects as leaving.
- `transfer_campaign_ownership(p_campaign_id, p_profile_id)`: owner only, and the target must be a current member. It demotes the old owner row, promotes the new one, and updates `campaigns.owner_id` in one transaction.
- Optional `get_campaign_party(p_campaign_id)`: members only. It returns roster rows plus `display_name` and party-character summaries, so the existing `get_campaign_roster` contract stays unchanged.

### Characters

```text
characters                       -- summary, readable by every current campaign member
  id uuid pk
  campaign_id uuid → campaigns on delete cascade
  owner_id uuid → profiles on delete cascade, default auth.uid()
  name text (non-blank), species, class_name, subclass, background text
  level int check 1..20
  status text ('active','retired','deceased') default 'active'
  in_party boolean default true                -- the party roster is a subset of characters
  sheet_visibility text ('private','party') default 'private'
  portrait_path text                           -- Storage key, M7
  created_at, updated_at
  unique (id, campaign_id), unique (id, owner_id)

character_sheets                 -- 1:1, owner always. Members only when sheet_visibility = 'party'.
  character_id uuid pk → characters on delete cascade
  current_hp, max_hp, temp_hp, armor_class, speed, initiative int   -- hot in-session fields as columns
  cp, sp, ep, gp, pp int not null default 0 check (>= 0)           -- currency
  sheet jsonb not null default '{}' check (jsonb_typeof(sheet) = 'object')
         -- abilities, skills, saves, attacks, features, spells: edited as a unit by the owner
  updated_at

character_items
  id uuid pk, character_id → characters on delete cascade
  name text (non-blank), quantity int check (>= 0), weight numeric, description text
  equipped boolean, attuned boolean, sort_order int, created_at, updated_at
```

- Split **summary from sheet** because RLS is per row, not per column. The party needs names, classes, and levels. The sheet, inventory, and money stay private unless the owner opts in.
- Use **columns for frequently changed values** (HP, currency) and `jsonb` for the rarely edited sheet body. This avoids whole-document overwrites mid-session.
- Make currency changes through an RPC, `adjust_character_currency(p_character_id, deltas…)`, that applies deltas atomically and rejects negative balances. Otherwise, edits from two devices can silently lose updates.
- A player may own several characters per campaign. Inserts require `owner_id = auth.uid()` and current membership. `campaign_id` and `owner_id` have no update grant.
- The camp can keep seating **accounts** from the roster. Swapping figures to characters is optional and purely presentational.

### Notes

```text
notes
  id uuid pk, campaign_id → campaigns on delete cascade
  author_id → profiles on delete cascade, default auth.uid()
  visibility text ('private','campaign') default 'private'
  title text, body text, character_id uuid null (composite FK to the same campaign)
  updated_by uuid, created_at, updated_at
```

- Private notes are visible only to the author, and only while the author is a member. **There is no campaign-owner override.**
- Campaign notes are readable and editable by all members. A trigger records `updated_by`. Only the author can change `visibility` or delete the note (a trigger rejects visibility changes by anyone else).
- Use optimistic concurrency (`.eq('updated_at', previous)`) for shared notes so simultaneous edits fail visibly instead of overwriting each other.
- Small-group notes belong to adventures (`adventure_updates`), not a third note visibility.

### Adventures, quests, and objectives

```text
adventures
  id uuid pk, campaign_id → campaigns on delete cascade
  created_by → profiles, title text (non-blank)
  type text ('main','side','personal')                     -- what it is
  visibility text ('participants','party')                 -- who sees it; changed only by RPCs
  status text ('pending','in_progress','on_hold','completed') default 'pending'
  description, next_step, reference text
  archived_at timestamptz null                             -- creator-only soft delete
  created_at, updated_at
  unique (id, campaign_id)

adventure_participants            -- participation is by character; access is through its owner
  id uuid pk
  adventure_id, campaign_id   (composite FK → adventures(id, campaign_id))
  character_id, campaign_id   (composite FK → characters(id, campaign_id))
  character_id, profile_id    (composite FK → characters(id, owner_id))
  status text ('proposed','invited','accepted','declined','left')
  invited_by uuid, share_consent boolean default false, responded_at, created_at
  unique (adventure_id, character_id)

adventure_invite_approvals        -- unanimity before a private thread is revealed to an invitee
  participant_id → adventure_participants, approver_id → profiles
  decision text ('approved','rejected'), decided_at
  primary key (participant_id, approver_id)

adventure_objectives
  id, adventure_id → adventures on delete cascade, title, done boolean,
  sort_order, completed_by, completed_at

adventure_updates                 -- attributed, append-only progress log
  id, adventure_id → adventures on delete cascade, author_id, body, created_at
```

- **Main** adventures are party-visible by design and editable by any campaign member. **Personal and side** adventures start with `visibility = 'participants'`.
- `create_adventure(...)` atomically inserts the adventure and the creator's chosen character as an `accepted` participant (the campaign-owner-trigger pattern).
- Invitations: `propose_adventure_participant` creates a `proposed` row. When every accepted participant has approved it, the row becomes `invited`. The invitee then sees **only the title and inviter** until `respond_to_adventure_invitation` accepts. Declining or rejection leaves no trace visible to the invitee beyond their own pending item.
- Sharing: `request_party_share`, `set_share_consent`, `withdraw_share_consent`. Visibility becomes `party` only when every accepted participant consents. Any withdrawal, or a new accepted participant without consent, reverts it to `participants` inside the same RPC.
- "Party" means **accounts that own an active, in-party character in the campaign**, per the product rules. Campaign membership alone is not enough. Implement this as `private.current_party_campaign_ids()`.
- RLS reads go through `private.current_adventure_ids()` (accepted participant) and `private.visible_adventure_ids()` (participant ∪ party-visible ∪ main). Unauthorized users see **no** titles, counts, or placeholders.

### Storage (M7)

A private `character-portraits` bucket with object paths `{campaign_id}/{character_id}/{file}`. `storage.objects` policies mirror `characters`: members read, and only the character owner writes or deletes. Set a size limit and an image MIME allow-list in `config.toml`.

## 4. Migration strategy

- **One forward-only migration per milestone**, timestamped after `20261112140000`, each wrapped in `begin; … commit;`. Existing tables and policies are **not modified**. Every new policy lives on a new table. M1 adds RPCs only.
- **Each migration** creates its tables, enables RLS, and runs `revoke all … from public, anon, authenticated, service_role` (because of the default-privilege finding). It then grants only the needed table and column privileges, creates policies and SECURITY DEFINER helpers with `set search_path = ''`, and revokes or grants `EXECUTE` explicitly on every function.
- **Non-destructive:** no backfills are needed, because no characters, notes, or adventures exist yet. Before and after `npm run db:migrate`, compare the row counts of the existing tables, as the M02 log did. `db:reset` is never part of the workflow.
- **The FK decision (owner account deletion)** is the only possible change to an existing object. If approved, it gets its own migration in M1 (for example, `on delete restrict` plus a transfer-before-delete flow) rather than being bundled with feature tables.
- **Types:** add a `supabase gen types typescript --local` step (backend package script) and switch new services to the generated `Database` type. Hand-written types stay until each file is touched.
- **Verification per migration:** extend `e2e/local-supabase.spec.ts`, or add sibling `local-supabase-*.spec.ts` files run by the same script, with real multi-account API checks covering the negative paths in the matrix below. Reuse the existing `localClient()` and `localDatabaseQuery()` helpers for controlled setup. Have the tests delete their own rows.

## 5. Authorization and RLS permissions matrix

Key: **R** read, **C** create, **U** update, **D** delete, **—** no access. "Member" means a current campaign member who is not the owner. Every non-anonymous column assumes current membership.

| Resource / action | Anon | Non-member | Member | Campaign owner | Character owner | Accepted participant | Pending invitee |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Campaign details | — | — | R | R U D | (as member) | (as member) | — |
| Roster | — | — | R | R | — | — | — |
| Invite / cancel invites | — | — | — | C D | — | — | — |
| Leave campaign | — | — | yes | transfer first | — | — | — |
| Remove member / transfer ownership | — | — | — | yes (not self) | — | — | — |
| Character summary | — | — | R | R (no edit) | R U D, C own | — | — |
| Character sheet, items, currency (`private`) | — | — | — | **—** | R U D | — | — |
| Character sheet, items, currency (`party`) | — | — | R | R | R U D | — | — |
| Toggle in-party / sheet visibility | — | — | — | — | yes | — | — |
| Private note | — | — | — | **—** | — | — | — |
| Private note (author) | — | — | R U D | R U D | — | — | — |
| Campaign note | — | — | R U | R U | — | — | — |
| Campaign note: delete or change visibility | — | — | author only | author only | — | — | — |
| Main adventure | — | — | R U, C | R U, C | — | — | — |
| Private adventure (participants) | — | — | **—** | **—** | — | R U, objectives, updates | title + inviter only |
| Party-visible adventure | — | — | R if in party | R if in party | — | R U | title + inviter only |
| Propose participant / approve | — | — | — | — | — | yes (unanimous) | — |
| Accept/decline adventure invite | — | — | — | — | the invited character's owner | — | yes |
| Share with party / withdraw consent | — | — | — | — | — | yes (unanimous to share, any one to withdraw) | — |
| Archive (soft delete) adventure | — | — | — | — | — | creator only | — |
| Leave adventure | — | — | — | — | — | yes | — |
| Portrait objects | — | — | R | R | R C U D | — | — |

**Explicit negatives to test:** the campaign owner cannot read a member's private sheet, private notes, or a private adventure they are not in. A pending invitee cannot read the description, objectives, or updates. A removed member loses all reads. No one can rewrite `campaign_id`, `owner_id`, `author_id`, or `created_by`. No one can attach another player's character as a participant. Non-participants see no counts or titles through any list RPC.

## 6. Implementation roadmap

Each milestone ships as one migration, its services and TanStack Query hooks, UI integrated into the existing camp panels without redesign, and tests. Each milestone stops for review, as M02 did.

```text
M1 Membership lifecycle ──► M2 Characters ──► M3 Inventory & currency
          │                       │
          ├──► M4 Notes           └──► M5 Adventures core ──► M6 Adventure collaboration
          │
M7 Session utilities (dice: anytime · portraits: after M2 · realtime: after M2/M5)
M8 Imports (character Markdown, DM handoffs): after M3 and M6
```

| # | Milestone | Scope | Depends on | Tests that prove it |
| --- | --- | --- | --- | --- |
| **M1** | Membership lifecycle ([plan](../completed/M03.1-Membership-Lifecycle.md)) | `leave_campaign`, `remove_campaign_member`, `transfer_campaign_ownership`. Decide the owner-deletion FK. `get_campaign_party` with display names and display-name editing on the existing profile column (implemented in M1 on request). Generated types. | — | Integration: member leaves → loses campaign and roster reads. Owner removes → same. Owner cannot remove self or leave. Transfer swaps both owner representations atomically, and the old owner loses edit rights. Non-owners are denied. Unit and e2e: Party and Settings confirmations, error and pending states. |
| **M2** | Characters and party | `characters`, `character_sheets`, membership-checked inserts, party flag, sheet visibility. "My character" (tent) destination: create, edit, view sheet. The Party panel lists each member's in-party characters. | M1 (departure semantics) | Integration: cross-user denial of private sheets, including **for the campaign owner**. A party-visible sheet is readable by members. A non-member cannot create a character in the campaign. Immutable keys. Leaving clears `in_party`. Unit: sheet validation. e2e: create, edit, and refresh persistence, plus empty, loading, and error states. |
| **M3** | Inventory and currency ([plan](../completed/M03.3-Inventory-and-Currency.md)) | `character_items`, currency columns, `adjust_character_currency`. Inventory and money sections of the sheet. | M2 | Integration: visibility follows the sheet. Concurrent deltas both apply. Negative balances are rejected. Non-owners cannot write. e2e: add, edit, and remove items and adjust coins across a refresh. |
| **M4** | Notes ([plan](../completed/M03.4-Notes.md), implemented) | `notes` (private/campaign). Journal crates destination with list, editor, and visibility toggle. | M1 | Integration: a private note is invisible to everyone else, including the owner. A campaign note is editable by members. Only the author changes visibility or deletes. A stale-version update fails. e2e: create, edit, toggle, and delete flows. |
| **M5** | Adventures core ([plan](../completed/M03.5-Adventures-Core.md), implemented) | `adventures`, `adventure_participants` (creator only), `adventure_objectives`, `adventure_updates`, `create_adventure`. Map table destination: My Adventures, main adventure, detail, status, next step, objectives, updates. | M2 | Integration: personal adventures are invisible to all non-participants (no list leakage, count, or title). Main adventures are visible and editable by members. Creator-only archive. Immutable keys. e2e: create, update, complete, and reopen. |
| **M6** | Adventure collaboration ([plan](M03.6-Adventure-Collaboration.md), approved, not started) | Propose, approve, invite, accept, decline, leave. Share-with-party consent and withdrawal. Party definition helper. | M5 | Integration: an invite is not revealed until every participant approves. The invitee sees only the title and inviter. Acceptance grants access. Sharing requires unanimity. Withdrawal or a new participant reverts it. A non-party member cannot see a party-shared thread. The campaign owner has no override. |
| **M7** | Session utilities | Dice roller (client-only, history labeled as this-session). Portrait bucket and policies. Realtime for HP and adventure updates where it helps. | Dice: none. Portraits: M2. Realtime: M2/M5. | Unit: dice parsing and distribution. Integration: Storage read and write denial for non-members and non-owners. Realtime events respect RLS. |
| **M8** | Imports ([plan](../completed/M03.8-Character-Imports.md), character imports done) | Character import as new or as reviewed updates, via a copyable conversion prompt and JSON (no in-app Markdown parser), plus Markdown export. DM handoff attachment with provenance, after M5. | Characters: M3. Handoffs: M5/M6. | Unit: parser fixtures. Integration: an import never changes visibility or participants. |

**Recommended order:** M1 → M2 → M3 → M4 → M5 → M6, then M7 and M8. M4 can run in parallel with M2 and M3 because it touches different tables and a different destination. The dice roller can be built at any point.

## Approved decisions

Approved 2026-11-13:

1. **Owner account deletion:** require an ownership transfer before deleting an account that owns campaigns (`campaigns.owner_id` becomes `on delete restrict`). Deliberately deleting a whole campaign stays possible with confirmation.
2. **Party definition:** campaign members who own an active, in-party character.
3. **Character sheets:** private by default, with explicit owner-controlled sharing.
4. **Shared campaign notes:** all current members can edit them. Only the author can delete them or change their visibility.
5. **Integration testing:** extend the existing Playwright `test:local-supabase` suite.

Additional requirements for every milestone:

- Correct the underlying PostgreSQL default privileges (finding 1), and keep revoking and granting explicitly in each migration.
- Define data retention and access for members who leave, are removed, or rejoin (specified in [M03.1 §6](../completed/M03.1-Membership-Lifecycle.md#6-data-retention-and-ownership-rules)).
- Make ownership transfers atomic so ownership can never be left inconsistent.
- Preserve existing campaign data and any future player-owned data during migrations.
- Keep privacy by default, with authorization enforced by Supabase RLS rather than frontend checks.
- Make migrations and tests safe to run against the local development database without a reset.
- Preserve existing authentication, invitations, campaign management, and Supabase integrations.
