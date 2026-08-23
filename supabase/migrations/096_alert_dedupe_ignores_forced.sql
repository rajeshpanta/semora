-- SEMORA (096): a test fire must never silence a real alert.
--
-- 095 shipped with p_force so the delivery path could be exercised without
-- waiting for a genuine outage — and the first forced test immediately
-- demonstrated the flaw: the forced row landed in ops_alerts, and the dedupe
-- ("skip if an alert of this kind fired in the last hour") then counted it.
-- Testing the alarm disabled the alarm for an hour.
--
-- The ledger still records forced fires — they are real events and belong in
-- the audit trail — but they no longer satisfy the dedupe.
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
begin
  select count(*), min(created_at), max(created_at)
    into n, first_at, last_at
  from public.edge_request_log
  where fn = 'stripe-webhook'
    and created_at > now() - interval '30 minutes';

  -- Threshold of two, not one: this endpoint sits on a public URL, so a lone
  -- 'Missing signature' is usually an internet scanner, and alerting on it
  -- would train the operator to ignore the alert. A genuine Stripe failure
  -- ALWAYS repeats — Stripe retries on a backoff (observed 08-20: 20:20,
  -- 20:26, 20:30, 21:19, 22:00, 23:23, 06:51) — so a real problem clears this
  -- bar within minutes and noise does not.
  if not p_force and coalesce(n, 0) < 2 then
    return 0;
  end if;

  -- At most one alert an hour: a ten-hour outage should feel like a problem,
  -- not a pager storm. Forced test fires are excluded — see the header.
  if not p_force and exists (
    select 1 from public.ops_alerts
    where kind = 'stripe_webhook_failing'
      and created_at > now() - interval '1 hour'
      and coalesce(detail->>'forced', 'false') <> 'true'
  ) then
    return 0;
  end if;

  select coalesce(array_agg(user_id), '{}') into recipients
  from public.ops_alert_recipients;

  select decrypted_secret into secret
  from vault.decrypted_secrets where name = 'push_send_secret';

  -- Record FIRST, deliver second. If the push fails the alert still exists,
  -- and delivered=false says exactly what happened.
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
    update public.ops_alerts set delivered = true where id = alert_id;
  end if;

  return coalesce(n, 0);
end;
$$;

revoke all on function public.alert_stripe_webhook_failures(boolean) from public, anon, authenticated;
