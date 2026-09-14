-- Tests for migration 140 (completeness before the words-unchanged early return).
--
-- These run against a THROWAWAY database, never production:
--
--   createdb semora_mig_test
--   psql -v ON_ERROR_STOP=1 -d semora_mig_test \
--     -f supabase/tests/140_completeness_before_the_early_return.test.sql
--   dropdb semora_mig_test
--
-- The first section rebuilds only the parts of the post-138 world that
-- lecture_rebuild_transcript touches, then installs 138's OWN version of the
-- three functions verbatim, so the defect can be demonstrated on the real code
-- before 140 is applied on top of it.
--
-- The defect: 138 calls lecture_set_parts_missing at the END of the rebuild,
-- after an early return that fires when the transcript's words did not change.
-- A recovered part that is five minutes of silence transcribes to nothing,
-- takes that early return, and the lecture goes on reporting a part missing
-- that is sitting right there, done.

create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());

create table public.lecture_recordings (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  title                  text,
  source                 text,
  status                 text not null default 'recording',
  transcript             text,
  notes_md               text,
  duration_seconds       integer not null default 0,
  segment_count          integer not null default 0,
  notes_auto_attempts    integer not null default 0,
  parts_missing          integer not null default 0,
  parts_missing_since    timestamptz,
  parts_unrecoverable_at timestamptz,
  notes_stale            boolean not null default false,
  notes_refreshed_at     timestamptz,
  transcript_rev         integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.lecture_segments (
  id                uuid primary key default gen_random_uuid(),
  lecture_id        uuid not null references public.lecture_recordings(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  seq               integer not null,
  storage_path      text,
  seconds           integer not null default 0,
  status            text not null default 'pending',
  transcript        text,
  has_gap           boolean not null default false,
  claimed_at        timestamptz,
  recovery_attempts integer not null default 0,
  created_at        timestamptz not null default now(),
  unique (lecture_id, seq)
);

-- ── 138's own functions, verbatim ──────────────────────────────────────────
create or replace function public.lecture_transcript_words(p_text text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(regexp_replace(
    regexp_replace(
      coalesce(p_text, ''),
      '\[(Part of this recording could not be transcribed|Falta una parte de la grabación|Recording resumed after an interruption|La grabación se reanudó tras una interrupción)\.\]',
      ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

create or replace function public.lecture_set_parts_missing(p_lecture_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  declared integer;
  done     integer;
  highest  integer;
  missing  integer;
begin
  select coalesce(segment_count, 0) into declared
  from public.lecture_recordings
  where id = p_lecture_id;
  if not found then
    return 0;
  end if;

  -- The highest seq seen covers a lecture whose phone never declared a count
  -- (it died or lost its session before Stop). A part whose upload never even
  -- created a row cannot be counted; the declared count is the only thing that
  -- sees those, which is why the sweep no longer overwrites it.
  select count(*) filter (where s.status = 'done'),
         coalesce(max(s.seq) + 1, 0)
    into done, highest
  from public.lecture_segments s
  where s.lecture_id = p_lecture_id;

  missing := greatest(0, greatest(declared, highest) - done);

  update public.lecture_recordings
     set parts_missing          = missing,
         parts_missing_since    = case when missing > 0 then coalesce(parts_missing_since, now()) end,
         parts_unrecoverable_at = case when missing > 0 then parts_unrecoverable_at end
   where id = p_lecture_id
     and (parts_missing is distinct from missing
          or (missing = 0 and (parts_missing_since is not null or parts_unrecoverable_at is not null)));

  return missing;
end;
$$;

CREATE OR REPLACE FUNCTION public.lecture_rebuild_transcript(p_lecture_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  rec      record;
  seg      record;
  had_notes boolean;
begin
  select id, transcript, segment_count, notes_md, status
    into rec
  from public.lecture_recordings
  where id = p_lecture_id
  for update;

  if not found then
    return false;
  end if;

  -- Both the text and the count come from the SAME filter, which is the whole
  -- lesson of 116: counting all `done` segments on one side while writing only
  -- the text-bearing count on the other made the comparison unsatisfiable and
  -- rebuilt the row on every tick forever, starving it of notes.
  select
    coalesce(string_agg(nullif(btrim(s.transcript), ''), ' ' order by s.seq), '') as text,
    count(*) filter (where nullif(btrim(s.transcript), '') is not null)           as done_count,
    -- Unfiltered: a silent segment still occupied its five minutes.
    coalesce(sum(s.seconds), 0)                                                   as total_seconds
  into seg
  from public.lecture_segments s
  where s.lecture_id = p_lecture_id
    and s.status = 'done';

  -- 138: compared by words, not bytes. lecture-transcribe assembles the same
  -- parts with paragraph breaks and "[Part of this recording…]" markers, so a
  -- byte comparison called every finished lecture changed, and now that this is
  -- called whenever a part lands on a finished lecture, that would rewrite
  -- correct notes for nothing.
  if seg.done_count = 0
     or public.lecture_transcript_words(seg.text) = public.lecture_transcript_words(rec.transcript) then
    return false;
  end if;

  -- 138: a lecture mid-generation is about to have notes from the old text.
  had_notes := rec.notes_md is not null or rec.status = 'generating';

  update public.lecture_recordings
     set transcript       = seg.text,
         -- 138: never shrink the phone's declared count (see sweep_stalled_lectures).
         segment_count    = greatest(coalesce(segment_count, 0), seg.done_count),
         duration_seconds = seg.total_seconds,
         -- 138: lets the notes job tell whether the transcript grew while it
         -- was writing (see lecture-study-kit handleNotes).
         transcript_rev   = transcript_rev + 1,
         updated_at       = now()
   where id = p_lecture_id;

  perform public.lecture_set_parts_missing(p_lecture_id);

  -- Notes written from a shorter transcript are now incomplete.
  --
  -- Until 138 this raised an ops alert asking a human whether to clear them,
  -- because replacing notes a student may have read felt like a judgement call.
  -- The owner made that call on 2026-09-13: refresh them. They are not replaced
  -- blindly — notes_stale asks request_pending_lecture_notes to write new ones,
  -- the old notes stay on screen until the new ones land, and the student gets a
  -- push saying the notes now cover the whole lecture (notify_lecture_notes_ready).
  -- Students cannot edit notes_md, so nothing of theirs is overwritten.
  if had_notes then
    update public.lecture_recordings
       set notes_stale         = true,
           notes_auto_attempts = 0
     where id = p_lecture_id;
  end if;

  return true;
end;
$function$;


-- ── fixture: a lecture missing one part, exactly like 04cd64e7 in miniature ──
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');

insert into public.lecture_recordings (id, user_id, status, transcript, notes_md,
                                       segment_count, notes_auto_attempts, duration_seconds)
values ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111',
        'ready', 'alpha beta', 'some notes', 3, 1, 600);

-- Two parts arrived with words. The third has not.
insert into public.lecture_segments (lecture_id, user_id, seq, status, seconds, transcript) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 0, 'done', 300, 'alpha'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 1, 'done', 300, 'beta');

select public.lecture_set_parts_missing('22222222-2222-2222-2222-222222222222');

do $test$
declare m integer;
begin
  select parts_missing into m from public.lecture_recordings
   where id = '22222222-2222-2222-2222-222222222222';
  if m <> 1 then raise exception 'fixture wrong: expected 1 missing, got %', m; end if;
end
$test$;

-- ── the defect, on 138's code ───────────────────────────────────────────────
-- The third part arrives. It is five minutes of a quiet room, so it is done and
-- its transcript is empty. The words do not change.
insert into public.lecture_segments (lecture_id, user_id, seq, status, seconds, transcript)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 2, 'done', 300, '');

select public.lecture_rebuild_transcript('22222222-2222-2222-2222-222222222222');

do $test$
declare m integer; d integer;
begin
  select parts_missing, duration_seconds into m, d
    from public.lecture_recordings where id = '22222222-2222-2222-2222-222222222222';
  if m <> 1 then
    raise exception 'EXPECTED THE DEFECT: 138 should still report 1 missing, got %', m;
  end if;
  if d <> 600 then
    raise exception 'EXPECTED THE DEFECT: 138 should still report 600s, got %', d;
  end if;
  raise notice 'defect reproduced on 138: parts_missing still 1, duration still 600';
end
$test$;

-- ── apply 140 ───────────────────────────────────────────────────────────────
\ir ../migrations/140_a_part_that_arrives_counts_even_when_it_says_nothing.sql

-- Same silent part, same call, on the new code.
select public.lecture_rebuild_transcript('22222222-2222-2222-2222-222222222222');

do $test$
declare m integer; d integer; rev integer; stale boolean; t text;
begin
  select parts_missing, duration_seconds, transcript_rev, notes_stale, transcript
    into m, d, rev, stale, t
    from public.lecture_recordings where id = '22222222-2222-2222-2222-222222222222';
  if m <> 0 then raise exception '140: expected 0 missing, got %', m; end if;
  if d <> 900 then raise exception '140: expected 900s, got %', d; end if;
  -- Silence must not rewrite the transcript, bump the revision, or ask for new
  -- notes. That is 116's lesson and 140 must not undo it.
  if rev <> 0 then raise exception '140: silence bumped transcript_rev to %', rev; end if;
  if stale then raise exception '140: silence marked the notes stale'; end if;
  if t <> 'alpha beta' then raise exception '140: transcript changed to %', t; end if;
  raise notice '140 ok: missing 0, duration 900, no transcript_rev bump, notes not stale';
end
$test$;

-- ── a part that DOES have words still does everything it used to ────────────
insert into public.lecture_segments (lecture_id, user_id, seq, status, seconds, transcript)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 3, 'done', 120, 'gamma');

update public.lecture_recordings set segment_count = 4
 where id = '22222222-2222-2222-2222-222222222222';

select public.lecture_rebuild_transcript('22222222-2222-2222-2222-222222222222');

do $test$
declare m integer; rev integer; stale boolean; t text; d integer;
begin
  select parts_missing, transcript_rev, notes_stale, transcript, duration_seconds
    into m, rev, stale, t, d
    from public.lecture_recordings where id = '22222222-2222-2222-2222-222222222222';
  if t <> 'alpha beta gamma' then raise exception '140: transcript is %', t; end if;
  if rev <> 1 then raise exception '140: expected transcript_rev 1, got %', rev; end if;
  if not stale then raise exception '140: new words should have marked the notes stale'; end if;
  if m <> 0 then raise exception '140: expected 0 missing, got %', m; end if;
  if d <> 1020 then raise exception '140: expected 1020s, got %', d; end if;
  raise notice '140 ok: real words still rebuild, bump the revision and refresh the notes';
end
$test$;

-- ── calling it again changes nothing ────────────────────────────────────────
select public.lecture_rebuild_transcript('22222222-2222-2222-2222-222222222222');

do $test$
declare rev integer;
begin
  select transcript_rev into rev from public.lecture_recordings
   where id = '22222222-2222-2222-2222-222222222222';
  if rev <> 1 then raise exception '140: a no-op rebuild bumped the revision to %', rev; end if;
  raise notice '140 ok: a second identical rebuild is a no-op';
end
$test$;

-- ── segment_count is never shrunk to what happened to arrive ────────────────
do $test$
declare c integer;
begin
  update public.lecture_recordings set segment_count = 9
   where id = '22222222-2222-2222-2222-222222222222';
  perform public.lecture_rebuild_transcript('22222222-2222-2222-2222-222222222222');
  select segment_count into c from public.lecture_recordings
   where id = '22222222-2222-2222-2222-222222222222';
  if c <> 9 then raise exception '140: declared count shrank to %', c; end if;
  raise notice '140 ok: the phone declaration of 9 survives 3 rows arriving';
end
$test$;
