# Database schema

Supabase Auth supplies the account ID. PostgreSQL uses that ID for profile ownership and campaign access. The browser connects with the publishable key, and authenticated requests use the signed-in user's session.

## Profiles

`public.profiles.id` is the primary key and references `auth.users.id` with `ON DELETE CASCADE`. An Auth insert trigger creates one profile per account. The migration preserves usernames from the previous registry and backfills profiles for accounts that had no registry entry.

`username` is the unique, lowercase sign-in name. The database enforces uniqueness on its lowercase value and resolves sign-in names without regard to letter case. It is null for email-only accounts. The app's registration form still asks for a username. The username sign-in Edge Function uses the service-role-only `resolve_username_email` RPC to find the Auth address, then delegates password verification to Supabase Auth.

An authenticated user can read their own profile and update `display_name` and `avatar_url`. `display_name` is optional, trimmed, 1–40 characters, and free of control characters (`profiles_display_name_check`). Other players see it only through `get_campaign_party`. The app edits it from the account name in the header. The database manages `id`, `username`, `created_at`, and `updated_at`.

## Campaigns and membership

- `public.campaigns.owner_id` references `profiles.id` with `ON DELETE RESTRICT` and defaults to the creator's Auth ID. Campaigns have a required `name` containing at least one non-whitespace character, optional `description`, and creation and modification timestamps.
- `public.campaign_members` links campaigns and profiles in a many-to-many relationship. Each row has an ID, a `joined_at` timestamp, and an `owner` or `member` role. A campaign/profile pair is unique, and each campaign can have only one owner row.
- An insert trigger creates the owner row in the same transaction as the campaign. The migration backfills existing owner rows using each campaign's `created_at`. The application API fixes ownership at creation.
- Deleting a campaign deletes its roster. A hard delete of an Auth user deletes their profile and memberships, but is blocked while they own a campaign: transfer ownership or delete the campaign first. Removing an owner through the Admin API or Studio fails with a generic database error (`23503`) until then.
- **Ownership invariant.** Ownership is stored twice, in `campaigns.owner_id` and in the single `role = 'owner'` membership row. Two deferred constraint triggers (`campaigns_ownership_consistent`, `campaign_members_ownership_consistent`) check at commit that every affected campaign has exactly one owner row and that it belongs to `owner_id`. A violation fails with `campaign_ownership_inconsistent`, whatever the write path.

## Access rules

Row Level Security is enabled on profiles, campaigns, campaign members, campaign invitations, characters, character sheets, and notes. Anonymous clients have no table access.

| Data | Authenticated access |
| --- | --- |
| Profiles | Read your own row. Update your own display name and avatar URL. |
| Campaigns | Create under your own profile ID. Read campaigns you own or belong to. Edit the name and description or delete a campaign you own. |
| Campaign members | Read the roster of a campaign you belong to. Membership writes happen only through the invitation and membership RPCs. |
| Campaign invitations | Use the invitation RPCs for access. Direct table reads and writes are denied. |

The roster read policies use a private `SECURITY DEFINER` helper with a fixed search path. It returns campaign IDs for the authenticated caller and reads the roster with the function owner's permissions to avoid recursive RLS. Authenticated clients have read-only access to membership rows.

Authenticated members can call `get_campaign_party(p_campaign_id uuid)`, which returns the same rows as the roster plus each member's `display_name` (null when unset). It has the same member-only behaviour. The Party panel and membership copy show the display name first and the username beside it. `get_campaign_roster` keeps its original contract.

Authenticated members can also call `get_campaign_roster(p_campaign_id uuid)` to get each member’s `profile_id`, `role`, and `username`. The username is null for email-only accounts. The RPC returns an empty result for unknown or inaccessible campaigns. It checks the caller’s membership and leaves direct profile access self-only.

## Campaign invitations

- `campaign_invitations` references the campaign, inviting owner, and recipient profile. A partial unique index allows one pending invitation per recipient and campaign. Resolved rows record acceptance, decline, or cancellation and the time it happened. Deleting the campaign or a referenced profile removes its invitations.
- Owners use `send_campaign_invitation` with an existing player's case-insensitive username, `list_campaign_outgoing_invitations` to see pending recipients, and `cancel_campaign_invitation` to withdraw a pending invitation. Invites are delivered in the app and stay pending until resolved.
- Recipients use `list_my_campaign_invitations` to see pending invitations and `respond_to_campaign_invitation` to accept or decline. Only the recipient can respond. Accepting adds a regular membership in the same transaction that resolves the invitation. Pending invitations convey only the campaign name and inviter's username.

## Membership lifecycle

All three RPCs are `SECURITY DEFINER`, executable only by `authenticated`, and lock the campaign row (`FOR NO KEY UPDATE`) first, so changes to one campaign are serialized. Each runs in one transaction. Clients still cannot insert, update, or delete `campaign_members`, or update `campaigns.owner_id`.

| RPC | Who | Effect and errors |
| --- | --- | --- |
| `leave_campaign(p_campaign_id)` | A member | Deletes the caller's membership row. Unknown, inaccessible, and already-left campaigns all return `campaign_membership_unavailable`. The owner gets `campaign_leave_owner_must_transfer`. |
| `remove_campaign_member(p_campaign_id, p_profile_id)` | The owner | Deletes a `member` row. Non-owners get `42501` (`campaign_member_owner_required`). Removing yourself is `campaign_member_remove_owner`; a missing player is `campaign_member_unavailable`. |
| `transfer_campaign_ownership(p_campaign_id, p_profile_id)` | The owner | Immediately demotes the caller to `member`, promotes the target, and updates `owner_id`. The target must be a current member whose Auth user is not soft-deleted. Errors: `campaign_transfer_owner_required` (`42501`), `campaign_transfer_self`, `campaign_transfer_target_unavailable`. |

A null argument raises `22023`. Pending invitations stay pending after a transfer, and the new owner manages them. A removed or departed player can be invited again; they rejoin with a new membership row.

`private.handle_campaign_member_departure(campaign_id, profile_id)` runs inside leave and remove, after the membership row is deleted. It is the one place where milestones attach departure side effects. It may change state but must never delete player-owned rows. Today it clears `in_party` on the departed player's characters in that campaign (see [Characters and party](#characters-and-party)). Executable by `postgres` only.

### Retention rules for player-owned data

- Leaving or being removed deletes only the membership row. Access to campaign data depends on membership, so it ends in the same transaction.
- Player-owned tables reference the campaign and the player (`campaign_id` and `owner_id`/`author_id`, both `ON DELETE CASCADE`). They must not reference `campaign_members.id` or `(campaign_id, profile_id)`, which would either cascade the data away on departure or block leaving.
- Rejoining restores access to retained data with no migration step. The campaign owner never gains access to a departed player's private data.
- Deleting a campaign deletes everything in it. Deleting a member's account deletes that member's own data and no one else's.
- Soft-deleted Auth users (`deleted_at` set) do not fire the foreign keys. A soft-deleted owner keeps owning their campaigns, and a soft-deleted member keeps a membership row. Soft-deleted users cannot receive a transfer. Handling them fully needs a decision once an account-deletion flow exists.

## Default privileges

Migration `20261113100000_harden_default_privileges` revokes the default grants that `postgres` gave to `anon`, `authenticated`, and `service_role` on new tables, sequences, and functions in `public`, and removes the default `EXECUTE` for `PUBLIC` on new functions. New objects are therefore not reachable through the API until a migration grants access explicitly, and every migration still revokes and grants explicitly. Existing grants are unchanged. Migrations run as `postgres`, which cannot change `supabase_admin`'s own defaults in `public`; those do not apply to objects migrations create. The `storage` schema defaults are unchanged and are reviewed when Storage is first used.

## Generated types

`implementation/frontend/src/types/database.ts` is generated. After `npm run db:migrate`, run `npm run db:types` from `implementation/backend`, then `npx prettier --write src/types/database.ts` from `implementation/frontend`. New membership code uses `Database['public']['Functions'][…]` for RPC arguments; the shared Supabase client is not yet typed with `Database`.

## Characters and party

Characters exist only inside a campaign and belong to one player. Neither can change after creation. Access depends on current membership, so a departed player's characters are kept but invisible to everyone, including the player, until they rejoin.

### Tables

- `public.characters` is the summary every current member can read: `name` (1–80 characters), optional `species`, `class_name`, `subclass` and `background` (1–60 characters each), `level` (1–20), `status` (`active`, `retired`, `deceased`), `in_party`, `sheet_visibility` (`private` or `campaign`), `portrait_path`, and `status_changed_at`, `created_at` and `updated_at`. Text is trimmed and free of control characters; empty optional fields are stored as null.
- `public.character_sheets` is the 1:1 body, created with the character and removed only by cascade: `max_hp`, `current_hp`, `temp_hp`, `armor_class`, `speed` (columns, because they change mid-session) and `sheet jsonb`, a version-1 body (abilities, saving throws, skills, attacks, features, spells, notes, alignment, experience). Derived values (modifiers, proficiency bonus, passive Perception) are computed in the client and never stored.
- The purse is three more columns on `character_sheets`, `cp`, `sp` and `gp` (see [Inventory and coins](#inventory-and-coins)).
- `characters.campaign_id` references `campaigns` and `characters.owner_id` references `profiles`, both `ON DELETE CASCADE`. Neither references `campaign_members`, per the retention rules above.

### Integrity

| Rule | Enforced by |
| --- | --- |
| One active character per player per campaign | Partial unique index `characters_one_active_per_player_idx (campaign_id, owner_id) WHERE status = 'active'`, so it holds for every write path and under concurrency |
| Only an active character can be in the party | `characters_party_requires_active` check |
| `id`, `campaign_id` and `owner_id` never change | `private.guard_character_write` trigger (`character_reassignment_forbidden`), plus no column grant |
| A character is created, or joins the party, only while its owner is a member | The same trigger (`character_owner_not_member`) |
| `status_changed_at` follows `status` | The same trigger |
| Sheet structure and size | `character_sheets_sheet_check`: object of at most 64 KiB, known keys only, ability scores 1–30, known skill values, at most 30 attacks, each with a lowercase UUID `id` unique within the sheet (M03.8), via `private.character_sheet_is_valid` (pure, executable by `authenticated` because check constraints run under the writing role) |
| Vitals | `max_hp` 1–9999, `current_hp` 0–`max_hp`, `temp_hp` 0–9999, AC 0–99, speed 0–999 |

Because only one character can be active and only active characters can be in the party, a player has at most one in-party character per campaign.

### Access

RLS is enabled on both tables. `authenticated` has no insert grant, `anon` and `service_role` have none at all.

| Data | Authenticated access |
| --- | --- |
| Character summaries (all statuses) | Read by current members of the campaign, for characters whose owner is also a current member. The campaign owner is an ordinary member here. |
| Summary edits | The owner updates `name`, `species`, `class_name`, `subclass`, `background`, `level`, `sheet_visibility` and `portrait_path` while a member. `status` and `in_party` change only through the RPCs. |
| Sheet read | The owner always; other current members only when `sheet_visibility = 'campaign'`. **The campaign owner has no override.** |
| Sheet edit | The owner only, for `max_hp`, `current_hp`, `temp_hp`, `armor_class`, `speed` and `sheet`. The app saves the body with an `updated_at` filter, so a stale save matches no row. |
| Delete a character | The owner, any status. The sheet and portrait go with it. |

### RPCs

`SECURITY DEFINER`, executable only by `authenticated`. Each locks the campaign row `FOR SHARE` (which conflicts with the membership RPCs' `FOR NO KEY UPDATE`, so character and membership changes serialize, while characters of different players run in parallel), then the character row, in that order.

| RPC | Effect and errors |
| --- | --- |
| `create_character(p_campaign_id, p_name, p_species, p_class_name, p_subclass, p_background, p_level, p_in_party)` | Creates an active character and its sheet for the caller; returns the id. `character_campaign_required` (`22023`), `character_name_invalid`, `character_details_invalid`, `character_level_invalid`, `character_campaign_unavailable` (unknown, inaccessible and departed look the same), `character_active_exists`. |
| `set_character_status(p_character_id, p_status)` | Any move among `active`, `retired` and `deceased`; the one-active rule is the only restriction. Leaving `active` clears `in_party`; returning to `active` does not set it. Same status is a no-op. `character_unavailable`, `character_status_invalid`, `character_active_exists`. |
| `set_character_in_party(p_character_id, p_in_party)` | Joins or leaves the party. Joining needs an active character (`character_not_active`). Leaving always works. `character_unavailable`. |

A null argument raises `22023` (`character_required`). Errors are `P0001` unless noted.

### Party and lifecycle

- The **party** is derived, not stored: current members who own an active character with `in_party`. The Party panel joins `get_campaign_party` with the characters query in the client.
- **Leaving or removal** keeps every character and sheet and only clears `in_party` (status is unchanged). Remaining members stop seeing them, and the leaver sees nothing.
- **Rejoining** restores access to the same rows. `in_party` stays false until the owner re-joins the party. Their still-active character blocks creating another until it is retired, marked deceased or deleted.
- **Ownership transfer** changes nothing about characters, and the new owner still cannot read private sheets.
- **Deleting a campaign** deletes its characters and sheets, including a departed player's. **Deleting a member's account** deletes only their own.

### Portraits

A private Storage bucket, `character-portraits` (2 MiB; PNG, JPEG or WebP), holds one picture per upload at `<character id>/<random>.<png|jpg|webp>`. `characters.portrait_path` is constrained to that shape for its own character. A new picture gets a new name, never an overwrite. Anyone who may read the character's summary may read its portrait (it is summary-level, whatever the sheet's visibility); only the owner, while a member, adds one, and only the owner removes one. The helper `private.portrait_character_id(name)` maps an object name to its character.

## Inventory and coins

Coins and items belong to a character and follow the same access rules as its sheet. They are kept, but invisible, while the owner is not a member, and come back on rejoining.

### Tables

- `character_sheets.cp`, `sp` and `gp` are the purse: whole coins, `integer NOT NULL DEFAULT 0`, each 0–9,999,999 (`character_sheets_currency_check`). There are no electrum or platinum coins (10 cp = 1 sp, 10 sp = 1 gp; the app derives the total, it is never stored). Authenticated users can read the columns but have no write grant on them, so balances change only through `adjust_character_currency`.
- `public.character_items` holds the inventory: `id`, `character_id` (references `characters`, `ON DELETE CASCADE`), `name` (1–80 characters, trimmed, no control characters), `quantity` (0–9,999, default 1), `weight` (`numeric(7, 2)`, per item, 0–99,999.99, null when unknown), `description` (1–2,000 characters, null when empty, newlines and tabs allowed), `equipped`, `attuned`, `created_at` and `updated_at`. Index on `character_id`.
- `public.character_currency_log` records each applied coin change: `id`, `seq` (identity, for ordering), `character_id` (cascade), `created_at`, the net change `cp_delta`, `sp_delta`, `gp_delta` and the balances after it, `cp_after`, `sp_after`, `gp_after`. At least one delta is non-zero. Only the newest 100 rows per character are kept.

### Integrity

| Rule | Enforced by |
| --- | --- |
| An item never moves to another character, and its `id` never changes | `private.guard_character_item_write` trigger (`item_reassignment_forbidden`), plus no column grant on `character_id` for updates |
| At most 200 items per character, under concurrency | The same trigger, on insert, after locking the character row (`item_limit_reached`) |
| Names, quantity, weight and description bounds | `character_items_*_check` constraints. A weight of 100,000 or more overflows the column (`22003`) before the check runs. |
| Balances stay within 0–9,999,999 | `character_sheets_currency_check` |
| `updated_at` follows item updates | `set_updated_at` trigger |
| Log rows reconcile with the purse | Written by `adjust_character_currency` inside the same locked transaction as the balance change |

### Access

RLS is enabled on `character_items` and `character_currency_log`; `anon`, `service_role` and `public` have no access to either.

| Data | Authenticated access |
| --- | --- |
| Items and the coin log: read | The character's owner while a member; other current members only when `sheet_visibility = 'campaign'`. **The campaign owner has no override.** |
| Items: add, edit, delete | The owner only, while a member. Insert is limited to `character_id`, `name`, `quantity`, `weight`, `description`, `equipped` and `attuned`; update to the same minus `character_id`. `id` and the timestamps are never supplied. The app edits with an `updated_at` filter, so a stale edit matches no row. |
| Coin log: write | Nobody through the API (select only). |
| Balances | Read with the sheet. Written only by `adjust_character_currency`. |

### RPCs

`SECURITY DEFINER`, executable only by `authenticated`. They use the character prelude: reject null arguments, find the character (or the item's character) owned by the caller, lock the campaign row `FOR SHARE`, re-check membership in a fresh statement, then lock the target row `FOR UPDATE`. Anyone who is not the owner, a current member, or the owner of an existing row gets the same "unavailable" error, so existence is not revealed.

| RPC | Effect and errors |
| --- | --- |
| `adjust_character_currency(p_character_id, p_cp, p_sp, p_gp)` | Adds the deltas (negative spends; a null delta counts as 0) to the locked purse and returns `cp, sp, gp, updated_at`. Several coins change together or not at all. All-zero deltas are a no-op: no write, no log row. Concurrent calls both apply, in order. Writes one `character_currency_log` row per applied change and trims to 100. `currency_required` and `currency_amount_invalid` (each delta within ±9,999,999) are `22023`; `character_unavailable`, `currency_insufficient` (any balance would go below 0) and `currency_limit_exceeded` are `P0001`. |
| `adjust_character_item_quantity(p_item_id, p_delta)` | Adds a delta (−9,999 to 9,999) to an item's quantity and returns the new value. An item at 0 stays; deleting is separate. A zero delta writes nothing. `item_required` and `item_quantity_invalid` (bad delta) are `22023`; `item_unavailable`, `item_quantity_insufficient` and `item_quantity_invalid` (result above 9,999) are `P0001`. |

### Sheet token

Coins live on the sheet row, so every coin change moves `character_sheets.updated_at`, which is also the body's optimistic-concurrency token. The RPC returns the new `updated_at` and the client writes it into the sheet cache, so a body save in the same tab does not conflict. A coin change on another device makes a pending body save fail with the usual `sheet_conflict` copy, as a vitals change already does.

### Lifecycle

- **Leaving or removal** keeps items, balances and the log. The leaver can no longer read or change them, and other members stop seeing them even on a shared sheet. **Rejoining** restores access to the same rows.
- **Deleting a character** deletes its items and log. **Deleting a campaign** deletes everything in it, including a departed player's. **Deleting a member's account** deletes only their own.

## Character imports

A player can bring a character in from a document, or bring later changes into an existing one. The app parses and reviews the document; the database only adds atomicity and a record of what happened. Neither RPC grants anything a player could not already do one write at a time, and neither can change `status`, `in_party`, `sheet_visibility`, `portrait_path`, the owner, or the campaign.

### Table

`public.character_imports` records each successful import: `id`, `character_id` (references `characters`, `ON DELETE CASCADE`), `imported_by` (references `profiles`, `ON DELETE CASCADE`), `kind` (`new` or `update`), `source_label` (1–120 characters, trimmed, no control characters, null when empty), `change_count` (0 or more) and `imported_at`. Indexed by `character_id`. The source document itself is not stored.

- `change_count` is, for `new`, one for the character plus the number of items plus one if coins were added, and for `update`, the number of changes the player selected.
- Imported coin changes appear in `character_currency_log` as ordinary rows; the log has no source column.

### Access

RLS is enabled; `anon`, `service_role` and `public` have no access.

| Data | Authenticated access |
| --- | --- |
| Read | Same rule as the sheet: the owner while a member, other current members only when `sheet_visibility = 'campaign'`. **The campaign owner has no override.** |
| Insert, update, delete | Nobody through the API (select only). Rows are written only by `private.record_character_import`, which the two RPCs call as their last step, so a failed import records nothing. The history goes away only with its character. |

### RPCs

Both are `SECURITY INVOKER` and executable only by `authenticated`: every write runs under the caller's own grants, RLS, guard triggers, caps and check constraints. Only `private.record_character_import` is `SECURITY DEFINER`; it re-checks that the caller owns the character and is a current member. Payloads are database-shaped (the client parses the document); every key and type is checked before anything is written.

| RPC | Effect and errors |
| --- | --- |
| `import_character(p_campaign_id, p_character, p_source_label)` | Creates the character (active, out of the party, private, no portrait) through `create_character`, then its vitals and body, items (at most 200) and coins (through `adjust_character_currency`, one log row), and the history row, in one transaction. Returns the new id. Any failure leaves nothing behind. |
| `apply_character_update(p_character_id, p_expected, p_changes, p_source_label)` | Applies the selected details, vitals, full body replacement, item adds, updates and removes, and coin targets, in one transaction, and returns the sheet's new `updated_at`. `p_expected` carries the character's, the sheet's and each targeted item's `updated_at`; any difference fails the whole update. Locks the campaign and sheet in the usual order (through `adjust_character_currency(…, 0, 0, 0)`, which changes and logs nothing), then the character row. `p_changes` may carry an informational `change_count`. |

Errors: `import_invalid` (wrong payload shape, a forbidden key, an empty `p_changes`), `import_values_invalid` (a value the table rules refuse) and `import_source_invalid` (a bad label) are `22023`. `import_conflict` (the character, sheet or an item changed after the review was loaded) and `character_unavailable` (unknown, inaccessible, someone else's, or departed) are `P0001`. Errors from the inner functions (`character_active_exists`, `character_campaign_unavailable`, `item_limit_reached`, `currency_limit_exceeded`, `currency_insufficient`) pass through unchanged.

## Notes

`public.notes` holds the journal: each note is **private** (its author only) or **shared with the campaign** (every current member reads and edits it). Access is computed from current membership, so the departure hook is unchanged.

### Table

`id`, `campaign_id` (references `campaigns`, `ON DELETE CASCADE`), `author_id` (references `profiles`, `ON DELETE CASCADE`, default `auth.uid()`), `visibility` (`private` default, or `campaign`), `title` (1–120 characters, trimmed, no control characters), `body` (0–20,000 characters, default empty; newlines and tabs allowed, other control characters not), `character_id` (optional link), `updated_by` (the last editor; `ON DELETE SET NULL`), `created_at` and `updated_at`. Indexes on `(campaign_id, updated_at desc)`, `(author_id, campaign_id)` and `character_id`.

`(character_id, campaign_id)` references `characters (id, campaign_id)` with `ON DELETE SET NULL (character_id)`: deleting a character clears only the link and keeps the note and `updated_by`.

### Integrity

| Rule | Enforced by |
| --- | --- |
| `id`, `campaign_id`, `author_id` and `created_at` never change | `private.guard_note_write` trigger (`note_reassignment_forbidden`), plus no column grant |
| Only the author changes `visibility` | The same trigger (`note_visibility_author_only`) |
| At most 500 notes per author per campaign, under concurrency | The same trigger on insert, after an advisory lock (`note_limit_reached`) |
| A link points at a character a current member of the same campaign owns | The same trigger on a new or changed link (`note_character_unavailable`), with the foreign key as the backstop |
| `updated_by` is the caller | The same trigger. Foreign-key actions (a deleted character or account) run nested and pass through untouched. |
| Title and body bounds | `notes_title_check`, `notes_body_check`, `notes_visibility_check` |
| `updated_at` follows updates | `set_updated_at` trigger |

### Access

`anon`, `service_role` and `public` have no access. `authenticated` has select and delete, insert on `campaign_id, visibility, title, body, character_id`, and update on `visibility, title, body, character_id`.

| Action | Who |
| --- | --- |
| Read | Current members read shared notes; an author reads their own while a member. **The campaign owner has no override on private notes.** |
| Create | A current member, as themselves. |
| Edit title, body and link | Any current member for a shared note; the author for their own private note. |
| Change visibility, delete | The author only, while a member. |

The app saves with an `updated_at` filter (optimistic concurrency): a stale save matches no row, and the client re-reads to tell a conflict (still readable) from a note that is gone.

### Lifecycle

- **Leaving or removal** keeps every note. The leaver reads and writes nothing; members still read and edit the leaver's shared notes but cannot delete them or make them private. **Rejoining** restores the author's access to both.
- **Deleting a campaign** deletes every note in it, including a departed author's. **Deleting a member's account** deletes their notes and clears `updated_by` on notes they edited.

## Camp appearance

`public.campaign_appearances` holds each player's chosen look for their seat at the camp, per campaign: `cloak` (0–7), `skin` (0–4), `headwear` (`hood`, `hat`, `cap`, `bare`) and `pack` (`satchel`, `bedroll`, `quiver`, `none`), keyed by `(campaign_id, profile_id)`. It is cosmetic only. No row means the camp's default look, derived from the profile id.

- Both keys reference their tables with `ON DELETE CASCADE` (never `campaign_members`), so a look survives leaving and rejoining, and is removed with the campaign or the account.
- RLS is enabled. Current members read the looks of current members (a departed player's look is hidden until they rejoin). `authenticated` can select and delete (to return to the default); there is no insert or update grant.
- `set_campaign_appearance(p_campaign_id, p_cloak, p_skin, p_headwear, p_pack)` is the only write path: `SECURITY DEFINER`, executable by `authenticated` only, upserting the caller's own row after locking the campaign `FOR SHARE` as a current member. Errors: `appearance_required` and `appearance_invalid` (`22023`), `appearance_campaign_unavailable` (`P0001`, the same for unknown, inaccessible and departed), `appearance_sign_in_required` (`42501`).

Apply schema changes to an existing local stack from `implementation/backend` with `npm run db:migrate`.
