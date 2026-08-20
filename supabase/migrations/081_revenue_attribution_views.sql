-- ============================================================
-- SEMORA: WHAT DID THE PEOPLE WHO PAID ACTUALLY DO?
-- ============================================================
-- 078 put user_id on analytics_events. This is what it was for: until now the
-- question "which feature precedes a purchase" had no answer, because events
-- and entitlements had no key in common.
--
-- Two views, deliberately kept as views rather than materialised — the volumes
-- are small (single-digit thousands of events) and a stale answer about
-- revenue is worse than a slow one.
--
-- Both are operator tools. No client role is granted anything.
-- ============================================================

-- ─── Who is who ────────────────────────────────────────────────────────────
-- One row per user seen in analytics, with their current entitlement state.
-- `first_seen` is the first event we ever recorded for them, so cohorting and
-- time-to-purchase are both derivable from here.
create or replace view public.semora_users as
  select
    e.user_id,
    min(e.created_at)                             as first_seen,
    max(e.created_at)                             as last_seen,
    count(*)                                      as events,
    count(distinct e.device_id)                   as devices,
    count(distinct date_trunc('day', e.created_at)) as active_days,
    bool_or(e.platform = 'ios')                   as used_ios,
    bool_or(e.platform = 'web')                   as used_web,
    ent.is_pro,
    ent.plan,
    ent.platform                                  as billing_platform,
    ent.created_at                                as became_pro_at
  from public.semora_events e
  left join public.entitlements ent on ent.user_id = e.user_id
  where e.user_id is not null
  group by e.user_id, ent.is_pro, ent.plan, ent.platform, ent.created_at;

comment on view public.semora_users is
  'SEMORA (081): one row per identified user — activity summary joined to entitlement. The basis for cohorts, retention and time-to-purchase.';

-- ─── What preceded the money ───────────────────────────────────────────────
-- Every event a paying user fired BEFORE they became Pro. Group by event_name
-- to see which features actually precede a purchase, rather than guessing from
-- what is popular overall — popular and persuasive are not the same thing.
create or replace view public.semora_pre_purchase_events as
  select
    e.user_id,
    e.event_name,
    e.platform,
    e.created_at,
    ent.plan,
    ent.created_at as became_pro_at,
    ent.created_at - e.created_at as before_purchase
  from public.semora_events e
  join public.entitlements ent
    on ent.user_id = e.user_id
   and ent.is_pro
   and e.created_at < ent.created_at
  where e.user_id is not null;

comment on view public.semora_pre_purchase_events is
  'SEMORA (081): events fired by a user before they became Pro, with how long before. Answers "which feature converts", not merely "which feature is used".';

revoke all on public.semora_users, public.semora_pre_purchase_events from anon, authenticated;
grant select on public.semora_users, public.semora_pre_purchase_events to service_role;
