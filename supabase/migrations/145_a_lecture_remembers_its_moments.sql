-- 145: a lecture remembers its moments.
--
-- Two additions for Record Lecture (plan Phase 4.2 and 4.4). Both are purely
-- additive: new nullable columns and one new function. Nothing existing reads
-- them, so every older app and every other feature behaves exactly as before.
--
-- 1. lecture_segments.timings — when each sentence in a part was said.
--    Whisper returns start/end times for every piece of text; they used to be
--    thrown away. lecture-transcribe now keeps the pieces that survived the
--    silence filter as [[start, end, "text"], ...], seconds from the start of
--    the part. The app turns them into a timestamped transcript. Written only by
--    the server; a phone inserting a part cannot set them.
--
-- 2. lecture_recordings.important_marks — moments the student tapped
--    "Mark important" while recording, in seconds of captured audio. The notes
--    writer finds what was being said at each mark and makes sure it is in the
--    notes, flagged; the quiz writer makes sure each flagged point is tested.
--    Set only through lecture_add_important_marks, which checks the owner.
--
-- NULLABLE ON PURPOSE: lecture_recordings_client_columns builds a document
-- note's row from nothing (jsonb_populate_record(null, ...)), where column
-- defaults do not apply, so a NOT NULL column here would break document notes.

alter table public.lecture_segments
  add column if not exists timings jsonb;

alter table public.lecture_recordings
  add column if not exists important_marks integer[];

-- ── what the phone may write on a part (142's guard + timings) ──
create or replace function public.lecture_segments_client_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- uploadSegment: a part the phone is about to upload.
    new.status                    := 'pending';
    new.transcript                := null;
    new.claimed_at                := null;
    new.recovery_attempts         := 0;
    new.dispatched_at             := null;
    -- 142: server-measured facts start empty.
    new.speech_seconds            := null;
    new.dropped_segments          := null;
    new.provider_failures         := 0;
    new.first_provider_failure_at := null;
    new.detected_language         := null;
    -- 145
    new.timings                   := null;
    return new;
  end if;

  -- Once the server has claimed or finished a part it is the server's. A retry
  -- that upserts the same part again succeeds and changes nothing.
  if old.status in ('transcribing', 'done') then
    return old;
  end if;

  -- Otherwise the phone may (re)describe the upload and move it between
  -- 'pending' and 'uploaded' — including a failed part it is retrying.
  -- jsonb_populate_record(old, ...) keeps every column not listed here.
  return jsonb_populate_record(
    old,
    jsonb_build_object(
      'seconds',      new.seconds,
      'storage_path', new.storage_path,
      'has_gap',      new.has_gap,
      'status',
        case when new.status in ('pending', 'uploaded') then new.status else old.status end
    )
  );
end;
$$;

-- ── Mark important ──────────────────────────────────────────────
-- Merges the phone's marks into the lecture's. Idempotent: the phone resends
-- every mark it has until one call succeeds (a classroom is often offline), and
-- marks closer than 10 seconds to an earlier one are the same moment. At most
-- 200 marks, each within the longest possible recording.
create or replace function public.lecture_add_important_marks(p_lecture_id uuid, p_seconds integer[])
returns integer[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  merged integer[] := '{}';
  last_kept integer := null;
  s integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  perform 1 from public.lecture_recordings
  where id = p_lecture_id and user_id = auth.uid() and source = 'recording'
  for update;
  if not found then
    return null;
  end if;

  for s in
    select distinct v
    from unnest(coalesce((select important_marks from public.lecture_recordings where id = p_lecture_id), '{}')
                || coalesce(p_seconds, '{}')) as v
    where v is not null and v between 0 and 4 * 60 * 60
    order by v
  loop
    if last_kept is null or s - last_kept >= 10 then
      merged := merged || s;
      last_kept := s;
    end if;
    exit when cardinality(merged) >= 200;
  end loop;

  update public.lecture_recordings set important_marks = merged where id = p_lecture_id;
  return merged;
end;
$$;

revoke all on function public.lecture_add_important_marks(uuid, integer[]) from public, anon;
grant execute on function public.lecture_add_important_marks(uuid, integer[]) to authenticated, service_role;
