# Local Supabase backend

The backend is local Supabase, not a custom application server. Configuration is in `supabase/config.toml`; database migrations are in `supabase/migrations/`.

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

No hosted Supabase project is linked or required for local development.
