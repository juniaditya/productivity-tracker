create index if not exists calendar_preferences_import_category_id_idx
  on public.calendar_preferences(import_category_id)
  where import_category_id is not null;
