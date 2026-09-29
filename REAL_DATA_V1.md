# Real Data V1

Applied to hosted Supabase:

1. Added missing foreign-key indexes.
2. Added automatic `updated_at` triggers.
3. Added idempotent `ensure_personal_defaults()`.
4. Seeded 10 default categories and 10 default habits for existing users.
5. Added atomic `save_day_time_blocks(date, blocks)` with max-two-overlap validation.
6. Preserved historical Timeline records when a category is archived.

Frontend changes:

1. Timeline now persists 15-minute entries to Supabase.
2. Previous/next-day Timeline navigation loads the selected date from Supabase.
3. Categories are editable and archivable in Settings.
4. Habit checks, creation, editing, monthly goals, and archive now persist.
5. Today dashboard is calculated from real rows.
6. Insights uses the last seven days of real rows and no longer shows fake correlations.
7. Added sign-out action.

Still intentionally deferred:

- Timeline notes editor / block resize inspector.
- Automatic habit rules.
- Google Calendar sync.
- StayFree CSV importer.
- Advanced correlations and gamification.
