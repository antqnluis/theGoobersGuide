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

Row Level Security is enabled on profiles, campaigns, campaign members, and campaign invitations. Anonymous clients have no table access.

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

`private.handle_campaign_member_departure(campaign_id, profile_id)` runs inside leave and remove and is currently a no-op. It is the one place where later milestones attach departure side effects (for example, clearing a character's `in_party` flag). It may change state but must never delete player-owned rows.

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

## Future character tables

Use a profile foreign key for the player who owns a character and a campaign foreign key for its campaign association. Define the character's visibility, editing rules, and deletion behavior in its own migration. A character tied to a campaign should validate the player's membership when the association is created or changed. Follow the retention rules above, and attach departure side effects to `private.handle_campaign_member_departure`.

Apply schema changes to an existing local stack from `implementation/backend` with `npm run db:migrate`.
