# Repository Guidelines

## Scope and structure

- The active application is in `implementation/frontend` and `implementation/backend`. Read the root and implementation READMEs, relevant source, package scripts, and Supabase configuration before changing behavior; trace how the affected flow is currently implemented.
- `implementation/frontend` is the React, TypeScript, Vite, Tailwind CSS v4, React Router, and TanStack Query app. Keep feature-specific UI and logic in `src/features/<feature>/`; shared UI, routes/pages, providers, Supabase setup, hooks, types, and assets belong in the existing `src/components`, `src/pages`, `src/providers`, `src/lib`, `src/hooks`, `src/types`, and `src/assets` areas as appropriate. Unit tests live beside source as `*.test.ts` or `*.test.tsx`; browser tests are in `e2e/`.
- `implementation/backend` contains the local Supabase CLI setup. Keep project settings in `supabase/config.toml`, schema changes in `supabase/migrations/`, and add `supabase/functions/` only for work that needs an Edge Function. Supabase provides the database, Auth, and Storage; do not add a separate application server without a concrete need.
- `legacy/` is the archived prototype, including its docs, tests, and tooling. Use it only as historical reference; keep new code, dependencies, and setup in `implementation/`. Change legacy files only when explicitly requested.

## Implementation conventions

- Preserve existing behavior and architecture. Make the smallest coherent change, follow nearby TypeScript and component patterns, and avoid dependencies when the current stack can do the job.
- Build complete user flows backed by Supabase Auth, PostgreSQL, and Storage as appropriate. Include validation and loading, empty, success, and error states. Do not present fixtures, mock responses, or in-memory state as completed persistent functionality. Treat browser state as transient unless offline persistence is explicitly part of the feature.
- Keep development usable with the local Supabase stack; ordinary development must not depend on a hosted project. Use TanStack Query for remote data and follow the existing Supabase client setup.

## Database and security

- Make every schema change in a new, timestamp-prefixed migration under `implementation/backend/supabase/migrations/`; do not rely on manual or dashboard-only database edits. Keep migrations reviewable and preserve existing data unless a reset is explicitly intended.
- Enable Row Level Security on every API-exposed table. Grant only the required roles and operations, and add policies that enforce ownership or other intended access using the authenticated identity. Apply equivalent access rules to Storage objects. Frontend checks are not authorization; verify that users cannot read or modify another user's data.
- Use Supabase Auth for identity and enforce access in PostgreSQL RLS. Only browser-safe configuration may use `VITE_` variables; the browser Supabase client uses the project URL and publishable/anon key. Never expose service-role keys or other secrets in frontend code, Vite variables, committed files, or logs. Use ignored local env files and Supabase-managed secrets for server-side credentials.

## Commands and verification

Run frontend commands from `implementation/frontend`:

```sh
npm run lint
npm run format:check
npm run build
npm test
npm run test:e2e
npm run test:local-supabase
```

`test:local-supabase` requires the local Supabase stack and configured `.env.local`. Playwright's Chromium browser may need the one-time install `npx playwright install chromium`.

Run backend commands from `implementation/backend` (Docker must be running):

```sh
npm run supabase:start
npm run supabase:status
npm run db:migrate
npm run supabase:stop
```

`npm run db:reset` rebuilds the local database and deletes its data; use it only when that reset is intended. Use the scripts in the relevant `package.json` as the source of truth; do not invent root-level or backend test commands.

## Change reporting

When finishing, summarize what changed, list the verification commands actually run and their results, and identify unresolved issues or checks that could not be completed. Do not imply a check passed if it was not run.
