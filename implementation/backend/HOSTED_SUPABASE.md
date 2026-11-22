# Hosted Supabase Guide

How The Goober's Guide connects to the hosted Supabase project, and how to keep it up to date.

- **Project:** `goobersguide`
- **Project ref:** `fidtqamnxcefbdxafiem`
- **API URL:** `https://fidtqamnxcefbdxafiem.supabase.co`
- **Dashboard:** https://supabase.com/dashboard/project/fidtqamnxcefbdxafiem

Local development is unchanged. `npm run supabase:start` and `frontend/.env.local` still point at the Docker stack.

## The one rule

**Add `--remote` to every Supabase CLI command meant for the hosted project.**
This CLI version targets the *local* stack by default. Without `--remote`, `db push` only touches your local database.

## What lives where

| Thing | Local | Hosted |
| --- | --- | --- |
| Database schema | `supabase/migrations/` applied by `db:migrate` / `db:reset` | Same files, applied by `db push --remote` |
| Edge Function `sign-in-with-username` | Served by the local stack | Deployed with `functions deploy` |
| Auth URLs, email settings | `supabase/config.toml` | Set in the dashboard (config.toml is not applied automatically) |
| Frontend settings | `frontend/.env.local` | `frontend/.env.hosted.local` (git-ignored) |

## One-time setup (already done unless noted)

1. Create the project in the dashboard. ✅
2. Log in and link the CLI. ✅
   ```bash
   cd implementation/backend
   npx supabase login
   npx supabase link --project-ref fidtqamnxcefbdxafiem
   ```
3. Push all migrations. ✅ (see "Push schema changes" below)
4. Deploy the sign-in function. ⬜
   ```bash
   npx supabase functions deploy sign-in-with-username
   ```
   `config.toml` already sets `verify_jwt = false` for this function, which sign-in needs because the user has no session yet.
5. Set Auth URLs in the dashboard. ⬜
   Go to **Authentication → URL Configuration**.
   - **Site URL:** where the hosted app will live. Use `http://localhost:5173` for now if you only test locally against hosted.
   - **Redirect URLs:** add every origin you will use, for example `http://localhost:5173`.
6. Decide on email confirmation. ⬜
   It is **off** locally. On the hosted project, check **Authentication → Sign In / Providers → Email**. If you turn confirmation on, set up custom SMTP, because the built-in email sender allows only a few emails per hour.

## Run the app against the hosted project

```bash
cd implementation/frontend
npx vite --mode hosted
```

This reads `.env.hosted.local`. To go back to local, run `npm run dev` as usual.

Do **not** run `npm run test:local-supabase` or the e2e tests with the hosted settings. They create and delete test data and are meant for the local stack only.

## Everyday workflow

### Push schema changes

1. Add a new timestamped file in `supabase/migrations/` and test it locally with `npm run db:migrate`.
2. Preview what the hosted project would receive:
   ```bash
   npx supabase db push --dry-run --remote
   ```
3. Apply it:
   ```bash
   npx supabase db push --remote
   ```

Never edit already-pushed migration files. Add a new one instead.

### Update the Edge Function

Re-run the `functions deploy` command from step 4 whenever `supabase/functions/sign-in-with-username/index.ts` changes.

## Safety notes

- **Browser-safe:** the project URL and the publishable key (`sb_publishable_...`). These are in `.env.hosted.local`.
- **Never put in the frontend or in git:** the `service_role` / secret key and your database password. The Edge Function gets its own keys from Supabase automatically.
- **The CLI labels this project "production".** Treat `db push --remote` as a real deploy. Always dry-run first.
- There is no `seed.sql`, so the hosted database starts empty apart from what the migrations create.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `db push` says "Local database is up to date" | You forgot `--remote`. |
| `failed to initialise login role: TransportError` | Network blocked. Check your connection or VPN, then retry. |
| App still talks to `127.0.0.1` | You started it without `--mode hosted`. |
| Username sign-in fails, email sign-in works | The Edge Function is not deployed (step 4). |
| Sign-up works but no confirmation email arrives | Email confirmation is on without custom SMTP (step 6). |
| Auth redirect goes to the wrong site | Fix Site URL / Redirect URLs (step 5). |
