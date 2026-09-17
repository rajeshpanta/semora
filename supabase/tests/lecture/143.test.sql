-- Tests for 143 (run after harness.sql, 140, 142, 143 on a THROWAWAY database).
set client_min_messages = warning;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, preferred_language, timezone)
select u, 'en', (select name from pg_timezone_names
                 where extract(hour from now() at time zone name) between 10 and 17
                 order by name limit 1)
from (values ('00000000-0000-0000-0000-00000000000a'::uuid), ('00000000-0000-0000-0000-00000000000b'::uuid)) v(u);
insert into public.push_tokens (user_id, token) values ('00000000-0000-0000-0000-00000000000a', 't');

-- Test rows need old timestamps, which the updated_at trigger would overwrite.
alter table public.lecture_recordings disable trigger lecture_recordings_set_updated_at_trigger;

create or replace function pg_temp.lecture(p_id text, p_status text, p_updated interval, p_hb interval,
                                           p_state text, p_declared int default 0)
returns void language sql as $$
  insert into public.lecture_recordings (id, user_id, title, status, source, segment_count, updated_at, created_at, last_heartbeat_at, capture_state)
  values (p_id::uuid, '00000000-0000-0000-0000-00000000000a', 'T ' || p_id, p_status, 'recording', p_declared,
          now() - p_updated, now() - interval '5 hours',
          case when p_hb is null then null else now() - p_hb end, p_state);
$$;
create or replace function pg_temp.part(p_id text, p_seq int, p_status text, p_text text, p_age interval default interval '2 hours', p_path boolean default false)
returns void language sql as $$
  insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds, created_at, storage_path)
  values (p_id::uuid, '00000000-0000-0000-0000-00000000000a', p_seq, p_status, p_text, 300, now() - p_age,
          case when p_path then '00000000-0000-0000-0000-00000000000a/' || p_id || '/seg_' || lpad(p_seq::text, 3, '0') || '.m4a' end);
$$;

-- ── heartbeat ──
select pg_temp.lecture('20000000-0000-0000-0000-000000000001', 'recording', interval '1 minute', null, null);
select pg_temp.lecture('20000000-0000-0000-0000-000000000009', 'ready', interval '1 minute', null, null);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert public.lecture_heartbeat('20000000-0000-0000-0000-000000000001', 'recording') = false, 'another user cannot heartbeat';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert public.lecture_heartbeat('20000000-0000-0000-0000-000000000001', 'recording', 60, 58, '60') = true, 'owner heartbeat';
  assert public.lecture_heartbeat('20000000-0000-0000-0000-000000000001', 'paused') = true, 'paused heartbeat keeps numbers';
  assert public.lecture_heartbeat('20000000-0000-0000-0000-000000000009', 'recording') = false, 'finished lecture does not go back to recording';
  assert public.lecture_heartbeat('20000000-0000-0000-0000-000000000009', 'stopped', 3600, 3500) = true, 'stopped report lands on a finished lecture';
  begin
    perform public.lecture_heartbeat('20000000-0000-0000-0000-000000000001', 'dancing');
    raise exception 'invalid state accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;
reset role;
do $$
declare r record;
begin
  select * into r from public.lecture_recordings where id = '20000000-0000-0000-0000-000000000001';
  assert r.capture_state = 'paused' and r.capture_wall_seconds = 60 and r.captured_seconds = 58 and r.app_build = '60',
    format('heartbeat fields: %s %s %s %s', r.capture_state, r.capture_wall_seconds, r.captured_seconds, r.app_build);
  assert r.last_heartbeat_at > now() - interval '1 minute', 'heartbeat stamped';
  select * into r from public.lecture_recordings where id = '20000000-0000-0000-0000-000000000009';
  assert r.status = 'ready' and r.capture_state = 'stopped' and r.captured_seconds = 3500, 'stopped on finished';
end $$;

-- ── sweep ──
-- A: heartbeat recording, phone quiet past the limit + 30 min (2 h 5 min), has text → finished
select pg_temp.lecture('20000000-0000-0000-0000-00000000000a', 'transcribing', interval '125 minutes', interval '125 minutes', 'recording');
select pg_temp.part('20000000-0000-0000-0000-00000000000a', 0, 'done', repeat('word ', 60));
-- B: heartbeat recording, phone quiet 40 min (offline in a hall, still recording) → untouched
select pg_temp.lecture('20000000-0000-0000-0000-00000000000b', 'transcribing', interval '40 minutes', interval '40 minutes', 'recording');
select pg_temp.part('20000000-0000-0000-0000-00000000000b', 0, 'done', repeat('word ', 60));
-- C: paused 2 hours → untouched; D: paused 13 hours → finished
select pg_temp.lecture('20000000-0000-0000-0000-00000000000c', 'transcribing', interval '2 hours', interval '2 hours', 'paused');
select pg_temp.part('20000000-0000-0000-0000-00000000000c', 0, 'done', repeat('word ', 60));
select pg_temp.lecture('20000000-0000-0000-0000-00000000000d', 'transcribing', interval '13 hours', interval '13 hours', 'paused');
select pg_temp.part('20000000-0000-0000-0000-00000000000d', 0, 'done', repeat('word ', 60), interval '13 hours');
-- E: stopped, quiet 16 min → finished
select pg_temp.lecture('20000000-0000-0000-0000-00000000000e', 'uploading', interval '16 minutes', interval '16 minutes', 'stopped', 2);
select pg_temp.part('20000000-0000-0000-0000-00000000000e', 0, 'done', repeat('word ', 60));
-- F: stopped, one part done and one uploaded part still waiting on the provider → left alone
select pg_temp.lecture('20000000-0000-0000-0000-00000000000f', 'uploading', interval '40 minutes', interval '40 minutes', 'stopped', 2);
select pg_temp.part('20000000-0000-0000-0000-00000000000f', 0, 'done', repeat('word ', 60));
select pg_temp.part('20000000-0000-0000-0000-00000000000f', 1, 'uploaded', null, interval '2 hours', true);
-- G: no heartbeat (old app), undeclared, quiet 1 hour → old 3-hour rule leaves it
select pg_temp.lecture('20000000-0000-0000-0000-000000000010', 'transcribing', interval '1 hour', null, null);
select pg_temp.part('20000000-0000-0000-0000-000000000010', 0, 'done', repeat('word ', 60), interval '1 hour');
-- H: stopped with a tiny transcript → ready, TOO_SHORT_FOR_NOTES
select pg_temp.lecture('20000000-0000-0000-0000-000000000011', 'uploading', interval '16 minutes', interval '16 minutes', 'stopped', 1);
select pg_temp.part('20000000-0000-0000-0000-000000000011', 0, 'done', 'hello there');
-- I: a quiz claim 6 minutes old
insert into public.lecture_recordings (id, user_id, title, status, source, quiz_generating, quiz_started_at, updated_at)
values ('20000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-00000000000a', 'Q', 'ready', 'recording', true, now() - interval '6 minutes', now() - interval '6 minutes');

select public.sweep_stalled_lectures();

do $$
declare s text; e text;
begin
  select status into s from public.lecture_recordings where id = '20000000-0000-0000-0000-00000000000a';
  assert s = 'transcribed', format('A: phone quiet past the limit finishes, got %s', s);
  select status into s from public.lecture_recordings where id = '20000000-0000-0000-0000-00000000000b';
  assert s = 'transcribing', format('B: offline phone still recording untouched, got %s', s);
  select status into s from public.lecture_recordings where id = '20000000-0000-0000-0000-00000000000c';
  assert s = 'transcribing', format('C: short pause untouched, got %s', s);
  select status into s from public.lecture_recordings where id = '20000000-0000-0000-0000-00000000000d';
  assert s = 'transcribed', format('D: long pause finishes, got %s', s);
  select status into s from public.lecture_recordings where id = '20000000-0000-0000-0000-00000000000e';
  assert s = 'transcribed', format('E: stopped finishes, got %s', s);
  select status into s from public.lecture_recordings where id = '20000000-0000-0000-0000-00000000000f';
  assert s = 'uploading', format('F: never finished while a part waits on the provider, got %s', s);
  select status into s from public.lecture_recordings where id = '20000000-0000-0000-0000-000000000010';
  assert s = 'transcribing', format('G: old-app rules unchanged, got %s', s);
  select status, error_code into s, e from public.lecture_recordings where id = '20000000-0000-0000-0000-000000000011';
  assert s = 'ready' and e = 'TOO_SHORT_FOR_NOTES', format('H: tiny transcript shown, got %s %s', s, e);
  select quiz_generating::text into s from public.lecture_recordings where id = '20000000-0000-0000-0000-000000000012';
  assert s = 'false', 'I: dead quiz claim reset';
end $$;

-- ── notes requests ──
update public.lecture_recordings set updated_at = now() - interval '3 minutes', notes_md = null, notes_auto_attempts = 0
 where id in ('20000000-0000-0000-0000-00000000000e', '20000000-0000-0000-0000-00000000000a');
-- a stopped lecture whose part is still waiting on the provider does NOT get notes yet
select pg_temp.lecture('20000000-0000-0000-0000-000000000014', 'transcribed', interval '3 minutes', interval '3 minutes', 'stopped', 2);
update public.lecture_recordings set transcript = repeat('word ', 60) where id = '20000000-0000-0000-0000-000000000014';
select pg_temp.part('20000000-0000-0000-0000-000000000014', 1, 'uploaded', null, interval '10 minutes', true);
-- an old-app lecture finished 3 minutes ago must still wait its 10 minutes
select pg_temp.lecture('20000000-0000-0000-0000-000000000013', 'transcribed', interval '3 minutes', null, null, 1);
update public.lecture_recordings set transcript = repeat('word ', 60) where id = '20000000-0000-0000-0000-000000000013';
do $$
declare n integer; ids text[];
begin
  delete from net.calls;
  n := public.request_pending_lecture_notes(10);
  select array_agg(body->>'lectureId' order by body->>'lectureId') into ids from net.calls;
  assert ids = array['20000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000e'],
    format('stopped + quiet-heartbeat lectures go immediately, old app waits: %s', ids);
end $$;

-- ── notifications ──
update public.lecture_recordings
   set status = 'ready', notes_md = 'notes', notes_auto_attempts = 1, notes_ready_notified_at = null,
       notes_refreshed_at = null, parts_missing = 0, updated_at = now()
 where id = '20000000-0000-0000-0000-00000000000e';
update public.lecture_recordings
   set status = 'ready', notes_md = 'notes', notes_auto_attempts = 1, notes_ready_notified_at = null,
       notes_refreshed_at = null, parts_missing = 2, updated_at = now(), capture_state = 'stopped'
 where id = '20000000-0000-0000-0000-00000000000d';
-- finished because the phone went quiet 40 minutes ago: not announced yet
update public.lecture_recordings
   set status = 'ready', notes_md = 'notes', notes_auto_attempts = 1, notes_ready_notified_at = null,
       notes_refreshed_at = null, parts_missing = 0, updated_at = now(), last_heartbeat_at = now() - interval '40 minutes'
 where id = '20000000-0000-0000-0000-00000000000a';
do $$
declare complete jsonb; partial jsonb; n integer;
begin
  delete from net.calls;
  n := public.notify_lecture_notes_ready();
  assert n = 2, format('two pushes, got %s', n);
  select body into complete from net.calls where body->'data'->>'lectureId' = '20000000-0000-0000-0000-00000000000e';
  select body into partial from net.calls where body->'data'->>'lectureId' = '20000000-0000-0000-0000-00000000000d';
  assert complete->>'title' = 'Your lecture notes are ready', 'complete wording unchanged';
  assert partial->>'title' = 'Your lecture notes are ready — some audio is missing', format('partial title %s', partial->>'title');
  assert partial->>'body' like '%2 parts didn’t reach us.', format('partial body %s', partial->>'body');
  assert partial->'translations'->'es'->>'body' like '%No nos llegaron 2 partes.', 'spanish partial body';
  assert not exists (select 1 from net.calls where body->'data'->>'lectureId' = '20000000-0000-0000-0000-00000000000a'),
    'quiet phone not announced within the hour';
end $$;

-- second loop: more arrived but parts still missing → never "whole lecture"
update public.lecture_recordings
   set notes_ready_notified_at = now() - interval '2 hours', notes_refreshed_at = now(), parts_missing = 1
 where id = '20000000-0000-0000-0000-00000000000d';
update public.lecture_recordings
   set notes_ready_notified_at = now() - interval '2 hours', notes_refreshed_at = now(), parts_missing = 0
 where id = '20000000-0000-0000-0000-00000000000e';
do $$
declare still jsonb; whole jsonb;
begin
  delete from net.calls;
  perform public.notify_lecture_notes_ready();
  select body into still from net.calls where body->'data'->>'lectureId' = '20000000-0000-0000-0000-00000000000d';
  select body into whole from net.calls where body->'data'->>'lectureId' = '20000000-0000-0000-0000-00000000000e';
  assert still->>'title' = 'Your lecture notes were updated' and still->>'body' like '%1 part is still missing.',
    format('still-missing refresh wording: %s / %s', still->>'title', still->>'body');
  assert whole->>'title' = 'Your notes now cover the whole lecture', 'whole-lecture wording only when complete';
end $$;

alter table public.lecture_recordings enable trigger lecture_recordings_set_updated_at_trigger;
select '143 OK' as result;

-- ── the reviewer's M1: a too-short lecture that grows gets notes ──
select pg_temp.lecture('20000000-0000-0000-0000-000000000020', 'ready', interval '1 hour', interval '1 hour', 'stopped', 3);
update public.lecture_recordings set error_code = 'TOO_SHORT_FOR_NOTES', transcript = 'short' where id = '20000000-0000-0000-0000-000000000020';
select pg_temp.part('20000000-0000-0000-0000-000000000020', 0, 'done', 'short', interval '1 hour');
select pg_temp.part('20000000-0000-0000-0000-000000000020', 1, 'done', repeat('longer words ', 30), interval '1 hour');
do $$
declare r record;
begin
  perform public.lecture_rebuild_transcript('20000000-0000-0000-0000-000000000020');
  select status, error_code, notes_auto_attempts into r from public.lecture_recordings where id = '20000000-0000-0000-0000-000000000020';
  assert r.status = 'transcribed' and r.error_code is null and r.notes_auto_attempts = 0,
    format('grown too-short lecture sent for notes: %s %s', r.status, r.error_code);
end $$;

-- ── markers do not count towards "long enough for notes" ──
select pg_temp.lecture('20000000-0000-0000-0000-000000000021', 'uploading', interval '16 minutes', interval '16 minutes', 'stopped', 6);
select pg_temp.part('20000000-0000-0000-0000-000000000021', 0, 'done', repeat('ab ', 20));
select pg_temp.part('20000000-0000-0000-0000-000000000021', 2, 'done', repeat('cd ', 20));
select pg_temp.part('20000000-0000-0000-0000-000000000021', 4, 'done', repeat('ef ', 20));
do $$
declare r record;
begin
  perform public.sweep_stalled_lectures();
  select status, error_code into r from public.lecture_recordings where id = '20000000-0000-0000-0000-000000000021';
  assert r.status = 'ready' and r.error_code = 'TOO_SHORT_FOR_NOTES', format('markers not counted: %s %s', r.status, r.error_code);
end $$;

-- ── the sweep accepts a raised recording limit ──
do $$ begin
  perform public.sweep_stalled_lectures(180);
  assert not exists (select 1 from pg_proc where proname = 'sweep_stalled_lectures' and pronargs = 0), 'old no-argument sweep dropped';
end $$;

-- ── an absurd declared count does not make the assembler walk billions ──
update public.lecture_recordings set segment_count = 2000000000 where id = '20000000-0000-0000-0000-000000000021';
do $$
declare started timestamptz := clock_timestamp();
begin
  perform public.lecture_assemble_transcript('20000000-0000-0000-0000-000000000021');
  assert clock_timestamp() - started < interval '2 seconds', 'assembler capped';
end $$;

select '143 OK (review fixes)' as result;

-- ── only the service role may run the sweep (grants survive the drop) ──
do $$ begin
  assert not has_function_privilege('anon', 'public.sweep_stalled_lectures(integer)', 'execute'), 'anon cannot sweep';
  assert not has_function_privilege('authenticated', 'public.sweep_stalled_lectures(integer)', 'execute'), 'users cannot sweep';
end $$;

-- ── review: section rows do not let a long lecture skip the "audio still arriving" guard ──
alter table public.lecture_recordings disable trigger lecture_recordings_set_updated_at_trigger;
insert into public.lecture_recordings (id, user_id, title, status, source, transcript, notes_md, notes_stale, updated_at, created_at)
values
  ('43000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'Long, notes exist, part arriving', 'ready', 'recording',
   repeat('word ', 100), 'old notes', true, now() - interval '5 minutes', now() - interval '3 hours'),
  ('43000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'Long, first notes mid-sections, quiet', 'transcribed', 'recording',
   repeat('word ', 100), null, false, now() - interval '5 minutes', now() - interval '3 hours');
insert into public.lecture_note_sections (lecture_id, idx, text_hash, status)
values ('43000000-0000-0000-0000-0000000000a1', 0, 'h', 'done'), ('43000000-0000-0000-0000-0000000000a2', 0, 'h', 'done');
insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds, created_at)
values ('43000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 7, 'done', 'late', 120, now() - interval '1 minute'),
       ('43000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 0, 'done', 'early', 120, now() - interval '2 hours');
do $$
declare ids text[];
begin
  delete from net.calls;
  perform public.request_pending_lecture_notes(50);
  select array_agg(body->>'lectureId') into ids from net.calls;
  assert not ('43000000-0000-0000-0000-0000000000a1' = any(coalesce(ids, '{}'))), format('no rewrite while audio arrives: %s', ids);
  assert '43000000-0000-0000-0000-0000000000a2' = any(coalesce(ids, '{}')), format('first notes continue promptly: %s', ids);
end $$;

-- ── audit: a lecture the sweep gives up on refunds the free allowance ──
insert into public.lecture_recordings (id, user_id, title, status, source, segment_count, updated_at, created_at)
values ('43000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a', 'Stalled, charged', 'uploading', 'recording', 3,
        now() - interval '4 hours', now() - interval '6 hours');
insert into public.lecture_usage_log (user_id, lecture_id, audio_seconds, status)
values ('00000000-0000-0000-0000-00000000000a', '43000000-0000-0000-0000-0000000000b1', 300, 'success');
-- one part transcribed empty (silence), the rest never arrived
insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds, created_at)
values ('43000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a', 0, 'done', '', 300, now() - interval '5 hours');
do $$
declare r record;
begin
  perform public.sweep_stalled_lectures();
  select * into r from public.lecture_recordings where id = '43000000-0000-0000-0000-0000000000b1';
  assert r.status = 'failed' and r.error_code = 'NO_SPEECH', format('empty parts → NO_SPEECH: %s %s', r.status, r.error_code);
  assert (select status from public.lecture_usage_log where lecture_id = '43000000-0000-0000-0000-0000000000b1') = 'refunded',
    'the charge is refunded when nothing usable was delivered';
end $$;

-- ── audit: parts recovery has given up on do not hold a lecture open ──
insert into public.lecture_recordings (id, user_id, title, status, source, segment_count, updated_at, created_at, last_heartbeat_at, capture_state)
values ('43000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000000a', 'Refused parts', 'uploading', 'recording', 2,
        now() - interval '4 hours', now() - interval '6 hours', now() - interval '4 hours', 'stopped');
insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds, created_at, storage_path, recovery_attempts)
values ('43000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000000a', 0, 'done', 'some real words here', 300, now() - interval '5 hours', null, 0),
       ('43000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000000a', 1, 'uploaded', null, 300, now() - interval '5 hours',
        '00000000-0000-0000-0000-00000000000a/43000000-0000-0000-0000-0000000000b2/seg_001.m4a', 3);
do $$
declare r record;
begin
  perform public.sweep_stalled_lectures();
  select * into r from public.lecture_recordings where id = '43000000-0000-0000-0000-0000000000b2';
  assert r.status in ('ready', 'transcribed'), format('finished around the refused part: %s', r.status);
end $$;

-- ── audit: one unrecoverable-parts alert per run ──
insert into public.lecture_recordings (id, user_id, title, status, source, parts_missing, parts_missing_since, updated_at, created_at)
values ('43000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'U1', 'ready', 'recording', 2, now() - interval '8 days', now(), now() - interval '9 days'),
       ('43000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a', 'U2', 'ready', 'recording', 1, now() - interval '8 days', now(), now() - interval '9 days');
do $$
declare n integer;
begin
  delete from public.ops_alerts where kind = 'lecture_parts_unrecoverable';
  perform public.sweep_stalled_lectures();
  select count(*) into n from public.ops_alerts where kind = 'lecture_parts_unrecoverable';
  assert n = 1, format('one alert for two lectures: %s', n);
  assert (select (detail->>'count')::int from public.ops_alerts where kind = 'lecture_parts_unrecoverable') = 2, 'both counted';
end $$;
