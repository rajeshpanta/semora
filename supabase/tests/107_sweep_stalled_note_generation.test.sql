-- Tests for migration 107 (the sweep learns about 'generating').
--
-- These run against a THROWAWAY database, never production:
--
--   createdb semora_mig_test
--   psql -v ON_ERROR_STOP=1 -d semora_mig_test -f supabase/tests/107_sweep_stalled_note_generation.test.sql
--   dropdb semora_mig_test
--
-- The first section rebuilds only the parts of the pre-107 world the sweep
-- touches (lecture_recordings + lecture_segments, per 065/082), so the real
-- migration file can be applied on top and its effect observed in isolation.
-- The cron tail of 082/107 is not replayed here — pg_cron does not exist in a
-- throwaway database, and the schedule is not what these tests are about.

create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());

-- The CHECK constraints and the updated_at trigger are copied from production
-- verbatim, not approximated. Without them this file would happily accept a
-- status the real table rejects, and the test would pass while the migration
-- failed on deploy — which is the only failure mode a stub schema can hide.
create table public.lecture_recordings (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  title            text,
  source           text,
  status           text not null default 'recording',
  error_code       text,
  transcript       text,
  notes_md         text,
  notes_started_at timestamptz,
  segment_count    int  not null default 0,
  duration_seconds int  not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint lecture_recordings_source_check
    check (source = any (array['recording'::text, 'document'::text])),
  constraint lecture_recordings_status_check
    check (status = any (array['recording'::text, 'uploading'::text, 'transcribing'::text,
                               'transcribed'::text, 'generating'::text, 'ready'::text, 'failed'::text]))
);

create function public.lecture_recordings_set_updated_at()
returns trigger language plpgsql as $trg$
begin
  new.updated_at := now();
  return new;
end;
$trg$;

create trigger lecture_recordings_set_updated_at_trigger
  before update on public.lecture_recordings
  for each row execute function public.lecture_recordings_set_updated_at();

create table public.lecture_segments (
  id         uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lecture_recordings(id) on delete cascade,
  seq        int  not null,
  status     text not null default 'pending',
  transcript text,
  seconds    int  not null default 0
);

-- The function under test, exactly as production will run it.
\i supabase/migrations/107_sweep_stalled_note_generation.sql

-- ── fixtures ────────────────────────────────────────────────
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');

-- A: the production case — 96575255. Claim stamped, isolate died, transcript
--    intact. source='document' because that is what the real row is.
insert into public.lecture_recordings
  (id, user_id, title, source, status, transcript, notes_started_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'GEOL3005Class-1', 'document', 'generating', 'the transcript survived',
   now() - interval '12 hours', now() - interval '12 hours');

-- B: a claim stamped 30 seconds ago. Still legitimately working; must be left alone.
insert into public.lecture_recordings
  (id, user_id, title, status, transcript, notes_started_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Still working', 'generating', 'transcript', now() - interval '30 seconds', now() - interval '30 seconds');

-- C: NULL notes_started_at, row itself untouched for an hour. Falls back to
--    updated_at and is swept — the client would call this stale immediately.
insert into public.lecture_recordings
  (id, user_id, title, status, transcript, notes_started_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'No stamp', 'generating', 'transcript', null, now() - interval '1 hour');

-- D: NULL notes_started_at but updated a moment ago. The conservative fallback
--    must protect this one, where the client would not.
insert into public.lecture_recordings
  (id, user_id, title, status, transcript, notes_started_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'No stamp, fresh', 'generating', 'transcript', null, now() - interval '10 seconds');

-- E: stale claim over an EMPTY transcript. Unreachable in the app; must fail
--    rather than offer a retry against nothing.
insert into public.lecture_recordings
  (id, user_id, title, status, transcript, notes_started_at, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'Empty', 'generating', '   ', now() - interval '2 hours', now() - interval '2 hours');

-- F: 'ready' and long finished. The sweep must never touch a completed lecture.
insert into public.lecture_recordings
  (id, user_id, title, status, transcript, notes_md, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   'Done', 'ready', 'transcript', '# notes', now() - interval '3 days');

-- G: 082's own case, still working — a stalled upload with one done segment.
insert into public.lecture_recordings
  (id, user_id, title, status, updated_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   'Abandoned upload', 'transcribing', now() - interval '40 minutes');
insert into public.lecture_segments (lecture_id, seq, status, transcript, seconds)
values ('aaaaaaaa-0000-0000-0000-000000000007', 1, 'done', 'segment one', 61);

-- ── run ─────────────────────────────────────────────────────
select public.sweep_stalled_lectures() as swept \gset

do $$
declare r record;
begin
  -- A: released to the state the client renders as transcript + "Try again".
  select * into r from public.lecture_recordings where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  assert r.status = 'transcribed',            'A: expected transcribed, got ' || r.status;
  assert r.error_code = 'NOTES_FAILED',       'A: expected NOTES_FAILED, got ' || coalesce(r.error_code,'null');
  assert r.notes_started_at is null,          'A: claim stamp must be cleared';
  assert r.transcript = 'the transcript survived', 'A: transcript must survive untouched';
  -- The BEFORE UPDATE trigger owns updated_at; the sweep must still leave the
  -- row looking freshly touched so nothing downstream re-reads it as ancient.
  assert r.updated_at > now() - interval '1 minute', 'A: updated_at did not move';

  -- B: inside the four-minute window. Untouched.
  select * into r from public.lecture_recordings where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  assert r.status = 'generating',             'B: a live claim must not be swept, got ' || r.status;
  assert r.notes_started_at is not null,      'B: live claim stamp must remain';

  -- C: no stamp, row cold. Swept via the updated_at fallback.
  select * into r from public.lecture_recordings where id = 'aaaaaaaa-0000-0000-0000-000000000003';
  assert r.status = 'transcribed',            'C: expected transcribed, got ' || r.status;
  assert r.error_code = 'NOTES_FAILED',       'C: expected NOTES_FAILED';

  -- D: no stamp, row warm. The deliberate divergence from the client.
  select * into r from public.lecture_recordings where id = 'aaaaaaaa-0000-0000-0000-000000000004';
  assert r.status = 'generating',             'D: fresh row must survive a null stamp, got ' || r.status;

  -- E: nothing to retry against.
  select * into r from public.lecture_recordings where id = 'aaaaaaaa-0000-0000-0000-000000000005';
  assert r.status = 'failed',                 'E: expected failed, got ' || r.status;
  assert r.error_code = 'STALLED',            'E: expected STALLED, got ' || coalesce(r.error_code,'null');
  assert r.notes_started_at is null,          'E: claim stamp must be cleared';

  -- F: a finished lecture is not the sweep's business.
  select * into r from public.lecture_recordings where id = 'aaaaaaaa-0000-0000-0000-000000000006';
  assert r.status = 'ready',                  'F: a ready lecture must never be touched, got ' || r.status;
  assert r.notes_md = '# notes',              'F: notes must survive';

  -- G: 082 still does its own job.
  select * into r from public.lecture_recordings where id = 'aaaaaaaa-0000-0000-0000-000000000007';
  assert r.status = 'transcribed',            'G: 082 salvage regressed, got ' || r.status;
  assert r.transcript = 'segment one',        'G: segment salvage regressed';
  assert r.segment_count = 1,                 'G: segment_count not set';
  assert r.duration_seconds = 61,             'G: duration not set';

  raise notice 'all assertions passed';
end $$;

-- A, C, E and G were swept; B, D and F were not.
do $$
declare n int;
begin
  select count(*) into n from public.lecture_recordings
   where status = 'generating';
  assert n = 2, 'expected 2 rows left in generating (B and D), got ' || n;
end $$;

-- ── idempotence ─────────────────────────────────────────────
-- A second pass in the same tick must find nothing new to do: everything the
-- first pass released has left the states this function looks at.
do $$
declare again int;
begin
  select public.sweep_stalled_lectures() into again;
  assert again = 0, 'second sweep should be a no-op, swept ' || again;
  raise notice 'idempotence holds';
end $$;
