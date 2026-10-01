-- V4: manual-only workflow. Hosted migration has already been applied.

delete from public.habit_checks where checked = false;
update public.habit_checks set source = 'manual' where source <> 'manual';
delete from public.habit_rules;
update public.habits set completion_mode = 'manual' where completion_mode <> 'manual';

update public.time_blocks
set source = 'manual', external_id = null, external_calendar_id = null
where source <> 'manual' or external_id is not null or external_calendar_id is not null;

delete from public.milestone_unlocks
where milestone_key in ('first_screen_import', 'first_calendar_import');

create or replace function public.refresh_milestones()
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_total_minutes bigint;
  v_days_logged integer;
  v_habit_checks integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select coalesce(sum(end_minute - start_minute), 0) into v_total_minutes
  from public.time_blocks where user_id = v_uid;

  select count(distinct activity_date) into v_days_logged
  from public.time_blocks where user_id = v_uid;

  select count(*) into v_habit_checks
  from public.habit_checks where user_id = v_uid and checked = true;

  if v_total_minutes > 0 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values (v_uid,'first_log',jsonb_build_object('minutes',v_total_minutes)) on conflict (user_id,milestone_key) do nothing; end if;
  if v_total_minutes >= 1440 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values (v_uid,'24_activity_hours',jsonb_build_object('minutes',v_total_minutes)) on conflict (user_id,milestone_key) do nothing; end if;
  if v_total_minutes >= 6000 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values (v_uid,'100_activity_hours',jsonb_build_object('minutes',v_total_minutes)) on conflict (user_id,milestone_key) do nothing; end if;
  if v_days_logged >= 7 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values (v_uid,'7_days_recorded',jsonb_build_object('days',v_days_logged)) on conflict (user_id,milestone_key) do nothing; end if;
  if v_days_logged >= 30 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values (v_uid,'30_days_recorded',jsonb_build_object('days',v_days_logged)) on conflict (user_id,milestone_key) do nothing; end if;
  if v_habit_checks >= 10 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values (v_uid,'10_habit_checks',jsonb_build_object('checks',v_habit_checks)) on conflict (user_id,milestone_key) do nothing; end if;
  if v_habit_checks >= 50 then insert into public.milestone_unlocks(user_id,milestone_key,metadata) values (v_uid,'50_habit_checks',jsonb_build_object('checks',v_habit_checks)) on conflict (user_id,milestone_key) do nothing; end if;
end;
$$;

revoke all on function public.refresh_milestones() from public;
revoke all on function public.refresh_milestones() from anon;
grant execute on function public.refresh_milestones() to authenticated;

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
    select 1 from jsonb_array_elements(v_blocks) item
    left join public.categories c on c.id = (item->>'category_id')::uuid and c.user_id = v_uid
    where c.id is null
  ) then raise exception 'A block references a category that does not belong to this user'; end if;

  if exists (
    select 1 from generate_series(0, 1425, 15) minute_mark
    where (
      select count(*) from jsonb_array_elements(v_blocks) item
      where (item->>'start_minute')::int <= minute_mark and (item->>'end_minute')::int > minute_mark
    ) > 2
  ) then raise exception 'A 15-minute slot cannot contain more than two activities'; end if;

  delete from public.time_blocks where user_id = v_uid and activity_date = p_activity_date;

  insert into public.time_blocks(user_id,activity_date,start_minute,end_minute,category_id,note,source,external_id,external_calendar_id)
  select v_uid,p_activity_date,(item->>'start_minute')::smallint,(item->>'end_minute')::smallint,(item->>'category_id')::uuid,nullif(item->>'note',''),'manual',null,null
  from jsonb_array_elements(v_blocks) item;

  perform public.refresh_milestones();
end;
$$;

revoke all on function public.save_day_time_blocks(date, jsonb) from public;
revoke all on function public.save_day_time_blocks(date, jsonb) from anon;
grant execute on function public.save_day_time_blocks(date, jsonb) to authenticated;
