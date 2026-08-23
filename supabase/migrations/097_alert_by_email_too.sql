-- SEMORA (097): send the webhook alert by email as well as push.
--
-- 095 delivered by push only, and that rests on a single registered device
-- staying signed in. If the token goes away the alert goes nowhere — which is
-- precisely the silent failure the alert exists to end. Email does not depend
-- on an app being installed, and it lands in the inbox support already
-- reaches, so there is no new place to remember to check.
--
-- Both channels are attempted. `delivered` now means "at least one channel
-- accepted it", and the detail column records which, so a half-failure is
-- visible instead of averaging out to looking fine.
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
  summary      text;
  pushed       boolean := false;
  emailed      boolean := false;
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
  -- not a pager storm. Forced test fires are excluded (see 096).
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

  summary :=
    coalesce(n, 0) || ' Stripe webhook deliveries were REJECTED in the last 30 minutes.'
    || E'\n\n'
    || 'First: ' || coalesce(first_at::text, 'n/a') || E'\n'
    || 'Last:  ' || coalesce(last_at::text,  'n/a') || E'\n\n'
    || 'stripe-webhook is the only thing that grants or removes web-billed '
    || 'Pro. While it is rejecting deliveries, Stripe still charges cards and '
    || 'Semora never hears: a new subscriber pays and gets nothing, and a '
    || 'cancellation leaves someone on Pro for free.' || E'\n\n'
    || 'Check: Stripe Dashboard -> Developers -> Webhooks -> the endpoint -> '
    || 'recent deliveries. A failure there says which secret signed them.' || E'\n\n'
    || 'Raw: select * from public.edge_request_log where fn = ''stripe-webhook'' '
    || 'order by created_at desc;';

  -- Record FIRST, deliver second. If every channel fails the alert still
  -- exists, and delivered=false says exactly that.
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

  if secret is not null then
    if coalesce(array_length(recipients, 1), 0) > 0 then
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
      pushed := true;
    end if;

    perform net.http_post(
      url     := 'https://usglgeosqhtxbyxsugre.supabase.co/functions/v1/ops-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || secret
      ),
      body := jsonb_build_object(
        'subject', 'Stripe webhook failing (' || coalesce(n, 0) || ' rejected in 30m)',
        'body', summary
      )
    );
    emailed := true;
  end if;

  update public.ops_alerts
     set delivered = (pushed or emailed),
         detail = detail || jsonb_build_object('push', pushed, 'email', emailed)
   where id = alert_id;

  return coalesce(n, 0);
end;
$$;

revoke all on function public.alert_stripe_webhook_failures(boolean) from public, anon, authenticated;
