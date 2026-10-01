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
