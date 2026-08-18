-- ============================================================
-- SEMORA UNIFIED FREE ACTION
-- ============================================================
-- The free tier becomes ONE AI action for the lifetime of the account:
-- either a syllabus scan or a lecture recording, whichever the student
-- reaches for first. After that, the paywall.
--
-- This replaces two separate allowances that never knew about each other:
--   • 5 syllabus scans per calendar month (009 trigger, 044 rewrite)
--   • 1 lecture recording, lifetime  (065 lecture_usage_log)
--
-- ─── Why a new ledger instead of counting syllabus_uploads ───
-- The old trigger counted rows in `syllabus_uploads`, which the user can
-- delete. 065 already documented the hole this leaves:
--
--   "the user can delete their own rows, so delete-and-retry mints
--    unlimited free lectures"
--
-- At five scans a month that hole was mostly theoretical — few people will
-- delete a syllabus to earn a sixth scan. At ONE lifetime scan it becomes the
-- obvious move, and the paywall stops meaning anything. So scans move onto the
-- same footing lectures already have: a service-role-only ledger the user
-- cannot reach, written when the cost is actually incurred.
--
-- ─── One source of truth ───
-- Four layers gate this (client pre-check, parse-syllabus, lecture-transcribe,
-- and the DB trigger). 044's own comment warned what happens when they drift:
-- "the three layers disagree and the user is either blocked early or bypasses
-- the cap." Rather than repeat one rule in four places, they all now call
-- free_action_used(). The rule lives here, once.
-- ============================================================

-- ─── Known gap, accepted ────────────────────────────────────────
-- A lecture is charged at FINALIZATION, not at start (065: the cost is spent
-- when audio is transcribed). So a student who starts a recording and then
-- scans a syllabus before that recording finishes can spend both halves: at
-- scan time no lecture is charged yet, and at finalization lecture-transcribe
-- deliberately refuses to fail a recording that already exists.
--
-- Left open on purpose. Closing it means either reserving the free action at
-- record-start — which then has to be released on every abandon, crash and
-- backgrounded app, or the student loses their action to a recording they
-- never made — or refusing to transcribe audio already captured, which this
-- codebase treats as the worst possible failure. A narrow race that costs one
-- extra free action is cheaper than either.

-- ─── scan_usage_log — the scan half of the free action ──────────
-- Mirrors lecture_usage_log deliberately: same shape, same lockdown, same
-- reason. `upload_id` is nullable and carries no foreign key ON PURPOSE — the
-- ledger must outlive the artifact. A row here means "this account spent its
-- free action", and deleting the syllabus must not erase that fact.
create table if not exists public.scan_usage_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  upload_id  uuid,
  status     text not null check (status in ('success', 'failed')),
  error_code text,
  created_at timestamptz not null default now()
);

create index if not exists scan_usage_log_user_created_idx
  on public.scan_usage_log (user_id, created_at desc);
-- Partial index for the hot question: "has this account ever completed a scan?"
create index if not exists scan_usage_log_user_success_idx
  on public.scan_usage_log (user_id) where status = 'success';

comment on table public.scan_usage_log is
  'SEMORA (071): free-scan quota ledger. Service-role writes only — counting the user-deletable syllabus_uploads let delete-and-retry reset the quota.';

alter table public.scan_usage_log enable row level security;
revoke all on public.scan_usage_log from public, anon, authenticated;

-- ─── Backfill ───────────────────────────────────────────────────
-- Without this, shipping the change would hand a brand-new free action to
-- every existing free user, including those who already used all five scans.
-- One row per account that has ever uploaded a syllabus, stamped with their
-- first upload so the ledger reads truthfully rather than claiming they all
-- scanned the day of the migration.
--
-- Counts syllabus_uploads even though it is deletable: a row that survives is
-- proof the action happened, and anyone who already deleted theirs is
-- indistinguishable from someone who never scanned. Erring toward the user is
-- the right side to err on for a one-time backfill.
-- The NOT EXISTS guard, not ON CONFLICT: this table has no unique constraint
-- on user_id (a Pro user accumulates many rows), so ON CONFLICT would have
-- been a silent no-op and a re-run would have doubled every backfilled row.
insert into public.scan_usage_log (user_id, status, created_at)
select u.user_id, 'success', min(u.created_at)
from public.syllabus_uploads u
where not exists (
  select 1 from public.scan_usage_log s where s.user_id = u.user_id
)
group by u.user_id;

-- ─── free_action_used — the single rule ─────────────────────────
-- True once the account has spent its one free action, on either side.
-- Reads both ledgers rather than merging them: lecture_usage_log carries
-- audio_seconds and daily-capacity reconciliation that has nothing to do with
-- the free tier, and folding it into a shared table would have meant rewriting
-- lecture-transcribe's charging path for no gain.
--
-- STABLE, not VOLATILE, so the trigger and the edge functions can call it
-- without forcing a re-plan per row.
create or replace function public.free_action_used(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.lecture_usage_log
    where user_id = uid and status = 'success'
  ) or exists (
    select 1 from public.scan_usage_log
    where user_id = uid and status = 'success'
  ) or exists (
    -- syllabus_uploads is included even though it is user-deletable, and it
    -- weakens nothing: scan_usage_log still holds the durable record, so
    -- delete-and-rescan is refused on the ledger regardless. This OR only ever
    -- ADDS reasons to consider the action spent.
    --
    -- It exists because parse-syllabus logs a failed charge and carries on
    -- rather than taking the student's finished extraction away. Without this
    -- clause, that swallowed failure leaves an upload with no ledger row: the
    -- app would keep promising a free action while the trigger — which counts
    -- prior uploads — refuses every scan. Reading both sources keeps the
    -- answer the user is shown and the answer the database enforces identical.
    --
    -- Safe against the ordering hazard documented on the trigger below: every
    -- caller of this function runs BEFORE the upload row for the scan in
    -- flight is inserted. The trigger, which runs after, deliberately does not
    -- call this.
    select 1 from public.syllabus_uploads where user_id = uid
  );
$$;

revoke all on function public.free_action_used(uuid) from public, anon, authenticated;
grant execute on function public.free_action_used(uuid) to service_role;

-- The client needs this same answer to decide whether to show the paywall
-- BEFORE opening a camera or a microphone. It gets a no-argument version
-- pinned to auth.uid(), so a signed-in user can ask about themselves and
-- cannot ask about anyone else.
create or replace function public.my_free_action_used()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.free_action_used(auth.uid());
$$;

revoke all on function public.my_free_action_used() from public, anon;
grant execute on function public.my_free_action_used() to authenticated;

comment on function public.my_free_action_used() is
  'SEMORA (071): has the caller spent their one free AI action (scan or lecture)? Pro is NOT considered here — callers check is_pro separately.';

-- ─── Retire the monthly scan cap ────────────────────────────────
-- Same trigger, same P0001 errcode. The errcode matters more than the wording:
-- builds already in the App Store detect a quota refusal with
-- `err.code === 'P0001'` and show their own upgrade prompt, so shipping this
-- ahead of a matching binary degrades to the right behaviour instead of a raw
-- Postgres error. The message is written to read correctly in those older
-- builds too, which print it verbatim.
-- ORDERING HAZARD, and why this does NOT call free_action_used().
--
-- A scan runs in this order:
--   1. parse-syllabus extracts, succeeds, and CHARGES scan_usage_log
--   2. the client then inserts the syllabus_uploads row
--   3. this trigger fires
--
-- By step 3 the ledger already records the scan happening right now, so
-- free_action_used() is true on a student's very FIRST scan. Calling it here
-- would charge them and then reject the upload — the one path that must always
-- work. So this asks a different question: has a PREVIOUS action been spent?
-- A prior syllabus_uploads row, or any charged lecture.
--
-- That makes this trigger deletable-table-based again, which is exactly the
-- weakness 065 called out — and it is fine here, because this is no longer the
-- gate. parse-syllabus checks the undeletable ledger BEFORE doing any AI work,
-- so delete-and-rescan is refused there and never reaches this insert. This is
-- a cheap backstop against a client that skips the edge function, not the wall.
create or replace function public.enforce_free_scan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_uploads integer;
  lecture_used  boolean;
begin
  if public.is_pro(new.user_id) then
    return new;
  end if;

  select count(*) into prior_uploads
  from public.syllabus_uploads
  where user_id = new.user_id;

  select exists (
    select 1 from public.lecture_usage_log
    where user_id = new.user_id and status = 'success'
  ) into lecture_used;

  if prior_uploads >= 1 or lecture_used then
    raise exception 'You''ve used your free scan. Upgrade to Pro for unlimited syllabus scanning and lecture recordings.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.enforce_free_scan_limit() is
  'SEMORA (071): blocks a syllabus upload once the account has spent its one free action. Name kept for the existing trigger; the rule now lives in free_action_used().';
