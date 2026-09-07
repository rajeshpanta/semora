-- ============================================================
-- MATERIAL A STUDENT SHOWED US ONCE
-- ============================================================
-- A real student photographed nine lecture slides into the tutor on
-- 2026-09-01. The assistant read each one and summarised what was on it, and
-- every practice question that course ever produced came out of those
-- summaries in the twenty minutes that followed. Then the conversation moved
-- on, MAX_HISTORY_TURNS = 12 slid the exchange out of the grounding window,
-- and the course went back to having no material at all. The slides were
-- never stored; only the reply describing them was, in tutor_messages, where
-- nothing but the next few turns can reach it.
--
-- So the material was not lost for want of understanding it. It was
-- understood, at full vision cost, and then left somewhere grounding does not
-- look. This migration lets that understanding be filed where it does.
--
-- WHY course_notes AND NOT A NEW TABLE. It is already the canonical store the
-- tutor grounds on: the notes query filters by course and user with no source
-- filter, so a row landing here is read by the existing path with no second
-- reader, no new join and no change to how S2 exam sessions, S5 course
-- sessions or practice generation find material. It already holds derived
-- text under a source marker — lecture-study-kit mirrors AI-written notes_md
-- with source='lecture'. This is that precedent, applied to the one other
-- place the product already pays to understand a student's material.
--
-- PROVENANCE IS THE POINT OF THE MARKER. source='tutor' says: this text was
-- written by the assistant, describing something the student supplied. It is
-- not their own uploaded document ('upload') and not a lecture recording
-- ('lecture'), and a later reader must be able to tell. The filename carries
-- the same claim in the one place the student and the model both see it,
-- because the grounding chunk header and the citation label are both the
-- filename.
--
-- SEMORA-owned (verify against supabase/SUPABASE_OWNERSHIP.md). Additive.
-- ============================================================

-- ─── a third kind of course material ────────────────────────────
alter table public.course_notes
  drop constraint if exists course_notes_source_check;
alter table public.course_notes
  add constraint course_notes_source_check
  check (source = any (array['upload'::text, 'lecture'::text, 'tutor'::text]));

comment on column public.course_notes.source is
  'SEMORA: upload = the student''s own file · lecture = AI notes from a recording · tutor = the assistant''s description of material the student showed it in a course-scoped chat.';

-- ─── showing the same slide twice is one piece of material ──────
-- Identity is the filename, which carries a short content hash of the image
-- the student sent. Cheap, deterministic, and it needs no similarity
-- infrastructure: the same photo re-sent produces the same hash and is
-- refused, while a genuinely different slide is a different row.
--
-- Partial, so nothing about uploads or lecture notes changes — those may
-- legitimately repeat a filename and always could.
create unique index if not exists course_notes_tutor_source_identity
  on public.course_notes (user_id, course_id, filename)
  where source = 'tutor';
