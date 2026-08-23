-- SEMORA (095): make stripe-webhook failures impossible to miss.
--
-- stripe-webhook is the ONLY thing that grants or removes web-billed Pro.
-- When it stops accepting deliveries, Stripe still charges the customer and
-- Semora never hears — the person pays and gets nothing, or cancels and keeps
-- Pro for free. Both are silent.
--
-- On 2026-08-20 fourteen deliveries were rejected over roughly ten hours and
-- nothing surfaced it. It was found two days later by hand-querying
-- edge_request_log. That is the actual defect being fixed here: not the
-- rejection, but that a rejection told nobody.

-- ── Who gets told ───────────────────────────────────────────────────────
-- A table rather than a hardcoded id so recipients can change without a
-- migration, and so this reads as configuration instead of a magic constant.
create table if not exists public.ops_alert_recipients (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note    text,
  added_at timestamptz not null default now()
);

comment on table public.ops_alert_recipients is
  'SEMORA (095): accounts that receive operational alerts (push). Service-role only. Delete a row to stop alerting that person.';

-- ── What was already said ───────────────────────────────────────────────
-- Dedupe ledger AND audit trail. Written even when delivery fails, so a
-- missed push never means a missed record.
create table if not exists public.ops_alerts (
  id         bigserial primary key,
  kind       text        not null,
  detail     jsonb,
  delivered  boolean     not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ops_alerts_kind_created_idx
  on public.ops_alerts (kind, created_at desc);

comment on table public.ops_alerts is
  'SEMORA (095): operational alerts that have fired. Doubles as the dedupe key — an alert is suppressed while a recent one of the same kind exists.';

alter table public.ops_alert_recipients enable row level security;
alter table public.ops_alerts           enable row level security;
revoke all on public.ops_alert_recipients from anon, authenticated;
revoke all on public.ops_alerts           from anon, authenticated;

-- Seed with the operator's account (the only one with a registered device).
insert into public.ops_alert_recipients (user_id, note)
select u.id, 'operator'
from auth.users u
where u.email = 'rajesh.panta08@gmail.com'
on conflict (user_id) do nothing;

-- ── The check ───────────────────────────────────────────────────────────
create or replace function public.alert_stripe_webhook_failures(p_force boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n            integer;
  first_at     timestamptz;
  last_at      timestamptz;
  secret       text;
  recipients   uuid[];
  alert_id     bigint;
  sent         boolean := false;
begin
  select count(*), min(created_at), max(created_at)
    into n, first_at, last_at
  from public.edge_request_log
  where fn = 'stripe-webhook'
    and created_at > now() - interval '30 minutes';

  -- Threshold of two, not one, and the reason matters: this endpoint sits on
  -- a public URL, so a single 'Missing signature' is usually an internet
  -- scanner and alerting on it would train the operator to ignore the alert.
  -- A genuine Stripe failure ALWAYS repeats — Stripe retries on a backoff
  -- (observed 08-20: 20:20, 20:26, 20:30, 21:19, 22:00, 23:23, 06:51) — so a
  -- real problem clears this bar within minutes and noise does not.
  if not p_force and coalesce(n, 0) < 2 then
    return 0;
  end if;

  -- At most one alert an hour. An outage lasting ten hours should feel like a
  -- problem, not like a pager storm.
  if not p_force and exists (
    select 1 from public.ops_alerts
    where kind = 'stripe_webhook_failing'
      and created_at > now() - interval '1 hour'
  ) then
    return 0;
  end if;

  select coalesce(array_agg(user_id), '{}') into recipients
  from public.ops_alert_recipients;

  select decrypted_secret into secret
  from vault.decrypted_secrets where name = 'push_send_secret';

  -- Record FIRST, deliver second. If the push fails, the alert still exists
  -- and `delivered=false` says exactly what happened.
  insert into public.ops_alerts (kind, detail)
  values (
    'stripe_webhook_failing',
    jsonb_build_object(
      'failures_30m', coalesce(n, 0),
      'first_at', first_at,
      'last_at', last_at,
      'forced', p_force
    )
  )
  returning id into alert_id;

  if secret is not null and coalesce(array_length(recipients, 1), 0) > 0 then
    perform net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret
      ),
      body := jsonb_build_object(
        'user_ids', to_jsonb(recipients),
        'title', 'Semora: Stripe webhook failing',
        'body', coalesce(n, 0) || ' rejected deliveries in 30 min. Web purchases may not be granting Pro.',
        'data', jsonb_build_object('type', 'ops_alert', 'kind', 'stripe_webhook_failing')
      )
    );
    sent := true;
    update public.ops_alerts set delivered = true where id = alert_id;
  end if;

  return coalesce(n, 0);
end;
$$;

comment on function public.alert_stripe_webhook_failures(boolean) is
  'SEMORA (095): push an alert when stripe-webhook has rejected 2+ deliveries in 30 minutes. Deduped to one alert per hour. Pass p_force to exercise the delivery path without waiting for a real failure.';

revoke all on function public.alert_stripe_webhook_failures(boolean) from public, anon, authenticated;

-- Every 5 minutes: fast enough that a broken webhook is noticed inside one
-- Stripe retry cycle, cheap enough to be a single indexed count.
select cron.schedule(
  'semora-stripe-webhook-alert',
  '*/5 * * * *',
  $job$ select public.alert_stripe_webhook_failures(); $job$
);
