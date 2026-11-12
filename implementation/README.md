# The Goober's Guide

The Goober's Guide is a local-first D&D companion application. This repository's new implementation is under `implementation/`; `legacy/` is an archived UI/UX prototype and is not part of the active app.

## Technology stack

- Frontend: React, TypeScript, Vite, Tailwind CSS v4, React Router, TanStack Query
- Backend: local Supabase, PostgreSQL, Supabase Auth, Storage, and Row Level Security
- Tooling: Docker, Supabase CLI, ESLint, Prettier, Vitest, React Testing Library, and Playwright

The backend is Supabase. There is no separate Express or NestJS server.

## Prerequisites

- Node.js 22.12 or later and npm
- Docker Desktop installed and running
- Git

The Supabase CLI is installed as a local dependency in `backend/`; a global CLI installation is not required.

## First-time setup

Install the local Supabase CLI dependency and start the local services:

```sh
cd implementation/backend
npm install
npm run supabase:start
npm run supabase:status -- --output env | grep -E '^(API_URL|PUBLISHABLE_KEY)='
```

Copy the API URL and publishable key from the status output. In a second terminal, install and configure the frontend:

```sh
cd implementation/frontend
npm install
cp .env.example .env.local
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `frontend/.env.local` to the local values printed by `supabase status`. The `.env.local` file is ignored by Git. Use only the publishable/anon key in the frontend; never place a Supabase secret or service-role key in a Vite variable.

## Run the app

With Supabase running and `.env.local` configured:

```sh
cd implementation/frontend
npm run dev
```

Open <http://localhost:5173>. Signed-out visitors reach the account screen for signing in with a username or email and password; authenticated visitors reach the protected `/app` shell. `/dev/status` keeps the React, Tailwind, and local Supabase Auth diagnostics available. The browser client is in `frontend/src/lib/supabase.ts`.

## Local Supabase and database migrations

Run Supabase CLI commands from `implementation/backend`:

```sh
npm run supabase:start
npm run supabase:status
npm run db:migrate
npm run supabase:stop
```

The first `supabase start` applies pending migrations automatically. `db:migrate` applies any migrations added while the stack is running. Migration files live in `backend/supabase/migrations/`.

Account creation requires a unique username and supports an optional email. Accounts without an email use an internal Supabase Auth address. Players sign in to those accounts with their username. Existing email-only accounts continue to sign in with their email. The `sign-in-with-username` Edge Function runs on the local Supabase stack and uses its built-in server environment. If the stack was already running when the function was added, run `npm run supabase:stop` and `npm run supabase:start` from the backend directory to load the function while preserving local data.

To rebuild the local database from migrations, run `npm run db:reset`. This deletes local database data before recreating the schema. Local Supabase uses Docker containers and does not connect to a hosted project.

## Tests and code quality

Run frontend commands from `implementation/frontend`:

```sh
npm run lint
npm run format:check
npm run build
npm test
npx playwright install chromium   # one-time browser install for end-to-end tests
npm run test:e2e
npm run test:local-supabase       # requires the local Supabase stack and .env.local
```

`npm run format` formats the frontend files. `npm run test:watch` starts Vitest in watch mode. The end-to-end smoke test starts Vite itself and stubs the Auth health endpoint. `npm run test:local-supabase` uses the values in `.env.local` and checks the running local Auth API, username and email account flows, and campaign access rules. It creates local test accounts, uses Docker access to add test memberships to the local database, and removes its test campaigns afterward. The test accounts remain in local Auth.

## Environment variables

`frontend/.env.example` documents the two required browser variables:

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Local Supabase API URL, normally `http://127.0.0.1:54321` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Local publishable (formerly anon) key shown by `supabase status` |

Any variable prefixed with `VITE_` is bundled into browser code. Never put secret or service-role keys there.

## Common local commands

| Task | Command | Run from |
| --- | --- | --- |
| Start frontend | `npm run dev` | `implementation/frontend` |
| Build frontend | `npm run build` | `implementation/frontend` |
| Lint frontend | `npm run lint` | `implementation/frontend` |
| Check formatting | `npm run format:check` | `implementation/frontend` |
| Run unit tests | `npm test` | `implementation/frontend` |
| Run end-to-end tests | `npm run test:e2e` | `implementation/frontend` |
| Verify browser connection to local Supabase | `npm run test:local-supabase` | `implementation/frontend` |
| Start Supabase | `npm run supabase:start` | `implementation/backend` |
| Apply pending migrations | `npm run db:migrate` | `implementation/backend` |
| Stop Supabase | `npm run supabase:stop` | `implementation/backend` |
| Audit all frontend dependencies | `npm audit` | `implementation/frontend` |
| Audit production dependencies | `npm audit --omit=dev` | `implementation/frontend` |

To print just the browser-safe local API URL and publishable key, run this from `implementation/backend`:

```sh
npm run supabase:status -- --output env | grep -E '^(API_URL|PUBLISHABLE_KEY)='
```

## Known dependency audit findings

The current frontend `npm audit` reports 10 moderate findings in ESLint and TypeScript ESLint tooling, all related to `minimatch` and GHSA-g3hv-75wg-m249 (globparts amplification denial of service). npm's suggested ESLint fix requires a major-version downgrade. No forced or breaking dependency changes were made. `npm audit --omit=dev` reports no production dependency findings.
