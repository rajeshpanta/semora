-- One-time courtesy when a syllabus parse finds no dates at all.
--
-- WHY.
-- The free tier is one AI action per account, spent the moment a real syllabus
-- is extracted. That is the right rule when the student gets deadlines out of
-- it. On 2026-08-26 four free accounts spent theirs on scans that returned
-- assignments with NO dates: `tasks.due_date` is NOT NULL, so not one of those
-- items could be saved, and all four students left within minutes holding an
-- empty course and no remaining free action.
--
-- WHY EXACTLY ONE.
-- Measured, not guessed. Of 185 accounts that have ever parsed a syllabus, 47
-- hit a zero-dated result — and only 5 ever hit a second one. All 47 first
-- occurrences, versus 12 repeats in the app's entire history; every zero-dated
-- parse in the last 24 hours was that account's first. One courtesy covers the
-- whole measured fairness case. Two or three would buy coverage for a handful
-- of accounts while multiplying what an attacker gets per sign-up.
--
-- WHY IT IS NOT DECIDED BY THE CLIENT.
-- The condition is "the extraction returned zero dated items", which only the
-- server sees. It deliberately does NOT depend on whether the student pressed
-- Save or abandoned the review: both are user-controlled, and a refund keyed to
-- them would be farmable by opening the review and walking away.
--
-- THE TWO ENFORCEMENT POINTS MUST AGREE.
-- free_action_used() answers the app, and enforce_free_scan_limit() refuses the
-- insert. Migration 071 exists because an earlier design let those drift. Both
-- are updated here to read the same new column, so a courtesy upload is
-- invisible to both or to neither.

begin;

-- ── 1. A third ledger state ────────────────────────────────────────────────
-- 'zero_dated' means: AI compute was spent, a real syllabus came back, and it
-- contained nothing this app could turn into a task. Distinct from 'failed'
-- (the parse itself broke) and from 'success' (the account was charged).
alter table public.scan_usage_log
  drop constraint if exists scan_usage_log_status_check;
alter table public.scan_usage_log
  add constraint scan_usage_log_status_check
  check (status in ('success', 'failed', 'zero_dated'));

-- The courtesy is one per account, and the DATABASE is what guarantees it.
-- Two zero-dated parses landing at the same instant both try to insert this
-- row; exactly one can succeed, and record_scan_usage below charges the other
-- normally. No application-level check could make that promise.
create unique index if not exists scan_usage_log_one_courtesy_per_user
  on public.scan_usage_log (user_id)
  where status = 'zero_dated';

-- ── 2. Uploads that must not spend the free action ─────────────────────────
-- Defaults to true, so every row written before this migration keeps counting
-- exactly as it did. No existing account's quota state changes.
alter table public.syllabus_uploads
  add column if not exists counts_toward_free_action boolean not null default true;

comment on column public.syllabus_uploads.counts_toward_free_action is
  'SEMORA (104): false only for the upload attached to an account''s one-time '
  'zero-dated courtesy. Set by claim_zero_dated_courtesy(), never by a client.';

-- ── 3. Charging decision, made atomically ──────────────────────────────────
create or replace function public.record_scan_usage(
  p_user_id uuid,
  p_zero_dated boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Pro accounts have no free action to preserve, so there is nothing to
  -- excuse and their ledger keeps its existing shape.
  if p_zero_dated and not public.is_pro(p_user_id) then
    begin
      insert into public.scan_usage_log (user_id, status)
      values (p_user_id, 'zero_dated');
      return 'zero_dated';
    exception when unique_violation then
      -- This account has already had its courtesy. Fall through and charge.
      null;
    end;
  end if;

  insert into public.scan_usage_log (user_id, status)
  values (p_user_id, 'success');
  return 'success';
end;
$$;

revoke all on function public.record_scan_usage(uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_scan_usage(uuid, boolean) to service_role;

comment on function public.record_scan_usage(uuid, boolean) is
  'SEMORA (104): records a successful syllabus parse against the free-action '
  'ledger. Grants the account''s one-time zero-dated courtesy when the '
  'extraction produced no dated items; the unique partial index makes that '
  'grant race-safe. Returns the status actually written.';

-- ── 4. The upload claims the courtesy ──────────────────────────────────────
-- parse-syllabus writes the ledger row before any upload row exists, so the
-- courtesy is attached here, by the first upload that follows it. Naming
-- matters: BEFORE-row triggers fire in alphabetical order, and
-- 'claim_...' sorts before 'enforce_free_scan_limit_trigger', so the flag is
-- set before the limit is checked.
create or replace function public.claim_zero_dated_courtesy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  if public.is_pro(new.user_id) then
    return new;
  end if;

  -- SKIP LOCKED so two uploads racing for one courtesy cannot both take it:
  -- the loser sees no row and its upload counts normally.
  select id into claimed_id
    from public.scan_usage_log
   where user_id = new.user_id
     and status = 'zero_dated'
     and upload_id is null
   order by created_at
   for update skip locked
   limit 1;

  if claimed_id is not null then
    update public.scan_usage_log
       set upload_id = new.id
     where id = claimed_id;
    new.counts_toward_free_action := false;
  end if;

  return new;
end;
$$;

drop trigger if exists claim_zero_dated_courtesy_trigger on public.syllabus_uploads;
create trigger claim_zero_dated_courtesy_trigger
  before insert on public.syllabus_uploads
  for each row execute function public.claim_zero_dated_courtesy();

-- ── 5. Both enforcement points read the new column ─────────────────────────
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
    -- 'zero_dated' rows are deliberately NOT counted: that is the courtesy.
    select 1 from public.scan_usage_log
    where user_id = uid and status = 'success'
  ) or exists (
    -- Unchanged in purpose (see 071): this clause keeps the answer the user is
    -- shown identical to the answer the trigger enforces, including when the
    -- ledger insert failed and was swallowed. It now skips the one upload
    -- attached to the courtesy, exactly as enforce_free_scan_limit() does.
    select 1 from public.syllabus_uploads
    where user_id = uid and counts_toward_free_action
  );
$$;

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

  -- Counts only uploads that spent the free action, so the courtesy upload
  -- does not lock the account out of the scan it is meant to make possible.
  select count(*) into prior_uploads
  from public.syllabus_uploads
  where user_id = new.user_id
    and counts_toward_free_action;

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

commit;
