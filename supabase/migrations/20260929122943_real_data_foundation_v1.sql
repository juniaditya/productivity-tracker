alter table public.user_settings alter column timezone set default 'Asia/Makassar';

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public, pg_temp
as $$ begin new.updated_at = now(); return new; end; $$;

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

create or replace function public.ensure_personal_defaults()
returns void language plpgsql security invoker set search_path = public, pg_temp
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  insert into public.user_settings (user_id, timezone) values (v_uid, 'Asia/Makassar') on conflict (user_id) do nothing;
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
  insert into public.habits (user_id, name, color, completion_mode, weekly_target, monthly_target, sort_order, is_active)
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
end; $$;
revoke all on function public.ensure_personal_defaults() from public;
revoke all on function public.ensure_personal_defaults() from anon;
grant execute on function public.ensure_personal_defaults() to authenticated;

create or replace function public.save_day_time_blocks(p_activity_date date, p_blocks jsonb)
returns void language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_blocks jsonb := coalesce(p_blocks, '[]'::jsonb);
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_activity_date is null then raise exception 'activity_date is required'; end if;
  if jsonb_typeof(v_blocks) <> 'array' then raise exception 'blocks must be a JSON array'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_blocks) item
    left join public.categories c on c.id = (item->>'category_id')::uuid and c.user_id = v_uid
    where c.id is null
  ) then raise exception 'A block references a category that does not belong to this user'; end if;
  if exists (
    select 1 from generate_series(0, 1425, 15) minute_mark
    where (select count(*) from jsonb_array_elements(v_blocks) item
           where (item->>'start_minute')::int <= minute_mark and (item->>'end_minute')::int > minute_mark) > 2
  ) then raise exception 'A 15-minute slot cannot contain more than two activities'; end if;
  delete from public.time_blocks where user_id = v_uid and activity_date = p_activity_date;
  insert into public.time_blocks (user_id, activity_date, start_minute, end_minute, category_id, note, source)
  select v_uid, p_activity_date, (item->>'start_minute')::smallint, (item->>'end_minute')::smallint,
         (item->>'category_id')::uuid, nullif(item->>'note', ''), 'manual'
  from jsonb_array_elements(v_blocks) item;
end; $$;
revoke all on function public.save_day_time_blocks(date, jsonb) from public;
revoke all on function public.save_day_time_blocks(date, jsonb) from anon;
grant execute on function public.save_day_time_blocks(date, jsonb) to authenticated;

insert into public.user_settings (user_id, timezone)
select id, 'Asia/Makassar' from auth.users on conflict (user_id) do nothing;

insert into public.categories (user_id, name, color, classification, sort_order, is_active)
select u.id, v.name, v.color, v.classification, v.sort_order, true
from auth.users u cross join (values
  ('Tidur', '#6366f1', 'recovery', 10), ('Belajar', '#8b5cf6', 'productive', 20),
  ('Kerja', '#3b82f6', 'productive', 30), ('Olahraga', '#22c55e', 'productive', 40),
  ('Main HP', '#f43f5e', 'distraction', 50), ('Personal', '#06b6d4', 'neutral', 60),
  ('Hiburan', '#eab308', 'leisure', 70), ('Makan', '#f97316', 'neutral', 80),
  ('Perjalanan', '#64748b', 'neutral', 90), ('Lainnya', '#71717a', 'neutral', 100)
) as v(name, color, classification, sort_order)
on conflict (user_id, name) do nothing;

insert into public.habits (user_id, name, color, completion_mode, weekly_target, monthly_target, sort_order, is_active)
select u.id, v.name, v.color, 'manual', v.weekly_target, v.monthly_target, v.sort_order, true
from auth.users u cross join (values
  ('Japanese', '#8b5cf6', 7, 28, 10), ('Anki', '#3b82f6', 7, 28, 20),
  ('Gym', '#22c55e', 4, 16, 30), ('Running', '#14b8a6', 3, 12, 40),
  ('Reading', '#f59e0b', 5, 20, 50), ('Journal', '#06b6d4', 5, 20, 60),
  ('Skincare', '#ec4899', 7, 28, 70), ('Vitamin', '#84cc16', 7, 28, 80),
  ('No sugar', '#f97316', 5, 20, 90), ('Stretch', '#6366f1', 4, 16, 100)
) as v(name, color, weekly_target, monthly_target, sort_order)
on conflict (user_id, name) do nothing;
