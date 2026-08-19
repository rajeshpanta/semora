-- ============================================================
-- SEMORA: LET CLIENTS CREATE DOCUMENT-SOURCED NOTES
-- ============================================================
-- 072 built "notes from a file" on `lecture_recordings`, with the client
-- inserting the row (lib/lectures.ts useCreateDocumentNote). But 066 had
-- already dropped the blanket `for all` policy and deliberately left INSERT
-- out, so that insert has never been permitted: every upload gets as far as
-- extracting the text and then dies on
--
--   new row violates row-level security policy for table "lecture_recordings"
--
-- i.e. the whole feature is unusable, for every user, on every file. 072 added
-- the `source` column but no policy to go with it.
--
-- ─── Why a policy and not an edge function ───
-- 066 withheld INSERT because minting a RECORDING must stay behind
-- lecture-transcribe, where the entitlement and the per-day seconds cap are
-- enforced. None of that applies to a document: there is no audio, it reserves
-- no lecture capacity, and the text was already extracted server-side during
-- the upload. The expensive half — turning the transcript into notes, a quiz
-- or a deck — still runs in lecture-study-kit, which charges the free AI action
-- and refuses a free account. So the narrow grant below costs nothing that
-- wasn't already gated, while routing it through a function would add a
-- network hop to move text the client just wrote to a table it already owns.
--
-- The check is deliberately tight:
--   * own rows only, matching every other policy on this table;
--   * source = 'document', so this cannot be used to mint a recording and
--     bypass the quota — that path stays service-role only;
--   * no audio accounting, so a forged row cannot inflate or consume the
--     lecture seconds ledger.
-- ============================================================

drop policy if exists "own_document_notes_insert" on public.lecture_recordings;
create policy "own_document_notes_insert" on public.lecture_recordings
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and source = 'document'
    and coalesce(duration_seconds, 0) = 0
    and coalesce(segment_count, 0) = 0
  );

comment on policy "own_document_notes_insert" on public.lecture_recordings is
  'SEMORA (075): clients may create their own document-sourced notes only. Recordings remain service-role-only so lecture-transcribe stays the single quota gate.';
