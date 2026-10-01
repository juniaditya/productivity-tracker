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
