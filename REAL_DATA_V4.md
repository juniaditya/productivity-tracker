# Real Data V4 — Manual-only + reliability

V4 removes Google Calendar and StayFree from the product surface and returns Focus Ledger to a manual tracker.

## Manual-only product

- Google Calendar UI/API routes removed.
- StayFree importer and digital-usage UI removed.
- Habit automation removed; all habit checks are manual.
- Existing external Timeline rows are detached and preserved as manual history.
- Existing positive automatic habit checks are preserved as manual checks.
- Backup exports only manual tracker data.

## Navigation performance

- `vercel.json` sets the Vercel Functions region to `icn1` (Seoul), matching the Supabase project region and reducing database round-trip latency.
- Navigation destinations are prefetched.
- Navigation immediately shows a pending indicator/spinner.
- Route loading skeleton gives immediate feedback instead of appearing unresponsive.
- Repeated initialization RPC was removed from the persistent app layout.
- Today, Habits, Insights, and Settings make fewer database calls after external integrations were removed.

## Timeline save reliability

- Autosave debounce reduced to about 600 ms.
- Saves are serialized through a queue instead of being silently rejected while another save is in flight.
- Changing Timeline date waits for the latest save to finish.
- Leaving Timeline through the app navigation waits for the latest save to finish.
- `pagehide`/unmount performs a same-origin keepalive save as a final safety net.
- `Save now` is always available as a force-save button; `Saved` is status text, not a disabled save control.
- A new `/api/timeline/save` endpoint performs authenticated server-side persistence.

## Habit ordering

Habit rows are sorted by the order of the preset color palette. Changing a habit color immediately changes its vertical position. When multiple habits share the same color, their existing sort order/name is used as the tie-breaker.
