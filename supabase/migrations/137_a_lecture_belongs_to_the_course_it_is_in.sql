-- ============================================================
-- A LECTURE BELONGS TO THE COURSE IT IS IN
-- ============================================================
-- Lecture notes reach the AI Tutor and the flashcard generator through one
-- copy: lecture-study-kit mirrors notes_md into course_notes (source='lecture',
-- one row per recording) when the notes are generated. That copy was written
-- in exactly one place and kept current by nothing:
--
--   * record without a course, attach one afterwards  → never copied
--   * move a lecture to a different course            → copy stays in the old one
--   * take a lecture out of its course                → copy stays behind
--
-- The first one cost a student on 2026-09-02. Their lecture had 12,000
-- characters of notes, it was attached to a course after they were generated,
-- and "Make flashcards" built from that course's material, which held nothing
-- but syllabus titles. The model found nothing to make cards from and the
-- student was told to try again. The same lecture was invisible to the Tutor.
-- (On 2026-09-13 it was the only lecture in that state; the gap itself is what
-- this closes.)
--
-- The copy is derived data, so the database keeps it true whenever the fact it
-- depends on changes: when course_id changes on a lecture that has notes. This
-- is a trigger rather than app code because a course can be set from the
-- lecture screen, a future web screen, a script or the dashboard, and every
-- one of them would otherwise have to remember.
--
-- What it does, only when course_id actually changes and notes exist:
--   course set or changed → the copy moves to (or is created in) that course,
--                           with the current notes and title
--   course removed        → the copy is removed, because the lecture is no
--                           longer part of any course's material
--
-- The copy row is identical to the one lecture-study-kit writes (same filename
-- shape, mime type, source and source_recording_id), and the insert yields to
-- that function on the existing unique index, so the two can never duplicate.
-- Lectures whose notes are generated after a course is set are still mirrored
-- by lecture-study-kit, unchanged.
--
-- The backfill at the end repairs lectures that already have notes and a
-- course but no copy.
-- ============================================================

create or replace function public.lecture_recordings_sync_course_note()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  note_filename text;
begin
  if new.notes_md is null or btrim(new.notes_md) = '' then
    return new;
  end if;

  if new.course_id is null then
    delete from public.course_notes
     where source_recording_id = new.id
       and source = 'lecture';
    return new;
  end if;

  -- Same shape as mirrorToCourseNotes: `${String(title || 'Lecture').slice(0, 80)} (lecture notes)`.
  note_filename := left(coalesce(nullif(new.title, ''), 'Lecture'), 80) || ' (lecture notes)';

  update public.course_notes
     set course_id      = new.course_id,
         extracted_text = new.notes_md,
         filename       = note_filename
   where source_recording_id = new.id
     and source = 'lecture';

  if not found then
    insert into public.course_notes
      (user_id, course_id, storage_path, filename, mime_type, extracted_text, source, source_recording_id)
    values
      (new.user_id, new.course_id, null, note_filename, 'text/markdown', new.notes_md, 'lecture', new.id)
    on conflict (source_recording_id) where source_recording_id is not null do nothing;
  end if;

  return new;
end;
$$;

comment on function public.lecture_recordings_sync_course_note() is
  'SEMORA (137): keeps the course_notes copy of a lecture''s notes in the course the lecture is in when course_id changes.';

drop trigger if exists lecture_recordings_sync_course_note_trigger on public.lecture_recordings;

-- AFTER, so it runs once lecture_recordings_assert_parent_owner (BEFORE) has
-- already refused a course owned by someone else.
create trigger lecture_recordings_sync_course_note_trigger
  after update of course_id on public.lecture_recordings
  for each row
  when (old.course_id is distinct from new.course_id)
  execute function public.lecture_recordings_sync_course_note();

-- ── backfill ────────────────────────────────────────────────────
insert into public.course_notes
  (user_id, course_id, storage_path, filename, mime_type, extracted_text, source, source_recording_id)
select l.user_id,
       l.course_id,
       null,
       left(coalesce(nullif(l.title, ''), 'Lecture'), 80) || ' (lecture notes)',
       'text/markdown',
       l.notes_md,
       'lecture',
       l.id
  from public.lecture_recordings l
 where l.course_id is not null
   and l.notes_md is not null
   and btrim(l.notes_md) <> ''
   and not exists (
     select 1 from public.course_notes n where n.source_recording_id = l.id
   )
on conflict (source_recording_id) where source_recording_id is not null do nothing;
