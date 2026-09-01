-- ============================================================
-- SEMORA PHASE 0 — PRE-PROMOTION BASELINE
-- ============================================================
-- The control measurement for the LMS activation experiment. Run this BEFORE
-- the Phase 1 promotion ships, and again on the same cadence afterwards, so
-- like-aged cohorts can be compared rather than a 6-day cohort against a
-- 30-day one.
--
--   supabase db query --linked --file scripts/phase0-baseline.sql
--
-- Deliberately a query and a committed snapshot rather than a new table: this
-- is read every few weeks by a person, and a metrics table would be
-- infrastructure to maintain for something a file already answers. The frozen
-- result lives in docs/phase0-baseline.json.
--
-- Everything is ACCOUNT-level. Device-level numbers are not comparable across
-- cohorts because one student reinstalling mints a new device id.
--
-- READ-ONLY. Contains no DDL and no writes.
-- ============================================================
with acct as (
  select
    u.id as user_id,
    u.created_at as joined,
    exists (
      select 1 from public.entitlements e
      where e.user_id = u.id and e.is_pro
        and coalesce(e.environment, 'x') <> 'Sandbox'
    ) as ever_pro,
    (select min(e.created_at) from public.entitlements e
      where e.user_id = u.id and e.is_pro
        and coalesce(e.environment, 'x') <> 'Sandbox') as pro_at,
    (select min(lc.created_at) from public.lms_connections lc where lc.user_id = u.id) as lms_at
  from auth.users u
),
-- D1/D7 are only meaningful for accounts that have HAD the chance. An account
-- that signed up yesterday has not failed to return on day 7; it has not been
-- asked yet. Mixing the two is how a growing product appears to be collapsing.
mature as (
  select
    a.*,
    a.joined < now() - interval '1 day'  as eligible_d1,
    a.joined < now() - interval '7 days' as eligible_d7,
    exists (select 1 from public.analytics_events x
      where x.user_id = a.user_id and x.app_name like 'semora%'
        and x.created_at > a.joined + interval '1 day') as returned_d1,
    exists (select 1 from public.analytics_events x
      where x.user_id = a.user_id and x.app_name like 'semora%'
        and x.created_at > a.joined + interval '7 days') as returned_d7
  from acct a
)
select
  now()                                                              as captured_at,
  -- ── Population ────────────────────────────────────────────
  count(*)                                                           as accounts,
  count(*) filter (where joined > now() - interval '30 days')        as signups_30d,
  count(*) filter (where ever_pro)                                   as ever_pro,
  count(*) filter (where not ever_pro and lms_at is null)            as free_without_lms,
  count(*) filter (where not ever_pro and lms_at is not null)        as free_with_lms,
  count(*) filter (where lms_at is not null)                         as lms_accounts,
  -- ── Per-100-signups rates (the business metrics) ──────────
  round(100.0 * count(*) filter (where lms_at is not null) / nullif(count(*), 0), 2)
                                                                     as lms_per_100_signups,
  round(100.0 * count(*) filter (where ever_pro) / nullif(count(*), 0), 2)
                                                                     as pro_per_100_signups,
  -- ── LMS-first -> Pro (the cannibalisation counter-evidence) ─
  count(*) filter (where lms_at is not null and (pro_at is null or pro_at > lms_at))
                                                                     as connected_lms_while_free,
  count(*) filter (where lms_at is not null and pro_at is not null and pro_at > lms_at)
                                                                     as lms_first_then_pro,
  round(100.0 * count(*) filter (where lms_at is not null and pro_at is not null and pro_at > lms_at)
        / nullif(count(*) filter (where lms_at is not null and (pro_at is null or pro_at > lms_at)), 0), 1)
                                                                     as lms_first_to_pro_pct,
  -- ── Retention, censoring-aware ────────────────────────────
  count(*) filter (where eligible_d1)                                as d1_eligible,
  round(100.0 * count(*) filter (where eligible_d1 and returned_d1)
        / nullif(count(*) filter (where eligible_d1), 0), 1)         as d1_return_pct,
  count(*) filter (where eligible_d7)                                as d7_eligible,
  round(100.0 * count(*) filter (where eligible_d7 and returned_d7)
        / nullif(count(*) filter (where eligible_d7), 0), 1)         as d7_return_pct,
  -- ── Activation ────────────────────────────────────────────
  round(100.0 * count(*) filter (where exists (
      select 1 from public.tasks t where t.user_id = mature.user_id and t.is_completed))
    / nullif(count(*), 0), 1)                                        as pct_completed_a_task,
  -- ── Purchase attribution (device-level: purchase_success is a client event) ─
  (select count(distinct user_id) from public.analytics_events
     where app_name = 'semora' and event_name = 'purchase_success'
       and properties->>'context' = 'upsell_scan')                   as purchases_upsell_scan,
  (select count(distinct user_id) from public.analytics_events
     where app_name = 'semora' and event_name = 'purchase_success'
       and properties->>'context' = 'postScan')                      as purchases_postscan,
  -- ── LMS sync capacity, as configured at capture time ──────
  (select count(*) from public.lms_connections)                      as lms_connections,
  (select count(*) from public.lms_connections
     where sync_enabled and background_sync_enabled)                 as lms_connections_syncing,
  (select round(avg(extract(epoch from (finished_at - started_at)) * 1000))
     from public.lms_sync_runs
     where finished_at is not null and started_at > now() - interval '7 days')
                                                                     as sync_avg_ms,
  (select count(*) from public.lms_sync_runs)                        as lms_sync_run_rows
from mature;
