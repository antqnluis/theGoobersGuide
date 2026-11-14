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

Row Level Security is enabled on profiles, campaigns, campaign members, campaign invitations, characters, and character sheets. Anonymous clients have no table access.

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
- `characters.campaign_id` references `campaigns` and `characters.owner_id` references `profiles`, both `ON DELETE CASCADE`. Neither references `campaign_members`, per the retention rules above.

### Integrity

| Rule | Enforced by |
| --- | --- |
| One active character per player per campaign | Partial unique index `characters_one_active_per_player_idx (campaign_id, owner_id) WHERE status = 'active'`, so it holds for every write path and under concurrency |
| Only an active character can be in the party | `characters_party_requires_active` check |
| `id`, `campaign_id` and `owner_id` never change | `private.guard_character_write` trigger (`character_reassignment_forbidden`), plus no column grant |
| A character is created, or joins the party, only while its owner is a member | The same trigger (`character_owner_not_member`) |
| `status_changed_at` follows `status` | The same trigger |
| Sheet structure and size | `character_sheets_sheet_check`: object of at most 64 KiB, known keys only, ability scores 1–30, known skill values, at most 30 attacks, via `private.character_sheet_is_valid` (pure, executable by `authenticated` because check constraints run under the writing role) |
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

Apply schema changes to an existing local stack from `implementation/backend` with `npm run db:migrate`.
