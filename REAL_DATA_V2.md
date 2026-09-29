# Real Data V2 — Automation + StayFree

Batch 2 builds on Real Data V1.

## Database

- Stricter RLS ownership checks for referenced categories, habits, and import batches.
- `evaluate_habit_rules(date)` evaluates one automation rule per habit.
- Timeline saves automatically re-evaluate rules for that date.
- `>=` rules can complete immediately.
- `<=` rules remain `on_track` during the current day and only auto-complete after the day cutoff / on historical dates.
- Manual rows and manual overrides are never overwritten by automation.
- `import_stayfree_rows(...)` imports a mapped CSV atomically, deduplicates exact files and overlapping rows, then re-evaluates StayFree habit rules.

## Timeline

- Debounced autosave (~1.2 seconds after editing stops).
- Explicit Save button remains available.
- Changing dates first attempts an autosave.
- Every successful save also refreshes automatic habit rules.

## Habits

- Automation editor per habit.
- Timeline rules: choose one category, `>=` or `<=`, threshold in minutes.
- StayFree rules: total usage or exact app/domain/device, `>=` or `<=`, threshold in minutes.
- Matrix marks automatic checks with `A` and manual overrides with `M`.
- Clicking an automatic result creates a manual override; clicking an existing manual override again returns control to automation.
- Current-day rule status shows measured minutes and `complete`, `pending`, `on_track`, or `failed`.

## StayFree

Settings now includes a CSV importer with:

- delimiter detection (comma / semicolon / tab)
- explicit column mapping
- duration unit mapping
- preview before import
- row validation
- file SHA-256 dedupe
- row SHA-256 dedupe
- import history

Because StayFree export columns can vary, the importer intentionally maps columns instead of hard-coding one CSV layout.

## Insights

- 7-day overview for coverage, habit completion, productive time, screen average.
- Top digital usage and device breakdown.
- Up to 28 days for observed associations.
- Pearson `screen time ↔ productive time` appears only with at least 7 matched days.
- Exercise-day vs study-time comparison appears only with at least 3 days in each group.
- Association language is descriptive; it does not claim causality.

## Deferred

Google Calendar remains deferred because a real integration needs Google OAuth credentials, callback URLs, token storage, and explicit calendar permissions. It should be implemented as a separate batch rather than faked with a disabled button or unsafe token handling.
