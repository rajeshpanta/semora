-- A scan that found nothing should not cost the only thing you get.
--
-- A free account has ONE AI action for its lifetime: one syllabus scan or one
-- lecture recording. It is spent when the scan RUNS, not when it works, and
-- that is deliberate — charging on success would let anyone extract forever by
-- never saving. The cost of that choice is now measurable: 78 free students
-- have a successful scan on record and zero tasks to show for it, and not one
-- of them had a parse that accepted a single item. Sixty-two got an extraction
-- that found nothing; sixteen have no parse behind the scan at all. They paid
-- their one shot for an outcome Semora failed to produce, and the app's answer
-- was that they had used their go.
--
-- So the ledger gains a fourth state. A scan that produced nothing is refunded:
-- the account may scan once more. Capped at ONE refund per account for its
-- lifetime, which is what keeps this from becoming unlimited free extraction
-- for anyone willing to photograph a blank page.
--
-- Nothing is deleted. The scan row stays exactly where it is with its status
-- changed, so the history of what happened is intact and a refund is visible
-- rather than inferred from an absence.

-- ── 1. The fourth state ────────────────────────────────────────────────────
alter table public.scan_usage_log drop constraint if exists scan_usage_log_status_check;
alter table public.scan_usage_log add constraint scan_usage_log_status_check
  check (status = any (array['success'::text, 'failed'::text, 'zero_dated'::text, 'refunded'::text]));

alter table public.scan_usage_log add column if not exists refunded_at timestamptz;

-- The cap, enforced by the database rather than by the job's own care. One
-- refunded row per account, ever, however many times the job runs and whatever
-- a future caller does.
create unique index if not exists scan_usage_log_one_refund_per_user
  on public.scan_usage_log (user_id)
  where status = 'refunded';

comment on column public.scan_usage_log.refunded_at is
  'Set by refund_empty_scans() when a scan produced nothing and the free action was returned. One per account, enforced by scan_usage_log_one_refund_per_user.';

-- ── 2. Giving it back ──────────────────────────────────────────────────────
--
-- Two things hold the free action down and BOTH have to be released, or the
-- refund is cosmetic:
--
--   * `scan_usage_log.status = 'success'`, which free_action_used() reads;
--   * `syllabus_uploads.counts_toward_free_action`, which the insert trigger
--     enforce_free_scan_limit() counts — this is the one that actually refuses
--     the next upload, so a refund that forgot it would tell the student they
--     have a scan and then refuse it.
--
-- Who qualifies, deliberately narrow:
--   * free right now (a Pro account has nothing to refund);
--   * has never been refunded before (the cap, checked here as well as by the
--     index, so the job skips rather than errors);
--   * every upload they have made produced NO accepted items — the account got
--     nothing at all, not merely less than it hoped for;
--   * the scan is at least 15 minutes old, so a parse still running is never
--     mistaken for one that failed;
--   * a lecture was not what spent the action (that is a different ledger and
--     a different failure; refunding a scan would not restore it).
create or replace function public.refund_empty_scans(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  refunded integer := 0;
  candidate record;
begin
  for candidate in
    select s.user_id, max(s.created_at) as last_scan_at
    from public.scan_usage_log s
    where s.status = 'success'
      and s.created_at < now() - interval '15 minutes'
      and not public.is_pro(s.user_id)
      -- never twice
      and not exists (
        select 1 from public.scan_usage_log r
        where r.user_id = s.user_id and r.status = 'refunded'
      )
      -- a lecture, not a scan, spent this account's action
      and not exists (
        select 1 from public.lecture_usage_log l
        where l.user_id = s.user_id and l.status = 'success'
      )
      -- nothing was ever extracted for them
      and not exists (
        select 1 from public.parse_runs p
        where p.user_id = s.user_id and coalesce(p.items_accepted, 0) > 0
      )
    group by s.user_id
    order by max(s.created_at) desc
    limit greatest(p_limit, 0)
  loop
    -- The most recent spent scan is the one refunded, so the refund lines up
    -- with the attempt the student remembers.
    update public.scan_usage_log
       set status = 'refunded', refunded_at = now()
     where id = (
       select id from public.scan_usage_log
       where user_id = candidate.user_id and status = 'success'
       order by created_at desc
       limit 1
     );

    -- Release the trigger's count. Only uploads that produced nothing: an
    -- account that later gets a good scan must still be held by that one.
    update public.syllabus_uploads up
       set counts_toward_free_action = false
     where up.user_id = candidate.user_id
       and up.counts_toward_free_action
       and not exists (
         select 1 from public.parse_runs p
         where p.upload_id = up.id and coalesce(p.items_accepted, 0) > 0
       );

    refunded := refunded + 1;
  end loop;

  return refunded;
end;
$$;

revoke all on function public.refund_empty_scans(integer) from public, anon, authenticated;

comment on function public.refund_empty_scans(integer) is
  'Hourly. Returns the free AI action to accounts whose scan produced nothing. One refund per account for life; deletes nothing.';

-- ── 3. Hourly, on a free minute ────────────────────────────────────────────
-- :37 — clear of the lecture health check (:17), the lapse watch (:23), the
-- LMS syncs (:02/:17/:32/:47) and audio retention (:08/:28/:48).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('semora-refund-empty-scans')
      where exists (select 1 from cron.job where jobname = 'semora-refund-empty-scans');
    perform cron.schedule(
      'semora-refund-empty-scans',
      '37 * * * *',
      'select public.refund_empty_scans(200);'
    );
  end if;
end;
$$;
