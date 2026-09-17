-- Tests for 148 (run after harness.sql, 140, 142-148 on a THROWAWAY database).
set client_min_messages = warning;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, preferred_language) values
  ('00000000-0000-0000-0000-00000000000a', 'en'),
  ('00000000-0000-0000-0000-00000000000b', 'en');

-- Test rows need old timestamps, which the updated_at trigger would overwrite.
alter table public.lecture_recordings disable trigger lecture_recordings_set_updated_at_trigger;

-- ── 1. the sweep: a Stop with nothing behind it (server-money-privacy-1) ──
insert into public.lecture_quota_day (day, seconds_reserved) values (current_date, 60000)
on conflict (day) do update set seconds_reserved = public.lecture_quota_day.seconds_reserved + 60000;

create or replace function pg_temp.bare(p_id text, p_title text, p_status text, p_count integer, p_state text,
                                        p_heartbeat interval, p_created interval, p_reserved integer)
returns void language sql as $$
  insert into public.lecture_recordings (id, user_id, title, status, source, segment_count, capture_state,
                                         last_heartbeat_at, created_at, updated_at, reserved_seconds, reserved_day)
  values (p_id::uuid, '00000000-0000-0000-0000-00000000000a', p_title, p_status, 'recording', p_count, p_state,
          case when p_heartbeat is null then null else now() - p_heartbeat end,
          now() - p_created, now() - coalesce(p_heartbeat, p_created), p_reserved, current_date);
$$;
-- uploading = the phone's Stop (finishLecture)
select pg_temp.bare('48000000-0000-0000-0000-000000000001', 'Stop, 0 parts, 31m',   'uploading', 0, 'recording', interval '31 minutes', interval '40 minutes', 5400);
select pg_temp.bare('48000000-0000-0000-0000-000000000002', 'Stop, 0 parts, 10m',   'uploading', 0, 'stopped',   interval '10 minutes', interval '40 minutes', 5400);
select pg_temp.bare('48000000-0000-0000-0000-000000000003', 'Stop, 6 parts, 31m',   'uploading', 6, 'stopped',   interval '31 minutes', interval '2 hours',    5400);
select pg_temp.bare('48000000-0000-0000-0000-000000000004', 'Stop, 6 parts, 8d',    'uploading', 6, 'stopped',   interval '8 days',     interval '8 days',     5400);
select pg_temp.bare('48000000-0000-0000-0000-000000000005', 'Stop, 6 parts, 6d',    'uploading', 6, 'stopped',   interval '6 days',     interval '6 days',     5400);
-- recording, never said Stop. created_at is kept inside section 3's 2 hours so only 2b can act.
select pg_temp.bare('48000000-0000-0000-0000-000000000006', 'Silent past 90m limit', 'recording', 0, 'recording', interval '125 minutes', interval '100 minutes', 5400);
select pg_temp.bare('48000000-0000-0000-0000-000000000007', 'Silent inside 3h limit', 'recording', 0, 'recording', interval '125 minutes', interval '100 minutes', 10800);
select pg_temp.bare('48000000-0000-0000-0000-000000000008', 'Offline 60m',          'recording', 0, 'recording', interval '60 minutes',  interval '70 minutes',  5400);
-- an app without heartbeats keeps section 1's 3-hour rule
select pg_temp.bare('48000000-0000-0000-0000-000000000009', 'Old app',              'uploading', 0, null,        null,                  interval '20 minutes',  5400);
-- a part row exists: not 2b's
select pg_temp.bare('48000000-0000-0000-0000-00000000000a', 'Has a part',           'uploading', 0, 'recording', interval '31 minutes', interval '40 minutes', 5400);
insert into public.lecture_segments (lecture_id, user_id, seq, status, seconds, storage_path, created_at)
values ('48000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 0, 'uploaded', 300,
        '00000000-0000-0000-0000-00000000000a/48000000-0000-0000-0000-00000000000a/seg_000.m4a', now() - interval '5 minutes');

insert into public.lecture_usage_log (user_id, lecture_id, audio_seconds, status) values
  ('00000000-0000-0000-0000-00000000000a', '48000000-0000-0000-0000-000000000001', 0, 'success'),
  ('00000000-0000-0000-0000-00000000000a', '48000000-0000-0000-0000-000000000004', 0, 'success');

do $$
declare r record; reserved_before integer; reserved_after integer;
begin
  select seconds_reserved into reserved_before from public.lecture_quota_day where day = current_date;
  perform public.sweep_stalled_lectures();
  select seconds_reserved into reserved_after from public.lecture_quota_day where day = current_date;

  select * into r from public.lecture_recordings where id = '48000000-0000-0000-0000-000000000001';
  assert r.status = 'failed' and r.error_code = 'NO_AUDIO' and r.reserved_seconds = 0,
    format('uploading + 0 declared + 31 silent minutes: NO_AUDIO, released: %s %s %s', r.status, r.error_code, r.reserved_seconds);
  assert (select status from public.lecture_usage_log where lecture_id = '48000000-0000-0000-0000-000000000001') = 'refunded', 'and refunded';

  select * into r from public.lecture_recordings where id = '48000000-0000-0000-0000-000000000002';
  assert r.status = 'uploading' and r.reserved_seconds = 5400, format('a Stop 10 minutes ago is left alone: %s', r.status);

  select * into r from public.lecture_recordings where id = '48000000-0000-0000-0000-000000000003';
  assert r.status = 'uploading', format('6 declared parts, 31 minutes: the phone may still upload them: %s', r.status);

  select * into r from public.lecture_recordings where id = '48000000-0000-0000-0000-000000000004';
  assert r.status = 'failed' and r.error_code = 'STALLED' and r.reserved_seconds = 0,
    format('6 declared parts, none in 8 days: STALLED, released: %s %s %s', r.status, r.error_code, r.reserved_seconds);
  assert (select status from public.lecture_usage_log where lecture_id = '48000000-0000-0000-0000-000000000004') = 'refunded', 'and refunded';

  select * into r from public.lecture_recordings where id = '48000000-0000-0000-0000-000000000005';
  assert r.status = 'uploading', format('6 declared parts, 6 days: still waiting: %s', r.status);

  select * into r from public.lecture_recordings where id = '48000000-0000-0000-0000-000000000006';
  assert r.status = 'failed' and r.error_code = 'NO_AUDIO' and r.reserved_seconds = 0,
    format('recording, silent past a 90-minute limit + 30: NO_AUDIO: %s %s', r.status, r.error_code);

  select * into r from public.lecture_recordings where id = '48000000-0000-0000-0000-000000000007';
  assert r.status = 'recording' and r.reserved_seconds = 10800,
    format('recording offline inside a 3-hour limit is never failed: %s', r.status);

  select * into r from public.lecture_recordings where id = '48000000-0000-0000-0000-000000000008';
  assert r.status = 'recording', format('recording offline for an hour is left alone: %s', r.status);

  select * into r from public.lecture_recordings where id = '48000000-0000-0000-0000-000000000009';
  assert r.status = 'uploading', format('no heartbeat: not 2b''s: %s', r.status);

  select * into r from public.lecture_recordings where id = '48000000-0000-0000-0000-00000000000a';
  assert r.status = 'uploading', format('a lecture with a part is not failed as NO_AUDIO: %s %s', r.status, r.error_code);

  assert reserved_after = greatest(0, reserved_before - 3 * 5400),
    format('three reservations released from the day: %s -> %s', reserved_before, reserved_after);
end $$;

-- a second run touches nothing it already failed
do $$
declare n integer;
begin
  update public.lecture_recordings set updated_at = now() - interval '1 minute'
   where id in ('48000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000004', '48000000-0000-0000-0000-000000000006');
  perform public.sweep_stalled_lectures();
  assert (select count(*) from public.lecture_recordings
          where id in ('48000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000004', '48000000-0000-0000-0000-000000000006')
            and status = 'failed' and updated_at < now() - interval '30 seconds') = 3, 'failed lectures are not swept again';
end $$;

-- ── 2. the health check pages only what is really stuck (server-money-privacy-3) ──
-- Clear the sweep cases so they do not appear in section 4.
update public.lecture_recordings set created_at = now() - interval '10 days'
 where id::text like '48000000-%';

create or replace function pg_temp.working(p_id text, p_state text, p_heartbeat interval, p_reserved integer,
                                           p_part_status text, p_first_failure interval, p_count integer default 3)
returns void language sql as $$
  insert into public.lecture_recordings (id, user_id, title, status, source, segment_count, capture_state,
                                         last_heartbeat_at, created_at, updated_at, reserved_seconds)
  values (p_id::uuid, '00000000-0000-0000-0000-00000000000b', 'Working ' || p_id, 'transcribing', 'recording', p_count, p_state,
          now() - p_heartbeat, now() - interval '20 hours', now() - interval '4 hours', p_reserved);
  insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds, storage_path, provider_failures,
                                       first_provider_failure_at, created_at)
  select p_id::uuid, '00000000-0000-0000-0000-00000000000b', 0, p_part_status,
         case when p_part_status = 'done' then 'words' end, 300,
         '00000000-0000-0000-0000-00000000000b/' || p_id || '/seg_000.m4a', 0,
         case when p_first_failure is null then null else now() - p_first_failure end, now() - interval '4 hours'
  where p_part_status is not null;
$$;
select pg_temp.working('48100001-0000-0000-0000-000000000001', 'paused',    interval '2 hours',   5400, 'done',     null);                 -- paused 2h: waiting
select pg_temp.working('48100002-0000-0000-0000-000000000002', 'paused',    interval '13 hours',  5400, 'done',     null);                 -- paused 13h: stuck
select pg_temp.working('48100003-0000-0000-0000-000000000003', 'recording', interval '100 minutes', 5400, 'done',   null);                 -- inside 90+30: waiting
select pg_temp.working('48100004-0000-0000-0000-000000000004', 'recording', interval '150 minutes', 5400, 'done',   null);                 -- past 90+30: stuck
select pg_temp.working('48100005-0000-0000-0000-000000000005', 'recording', interval '150 minutes', 10800, 'done',  null);                 -- inside 180+30: waiting
select pg_temp.working('48100006-0000-0000-0000-000000000006', 'stopped',   interval '2 hours',   5400, 'uploaded', interval '1 hour');    -- provider window: waiting
select pg_temp.working('48100007-0000-0000-0000-000000000007', 'stopped',   interval '2 hours',   5400, 'uploaded', interval '13 hours');  -- window over: stuck
select pg_temp.working('48100008-0000-0000-0000-000000000008', 'stopped',   interval '2 hours',   5400, null,       null, 0);              -- nothing declared, nothing arrived: the sweep's
update public.lecture_recordings set status = 'uploading' where id = '48100008-0000-0000-0000-000000000008';
select pg_temp.working('48100009-0000-0000-0000-000000000009', 'stopped',   interval '2 hours',   5400, 'done',     null);                 -- plainly stuck
select pg_temp.working('4810000a-0000-0000-0000-00000000000a', 'stopped',   interval '2 hours',   5400, null,       null, 4);              -- declared, nothing arrived: stuck
select pg_temp.working('4810000b-0000-0000-0000-00000000000b', null,        null,                 5400, 'done',     null);                 -- older app, no capture_state or heartbeat: still stuck

do $$
declare a record; expected jsonb := '["48100002", "48100004", "48100007", "48100009", "4810000a", "4810000b"]'::jsonb; stuck uuid[];
begin
  -- the exact set, by the section 4 predicate's own count
  perform public.lecture_health_check(7200, 28800);
  select * into a from public.ops_alerts where kind = 'lecture_stuck';
  assert found, 'lecture_stuck raised';
  assert a.detail->'lectures' = expected,
    format('six stuck lectures named (2, 4, 7, 9, 10, 11): %s', a.detail->'lectures');
  assert a.detail->>'summary' like '6 lecture(s)%', format('count: %s', a.detail->>'summary');
  assert a.detail->>'fingerprint' = (a.detail->'lectures')::text and a.detail->>'fingerprint_md5' = md5((a.detail->'lectures')::text),
    format('fingerprinted: %s', a.detail);

  -- 7 hours later the same set is not paged again...
  update public.ops_alerts set created_at = now() - interval '7 hours' where kind = 'lecture_stuck';
  perform public.lecture_health_check(7200, 28800);
  assert (select count(*) from public.ops_alerts where kind = 'lecture_stuck') = 1, 'the same stuck set is not re-paged within 3 days';

  -- ...but a changed set is.
  update public.lecture_recordings set last_heartbeat_at = now() - interval '14 hours'
   where id = '48100001-0000-0000-0000-000000000001';
  perform public.lecture_health_check(7200, 28800);
  assert (select count(*) from public.ops_alerts where kind = 'lecture_stuck') = 2, 'a new stuck lecture pages';
  assert (select jsonb_array_length(detail->'lectures') from public.ops_alerts where kind = 'lecture_stuck' order by created_at desc limit 1) = 7,
    'the paused-14h lecture joins the set';
end $$;

select '148 OK' as result;
