-- Hosted project applied this as a follow-up fix. Kept here so migration versions match production.
drop index if exists public.time_blocks_calendar_event_unique_idx;
create unique index time_blocks_calendar_event_unique_idx
  on public.time_blocks(user_id, activity_date, external_calendar_id, external_id)
  where source = 'google_calendar' and external_calendar_id is not null and external_id is not null;
