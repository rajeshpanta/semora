-- A site check is bounded, and a run says what it skipped
--
-- MOODLE_PLAN.md Phase 2.1. Two additive pieces, both for the Moodle work.
--
-- 1. The Moodle connect flow asks Semora's server "is this address a Moodle?"
--    before sending the student to a browser. That is a fetch to a host the
--    STUDENT named, which means without a bound it is a scanner with Semora's
--    IP on it. Thirty per user per hour is far above what any real setup needs
--    (a student types their school once, maybe twice) and far below anything
--    useful for probing a range.
--
-- 2. `lms_sync_runs.summary` carries the counts a run wants to explain rather
--    than just total. The first use is the Moodle token lane's `undated` count:
--    Moodle creates no calendar event for an assignment with no due date, so
--    those rows would otherwise sit in a permanent 'partial' status with
--    nothing to show for it.
--
-- Additive and idempotent: one new table, one new function, one nullable
-- column, one cron entry. No data is changed. Nothing here is read by any
-- client that exists today.

-- ── the probe bound ─────────────────────────────────────────────────────────

create table if not exists public.lms_probe_attempts (
  id      bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The host the student typed, for the launch-watch readout. Never the URL,
  -- and never anything the site returned.
  host    text not null,
  at      timestamptz not null default now()
);

create index if not exists lms_probe_attempts_user_at_idx
  on public.lms_probe_attempts (user_id, at desc);

comment on table public.lms_probe_attempts is
  'SEMORA (151): one row per "is this a Moodle?" check, so the check can be rate limited per user. Purged after 7 days by purge_lms_probe_attempts().';

alter table public.lms_probe_attempts enable row level security;
-- No policy on purpose: only the service role touches this, exactly like
-- lms_sync_credentials (053).
revoke all on public.lms_probe_attempts from anon, authenticated;

create or replace function public.note_lms_probe(p_user_id uuid, p_host text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent integer;
begin
  select count(*) into recent
  from public.lms_probe_attempts
  where user_id = p_user_id
    and at > now() - interval '1 hour';

  if recent >= 30 then
    -- P0001, so the edge function can answer 429 with a bounded code rather
    -- than leaking a database message to the student.
    raise exception 'probe_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.lms_probe_attempts (user_id, host)
  values (p_user_id, left(btrim(coalesce(p_host, '')), 253));
end;
$$;

revoke all on function public.note_lms_probe(uuid, text) from public, anon, authenticated;
grant execute on function public.note_lms_probe(uuid, text) to service_role;

comment on function public.note_lms_probe(uuid, text) is
  'SEMORA (151): records a site check and refuses past 30 per user per hour, so Semora''s server cannot be turned into a host scanner.';

-- Bounded for ever, in the pattern of purge_lms_sync_runs (106). A diagnostic
-- table that only grows is a table that eventually matters for the wrong reason.
create or replace function public.purge_lms_probe_attempts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  delete from public.lms_probe_attempts where at < now() - interval '7 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.purge_lms_probe_attempts() from public, anon, authenticated;
grant execute on function public.purge_lms_probe_attempts() to service_role;

-- Alongside the existing purge, not on its own schedule.
select cron.schedule(
  'semora-purge-lms-probe-attempts',
  '45 3 * * *',
  $job$select public.purge_lms_probe_attempts();$job$
);

-- ── what a run skipped ──────────────────────────────────────────────────────

alter table public.lms_sync_runs
  add column if not exists summary jsonb;

comment on column public.lms_sync_runs.summary is
  'SEMORA (151): per-run counts a status alone cannot carry. First use: {"undated": n} from the Moodle token lane, where an assignment with no due date produces no Moodle calendar event and must not hold a run at ''partial'' for ever.';
