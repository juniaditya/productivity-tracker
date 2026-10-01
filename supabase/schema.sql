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
  title text check (title is null or char_length(title) <= 120),
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


-- Batch 2 additions
-- Batch 2: rule automation, StayFree import, and stricter ownership checks.

-- Tighten ownership policies for rows that reference other user-owned tables.
drop policy if exists "time_blocks_insert_own" on public.time_blocks;
drop policy if exists "time_blocks_update_own" on public.time_blocks;
create policy "time_blocks_insert_own" on public.time_blocks
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.categories c
    where c.id = category_id and c.user_id = (select auth.uid())
  )
);
create policy "time_blocks_update_own" on public.time_blocks
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.categories c
    where c.id = category_id and c.user_id = (select auth.uid())
  )
);

drop policy if exists "habit_rules_insert_own" on public.habit_rules;
drop policy if exists "habit_rules_update_own" on public.habit_rules;
create policy "habit_rules_insert_own" on public.habit_rules
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.habits h
    where h.id = habit_id and h.user_id = (select auth.uid())
  )
  and (
    category_id is null
    or exists (
      select 1 from public.categories c
      where c.id = category_id and c.user_id = (select auth.uid())
    )
  )
);
create policy "habit_rules_update_own" on public.habit_rules
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.habits h
    where h.id = habit_id and h.user_id = (select auth.uid())
  )
  and (
    category_id is null
    or exists (
      select 1 from public.categories c
      where c.id = category_id and c.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "habit_checks_insert_own" on public.habit_checks;
drop policy if exists "habit_checks_update_own" on public.habit_checks;
create policy "habit_checks_insert_own" on public.habit_checks
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.habits h
    where h.id = habit_id and h.user_id = (select auth.uid())
  )
);
create policy "habit_checks_update_own" on public.habit_checks
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.habits h
    where h.id = habit_id and h.user_id = (select auth.uid())
  )
);

drop policy if exists "screen_usage_insert_own" on public.screen_usage;
drop policy if exists "screen_usage_update_own" on public.screen_usage;
create policy "screen_usage_insert_own" on public.screen_usage
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    import_batch_id is null
    or exists (
      select 1 from public.import_batches b
      where b.id = import_batch_id and b.user_id = (select auth.uid())
    )
  )
);
create policy "screen_usage_update_own" on public.screen_usage
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    import_batch_id is null
    or exists (
      select 1 from public.import_batches b
      where b.id = import_batch_id and b.user_id = (select auth.uid())
    )
  )
);

-- A habit can have one active automation rule in V2.
alter table public.habit_rules
  drop constraint if exists habit_rules_source_shape;
alter table public.habit_rules
  add constraint habit_rules_source_shape check (
    (source = 'time_tracker' and category_id is not null)
    or (source = 'stayfree' and category_id is null)
  );

-- Evaluate a single date and keep auto-generated habit checks in sync.
create or replace function public.evaluate_habit_rules(p_check_date date)
returns table (
  habit_id uuid,
  rule_source text,
  measured_minutes integer,
  target_minutes integer,
  rule_operator text,
  status text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_timezone text;
  v_cutoff time;
  v_local_date date;
  v_local_time time;
  v_minutes integer;
  v_final boolean;
  v_success boolean;
  v_status text;
  v_auto_source text;
  r record;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if p_check_date is null then
    raise exception 'check date is required';
  end if;

  select timezone, day_cutoff
    into v_timezone, v_cutoff
  from public.user_settings
  where user_id = v_uid;

  v_timezone := coalesce(v_timezone, 'Asia/Makassar');
  v_cutoff := coalesce(v_cutoff, '23:59:59'::time);
  v_local_date := (now() at time zone v_timezone)::date;
  v_local_time := (now() at time zone v_timezone)::time;
  v_final := p_check_date < v_local_date
    or (p_check_date = v_local_date and v_local_time >= v_cutoff);

  for r in
    select hr.*
    from public.habit_rules hr
    join public.habits h on h.id = hr.habit_id
    where hr.user_id = v_uid
      and hr.is_active = true
      and h.user_id = v_uid
      and h.is_active = true
    order by h.sort_order, h.name
  loop
    if r.source = 'time_tracker' then
      select coalesce(sum(tb.end_minute - tb.start_minute), 0)::integer
        into v_minutes
      from public.time_blocks tb
      where tb.user_id = v_uid
        and tb.activity_date = p_check_date
        and tb.category_id = r.category_id;
      v_auto_source := 'time_rule';
    else
      select coalesce(floor(sum(su.duration_seconds) / 60.0), 0)::integer
        into v_minutes
      from public.screen_usage su
      where su.user_id = v_uid
        and su.usage_date = p_check_date
        and (
          r.match_type is null
          or r.match_type = 'all'
          or (r.match_type = 'app' and lower(coalesce(su.app_name, '')) = lower(coalesce(r.match_value, '')))
          or (r.match_type = 'domain' and lower(coalesce(su.domain, '')) = lower(coalesce(r.match_value, '')))
          or (r.match_type = 'device' and lower(coalesce(su.device, '')) = lower(coalesce(r.match_value, '')))
        );
      v_auto_source := 'stayfree_rule';
    end if;

    if r.operator = 'gte' then
      v_success := v_minutes >= r.threshold_minutes;
      v_status := case when v_success then 'complete' else 'pending' end;
    else
      v_success := v_minutes <= r.threshold_minutes;
      if v_final then
        v_status := case when v_success then 'complete' else 'failed' end;
      else
        v_status := case when v_success then 'on_track' else 'failed' end;
      end if;
    end if;

    -- Any explicit manual row wins over automation for that habit/date.
    if not exists (
      select 1 from public.habit_checks hc
      where hc.user_id = v_uid
        and hc.habit_id = r.habit_id
        and hc.check_date = p_check_date
        and hc.source in ('manual', 'manual_override')
    ) then
      if v_success and (r.operator = 'gte' or v_final) then
        insert into public.habit_checks (
          user_id, habit_id, check_date, checked, source
        ) values (
          v_uid, r.habit_id, p_check_date, true, v_auto_source
        )
        on conflict on constraint habit_checks_habit_id_check_date_key
        do update set
          checked = excluded.checked,
          source = excluded.source,
          updated_at = now();
      else
        delete from public.habit_checks hc
        where hc.user_id = v_uid
          and hc.habit_id = r.habit_id
          and hc.check_date = p_check_date
          and hc.source in ('time_rule', 'stayfree_rule');
      end if;
    end if;

    habit_id := r.habit_id;
    rule_source := r.source;
    measured_minutes := v_minutes;
    target_minutes := r.threshold_minutes;
    rule_operator := r.operator;
    status := v_status;
    return next;
  end loop;
end;
$$;

revoke all on function public.evaluate_habit_rules(date) from public;
revoke all on function public.evaluate_habit_rules(date) from anon;
grant execute on function public.evaluate_habit_rules(date) to authenticated;

-- Recreate the Timeline save function so any save also refreshes automatic habits.
create or replace function public.save_day_time_blocks(
  p_activity_date date,
  p_blocks jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_blocks jsonb := coalesce(p_blocks, '[]'::jsonb);
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if p_activity_date is null then
    raise exception 'activity_date is required';
  end if;
  if jsonb_typeof(v_blocks) <> 'array' then
    raise exception 'blocks must be a JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_blocks) item
    left join public.categories c
      on c.id = (item->>'category_id')::uuid
     and c.user_id = v_uid
    where c.id is null
  ) then
    raise exception 'A block references a category that does not belong to this user';
  end if;

  if exists (
    select 1
    from generate_series(0, 1425, 15) minute_mark
    where (
      select count(*)
      from jsonb_array_elements(v_blocks) item
      where (item->>'start_minute')::int <= minute_mark
        and (item->>'end_minute')::int > minute_mark
    ) > 2
  ) then
    raise exception 'A 15-minute slot cannot contain more than two activities';
  end if;

  delete from public.time_blocks
  where user_id = v_uid
    and activity_date = p_activity_date;

  insert into public.time_blocks (
    user_id, activity_date, start_minute, end_minute, category_id, note, source
  )
  select
    v_uid,
    p_activity_date,
    (item->>'start_minute')::smallint,
    (item->>'end_minute')::smallint,
    (item->>'category_id')::uuid,
    nullif(item->>'note', ''),
    'manual'
  from jsonb_array_elements(v_blocks) item;

  perform * from public.evaluate_habit_rules(p_activity_date);
end;
$$;

revoke all on function public.save_day_time_blocks(date, jsonb) from public;
revoke all on function public.save_day_time_blocks(date, jsonb) from anon;
grant execute on function public.save_day_time_blocks(date, jsonb) to authenticated;

-- Atomic StayFree import with exact-file and overlapping-row deduplication.
create or replace function public.import_stayfree_rows(
  p_file_name text,
  p_file_hash text,
  p_rows jsonb
)
returns table (
  batch_id uuid,
  inserted_count integer,
  duplicate_file boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_batch_id uuid;
  v_inserted integer := 0;
  v_rows jsonb := coalesce(p_rows, '[]'::jsonb);
  v_date date;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(trim(p_file_hash), '') = '' then
    raise exception 'file hash is required';
  end if;
  if jsonb_typeof(v_rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;

  select id into v_batch_id
  from public.import_batches
  where user_id = v_uid
    and source = 'stayfree_csv'
    and file_hash = p_file_hash;

  if v_batch_id is not null then
    batch_id := v_batch_id;
    inserted_count := 0;
    duplicate_file := true;
    return next;
    return;
  end if;

  insert into public.import_batches (
    user_id, source, file_name, file_hash, row_count
  ) values (
    v_uid, 'stayfree_csv', nullif(p_file_name, ''), p_file_hash, 0
  ) returning id into v_batch_id;

  insert into public.screen_usage (
    user_id,
    import_batch_id,
    usage_date,
    device,
    app_name,
    domain,
    duration_seconds,
    source,
    source_row_hash,
    raw_payload
  )
  select
    v_uid,
    v_batch_id,
    (item->>'usage_date')::date,
    nullif(item->>'device', ''),
    nullif(item->>'app_name', ''),
    nullif(item->>'domain', ''),
    greatest(0, (item->>'duration_seconds')::integer),
    'stayfree_csv',
    nullif(item->>'source_row_hash', ''),
    coalesce(item->'raw_payload', '{}'::jsonb)
  from jsonb_array_elements(v_rows) item
  where item ? 'usage_date'
    and item ? 'duration_seconds'
  on conflict (user_id, source, source_row_hash)
    where source_row_hash is not null
  do nothing;

  get diagnostics v_inserted = row_count;

  update public.import_batches
  set row_count = v_inserted
  where id = v_batch_id;

  for v_date in
    select distinct (item->>'usage_date')::date
    from jsonb_array_elements(v_rows) item
    where item ? 'usage_date'
  loop
    perform * from public.evaluate_habit_rules(v_date);
  end loop;

  batch_id := v_batch_id;
  inserted_count := v_inserted;
  duplicate_file := false;
  return next;
end;
$$;

revoke all on function public.import_stayfree_rows(text, text, jsonb) from public;
revoke all on function public.import_stayfree_rows(text, text, jsonb) from anon;
grant execute on function public.import_stayfree_rows(text, text, jsonb) to authenticated;
-- Real Data V3: Calendar integration foundation, private OAuth tokens, milestones.

alter table public.time_blocks add column if not exists external_calendar_id text;

create index if not exists time_blocks_calendar_lookup_idx
  on public.time_blocks(user_id, activity_date, external_calendar_id)
  where source = 'google_calendar';

create unique index if not exists time_blocks_calendar_event_unique_idx
  on public.time_blocks(user_id, activity_date, external_calendar_id, external_id)
  where source = 'google_calendar' and external_calendar_id is not null and external_id is not null;

create table if not exists public.calendar_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  import_calendar_id text,
  export_calendar_id text,
  import_category_id uuid references public.categories(id) on delete set null,
  skip_all_day boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.calendar_preferences enable row level security;
grant select, insert, update, delete on public.calendar_preferences to authenticated;

drop policy if exists "calendar_preferences_select_own" on public.calendar_preferences;
drop policy if exists "calendar_preferences_insert_own" on public.calendar_preferences;
drop policy if exists "calendar_preferences_update_own" on public.calendar_preferences;
drop policy if exists "calendar_preferences_delete_own" on public.calendar_preferences;
create policy "calendar_preferences_select_own" on public.calendar_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy "calendar_preferences_insert_own" on public.calendar_preferences for insert to authenticated with check ((select auth.uid()) = user_id and (import_category_id is null or exists (select 1 from public.categories c where c.id = import_category_id and c.user_id = (select auth.uid()))));
create policy "calendar_preferences_update_own" on public.calendar_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and (import_category_id is null or exists (select 1 from public.categories c where c.id = import_category_id and c.user_id = (select auth.uid()))));
create policy "calendar_preferences_delete_own" on public.calendar_preferences for delete to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists calendar_preferences_set_updated_at on public.calendar_preferences;
create trigger calendar_preferences_set_updated_at before update on public.calendar_preferences for each row execute function public.set_updated_at();

create table if not exists public.milestone_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone_key text not null,
  unlocked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, milestone_key)
);
create index if not exists milestone_unlocks_user_date_idx on public.milestone_unlocks(user_id, unlocked_at desc);
alter table public.milestone_unlocks enable row level security;
grant select, insert, update, delete on public.milestone_unlocks to authenticated;

drop policy if exists "milestone_unlocks_select_own" on public.milestone_unlocks;
drop policy if exists "milestone_unlocks_insert_own" on public.milestone_unlocks;
drop policy if exists "milestone_unlocks_update_own" on public.milestone_unlocks;
drop policy if exists "milestone_unlocks_delete_own" on public.milestone_unlocks;
create policy "milestone_unlocks_select_own" on public.milestone_unlocks for select to authenticated using ((select auth.uid()) = user_id);
create policy "milestone_unlocks_insert_own" on public.milestone_unlocks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "milestone_unlocks_update_own" on public.milestone_unlocks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "milestone_unlocks_delete_own" on public.milestone_unlocks for delete to authenticated using ((select auth.uid()) = user_id);

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.google_calendar_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  scopes text,
  google_account text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on table private.google_calendar_tokens from public;
revoke all on table private.google_calendar_tokens from anon;
revoke all on table private.google_calendar_tokens from authenticated;

create or replace function public.admin_set_google_calendar_tokens(p_user_id uuid,p_refresh_token text,p_access_token text,p_access_token_expires_at timestamptz,p_scopes text,p_google_account text default null)
returns void language plpgsql security definer set search_path = private, public, pg_temp as $$
begin
  if p_user_id is null or coalesce(trim(p_refresh_token), '') = '' then raise exception 'user id and refresh token are required'; end if;
  insert into private.google_calendar_tokens(user_id,refresh_token,access_token,access_token_expires_at,scopes,google_account,updated_at)
  values(p_user_id,p_refresh_token,nullif(p_access_token,''),p_access_token_expires_at,nullif(p_scopes,''),nullif(p_google_account,''),now())
  on conflict(user_id) do update set refresh_token=excluded.refresh_token,access_token=excluded.access_token,access_token_expires_at=excluded.access_token_expires_at,scopes=excluded.scopes,google_account=coalesce(excluded.google_account,private.google_calendar_tokens.google_account),updated_at=now();
end; $$;
revoke all on function public.admin_set_google_calendar_tokens(uuid,text,text,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.admin_set_google_calendar_tokens(uuid,text,text,timestamptz,text,text) to service_role;

create or replace function public.admin_get_google_calendar_tokens(p_user_id uuid)
returns table(refresh_token text,access_token text,access_token_expires_at timestamptz,scopes text,google_account text,updated_at timestamptz)
language sql security definer set search_path = private, public, pg_temp as $$
  select t.refresh_token,t.access_token,t.access_token_expires_at,t.scopes,t.google_account,t.updated_at from private.google_calendar_tokens t where t.user_id=p_user_id;
$$;
revoke all on function public.admin_get_google_calendar_tokens(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_google_calendar_tokens(uuid) to service_role;

create or replace function public.admin_delete_google_calendar_tokens(p_user_id uuid)
returns void language sql security definer set search_path = private, public, pg_temp as $$ delete from private.google_calendar_tokens where user_id=p_user_id; $$;
revoke all on function public.admin_delete_google_calendar_tokens(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_google_calendar_tokens(uuid) to service_role;

create or replace function public.refresh_milestones() returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_uid uuid := (select auth.uid()); v_total_minutes bigint; v_days_logged integer; v_habit_checks integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select coalesce(sum(end_minute-start_minute),0) into v_total_minutes from public.time_blocks where user_id=v_uid;
  select count(distinct activity_date) into v_days_logged from public.time_blocks where user_id=v_uid;
  select count(*) into v_habit_checks from public.habit_checks where user_id=v_uid and checked=true;
  if v_total_minutes>0 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values(v_uid,'first_log',jsonb_build_object('minutes',v_total_minutes)) on conflict(user_id,milestone_key) do nothing; end if;
  if v_total_minutes>=1440 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values(v_uid,'24_activity_hours',jsonb_build_object('minutes',v_total_minutes)) on conflict(user_id,milestone_key) do nothing; end if;
  if v_total_minutes>=6000 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values(v_uid,'100_activity_hours',jsonb_build_object('minutes',v_total_minutes)) on conflict(user_id,milestone_key) do nothing; end if;
  if v_days_logged>=7 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values(v_uid,'7_days_recorded',jsonb_build_object('days',v_days_logged)) on conflict(user_id,milestone_key) do nothing; end if;
  if v_days_logged>=30 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values(v_uid,'30_days_recorded',jsonb_build_object('days',v_days_logged)) on conflict(user_id,milestone_key) do nothing; end if;
  if v_habit_checks>=10 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values(v_uid,'10_habit_checks',jsonb_build_object('checks',v_habit_checks)) on conflict(user_id,milestone_key) do nothing; end if;
  if v_habit_checks>=50 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values(v_uid,'50_habit_checks',jsonb_build_object('checks',v_habit_checks)) on conflict(user_id,milestone_key) do nothing; end if;
  if exists(select 1 from public.screen_usage where user_id=v_uid) then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values(v_uid,'first_screen_import','{}'::jsonb) on conflict(user_id,milestone_key) do nothing; end if;
  if exists(select 1 from public.time_blocks where user_id=v_uid and source='google_calendar') then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values(v_uid,'first_calendar_import','{}'::jsonb) on conflict(user_id,milestone_key) do nothing; end if;
end; $$;
revoke all on function public.refresh_milestones() from public, anon;
grant execute on function public.refresh_milestones() to authenticated;

create or replace function public.sync_google_calendar_day(p_activity_date date,p_calendar_id text,p_category_id uuid,p_events jsonb)
returns table(inserted_count integer, skipped_overlap_count integer) language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_uid uuid := (select auth.uid()); v_inserted integer:=0; v_skipped integer:=0; v_events jsonb:=coalesce(p_events,'[]'::jsonb); r record;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_activity_date is null or coalesce(trim(p_calendar_id),'')='' then raise exception 'date and calendar id are required'; end if;
  if jsonb_typeof(v_events)<>'array' then raise exception 'events must be a JSON array'; end if;
  if not exists(select 1 from public.categories c where c.id=p_category_id and c.user_id=v_uid and c.is_active=true) then raise exception 'Import category is invalid or inactive'; end if;
  delete from public.time_blocks where user_id=v_uid and activity_date=p_activity_date and source='google_calendar' and external_calendar_id=p_calendar_id;
  for r in select * from jsonb_to_recordset(v_events) as x(external_id text,start_minute integer,end_minute integer,note text) order by start_minute,end_minute loop
    if coalesce(trim(r.external_id),'')='' or r.start_minute is null or r.end_minute is null or r.start_minute<0 or r.end_minute>1440 or r.end_minute<=r.start_minute or r.start_minute%15<>0 or r.end_minute%15<>0 then v_skipped:=v_skipped+1; continue; end if;
    if exists(select 1 from generate_series(r.start_minute,r.end_minute-15,15) minute_mark where (select count(*) from public.time_blocks tb where tb.user_id=v_uid and tb.activity_date=p_activity_date and tb.start_minute<=minute_mark and tb.end_minute>minute_mark)>=2) then v_skipped:=v_skipped+1; continue; end if;
    insert into public.time_blocks(user_id,activity_date,start_minute,end_minute,category_id,note,source,external_id,external_calendar_id)
    values(v_uid,p_activity_date,r.start_minute,r.end_minute,p_category_id,nullif(r.note,''),'google_calendar',r.external_id,p_calendar_id)
    on conflict(user_id,activity_date,external_calendar_id,external_id) where source='google_calendar' and external_calendar_id is not null and external_id is not null
    do update set start_minute=excluded.start_minute,end_minute=excluded.end_minute,category_id=excluded.category_id,note=excluded.note,updated_at=now();
    v_inserted:=v_inserted+1;
  end loop;
  perform * from public.evaluate_habit_rules(p_activity_date); perform public.refresh_milestones();
  inserted_count:=v_inserted; skipped_overlap_count:=v_skipped; return next;
end; $$;
revoke all on function public.sync_google_calendar_day(date,text,uuid,jsonb) from public, anon;
grant execute on function public.sync_google_calendar_day(date,text,uuid,jsonb) to authenticated;

create or replace function public.save_day_time_blocks(p_activity_date date,p_blocks jsonb) returns void language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_uid uuid := (select auth.uid()); v_blocks jsonb:=coalesce(p_blocks,'[]'::jsonb);
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_activity_date is null then raise exception 'activity_date is required'; end if;
  if jsonb_typeof(v_blocks)<>'array' then raise exception 'blocks must be a JSON array'; end if;
  if exists(select 1 from jsonb_array_elements(v_blocks) item left join public.categories c on c.id=(item->>'category_id')::uuid and c.user_id=v_uid where c.id is null) then raise exception 'A block references a category that does not belong to this user'; end if;
  if exists(select 1 from jsonb_array_elements(v_blocks) item where coalesce(item->>'source','manual') not in('manual','google_calendar','import')) then raise exception 'Invalid block source'; end if;
  if exists(select 1 from generate_series(0,1425,15) minute_mark where (select count(*) from jsonb_array_elements(v_blocks) item where (item->>'start_minute')::int<=minute_mark and (item->>'end_minute')::int>minute_mark)>2) then raise exception 'A 15-minute slot cannot contain more than two activities'; end if;
  delete from public.time_blocks where user_id=v_uid and activity_date=p_activity_date;
  insert into public.time_blocks(user_id,activity_date,start_minute,end_minute,category_id,note,source,external_id,external_calendar_id)
  select v_uid,p_activity_date,(item->>'start_minute')::smallint,(item->>'end_minute')::smallint,(item->>'category_id')::uuid,nullif(item->>'note',''),coalesce(nullif(item->>'source',''),'manual'),nullif(item->>'external_id',''),nullif(item->>'external_calendar_id','') from jsonb_array_elements(v_blocks) item;
  perform * from public.evaluate_habit_rules(p_activity_date); perform public.refresh_milestones();
end; $$;
revoke all on function public.save_day_time_blocks(date,jsonb) from public, anon;
grant execute on function public.save_day_time_blocks(date,jsonb) to authenticated;

insert into public.calendar_preferences(user_id) select id from auth.users on conflict(user_id) do nothing;
-- Hosted project applied this as a follow-up fix. Kept here so migration versions match production.
drop index if exists public.time_blocks_calendar_event_unique_idx;
create unique index time_blocks_calendar_event_unique_idx
  on public.time_blocks(user_id, activity_date, external_calendar_id, external_id)
  where source = 'google_calendar' and external_calendar_id is not null and external_id is not null;
create index if not exists calendar_preferences_import_category_id_idx
  on public.calendar_preferences(import_category_id)
  where import_category_id is not null;


-- V5: calendar-style manual Timeline with titles and atomic multi-day saves.

alter table public.time_blocks
  add column if not exists title text;

update public.time_blocks tb
set title = c.name
from public.categories c
where c.id = tb.category_id
  and (tb.title is null or btrim(tb.title) = '');

alter table public.time_blocks
  drop constraint if exists time_blocks_title_length;

alter table public.time_blocks
  add constraint time_blocks_title_length
  check (title is null or char_length(title) <= 120);

create or replace function public.save_timeline_days(p_days jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_day jsonb;
  v_date date;
  v_blocks jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if p_days is null or jsonb_typeof(p_days) <> 'array' then
    raise exception 'days must be a JSON array';
  end if;

  for v_day in
    select value from jsonb_array_elements(p_days)
  loop
    if coalesce(v_day->>'activity_date', '') = '' then
      raise exception 'activity_date is required';
    end if;

    v_date := (v_day->>'activity_date')::date;
    v_blocks := coalesce(v_day->'blocks', '[]'::jsonb);

    if jsonb_typeof(v_blocks) <> 'array' then
      raise exception 'blocks must be a JSON array';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_blocks) item
      left join public.categories c
        on c.id = (item->>'category_id')::uuid
       and c.user_id = v_uid
      where c.id is null
    ) then
      raise exception 'A block references a category that does not belong to this user';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_blocks) item
      where
        (item->>'start_minute')::int < 0
        or (item->>'start_minute')::int > 1425
        or (item->>'end_minute')::int < 15
        or (item->>'end_minute')::int > 1440
        or (item->>'end_minute')::int <= (item->>'start_minute')::int
        or (item->>'start_minute')::int % 15 <> 0
        or (item->>'end_minute')::int % 15 <> 0
        or char_length(coalesce(item->>'title', '')) > 120
        or char_length(coalesce(item->>'note', '')) > 500
    ) then
      raise exception 'Invalid Timeline block';
    end if;

    if exists (
      select 1
      from generate_series(0, 1425, 15) minute_mark
      where (
        select count(*)
        from jsonb_array_elements(v_blocks) item
        where (item->>'start_minute')::int <= minute_mark
          and (item->>'end_minute')::int > minute_mark
      ) > 2
    ) then
      raise exception 'A 15-minute slot cannot contain more than two activities';
    end if;

    delete from public.time_blocks
    where user_id = v_uid
      and activity_date = v_date;

    insert into public.time_blocks (
      user_id,
      activity_date,
      start_minute,
      end_minute,
      category_id,
      title,
      note,
      source,
      external_id,
      external_calendar_id
    )
    select
      v_uid,
      v_date,
      (item->>'start_minute')::smallint,
      (item->>'end_minute')::smallint,
      c.id,
      coalesce(nullif(btrim(item->>'title'), ''), c.name),
      nullif(item->>'note', ''),
      'manual',
      null,
      null
    from jsonb_array_elements(v_blocks) item
    join public.categories c
      on c.id = (item->>'category_id')::uuid
     and c.user_id = v_uid;
  end loop;

  perform public.refresh_milestones();
end;
$$;

revoke all on function public.save_timeline_days(jsonb) from public;
revoke all on function public.save_timeline_days(jsonb) from anon;
grant execute on function public.save_timeline_days(jsonb) to authenticated;

create or replace function public.save_day_time_blocks(
  p_activity_date date,
  p_blocks jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.save_timeline_days(
    jsonb_build_array(
      jsonb_build_object(
        'activity_date', p_activity_date,
        'blocks', coalesce(p_blocks, '[]'::jsonb)
      )
    )
  );
end;
$$;

revoke all on function public.save_day_time_blocks(date, jsonb) from public;
revoke all on function public.save_day_time_blocks(date, jsonb) from anon;
grant execute on function public.save_day_time_blocks(date, jsonb) to authenticated;
