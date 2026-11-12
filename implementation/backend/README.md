# Local Supabase backend

The backend is local Supabase, not a custom application server. Configuration is in `supabase/config.toml`; database migrations are in `supabase/migrations/`.

See the [database schema](../../docs/DATABASE_SCHEMA.md) for profiles, campaign membership, and access rules.

## Commands

Run these commands from this directory:

```sh
npm install
npm run supabase:start
npm run supabase:status -- --output env | grep -E '^(API_URL|PUBLISHABLE_KEY)='
npm run db:migrate
npm run supabase:stop
```

Docker Desktop must be running before starting Supabase. The first start applies migrations. `db:migrate` applies any pending migration to the running local database. `db:reset` rebuilds the local database and deletes its existing data.

The `sign-in-with-username` Edge Function resolves the account through a service-role-only RPC, then passes password verification to Supabase Auth. Local Edge Runtime supplies the server credentials. The browser still uses the publishable key. Username attempts go through Auth's password endpoint and share its rate limit for the Edge Runtime's network address.

For an existing local stack, apply the migration with `npm run db:migrate`, then stop and start Supabase to load the function. The regular stop command preserves local data.

No hosted Supabase project is linked or required for local development.
