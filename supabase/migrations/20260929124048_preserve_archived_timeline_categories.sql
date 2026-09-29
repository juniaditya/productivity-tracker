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
