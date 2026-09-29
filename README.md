# Focus Ledger / Productivity Tracker

Personal productivity database built with Next.js 16, Supabase, and Vercel.

## Product modules

- **Today** — time coverage, habits, weekly goals, screen usage.
- **Timeline** — 15-minute planning/tracking with up to 2 overlapping activities.
- **Habits** — monthly matrix with weekly + monthly completion goals; no streak pressure.
- **Insights** — time allocation, completeness, comparisons, and non-causal associations.
- **Settings** — categories, theme, Google Calendar (planned), StayFree CSV import (planned).

## Recommended Git workflow

The local laptop folder is the editing source; GitHub is the canonical remote; Vercel watches GitHub.

```bash
git init
git add .
git commit -m "feat: initial productivity tracker"
git branch -M main
git remote add origin https://github.com/<YOUR_USER>/productivity-tracker.git
git push -u origin main
```

After the GitHub repository is connected to Vercel:

- push to `main` → Production Deployment
- push another branch → Preview Deployment

Typical improvement workflow:

```bash
git checkout -b feature/timeline-notes
# edit files
git add .
git commit -m "feat: add timeline notes"
git push -u origin feature/timeline-notes
```

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Without Supabase environment variables, the UI intentionally runs in demo mode so the project can build before cloud resources are connected.

## Supabase environment variables

Use a publishable key, never a service-role/secret key in browser code.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The same two variables should be added to Vercel for Production and Preview.

## Database schema

`supabase/schema.sql` contains the initial schema and RLS policies for:

- `user_settings`
- `categories`
- `time_blocks`
- `habits`
- `habit_rules`
- `habit_checks`
- `import_batches`
- `screen_usage`

Time blocks use minute offsets (0–1440) constrained to 15-minute increments. Overlap is intentionally permitted.

When adopting the Supabase CLI locally, create a migration with the CLI first and copy the reviewed schema into that generated migration file rather than inventing a migration filename manually.

## Authentication

The project uses `@supabase/ssr`, cookie-based auth, and Next.js 16 `proxy.ts` to refresh/validate sessions. Once Supabase env vars exist, unauthenticated app routes redirect to `/auth/login`.

For a personal deployment, create only the account(s) you intend to use and keep RLS enabled.

## Important product semantics

### Clock coverage vs activity time

If `Belajar` and `Main HP` overlap from 19:00–20:00:

- clock coverage = 1 hour
- Belajar activity time = 1 hour
- Main HP activity time = 1 hour

This prevents overlap from creating impossible 25–30 hour days while preserving activity totals.

### Habit completion

Unchecked days are not automatically failures. A running habit can target `3/week` and `12/month`, so any three checked days in a week complete the weekly goal.

Automatic habit rules are optional and designed for:

- Timeline category duration (`Japanese >= 60 min`)
- StayFree usage limits (`Phone <= 120 min`, finalized at day end)

Manual overrides remain possible.

## Real-data v1

The app now uses Supabase data for the core workflow instead of demo arrays:

- Timeline loads/saves `time_blocks` by date at 15-minute resolution.
- Saving one Timeline day uses `save_day_time_blocks()` so delete + insert happen atomically.
- Settings manages real `categories` (add, rename, recolor, classify, archive/restore).
- Habits manages real `habits` and `habit_checks` (add, edit, archive, monthly navigation, daily checks).
- Today reads real Timeline, habit, and screen-usage records.
- Insights calculates seven-day coverage, category classifications, habit completion, and screen-time average from real rows.
- `ensure_personal_defaults()` idempotently creates default categories/habits for an authenticated account.

Database migrations applied to the hosted Supabase project are mirrored under `supabase/migrations/`.

### Before pushing

```powershell
npm.cmd run build
```

Then:

```powershell
git add .
git commit -m "feat: connect tracker to real Supabase data"
git push
```
