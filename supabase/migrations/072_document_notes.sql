-- ============================================================
-- SEMORA DOCUMENT-SOURCED NOTES
-- ============================================================
-- A student can now hand Semora a PDF, a photo of a whiteboard, a slide deck
-- or a Word file and get the same study material a recorded lecture produces:
-- structured notes, a quiz, a flashcard deck.
--
-- ─── Why this is not a new table ───
-- `lecture_recordings` already models exactly this: a title, a body of source
-- text (`transcript`), generated `notes_md`, a `quiz`, and a `deck_id` (070).
-- Everything downstream — the notes screen, the quiz player, the flashcard
-- generator, assigning it to a class — reads that shape. A parallel
-- `document_notes` table would have meant a second copy of all of it, and a
-- student would have had two lists to look through to find one set of notes.
--
-- So a document produces a `lecture_recordings` row whose `transcript` is the
-- text extracted from the file instead of from audio. `duration_seconds` and
-- `segment_count` default to 0, which is already true of a row with no audio,
-- and lecture-study-kit reads `transcript` off the row without caring where it
-- came from. No generation code changes.
--
-- The user-facing word for all of this becomes "Notes", not "Lectures": the
-- feature is no longer only about lectures, and the course screen says so.
-- ============================================================

alter table public.lecture_recordings
  add column if not exists source text not null default 'recording'
    check (source in ('recording', 'document'));

-- The original filename, kept for display. `title` is editable by the student
-- and defaults to the filename, so after a rename there would otherwise be no
-- record of which upload a set of notes came from.
alter table public.lecture_recordings
  add column if not exists source_filename text;

comment on column public.lecture_recordings.source is
  'SEMORA (072): where the transcript came from — ''recording'' (audio, the original path) or ''document'' (text extracted from an uploaded file).';

comment on column public.lecture_recordings.source_filename is
  'SEMORA (072): original filename for a document-sourced note. Display only; title is what the student edits.';

-- Existing rows are all audio. The DEFAULT already covers them, but stating it
-- makes the backfill explicit rather than implied by column defaults.
update public.lecture_recordings set source = 'recording' where source is null;

-- The Notes list filters by course and orders by recency regardless of source,
-- which the existing lecture_recordings_course_created_idx already serves.
-- Deliberately no index on `source`: it is displayed, never filtered on.
