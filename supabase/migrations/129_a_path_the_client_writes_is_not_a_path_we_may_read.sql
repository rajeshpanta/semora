-- ============================================================
-- SEMORA: A PATH THE CLIENT WRITES IS NOT A PATH WE MAY READ
-- ============================================================
-- Two defects found in the 2026-09-05 Tutor audit, both in the same table's
-- neighbourhood, both about trusting a value the client supplied.
--
-- ─── 1. course_notes.storage_path is unvalidated ────────────
-- The storage bucket is correctly locked down: every policy on
-- storage.objects for 'course-notes' requires
-- `auth.uid()::text = (storage.foldername(name))[1]` (025), so a client
-- cannot UPLOAD outside its own folder.
--
-- But `course_notes.storage_path` is a plain text column written by the
-- client (lib/tutor.ts:862), and nothing checks it:
--
--   the RLS policy `own_course_notes` constrains user_id, and only user_id
--   the trigger course_notes_assert_parent_owner validates course_id, and
--     only course_id
--   extractNoteText downloads that path with the SERVICE ROLE
--     (tutor-chat/index.ts:1547), which bypasses storage RLS by design
--
-- So a crafted client can insert a row with its own user_id, its own
-- course_id, and `storage_path = '<other-uid>/1699_notes.pdf'`. Both guards
-- pass. The Tutor then extracts that file and grounds an answer on another
-- student's private coursework.
--
-- Measured before writing this: 37 course_notes rows, 7 with a storage_path,
-- ZERO with a mismatched prefix. The hole is real and has not been used.
--
-- The fix belongs here rather than only in the edge function because the
-- column is the thing that is wrong. A check in one download site protects
-- that site; a constraint on the row protects every reader that will ever
-- exist — and this codebase already learned that lesson with the LMS removal
-- guard in 119, which was moved out of the edge function for exactly this
-- reason.
--
-- NULL is allowed and must stay allowed: a lecture-mirrored note carries its
-- text directly and has no object behind it (30 of the 37 rows today).
--
-- ─── 2. Every tutor message shares its sibling's timestamp ──
-- persistTurns writes the user turn and the assistant turn in ONE insert
-- (tutor-chat/index.ts:1240), so `default now()` — which is
-- transaction_timestamp() — returns a byte-identical value for both rows.
-- Both readers then order on created_at alone (lib/tutor.ts:414 ascending for
-- the transcript, index.ts:904 descending for the history window).
--
-- Measured: 168 of 168 message rows are in a tie. 84 groups, every one of
-- them exactly one user row and one assistant row. Transcript order is
-- currently decided by whatever the planner happens to return, and the
-- history sent to the model has the same exposure.
--
-- clock_timestamp() is the minimal correct fix: it is VOLATILE, so a
-- multi-row insert evaluates it per row and the two turns land microseconds
-- apart in write order. Nothing else changes — no new column, no reader
-- rewrite, no index change. The existing (conversation_id, created_at) index
-- keeps working and becomes actually unique in practice.
--
-- The backfill below repairs the 84 existing pairs the same way. It is safe
-- precisely because the shape was verified first: every tie is exactly one
-- user and one assistant, so nudging the assistant forward one microsecond
-- cannot reorder anything relative to a neighbouring turn seconds away.
-- ============================================================

-- ─── 1. The path must live under its owner's folder ─────────
create or replace function public.course_notes_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_user uuid;
begin
  parent_user := public.parent_row_user_id('public.courses'::regclass, new.course_id);
  if parent_user is null then
    raise exception 'Referenced course does not exist'
      using errcode = '23503';
  end if;
  if parent_user <> new.user_id then
    raise exception 'Cross-tenant write blocked: course note cannot reference a course owned by another user'
      using errcode = '42501';
  end if;

  -- The path is client-supplied and is later handed to a service-role
  -- download that does not consult storage RLS. The bucket's own policies
  -- already require this exact prefix on upload; this makes the row agree
  -- with the object it claims to point at.
  --
  -- NULL stays legal: a lecture-mirrored note has its text inline and no
  -- object at all.
  if new.storage_path is not null
     and new.storage_path <> ''
     and left(new.storage_path, length(new.user_id::text) + 1) <> new.user_id::text || '/' then
    raise exception 'Cross-tenant write blocked: course note storage_path must live under the owner''s folder'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.course_notes_assert_parent_owner() is
  'SEMORA (025, extended in 129): a course note must reference a course the '
  'same user owns AND a storage_path under that user''s own folder. The path '
  'half exists because extractNoteText downloads it with the service role, '
  'which bypasses storage RLS — without this, a client could point a row it '
  'legitimately owns at another student''s file.';

-- The trigger has to fire when storage_path changes, not only course_id/user_id.
drop trigger if exists course_notes_assert_parent_owner_trigger on public.course_notes;
create trigger course_notes_assert_parent_owner_trigger
  before insert or update of course_id, user_id, storage_path on public.course_notes
  for each row execute function public.course_notes_assert_parent_owner();

-- ─── 2. Two turns, two timestamps ───────────────────────────
alter table public.tutor_messages
  alter column created_at set default clock_timestamp();

comment on column public.tutor_messages.created_at is
  'SEMORA (025, default changed in 129): clock_timestamp(), NOT now(). '
  'persistTurns inserts the user and assistant rows in one statement, and '
  'now() is transaction_timestamp() — identical for both — which left every '
  'message pair tied and transcript order up to the planner. clock_timestamp() '
  'is volatile, so each row of a multi-row insert gets its own value.';

-- Repair the pairs written before the default changed. Verified beforehand:
-- every tie is exactly one user row and one assistant row, so this cannot
-- reorder anything except the two rows it is meant to separate.
update public.tutor_messages m
   set created_at = m.created_at + interval '1 microsecond'
 where m.role = 'assistant'
   and exists (
     select 1 from public.tutor_messages peer
     where peer.conversation_id = m.conversation_id
       and peer.created_at = m.created_at
       and peer.role = 'user'
   );
