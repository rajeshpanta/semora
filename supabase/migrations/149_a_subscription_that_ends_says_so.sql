-- A subscription that ends should say so.
--
-- Semora has 81 paying students and no way to learn that one of them stopped
-- paying. Apple and Stripe both tell an app when a subscription lapses —
-- Apple through App Store Server Notifications, Stripe through the webhook
-- Semora already runs — but the App Store side was never wired up, and the
-- entitlements table is only re-read when a student opens the app. So the
-- sequence today is: a student cancels, their `expires_at` passes, `is_pro()`
-- quietly answers false, and nobody finds out. 40 of the 82 live entitlement
-- rows were last validated more than 7 days ago; the oldest is a month.
--
-- This does not fix the blindness — only the notification endpoint can, and
-- that is a bigger piece of work. It does something smaller and immediate:
-- it watches the one moment that IS visible in our own data, the moment a paid
-- period ends without a new one replacing it, and raises an alert about it.
-- 41 monthly subscriptions renew in the next 30 days, 16 of them in the next
-- 7, and until now the first sign of trouble would have been a revenue number
-- weeks later.
--
-- It messages no students. The alert goes to the ops recipients, through the
-- same push-and-email path the lecture alerts use.

-- ── 1. What we have already noticed ────────────────────────────────────────
--
-- One row per subscription period that ended. Keyed on (user_id, expired_at)
-- so the hourly check is idempotent: the same lapse can be seen twenty times
-- and alerted once. Kept as history, so "did October churn?" is answerable
-- without reconstructing it from entitlement rows that have since moved on.
create table if not exists public.subscription_lapses (
  id          bigserial primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  platform    text,
  plan        text,
  -- The end of the period that was not renewed.
  expired_at  timestamptz not null,
  -- When the check first saw it. The gap between the two is our blind spot,
  -- measured rather than assumed.
  noticed_at  timestamptz not null default now(),
  -- Set later if the same account comes back (a resubscribe, or a late
  -- validation that moved expires_at forward after all).
  recovered_at timestamptz,
  unique (user_id, expired_at)
);

alter table public.subscription_lapses enable row level security;
-- No policy: this is ops data about paying accounts, and nothing in the app
-- reads it. The service role bypasses RLS; everyone else sees nothing.
revoke all on table public.subscription_lapses from public, anon, authenticated;

comment on table public.subscription_lapses is
  'Paid subscription periods that ended without renewing. Written by subscription_lapse_check() hourly; read by nobody in the app.';

-- ── 2. The check ───────────────────────────────────────────────────────────
--
-- Deliberately narrow about what counts as a lapse:
--   * the row must be a REAL purchase (an Apple transaction id or a Stripe
--     subscription id) — hand-made grants and the review account are not
--     revenue and must never raise an alert;
--   * `expires_at` must be in the past but inside the last 7 days, so
--     switching this on does not alert about every historical expiry;
--   * an account that still has Pro from somewhere else (a promo grant, a
--     second entitlement) is not a lapse — it lost nothing.
--
-- A recovery is recorded too: if the same account's entitlement later runs
-- past the lapse we saw, the row is stamped rather than deleted, so a renewal
-- that simply validated late reads as exactly that.
create or replace function public.subscription_lapse_check()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_lapses integer := 0;
  summary    text;
begin
  -- Recoveries first: an entitlement that moved forward cancels the alarm for
  -- that period, and doing it before the insert keeps a late validation from
  -- being announced as a loss.
  update public.subscription_lapses l
     set recovered_at = now()
   where l.recovered_at is null
     and exists (
       select 1 from public.entitlements e
       where e.user_id = l.user_id
         and e.is_pro
         and e.expires_at > l.expired_at
         and e.expires_at > now()
     );

  with lapsed as (
    select e.user_id, e.platform, e.plan, e.expires_at
    from public.entitlements e
    where e.plan is not null
      and (e.original_transaction_id ~ '^[0-9]+$' or e.stripe_subscription_id like 'sub_%')
      and e.expires_at <= now()
      and e.expires_at > now() - interval '7 days'
      and not public.is_pro(e.user_id)
  ), inserted as (
    insert into public.subscription_lapses (user_id, platform, plan, expired_at)
    select user_id, platform, plan, expires_at from lapsed
    on conflict (user_id, expired_at) do nothing
    returning plan
  )
  select count(*),
         'A paid subscription ended without renewing: '
           || count(*) || ' ('
           || coalesce(string_agg(distinct coalesce(plan, 'unknown'), ', '), 'unknown')
           || ')'
    into new_lapses, summary
  from inserted;

  if new_lapses > 0 then
    insert into public.ops_alerts (kind, detail)
    values (
      'subscription_lapsed',
      jsonb_build_object(
        'summary', summary,
        'count', new_lapses,
        'meaning', 'Someone who was paying is not any more. Check App Store Connect and Stripe for a cancellation or a billing failure.',
        'still_paying', (
          select count(*) from public.entitlements e
          where e.is_pro and e.expires_at > now() and e.plan is not null
        ),
        'renewing_next_7_days', (
          select count(*) from public.entitlements e
          where e.is_pro and e.plan is not null
            and e.expires_at > now() and e.expires_at < now() + interval '7 days'
        )
      )
    );
    -- Delivered in the same pass rather than waiting for the hourly lecture
    -- job, so the alert arrives while the day it happened is still today.
    perform public.lecture_deliver_ops_alerts();
  end if;

  return new_lapses;
end;
$$;

revoke all on function public.subscription_lapse_check() from public, anon, authenticated;

comment on function public.subscription_lapse_check() is
  'Hourly. Records paid subscriptions whose period ended without renewing and raises one ops alert per pass. Never messages students.';

-- ── 3. Delivery has to know this alert exists ──────────────────────────────
--
-- lecture_deliver_ops_alerts() filtered on `kind like ''lecture%''`, so an
-- alert of any other kind would have been written and never sent — the exact
-- failure 144 was written to fix, one kind later. The filter is widened and
-- the wording generalised; everything else about the function is unchanged,
-- including the revoke below, which a drop-and-recreate would otherwise lose.
create or replace function public.lecture_deliver_ops_alerts()
returns integer
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  secret     text;
  recipients uuid[];
  alert      record;
  body_text  text;
  sent_count integer := 0;
  email_request bigint;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_send_secret';
  if secret is null then
    return 0;
  end if;

  select coalesce(array_agg(user_id), '{}') into recipients from public.ops_alert_recipients;

  for alert in
    select id, kind, detail, created_at
    from public.ops_alerts
    where (kind like 'lecture%' or kind like 'subscription%')
      and not delivered
      and created_at > now() - interval '24 hours'
    order by created_at
    limit 20
    for update skip locked
  loop
    body_text := 'Semora alert: ' || alert.kind || E'\n\n'
      || coalesce(alert.detail->>'summary', alert.detail->>'meaning', '') || E'\n\n'
      || 'Raised: ' || alert.created_at::text || E'\n\n'
      || 'Detail: ' || coalesce(alert.detail::text, '{}') || E'\n\n'
      || case when alert.kind like 'lecture%'
           then 'Runbook: docs/audits/record-lecture-report-and-plan-2026-09-16.md (Phase 5).'
           else 'Runbook: DEPLOY_CHECKLIST.md, "Subscription lapse watch".'
         end;

    if coalesce(array_length(recipients, 1), 0) > 0 then
      perform net.http_post(
        url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
        body    := jsonb_build_object(
          'user_ids', to_jsonb(recipients),
          'title', 'Semora: ' || replace(alert.kind, '_', ' '),
          'body', left(coalesce(alert.detail->>'summary', alert.detail->>'meaning', alert.kind), 180),
          'data', jsonb_build_object('type', 'ops_alert', 'kind', alert.kind)
        ),
        -- 136: the 5-second default times out send-push.
        timeout_milliseconds := 60000
      );
    end if;

    email_request := net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/ops-alert',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
      body    := jsonb_build_object(
        'subject', 'Semora alert: ' || alert.kind,
        'body', left(body_text, 4900)
      ),
      timeout_milliseconds := 60000
    );

    -- Delivery is asynchronous (pg_net): the request id is kept so a failed
    -- send can be found in net._http_response.
    update public.ops_alerts
       set delivered = true,
           detail = coalesce(detail, '{}'::jsonb)
                    || jsonb_build_object('push', coalesce(array_length(recipients, 1), 0) > 0, 'email', true,
                                          'email_request_id', email_request)
     where id = alert.id;
    sent_count := sent_count + 1;
  end loop;

  return sent_count;
end;
$$;

revoke all on function public.lecture_deliver_ops_alerts() from public, anon, authenticated;

-- ── 4. Hourly, on a minute nothing else uses ───────────────────────────────
-- :23 — clear of the lecture health check (:17), the LMS syncs (:02/:17/:32/:47)
-- and the audio retention pass (:08/:28/:48).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('semora-subscription-lapse-check')
      where exists (select 1 from cron.job where jobname = 'semora-subscription-lapse-check');
    perform cron.schedule(
      'semora-subscription-lapse-check',
      '23 * * * *',
      'select public.subscription_lapse_check();'
    );
  end if;
end;
$$;
