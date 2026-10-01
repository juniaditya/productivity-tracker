# Real Data V3 — Google Calendar, Preferences, Milestones, Backup

Batch 3 builds on Real Data V2.

## Added

- Google Calendar OAuth 2.0 server flow.
- Narrow Calendar scopes: event read/write + calendar-list read-only.
- Refresh tokens stored in a private Supabase schema and only accessible through service-role-only RPCs.
- Manual day import: Google Calendar -> 15-minute Timeline.
- Manual day export: Timeline -> Google Calendar.
- Calendar-imported blocks preserve their source metadata until edited locally.
- All-day Calendar events are skipped.
- Imported timed events are rounded outward to the 15-minute grid.
- Calendar imports enforce the existing max-two-activities-per-slot rule.
- Timezone, day cutoff, and milestone toggle in Settings.
- Lightweight milestone system with no streak penalties.
- JSON backup export for all productivity data; OAuth secrets are excluded.

## New Vercel environment variables

Server-only variables. Never prefix these with `NEXT_PUBLIC_`:

```env
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

The existing public variables stay unchanged:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

## Google Cloud setup

1. Create or choose a Google Cloud project.
2. Enable Google Calendar API.
3. Configure Google Auth Platform / OAuth consent screen.
4. Add your Google account as a test user while the app is in Testing mode.
5. Create an OAuth 2.0 Web Application client.
6. Add authorized redirect URIs:
   - `http://localhost:3000/api/google/calendar/callback`
   - `https://YOUR-PRODUCTION-DOMAIN/api/google/calendar/callback`
7. Put the Client ID and Client Secret into Vercel environment variables.
8. Redeploy, then open Settings -> Google Calendar -> Connect.

Important: Google OAuth projects in Testing mode can issue refresh tokens that expire after 7 days. For long-lived personal sync, move the OAuth app to In production when appropriate.

## Calendar semantics

- Import is manual per day. Focus Ledger does not silently rewrite the Timeline in the background.
- Re-importing the same calendar/day replaces the previous Google-sourced blocks for that calendar/day.
- Manual Timeline blocks are preserved.
- If an imported event would create a third simultaneous activity, it is skipped and reported.
- Editing an imported Calendar block in the Timeline converts the edited run to manual data.
- Export ignores blocks that came from Google Calendar, preventing obvious echo loops.
- Exported events carry a private fingerprint so repeated export of the same block does not create duplicates.

## Milestones

Current milestones are intentionally secondary and non-punitive:

- First Log
- 24 Activity Hours
- 100 Activity Hours
- 7 Days Recorded
- 30 Days Recorded
- 10 Habit Checks
- 50 Habit Checks
- Digital Awareness (first screen import)
- Calendar Connected to Time (first calendar import)

No streaks are used.

## Backup

Settings -> Backup & export downloads a JSON snapshot of:

- user settings
- categories
- time blocks
- habits
- habit rules
- habit checks
- StayFree import batches
- screen usage
- Calendar preferences
- milestone unlocks

Google OAuth tokens are intentionally excluded.
