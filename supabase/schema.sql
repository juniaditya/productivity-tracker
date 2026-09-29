-- Focus Ledger / Productivity Tracker
-- PostgreSQL schema for a private Supabase-backed productivity database.
-- Designed for 15-minute time blocks, overlapping activities, habits, rules, and StayFree imports.

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Makassar',
  day_cutoff time not null default '23:59:59',
  gamification_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  classification text not null default 'neutral'
    check (classification in ('productive','recovery','leisure','distraction','neutral')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  start_minute smallint not null check (start_minute between 0 and 1425 and start_minute % 15 = 0),
  end_minute smallint not null check (end_minute between 15 and 1440 and end_minute % 15 = 0),
  category_id uuid not null references public.categories(id) on delete restrict,
  note text check (note is null or char_length(note) <= 500),
  source text not null default 'manual' check (source in ('manual','google_calendar','import')),
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_minute > start_minute)
);

create index if not exists time_blocks_user_date_idx
  on public.time_blocks(user_id, activity_date, start_minute);
create index if not exists time_blocks_category_date_idx
  on public.time_blocks(user_id, category_id, activity_date);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  completion_mode text not null default 'manual'
    check (completion_mode in ('manual','automatic','hybrid')),
  weekly_target smallint check (weekly_target is null or weekly_target between 1 and 7),
  monthly_target smallint check (monthly_target is null or monthly_target between 1 and 31),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.habit_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  source text not null check (source in ('time_tracker','stayfree')),
  operator text not null check (operator in ('gte','lte')),
  threshold_minutes integer not null check (threshold_minutes >= 0 and threshold_minutes <= 1440),
  category_id uuid references public.categories(id) on delete set null,
  match_type text check (match_type is null or match_type in ('all','app','domain','device')),
  match_value text,
  finalize_at_day_end boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id)
);

create table if not exists public.habit_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  check_date date not null,
  checked boolean not null default false,
  source text not null default 'manual'
    check (source in ('manual','time_rule','stayfree_rule','manual_override')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, check_date)
);

create index if not exists habit_checks_user_date_idx
  on public.habit_checks(user_id, check_date);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('stayfree_csv','other')),
  file_name text,
  file_hash text not null,
  row_count integer not null default 0 check (row_count >= 0),
  imported_at timestamptz not null default now(),
  unique (user_id, source, file_hash)
);

create table if not exists public.screen_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  usage_date date not null,
  device text,
  app_name text,
  domain text,
  duration_seconds integer not null check (duration_seconds >= 0 and duration_seconds <= 86400),
  source text not null default 'stayfree_csv' check (source in ('stayfree_csv','manual','api')),
  source_row_hash text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists screen_usage_user_date_idx
  on public.screen_usage(user_id, usage_date);
create unique index if not exists screen_usage_dedupe_idx
  on public.screen_usage(user_id, source, source_row_hash)
  where source_row_hash is not null;

-- RLS: every exposed table is private to the authenticated owner.
alter table public.user_settings enable row level security;
alter table public.categories enable row level security;
alter table public.time_blocks enable row level security;
alter table public.habits enable row level security;
alter table public.habit_rules enable row level security;
alter table public.habit_checks enable row level security;
alter table public.import_batches enable row level security;
alter table public.screen_usage enable row level security;

-- Explicit Data API grants. RLS still decides which rows can be accessed.
grant select, insert, update, delete on public.user_settings to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.time_blocks to authenticated;
grant select, insert, update, delete on public.habits to authenticated;
grant select, insert, update, delete on public.habit_rules to authenticated;
grant select, insert, update, delete on public.habit_checks to authenticated;
grant select, insert, update, delete on public.import_batches to authenticated;
grant select, insert, update, delete on public.screen_usage to authenticated;

-- Policies are intentionally repetitive: simple ownership rules are easy to audit.
create policy "user_settings_select_own" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_settings_insert_own" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_settings_update_own" on public.user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_settings_delete_own" on public.user_settings for delete to authenticated using ((select auth.uid()) = user_id);

create policy "categories_select_own" on public.categories for select to authenticated using ((select auth.uid()) = user_id);
create policy "categories_insert_own" on public.categories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "categories_update_own" on public.categories for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "categories_delete_own" on public.categories for delete to authenticated using ((select auth.uid()) = user_id);

create policy "time_blocks_select_own" on public.time_blocks for select to authenticated using ((select auth.uid()) = user_id);
create policy "time_blocks_insert_own" on public.time_blocks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "time_blocks_update_own" on public.time_blocks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "time_blocks_delete_own" on public.time_blocks for delete to authenticated using ((select auth.uid()) = user_id);

create policy "habits_select_own" on public.habits for select to authenticated using ((select auth.uid()) = user_id);
create policy "habits_insert_own" on public.habits for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "habits_update_own" on public.habits for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habits_delete_own" on public.habits for delete to authenticated using ((select auth.uid()) = user_id);

create policy "habit_rules_select_own" on public.habit_rules for select to authenticated using ((select auth.uid()) = user_id);
create policy "habit_rules_insert_own" on public.habit_rules for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "habit_rules_update_own" on public.habit_rules for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habit_rules_delete_own" on public.habit_rules for delete to authenticated using ((select auth.uid()) = user_id);

create policy "habit_checks_select_own" on public.habit_checks for select to authenticated using ((select auth.uid()) = user_id);
create policy "habit_checks_insert_own" on public.habit_checks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "habit_checks_update_own" on public.habit_checks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "habit_checks_delete_own" on public.habit_checks for delete to authenticated using ((select auth.uid()) = user_id);

create policy "import_batches_select_own" on public.import_batches for select to authenticated using ((select auth.uid()) = user_id);
create policy "import_batches_insert_own" on public.import_batches for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "import_batches_update_own" on public.import_batches for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "import_batches_delete_own" on public.import_batches for delete to authenticated using ((select auth.uid()) = user_id);

create policy "screen_usage_select_own" on public.screen_usage for select to authenticated using ((select auth.uid()) = user_id);
create policy "screen_usage_insert_own" on public.screen_usage for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "screen_usage_update_own" on public.screen_usage for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "screen_usage_delete_own" on public.screen_usage for delete to authenticated using ((select auth.uid()) = user_id);


-- REAL DATA FOUNDATION -------------------------------------------------------
-- Keep timestamps correct on mutable entities.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at before update on public.user_settings for each row execute function public.set_updated_at();
drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
drop trigger if exists time_blocks_set_updated_at on public.time_blocks;
create trigger time_blocks_set_updated_at before update on public.time_blocks for each row execute function public.set_updated_at();
drop trigger if exists habits_set_updated_at on public.habits;
create trigger habits_set_updated_at before update on public.habits for each row execute function public.set_updated_at();
drop trigger if exists habit_rules_set_updated_at on public.habit_rules;
create trigger habit_rules_set_updated_at before update on public.habit_rules for each row execute function public.set_updated_at();
drop trigger if exists habit_checks_set_updated_at on public.habit_checks;
create trigger habit_checks_set_updated_at before update on public.habit_checks for each row execute function public.set_updated_at();

create index if not exists habit_rules_category_id_idx on public.habit_rules(category_id) where category_id is not null;
create index if not exists habit_rules_user_id_idx on public.habit_rules(user_id);
create index if not exists screen_usage_import_batch_id_idx on public.screen_usage(import_batch_id) where import_batch_id is not null;
create index if not exists time_blocks_category_id_idx on public.time_blocks(category_id);

-- Idempotent first-login initializer. It runs under the authenticated user and RLS.
create or replace function public.ensure_personal_defaults()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  insert into public.user_settings (user_id, timezone)
  values (v_uid, 'Asia/Makassar')
  on conflict (user_id) do nothing;

  insert into public.categories (user_id, name, color, classification, sort_order, is_active)
  values
    (v_uid, 'Tidur', '#6366f1', 'recovery', 10, true),
    (v_uid, 'Belajar', '#8b5cf6', 'productive', 20, true),
    (v_uid, 'Kerja', '#3b82f6', 'productive', 30, true),
    (v_uid, 'Olahraga', '#22c55e', 'productive', 40, true),
    (v_uid, 'Main HP', '#f43f5e', 'distraction', 50, true),
    (v_uid, 'Personal', '#06b6d4', 'neutral', 60, true),
    (v_uid, 'Hiburan', '#eab308', 'leisure', 70, true),
    (v_uid, 'Makan', '#f97316', 'neutral', 80, true),
    (v_uid, 'Perjalanan', '#64748b', 'neutral', 90, true),
    (v_uid, 'Lainnya', '#71717a', 'neutral', 100, true)
  on conflict (user_id, name) do nothing;

  insert into public.habits
    (user_id, name, color, completion_mode, weekly_target, monthly_target, sort_order, is_active)
  values
    (v_uid, 'Japanese', '#8b5cf6', 'manual', 7, 28, 10, true),
    (v_uid, 'Anki', '#3b82f6', 'manual', 7, 28, 20, true),
    (v_uid, 'Gym', '#22c55e', 'manual', 4, 16, 30, true),
    (v_uid, 'Running', '#14b8a6', 'manual', 3, 12, 40, true),
    (v_uid, 'Reading', '#f59e0b', 'manual', 5, 20, 50, true),
    (v_uid, 'Journal', '#06b6d4', 'manual', 5, 20, 60, true),
    (v_uid, 'Skincare', '#ec4899', 'manual', 7, 28, 70, true),
    (v_uid, 'Vitamin', '#84cc16', 'manual', 7, 28, 80, true),
    (v_uid, 'No sugar', '#f97316', 'manual', 5, 20, 90, true),
    (v_uid, 'Stretch', '#6366f1', 'manual', 4, 16, 100, true)
  on conflict (user_id, name) do nothing;
end;
$$;
revoke all on function public.ensure_personal_defaults() from public;
revoke all on function public.ensure_personal_defaults() from anon;
grant execute on function public.ensure_personal_defaults() to authenticated;

-- Atomic replacement for a single day of Timeline data.
create or replace function public.save_day_time_blocks(p_activity_date date, p_blocks jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_blocks jsonb := coalesce(p_blocks, '[]'::jsonb);
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_activity_date is null then raise exception 'activity_date is required'; end if;
  if jsonb_typeof(v_blocks) <> 'array' then raise exception 'blocks must be a JSON array'; end if;

  if exists (
    select 1
    from jsonb_array_elements(v_blocks) item
    left join public.categories c
      on c.id = (item->>'category_id')::uuid
     and c.user_id = v_uid
    where c.id is null
  ) then raise exception 'A block references a category that does not belong to this user'; end if;

  if exists (
    select 1
    from generate_series(0, 1425, 15) minute_mark
    where (
      select count(*)
      from jsonb_array_elements(v_blocks) item
      where (item->>'start_minute')::int <= minute_mark
        and (item->>'end_minute')::int > minute_mark
    ) > 2
  ) then raise exception 'A 15-minute slot cannot contain more than two activities'; end if;

  delete from public.time_blocks where user_id = v_uid and activity_date = p_activity_date;
  insert into public.time_blocks (user_id, activity_date, start_minute, end_minute, category_id, note, source)
  select
    v_uid,
    p_activity_date,
    (item->>'start_minute')::smallint,
    (item->>'end_minute')::smallint,
    (item->>'category_id')::uuid,
    nullif(item->>'note', ''),
    'manual'
  from jsonb_array_elements(v_blocks) item;
end;
$$;
revoke all on function public.save_day_time_blocks(date, jsonb) from public;
revoke all on function public.save_day_time_blocks(date, jsonb) from anon;
grant execute on function public.save_day_time_blocks(date, jsonb) to authenticated;
