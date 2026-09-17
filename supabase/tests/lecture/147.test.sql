-- Tests for 147 (run after harness.sql, 140, 142, 143, 144, 145, 146, 147 on a THROWAWAY database).
set client_min_messages = warning;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');
insert into public.profiles (id, preferred_language) values
  ('00000000-0000-0000-0000-00000000000a', 'en'),
  ('00000000-0000-0000-0000-00000000000b', 'en'),
  ('00000000-0000-0000-0000-00000000000c', 'en');
insert into vault.decrypted_secrets (name, decrypted_secret)
values ('semora_lecture_cron_secret', 's') on conflict (name) do nothing;

-- Test rows need old timestamps, which the updated_at trigger would overwrite.
alter table public.lecture_recordings disable trigger lecture_recordings_set_updated_at_trigger;

-- ── 1. part numbers 200-999 are parts (server-and-ops-13) ──
insert into public.lecture_recordings (id, user_id, title, status, source)
values ('47000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'High seq', 'transcribing', 'recording');
do $$
declare p record;
begin
  select * into p from public.lecture_audio_object_part('00000000-0000-0000-0000-00000000000a/47000000-0000-0000-0000-000000000001/seg_250.m4a');
  assert found and p.seq = 250, 'seg_250 is part 250';
  select * into p from public.lecture_audio_object_part('00000000-0000-0000-0000-00000000000a/47000000-0000-0000-0000-000000000001/seg_999.m4a');
  assert found and p.seq = 999, 'seg_999 is part 999';
  select * into p from public.lecture_audio_object_part('00000000-0000-0000-0000-00000000000a/47000000-0000-0000-0000-000000000001/seg_1000.m4a');
  assert not found, 'seg_1000 is beyond the insert trigger''s bound and is not a part';
  select * into p from public.lecture_audio_object_part('00000000-0000-0000-0000-00000000000a/47000000-0000-0000-0000-000000000001/seg_007.m4a');
  assert found and p.seq = 7, 'three-digit numbers still parse';
end $$;

-- ...and the arrival job adopts such an object whose row never landed.
insert into storage.objects (bucket_id, name, created_at) values
  ('lectures', '00000000-0000-0000-0000-00000000000a/47000000-0000-0000-0000-000000000001/seg_250.m4a', now() - interval '20 minutes');
do $$
declare n integer; r record;
begin
  delete from net.calls;
  n := public.lecture_take_over_arrived_audio(5);
  select * into r from public.lecture_segments where lecture_id = '47000000-0000-0000-0000-000000000001' and seq = 250;
  assert found and r.status = 'uploaded'
     and r.storage_path = '00000000-0000-0000-0000-00000000000a/47000000-0000-0000-0000-000000000001/seg_250.m4a',
    'part 250 adopted from its object';
  assert n = 1 and (select body->>'segmentId' from net.calls limit 1) = r.id::text, 'and dispatched';
  assert public.lecture_audio_is_actionable('00000000-0000-0000-0000-00000000000a/47000000-0000-0000-0000-000000000001/seg_250.m4a', now() - interval '20 minutes'),
    'its audio is actionable, so lecture_orphaned_audio leaves it alone';
end $$;

-- ── 2. a declared count and duration only grow (code-gaps-8) ──
insert into public.lecture_recordings (id, user_id, title, status, source, segment_count, duration_seconds)
values ('47000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Declared', 'uploading', 'recording', 5, 1500);
insert into public.lecture_recordings (id, user_id, title, status, source, transcript, segment_count, duration_seconds)
values ('47000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'Doc', 'transcribed', 'document', 'text', 0, 0);
grant select, update on public.lecture_recordings to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update public.lecture_recordings set segment_count = 3, duration_seconds = 900, status = 'uploading'
where id = '47000000-0000-0000-0000-000000000002';
update public.lecture_recordings set segment_count = 9, duration_seconds = 2000
where id = '47000000-0000-0000-0000-000000000003';
reset role;
do $$
declare r record;
begin
  select * into r from public.lecture_recordings where id = '47000000-0000-0000-0000-000000000002';
  assert r.segment_count = 5 and r.duration_seconds = 1500, format('a smaller re-declaration is ignored: %s %s', r.segment_count, r.duration_seconds);
  select * into r from public.lecture_recordings where id = '47000000-0000-0000-0000-000000000003';
  assert r.segment_count = 0 and r.duration_seconds = 0, 'a document''s count and duration stay the server''s';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update public.lecture_recordings set segment_count = 7, duration_seconds = 2100
where id = '47000000-0000-0000-0000-000000000002';
reset role;
do $$
declare r record;
begin
  select * into r from public.lecture_recordings where id = '47000000-0000-0000-0000-000000000002';
  assert r.segment_count = 7 and r.duration_seconds = 2100, format('a larger declaration is taken: %s %s', r.segment_count, r.duration_seconds);
end $$;

-- ── 3. a transcribed part's audio is collectable while its lecture is live (server-and-ops-6) ──
insert into public.lecture_recordings (id, user_id, title, status, source, capture_state, last_heartbeat_at)
values ('47000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'Paused, forgotten', 'transcribing', 'recording', 'paused', now() - interval '3 hours');
insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds, created_at, storage_path)
values ('47000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 0, 'done', 'twenty minutes ago, transcribed', 300, now() - interval '25 hours',
        '00000000-0000-0000-0000-00000000000a/47000000-0000-0000-0000-000000000004/seg_000.m4a'),
       ('47000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 1, 'uploaded', null, 300, now() - interval '20 minutes',
        '00000000-0000-0000-0000-00000000000a/47000000-0000-0000-0000-000000000004/seg_001.m4a');
do $$
declare p text[]; n integer;
begin
  select paths into p from public.lecture_audio_awaiting_deletion(100) where lecture_id = '47000000-0000-0000-0000-000000000004';
  assert p = array['00000000-0000-0000-0000-00000000000a/47000000-0000-0000-0000-000000000004/seg_000.m4a'],
    format('the done part is collected, the waiting one kept: %s', p);
  n := public.alert_lecture_audio_retained();
  assert n >= 1, format('the retention alert sees a transcribed part kept 24h on a live lecture: %s', n);
  assert (select (detail->>'transcribed_but_retained')::int from public.ops_alerts where kind = 'lecture_audio_retained') >= 1, 'counted as transcribed_but_retained';
  -- a part still landing keeps everything for 15 minutes
  insert into public.lecture_segments (lecture_id, user_id, seq, status, seconds, created_at)
  values ('47000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 2, 'pending', 300, now() - interval '5 minutes');
  assert not exists (select 1 from public.lecture_audio_awaiting_deletion(100) where lecture_id = '47000000-0000-0000-0000-000000000004'),
    'nothing collected while a part is still arriving';
end $$;

-- ── 4. the arrival job's circuit breaker (server-and-ops-3) ──
-- Three students, one waiting part each, all dispatchable.
insert into public.lecture_recordings (id, user_id, title, status, source) values
  ('47000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'A', 'transcribing', 'recording'),
  ('47000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'B', 'transcribing', 'recording'),
  ('47000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 'C', 'transcribing', 'recording');
insert into storage.objects (bucket_id, name, created_at) values
  ('lectures', '00000000-0000-0000-0000-00000000000a/47000000-0000-0000-0000-00000000000a/seg_000.m4a', now() - interval '30 minutes'),
  ('lectures', '00000000-0000-0000-0000-00000000000b/47000000-0000-0000-0000-00000000000b/seg_000.m4a', now() - interval '29 minutes'),
  ('lectures', '00000000-0000-0000-0000-00000000000c/47000000-0000-0000-0000-00000000000c/seg_000.m4a', now() - interval '28 minutes');
insert into public.lecture_segments (lecture_id, user_id, seq, status, storage_path) values
  ('47000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 0, 'uploaded', '00000000-0000-0000-0000-00000000000a/47000000-0000-0000-0000-00000000000a/seg_000.m4a'),
  ('47000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 0, 'uploaded', '00000000-0000-0000-0000-00000000000b/47000000-0000-0000-0000-00000000000b/seg_000.m4a'),
  ('47000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000c', 0, 'uploaded', '00000000-0000-0000-0000-00000000000c/47000000-0000-0000-0000-00000000000c/seg_000.m4a');
-- the provider refused 6 of the last 10 requests
insert into public.lecture_transcription_usage (hour, audio_seconds, requests, failures)
values (date_trunc('hour', now()), 600, 10, 6)
on conflict (hour) do update set requests = 10, failures = 6;
do $$
declare n integer;
begin
  delete from net.calls;
  n := public.lecture_take_over_arrived_audio(20);
  assert n = 1, format('breaker open: one probe part, got %s', n);
  assert (select body->>'segmentId' from net.calls) = (select id::text from public.lecture_segments where lecture_id = '47000000-0000-0000-0000-00000000000a'),
    'the oldest part is the probe';
  -- the provider is back (1 of 10 failed): the rest go out
  update public.lecture_transcription_usage set failures = 1 where hour = date_trunc('hour', now());
  delete from net.calls;
  n := public.lecture_take_over_arrived_audio(20);
  assert n = 2, format('breaker closed: the remaining two dispatched, got %s', n);
  -- too few requests to judge by: never held back
  update public.lecture_transcription_usage set requests = 4, failures = 4 where hour = date_trunc('hour', now());
  update public.lecture_segments set dispatched_at = null where lecture_id in ('47000000-0000-0000-0000-00000000000a', '47000000-0000-0000-0000-00000000000b', '47000000-0000-0000-0000-00000000000c');
  delete from net.calls;
  n := public.lecture_take_over_arrived_audio(20);
  assert n = 3, format('4 of 4 failed is not enough evidence: %s', n);
end $$;

-- ── 5a. a quota hold is a bounded wait (server-and-ops-1) ──
create or replace function pg_temp.held_lecture(p_id text, p_first_failure interval)
returns void language sql as $$
  insert into public.lecture_recordings (id, user_id, title, status, source, segment_count, updated_at, created_at, last_heartbeat_at, capture_state)
  values (p_id::uuid, '00000000-0000-0000-0000-00000000000a', 'Held ' || p_id, 'uploading', 'recording', 2,
          now() - interval '20 minutes', now() - interval '5 hours', now() - interval '20 minutes', 'stopped');
  insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds, created_at, storage_path, provider_failures, first_provider_failure_at)
  values (p_id::uuid, '00000000-0000-0000-0000-00000000000a', 0, 'done', repeat('real words spoken in class ', 12), 300, now() - interval '4 hours', null, 0, null),
         (p_id::uuid, '00000000-0000-0000-0000-00000000000a', 1, 'uploaded', null, 300, now() - interval '4 hours',
          '00000000-0000-0000-0000-00000000000a/' || p_id || '/seg_001.m4a', 0, now() - p_first_failure);
$$;
select pg_temp.held_lecture('47000000-0000-0000-0000-000000000051', interval '13 hours');
select pg_temp.held_lecture('47000000-0000-0000-0000-000000000052', interval '1 hour');
do $$
declare r record;
begin
  perform public.sweep_stalled_lectures();
  select * into r from public.lecture_recordings where id = '47000000-0000-0000-0000-000000000051';
  assert r.status in ('transcribed', 'ready') and r.parts_missing = 1,
    format('held 13h: finished from the done part with one missing: %s %s', r.status, r.parts_missing);
  assert (select status from public.lecture_segments where lecture_id = '47000000-0000-0000-0000-000000000051' and seq = 1) = 'uploaded',
    'the held part is still reclaimable for the arrival job';
  select * into r from public.lecture_recordings where id = '47000000-0000-0000-0000-000000000052';
  assert r.status = 'uploading', format('held 1h: still waiting on the provider: %s', r.status);
end $$;

-- ...and the notes job does not wait on the same part.
create or replace function pg_temp.notes_lecture(p_id text, p_first_failure interval)
returns void language sql as $$
  insert into public.lecture_recordings (id, user_id, title, status, source, segment_count, transcript, updated_at, created_at, last_heartbeat_at, capture_state, parts_missing)
  values (p_id::uuid, '00000000-0000-0000-0000-00000000000a', 'Notes ' || p_id, 'transcribed', 'recording', 2, repeat('real words spoken in class ', 12),
          now() - interval '3 minutes', now() - interval '5 hours', now() - interval '20 minutes', 'stopped', 1);
  insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds, created_at, storage_path, provider_failures, first_provider_failure_at)
  values (p_id::uuid, '00000000-0000-0000-0000-00000000000a', 0, 'done', repeat('real words spoken in class ', 12), 300, now() - interval '4 hours', null, 0, null),
         (p_id::uuid, '00000000-0000-0000-0000-00000000000a', 1, 'uploaded', null, 300, now() - interval '4 hours',
          '00000000-0000-0000-0000-00000000000a/' || p_id || '/seg_001.m4a', 0, now() - p_first_failure);
$$;
select pg_temp.notes_lecture('47000000-0000-0000-0000-000000000053', interval '13 hours');
select pg_temp.notes_lecture('47000000-0000-0000-0000-000000000054', interval '1 hour');
do $$
declare ids text[];
begin
  delete from net.calls;
  perform public.request_pending_lecture_notes(50);
  select array_agg(body->>'lectureId') into ids from net.calls;
  assert '47000000-0000-0000-0000-000000000053' = any(coalesce(ids, '{}')), format('notes requested past the 12-hour hold: %s', ids);
  assert not ('47000000-0000-0000-0000-000000000054' = any(coalesce(ids, '{}'))), format('notes wait inside it: %s', ids);
end $$;

-- ── 5b. no audio, phone gone: NO_AUDIO after 30 minutes (student-journeys-4) ──
insert into public.lecture_quota_day (day, seconds_reserved) values (current_date, 5400)
on conflict (day) do update set seconds_reserved = public.lecture_quota_day.seconds_reserved + 5400;
insert into public.lecture_recordings (id, user_id, title, status, source, created_at, updated_at, last_heartbeat_at, capture_state, reserved_seconds, reserved_day) values
  ('47000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-00000000000a', 'Ghost', 'recording', 'recording', now() - interval '40 minutes', now() - interval '31 minutes', now() - interval '31 minutes', 'stopped', 5400, current_date),
  ('47000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-00000000000a', 'Live', 'recording', 'recording', now() - interval '40 minutes', now() - interval '10 minutes', now() - interval '10 minutes', 'recording', 5400, current_date),
  ('47000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-00000000000a', 'Offline', 'recording', 'recording', now() - interval '40 minutes', now() - interval '31 minutes', now() - interval '31 minutes', 'recording', 5400, current_date),
  ('47000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-00000000000a', 'Old app', 'recording', 'recording', now() - interval '60 minutes', now() - interval '60 minutes', null, null, 5400, current_date);
insert into public.lecture_usage_log (user_id, lecture_id, audio_seconds, status)
values ('00000000-0000-0000-0000-00000000000a', '47000000-0000-0000-0000-000000000061', 0, 'success');
do $$
declare r record; q integer;
begin
  perform public.sweep_stalled_lectures();
  select * into r from public.lecture_recordings where id = '47000000-0000-0000-0000-000000000061';
  assert r.status = 'failed' and r.error_code = 'NO_AUDIO', format('ghost failed as NO_AUDIO: %s %s', r.status, r.error_code);
  assert r.reserved_seconds = 0, 'its reservation is released';
  assert (select status from public.lecture_usage_log where lecture_id = '47000000-0000-0000-0000-000000000061') = 'refunded', 'its charge is refunded';
  assert not public.free_action_used('00000000-0000-0000-0000-00000000000a'), 'the free account can record again';
  select * into r from public.lecture_recordings where id = '47000000-0000-0000-0000-000000000062';
  assert r.status = 'recording', 'a phone that reported in 10 minutes ago is left alone';
  select * into r from public.lecture_recordings where id = '47000000-0000-0000-0000-000000000063';
  assert r.status = 'recording', 'an app without heartbeats keeps the 2-hour rule';
  select * into r from public.lecture_recordings where id = '47000000-0000-0000-0000-000000000064';
  assert r.status = 'recording', 'a phone recording offline (no Stop, no parts yet) is left alone';
end $$;

-- ── 6. alert fingerprints are ordered (server-and-ops-5) ──
insert into public.lecture_recordings (id, user_id, title, status, source, parts_missing, updated_at) values
  ('ffffffff-0000-0000-0000-000000000071', '00000000-0000-0000-0000-00000000000a', 'Z', 'ready', 'recording', 2, now() - interval '5 minutes'),
  ('11111111-0000-0000-0000-000000000072', '00000000-0000-0000-0000-00000000000a', 'A', 'ready', 'recording', 1, now() - interval '4 minutes'),
  ('88888888-0000-0000-0000-000000000073', '00000000-0000-0000-0000-00000000000a', 'M', 'ready', 'recording', 1, now() - interval '3 minutes');
do $$
declare lectures jsonb;
begin
  perform public.lecture_health_check(7200, 28800);
  select detail->'lectures' into lectures from public.ops_alerts where kind = 'lecture_parts_missing';
  assert lectures is not null and jsonb_array_length(lectures) >= 3, format('parts-missing alert names the lectures: %s', lectures);
  assert lectures = (select jsonb_agg(x order by x) from jsonb_array_elements_text(lectures) x),
    format('lectures are listed in id order: %s', lectures);
  assert (lectures->>0) = '11111111' and (lectures->>(jsonb_array_length(lectures) - 1)) = 'ffffffff', format('first and last by id: %s', lectures);
end $$;

-- ── 7. notes every 2 minutes, same command (server-and-ops-8) ──
do $$
declare j record;
begin
  select * into j from cron.job where jobname = 'semora-finish-lecture-notes';
  assert found and j.schedule = '*/2 * * * *', format('schedule: %s', j.schedule);
  assert j.command like '%resync_lecture_transcripts()%' and j.command like '%request_pending_lecture_notes(5)%'
     and j.command like '%notify_lecture_notes_ready()%' and j.command like '%alert_lecture_notes_stuck()%',
    'the 115 command is kept whole';
end $$;

select '147 OK' as result;
