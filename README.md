# Focus Ledger / Productivity Tracker

Personal manual productivity database built with Next.js 16, Supabase, and Vercel.

## Product modules

- **Today** — manual Timeline coverage, habits, weekly goals, milestones.
- **Timeline** — 15-minute manual planning/tracking with up to 2 overlapping activities.
- **Habits** — manual monthly matrix with weekly + monthly completion goals; no streak pressure.
- **Insights** — coverage, time classification, habit completion, and manual-data associations.
- **Settings** — categories, timezone, theme, milestones, and JSON backup.

Google Calendar and StayFree are intentionally not part of the active product workflow as of V4.

## Git workflow

```bash
git add .
git commit -m "feat: improve tracker"
git push
```

Vercel watches `main` and deploys automatically.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

## Database

The active manual workflow uses:

- `user_settings`
- `categories`
- `time_blocks`
- `habits`
- `habit_checks`
- `milestone_unlocks`

Legacy external-integration tables remain in hosted Supabase for non-destructive history compatibility, but V4 does not query or expose them.

## Timeline semantics

- 96 slots per day.
- Each slot is 15 minutes.
- At most 2 activities may overlap.
- Clock coverage counts each wall-clock slot once.
- Category totals count each selected activity.
- Autosave runs after about 600 ms of inactivity.
- Date changes and app navigation flush pending Timeline changes before leaving.
- `Save now` is always available for a manual force-save.

## Habit semantics

- All checks are manual.
- Empty days are neutral, not failures.
- Weekly/monthly target is the denominator for completion.
- Habit rows are sorted by preset color order; changing color changes row position.

## V4

See `REAL_DATA_V4.md` for the manual-only, navigation-performance, Timeline-reliability, and habit-ordering revision.

## Timeline V5

Timeline now uses draggable calendar-style activity blocks. Desktop defaults to a 7-day week, mobile to one day. Blocks support title/category/date/time/note editing, drag move, resize, duplicate/delete, 15-minute snapping, and atomic multi-day saves.
