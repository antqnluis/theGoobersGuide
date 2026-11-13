# Database schema

Supabase Auth supplies the account ID. PostgreSQL uses that ID for profile ownership and campaign access. The browser connects with the publishable key, and authenticated requests use the signed-in user's session.

## Profiles

`public.profiles.id` is the primary key and references `auth.users.id` with `ON DELETE CASCADE`. An Auth insert trigger creates one profile per account. The migration preserves usernames from the previous registry and backfills profiles for accounts that had no registry entry.

`username` is the unique, lowercase sign-in name. The database enforces uniqueness on its lowercase value and resolves sign-in names without regard to letter case. It is null for email-only accounts. The app's registration form still asks for a username. The username sign-in Edge Function uses the service-role-only `resolve_username_email` RPC to find the Auth address, then delegates password verification to Supabase Auth.

An authenticated user can read their own profile and update `display_name` and `avatar_url`. The database manages `id`, `username`, `created_at`, and `updated_at`.

## Campaigns and membership

- `public.campaigns.owner_id` references `profiles.id` and defaults to the creator's Auth ID. Campaigns have a required `name` containing at least one non-whitespace character, optional `description`, and creation and modification timestamps.
- `public.campaign_members` links campaigns and profiles in a many-to-many relationship. Each row has an ID, a `joined_at` timestamp, and an `owner` or `member` role. A campaign/profile pair is unique, and each campaign can have only one owner row.
- An insert trigger creates the owner row in the same transaction as the campaign. The migration backfills existing owner rows using each campaign's `created_at`. The application API fixes ownership at creation.
- Deleting a campaign deletes its roster. A hard delete of an Auth user deletes their profile, memberships, and owned campaigns. Rosters of those owned campaigns are deleted too.

## Access rules

Row Level Security is enabled on profiles, campaigns, campaign members, and campaign invitations. Anonymous clients have no table access.

| Data | Authenticated access |
| --- | --- |
| Profiles | Read your own row. Update your own display name and avatar URL. |
| Campaigns | Create under your own profile ID. Read campaigns you own or belong to. Edit the name and description or delete a campaign you own. |
| Campaign members | Read the roster of a campaign you belong to. Membership writes are reserved for database-managed operations. |
| Campaign invitations | Use the invitation RPCs for access. Direct table reads and writes are denied. |

The roster read policies use a private `SECURITY DEFINER` helper with a fixed search path. It returns campaign IDs for the authenticated caller and reads the roster with the function owner's permissions to avoid recursive RLS. Authenticated clients have read-only access to membership rows.

Authenticated members can call `get_campaign_roster(p_campaign_id uuid)` to get each member’s `profile_id`, `role`, and `username`. The username is null for email-only accounts. The RPC returns an empty result for unknown or inaccessible campaigns. It checks the caller’s membership and leaves direct profile access self-only.

## Campaign invitations

- `campaign_invitations` references the campaign, inviting owner, and recipient profile. A partial unique index allows one pending invitation per recipient and campaign. Resolved rows record acceptance, decline, or cancellation and the time it happened. Deleting the campaign or a referenced profile removes its invitations.
- Owners use `send_campaign_invitation` with an existing player's case-insensitive username, `list_campaign_outgoing_invitations` to see pending recipients, and `cancel_campaign_invitation` to withdraw a pending invitation. Invites are delivered in the app and stay pending until resolved.
- Recipients use `list_my_campaign_invitations` to see pending invitations and `respond_to_campaign_invitation` to accept or decline. Only the recipient can respond. Accepting adds a regular membership in the same transaction that resolves the invitation. Pending invitations convey only the campaign name and inviter's username.

## Future character tables

Use a profile foreign key for the player who owns a character and a campaign foreign key for its campaign association. Define the character's visibility, editing rules, and deletion behavior in its own migration. A character tied to a campaign should validate the player's membership when the association is created or changed.

Apply schema changes to an existing local stack from `implementation/backend` with `npm run db:migrate`.
