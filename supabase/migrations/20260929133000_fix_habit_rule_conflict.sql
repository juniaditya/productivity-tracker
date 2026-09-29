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
