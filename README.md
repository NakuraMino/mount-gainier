# Gym Tracker

A personal, installable web app for logging workouts and watching your strength
grow. Pick a category (**Upper / Lower / Back**), the app shows the exercises you
train for it with **last time's numbers** and a **suggestion to add weight** when
you're ready, you punch in your sets, and the **Progress** tab charts it over time
with personal-record tracking.

Built on the same stack as `papers_web` — a **Vite + React PWA** → a thin
**Express API** → **Supabase Postgres** → **Vercel** — with real logins handled by
**Supabase Auth**.

## Features

- **Category-based logging.** No fixed weekly schedule — choose Upper, Lower, or
  Back and fill in that category's exercises. Add a new exercise inline anytime.
- **"Last time" reference + progression suggestions.** Each exercise shows your
  previous top set and estimated 1RM, and proposes a heavier weight when you hit
  your target reps or tick **"ready for more weight?"**
- **Per-set logging** with optional **RPE** and notes; a cardio/steps note per session.
- **Progress charts** (recharts): **Weight · Est. 1RM · Volume**, with timeline
  toggles (**1M / 3M / 6M / 1Y / All**) and a draggable zoom brush.
- **Personal records** — heaviest weight, best estimated 1RM, best session volume.
- **Consistency streak**, weekly volume, lifetime workout count.
- **CSV export** of every set. **Installable PWA**, mobile-first, **dark/light** theme.
- **Private** — username/password login required to view and edit; accounts are
  created by an admin only (no public signup).

## Requirements

- **Node 18+** (built/tested on Node 20). This repo lives in WSL Ubuntu — run the
  commands in a WSL shell where `node -v` shows ≥ 18.
- **A free Supabase project** (Postgres + Auth). All your data lives here.

## Setup

```bash
npm install            # root deps (express, @supabase/supabase-js, ws)
npm run build:web      # installs web deps + builds the React app
```

### 1. Supabase

1. Create a free project at https://supabase.com.
2. **SQL Editor → New query** → paste [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   (Creates the `profiles`, `exercises`, `workouts`, `workout_exercises`, `sets`,
   and `prefs` tables, all with RLS enabled.)
3. **Project Settings → API** → copy the **Project URL**, the **`anon` public** key,
   and the **`service_role`** secret key.

### 2. Configure + seed

```bash
cp .env.local.example .env.local
#   SUPABASE_URL                = your project URL
#   SUPABASE_SERVICE_ROLE_KEY   = service_role secret (server only)
#   VITE_SUPABASE_URL           = same project URL (browser, public)
#   VITE_SUPABASE_ANON_KEY      = anon public key  (browser, public)

npm run seed           # creates account "mino" (password gym123) + the exercise library
npm run build:web      # rebuild so the web app picks up VITE_SUPABASE_* (if you set them after the first build)
```

> `npm run seed` is idempotent — safe to re-run. Override the seeded credentials
> with `SEED_USERNAME` / `SEED_PASSWORD` env vars if you like.

### 3. Run

```bash
npm start              # serve on http://localhost:8080
```

Open **http://localhost:8080** and log in with **`mino` / `gym123`**.

### Development (hot-reload UI)

```bash
npm run dev            # Express on :8080 + Vite UI on :5173 (proxies /api)
```

Open **http://localhost:5173** while developing.

## Accounts

Logins use **Supabase Auth**. The username/password you see in the UI maps to a
synthetic email (`<username>@gymtracker.local`) under the hood — you never type an
email. Account creation is **admin-only**; there is no public signup. To add another
account:

```bash
npm run create-user -- <username> <password> [admin]
#   e.g. npm run create-user -- alex hunter2
```

To change `mino`'s password, re-run `npm run seed` with a new `SEED_PASSWORD`, or
`npm run create-user -- mino <newpassword> admin`.

> `gym123` is intentionally simple for a personal tool. It's stored hashed by
> Supabase Auth (never plaintext) and only travels over HTTPS in production.

## Hosting (Supabase + Vercel, free)

Same model as `papers_web`: **Supabase** holds the data + auth, **Vercel** serves the
app. Total cost: $0. The Express API runs as a Vercel serverless function
([`api/index.mjs`](api/index.mjs)); the React app is served from the CDN.

1. Push this repo to GitHub.
2. Import it at https://vercel.com → **New Project**.
3. Add four env vars under **Settings → Environment Variables**: `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
   Leave build settings as detected — [`vercel.json`](vercel.json) already sets the
   build command, output dir, and routing.
4. **Deploy**, then open your `your-app.vercel.app` URL.

> Heads up: Supabase's free tier pauses a project after ~1 week of inactivity. If you
> take a layoff from the gym, the first request after may cold-start (or need a click
> to un-pause in the Supabase dashboard).

## How "last time" and suggestions work

- **Estimated 1RM** uses the Epley formula: `weight × (1 + reps/30)`.
- **"Last time"** is the top set (heaviest, tie-broken by reps) of your most recent
  prior session for that exercise.
- A **suggestion to add weight** appears when, last session, you either ticked
  *"ready for more weight?"* or hit at least your exercise's target reps. The bump is
  +2.5 (dumbbell/unilateral), +10 (lower body), or +5 lb otherwise — tap the chip to
  pre-fill it.

## Data & privacy

All data is per-user and lives in your Supabase Postgres database. The browser only
ever talks to Supabase for **login**; every read/write of your workout data goes
through the Express API using the **service-role key (server-side only)**. RLS is
enabled on all tables, so the public anon key can't touch your data directly. Export
anytime via **Settings → Export CSV**.

## Project layout

```
server/supabase.mjs    service-role Supabase client (server-side)
server/auth.mjs        Supabase-Auth token verification + admin account creation
server/db.mjs          data layer (exercises, workouts, sets) + derived stats/PRs
server/app.mjs         Express API (auth-gated) + serves the built web app locally
server/index.mjs       local entry: `npm start`
api/index.mjs          Vercel serverless entry (mounts the Express app)
supabase/schema.sql    tables + RLS (run once in Supabase)
scripts/seed.mjs       seed `mino` + the exercise library
scripts/create-user.mjs admin CLI to add accounts
web/                   Vite + React PWA (Log / History / Progress + settings)
vercel.json            Vercel build + routing config
```

## API (all routes require a valid Supabase token; scoped to the user)

```
GET  /api/me                          { username, isAdmin }
POST /api/users                       (admin) create an account
GET  /api/categories                  category list + exercise counts
GET  /api/log?category=               a category's exercises + "last time" + suggestion
GET  /api/exercises[?category=]       library            POST /api/exercises
PUT  /api/exercises/:id   DELETE       edit / remove
GET  /api/exercises/:id/history       full per-session history
GET  /api/workouts[?limit=]           history list       POST /api/workouts  (save a session)
GET  /api/workouts/:id                session detail
PUT  /api/workouts/:id    DELETE       edit / remove a session
GET  /api/progress/:exerciseId?range= series (weight/e1rm/volume) + PRs   (range=1m|3m|6m|1y|all)
GET  /api/stats                       streak, weekly volume, totals
GET  /api/prefs           POST         units (lb/kg)
GET  /api/export.csv                  every set as CSV
```
