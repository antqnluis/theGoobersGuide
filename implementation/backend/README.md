# Local Supabase backend

The backend is local Supabase, not a custom application server. Configuration is in `supabase/config.toml`; database migrations are in `supabase/migrations/`.

See the [database schema](../../docs/reference/DATABASE_SCHEMA.md) for profiles, campaign membership, and access rules.

## Commands

Run these commands from this directory:

```sh
npm install
npm run supabase:start
npm run supabase:status -- --output env | grep -E '^(API_URL|PUBLISHABLE_KEY)='
npm run db:migrate
npm run supabase:stop
```

```sh
npm run db:seed
```

`db:seed` loads local demo data into the running database (see [Demo data](#demo-data)).

Docker Desktop must be running before starting Supabase. The first start applies migrations. `db:migrate` applies any pending migration to the running local database. `db:reset` rebuilds the local database and deletes its existing data.

The `sign-in-with-username` Edge Function resolves the account through a service-role-only RPC, then passes password verification to Supabase Auth. Local Edge Runtime supplies the server credentials. The browser still uses the publishable key. Username attempts go through Auth's password endpoint and share its rate limit for the Edge Runtime's network address.

For an existing local stack, apply the migration with `npm run db:migrate`, then stop and start Supabase to load the function. The regular stop command preserves local data.

## Demo data

`supabase/seed.sql` creates a demo table so the Maker's Visions can be seen working. It runs after migrations on `npm run db:reset`, and `npm run db:seed` loads it into a running local stack. It is safe to run again (it does nothing once the demo campaign exists) and never touches other data. It is for local development only: `supabase db push` does not run it.

- **`demo.dm@example.com` (`demo_dm`)** owns the campaign _The Ember Road (demo)_ and the crafting library _Ember Road Components_ (8 materials, 5 items to make, 5 recipes), already imported and turned on. In the camp's Visions area, the DM tab shows the library, its recipes (including DM-only notes and the hidden Wyrmfang Blade), and the long rest.
- **`demo.player@example.com` (`demo_player`)** plays Brannoc, who carries linked and hand-typed materials. After the long rest the seed calls, Brannoc has two visions (Venom Blade Oil, saved, and Wyvern Fang Dagger) and two fragments, all marked new.

Both accounts share the password set at the top of `seed.sql`. To see the player's side change, sign in as the DM and call another long rest after adding materials to Brannoc's inventory (a rest needs 30 seconds since the last).

No hosted Supabase project is linked or required for local development.
