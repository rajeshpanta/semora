-- Tests for 142 (run after harness.sql, 140 and 142 on a THROWAWAY database).
set client_min_messages = warning;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, preferred_language) values
  ('00000000-0000-0000-0000-00000000000a', 'en'),
  ('00000000-0000-0000-0000-00000000000b', 'es');

-- A lecture: parts 0 done, 1 no row, 2 failed, 3 done after an interruption,
-- declared 5 parts (so 4 is missing too).
insert into public.lecture_recordings (id, user_id, title, status, segment_count, source)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'L1', 'transcribing', 5, 'recording');
insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds, has_gap) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 0, 'done', 'alpha words', 300, false),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 2, 'failed', null, 300, false),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 3, 'done', 'delta words', 120, true);

do $$
declare a record;
begin
  select * into a from public.lecture_assemble_transcript('10000000-0000-0000-0000-000000000001');
  assert a.transcript =
    E'alpha words\n\n[Part of this recording could not be transcribed.]\n\n[Recording resumed after an interruption.]\n\ndelta words\n\n[Part of this recording could not be transcribed.]',
    format('assembler layout wrong: %L', a.transcript);
  assert a.text_parts = 2, 'text_parts';
  assert a.total_seconds = 420, 'total_seconds counts done parts only';
  -- markers are invisible to the words comparison
  assert public.lecture_transcript_words(a.transcript) = 'alpha words delta words', 'words ignore markers';
end $$;

-- Spanish markers follow the lecture language, falling back to the profile.
insert into public.lecture_recordings (id, user_id, title, status, segment_count, source)
values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'L2', 'transcribing', 2, 'recording');
insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds) values
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 0, 'done', 'hola', 300);
do $$
declare a record;
begin
  select * into a from public.lecture_assemble_transcript('10000000-0000-0000-0000-000000000002');
  assert a.transcript = E'hola\n\n[Falta una parte de la grabación.]', format('spanish markers: %L', a.transcript);
  update public.lecture_recordings set language = 'en' where id = '10000000-0000-0000-0000-000000000002';
  select * into a from public.lecture_assemble_transcript('10000000-0000-0000-0000-000000000002');
  assert a.transcript like '%[Part of this recording could not be transcribed.]', 'lecture language wins over profile';
end $$;

-- No real text: no transcript made only of markers.
insert into public.lecture_recordings (id, user_id, title, status, segment_count, source)
values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'L3', 'transcribing', 3, 'recording');
insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds) values
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 1, 'done', '', 300);
do $$
declare a record;
begin
  select * into a from public.lecture_assemble_transcript('10000000-0000-0000-0000-000000000003');
  assert a.transcript = '' and a.text_parts = 0, 'no text → empty transcript';
end $$;

-- Rebuild: a finished lecture whose words are unchanged is left alone even
-- though the assembler now adds markers it did not have before.
insert into public.lecture_recordings (id, user_id, title, status, segment_count, source, transcript, notes_md)
values ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'L4', 'ready', 3, 'recording', 'one two', 'notes');
insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds) values
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 0, 'done', 'one', 300),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 2, 'done', 'two', 300);
do $$
declare changed boolean; r record;
begin
  changed := public.lecture_rebuild_transcript('10000000-0000-0000-0000-000000000004');
  select * into r from public.lecture_recordings where id = '10000000-0000-0000-0000-000000000004';
  assert changed = false, 'unchanged words → no rebuild';
  assert r.notes_stale = false, 'notes not marked stale for markers only';
  assert r.parts_missing = 1, format('parts_missing still recalculated: %s', r.parts_missing);
  -- a late part with words DOES rebuild, with markers, and marks notes stale
  insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds)
  values ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 1, 'done', 'middle', 300);
  changed := public.lecture_rebuild_transcript('10000000-0000-0000-0000-000000000004');
  select * into r from public.lecture_recordings where id = '10000000-0000-0000-0000-000000000004';
  assert changed, 'new words → rebuild';
  assert r.transcript = E'one\n\nmiddle\n\ntwo', format('rebuilt transcript: %L', r.transcript);
  assert r.notes_stale and r.parts_missing = 0 and r.transcript_rev = 1, 'stale + complete + rev';
end $$;

-- Charges: refunded is a status, and a refunded lecture is charged again when
-- speech arrives. (A lecture with no transcribed text: one with text is never
-- refunded — tested below.)
insert into public.lecture_recordings (id, user_id, title, status, source)
values ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', 'Silent', 'transcribing', 'recording');
do $$
declare n integer;
begin
  perform public.lecture_charge_usage('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000c1', 300);
  perform public.lecture_charge_usage('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000c1', 300);
  select count(*) into n from public.lecture_usage_log where lecture_id = '10000000-0000-0000-0000-0000000000c1';
  assert n = 1, 'charged once';
  assert public.free_action_used('00000000-0000-0000-0000-00000000000a'), 'charge spends the free action';

  n := public.lecture_refund_usage('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000c1', 'NO_SPEECH');
  assert n = 1, 'refunded one row';
  assert not public.free_action_used('00000000-0000-0000-0000-00000000000a'), 'refund gives the free action back';
  select count(*) into n from public.lecture_usage_log where lecture_id = '10000000-0000-0000-0000-0000000000c1';
  assert n = 1, 'refund keeps the row';

  perform public.lecture_charge_usage('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-0000000000c1', 60);
  assert public.free_action_used('00000000-0000-0000-0000-00000000000a'), 'late speech charges a refunded lecture again';
end $$;

-- A part's path must name its own owner, lecture and seq.
do $$
begin
  begin
    insert into public.lecture_segments (lecture_id, user_id, seq, status, storage_path)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 9, 'uploaded',
            '00000000-0000-0000-0000-00000000000b/10000000-0000-0000-0000-000000000001/seg_009.m4a');
    raise exception 'constraint did not fire';
  exception when check_violation then null;
  end;
  insert into public.lecture_segments (lecture_id, user_id, seq, status, storage_path)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 9, 'uploaded',
          '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000001/seg_009.m4a');
end $$;

-- The phone cannot pre-set server-measured part columns.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
insert into public.lecture_segments (lecture_id, user_id, seq, seconds, storage_path, provider_failures, speech_seconds)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 10, 300,
        '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000001/seg_010.m4a', 99, 999);
reset role;
do $$
declare s record;
begin
  select * into s from public.lecture_segments where lecture_id = '10000000-0000-0000-0000-000000000001' and seq = 10;
  assert s.provider_failures = 0 and s.speech_seconds is null and s.status = 'pending', 'client columns reset on insert';
end $$;

-- The arrival job treats a 6-minute-old claim as dead and a 4-minute one as live.
insert into public.lecture_recordings (id, user_id, title, status, source)
values ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'L5', 'transcribing', 'recording');
insert into storage.objects (bucket_id, name, created_at) values
  ('lectures', '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000005/seg_000.m4a', now() - interval '20 minutes'),
  ('lectures', '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000005/seg_001.m4a', now() - interval '20 minutes');
insert into public.lecture_segments (lecture_id, user_id, seq, status, storage_path, claimed_at) values
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 0, 'transcribing',
   '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000005/seg_000.m4a', now() - interval '6 minutes'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 1, 'transcribing',
   '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000005/seg_001.m4a', now() - interval '4 minutes');
do $$
declare n integer;
begin
  delete from net.calls;
  n := public.lecture_take_over_arrived_audio(5);
  assert n = 1, format('one dead claim dispatched, got %s', n);
  assert (select body->>'segmentId' from net.calls limit 1) =
         (select id::text from public.lecture_segments where lecture_id = '10000000-0000-0000-0000-000000000005' and seq = 0),
         'the dead claim is the one dispatched';
end $$;

-- Retention returns a part whose last attempt died mid-transcription.
insert into public.lecture_recordings (id, user_id, title, status, source)
values ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', 'L6', 'ready', 'recording');
insert into public.lecture_segments (lecture_id, user_id, seq, status, storage_path, claimed_at, recovery_attempts, created_at) values
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', 0, 'transcribing',
   '00000000-0000-0000-0000-00000000000a/10000000-0000-0000-0000-000000000006/seg_000.m4a', now() - interval '2 hours', 3, now() - interval '3 hours');
do $$
begin
  assert exists (select 1 from public.lecture_audio_awaiting_deletion(25) where lecture_id = '10000000-0000-0000-0000-000000000006'),
    'exhausted dead claim is deleted, not kept forever';
end $$;

-- Usage counter.
do $$
declare u record;
begin
  perform public.lecture_count_transcription(300);
  perform public.lecture_count_transcription(120, true);
  select * into u from public.lecture_transcription_usage where hour = date_trunc('hour', now());
  assert u.audio_seconds = 420 and u.requests = 2 and u.failures = 1, 'usage counts';
end $$;

select '142 OK' as result;

-- ── a document note can still be created by the app (review finding) ──
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000dd') on conflict do nothing;
grant insert, select on public.lecture_recordings to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000dd', false);
insert into public.lecture_recordings (user_id, title, transcript, source, source_filename)
values ('00000000-0000-0000-0000-0000000000dd', 'Doc', 'text', 'document', 'a.pdf');
reset role;
do $$
declare r record;
begin
  select * into r from public.lecture_recordings where user_id = '00000000-0000-0000-0000-0000000000dd';
  assert r.status = 'transcribed' and r.notes_rewrite_requested = false and r.notes_truncated = false and r.quiz_stale = false,
    'document note insert keeps working with the 142 columns';
end $$;

-- ── review: no refund while any finished part has text; seq is bounded ──
insert into public.lecture_recordings (id, user_id, title, status, source)
values ('42000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000dd', 'Refund probe', 'transcribing', 'recording');
insert into public.lecture_usage_log (user_id, lecture_id, audio_seconds, status)
values ('00000000-0000-0000-0000-0000000000dd', '42000000-0000-0000-0000-0000000000f1', 100, 'success');
insert into public.lecture_segments (lecture_id, user_id, seq, status, transcript, seconds)
values ('42000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000dd', 150, 'done', 'real words here', 100);
do $$ begin
  assert public.lecture_refund_usage('00000000-0000-0000-0000-0000000000dd', '42000000-0000-0000-0000-0000000000f1', 'NO_SPEECH') = 0,
    'no refund while a finished part has text';
  begin
    insert into public.lecture_segments (lecture_id, user_id, seq, status)
    values ('42000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000dd', 1000, 'pending');
    raise exception 'seq 1000 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.lecture_segments (lecture_id, user_id, seq, status)
    values ('42000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000dd', -1, 'pending');
    raise exception 'seq -1 accepted';
  exception when check_violation then null;
  end;
end $$;

-- an existing out-of-range row (from before the trigger) can still be updated
alter table public.lecture_segments disable trigger lecture_segments_seq_in_range_trigger;
insert into public.lecture_segments (lecture_id, user_id, seq, status)
values ('42000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000dd', 1200, 'uploaded');
alter table public.lecture_segments enable trigger lecture_segments_seq_in_range_trigger;
update public.lecture_segments set status = 'failed' where seq = 1200;
do $$ begin
  assert (select status from public.lecture_segments where seq = 1200) = 'failed', 'legacy row still updatable';
end $$;

-- ── audit: retention collects given-up parts and anything past the 7-day window ──
insert into public.lecture_recordings (id, user_id, title, status, source)
values ('42000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000dd', 'Old audio', 'failed', 'recording');
alter table public.lecture_segments disable trigger lecture_segments_seq_in_range_trigger;
insert into public.lecture_segments (lecture_id, user_id, seq, status, seconds, created_at, storage_path, recovery_attempts)
values ('42000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000dd', 0, 'uploaded', 300, now() - interval '9 days',
        '00000000-0000-0000-0000-0000000000dd/42000000-0000-0000-0000-0000000000e1/seg_000.m4a', 0),
       ('42000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000dd', 1, 'pending', 300, now() - interval '1 day',
        '00000000-0000-0000-0000-0000000000dd/42000000-0000-0000-0000-0000000000e1/seg_001.m4a', 3),
       ('42000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000dd', 2, 'uploaded', 300, now() - interval '1 day',
        '00000000-0000-0000-0000-0000000000dd/42000000-0000-0000-0000-0000000000e1/seg_002.m4a', 0);
alter table public.lecture_segments enable trigger lecture_segments_seq_in_range_trigger;
do $$
declare p text[];
begin
  select paths into p from public.lecture_audio_awaiting_deletion(100) where lecture_id = '42000000-0000-0000-0000-0000000000e1';
  assert p is not null and array_length(p, 1) = 2, format('9-day-old and given-up parts collected, the live one kept: %s', p);
  assert not (p @> array['00000000-0000-0000-0000-0000000000dd/42000000-0000-0000-0000-0000000000e1/seg_002.m4a']), 'a part still being retried is kept';
end $$;
