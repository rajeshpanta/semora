-- Tests for 149 (run after harness.sql and the earlier migrations on a
-- THROWAWAY database). The subscription lapse watch.
set client_min_messages = warning;

-- The harness is lecture-shaped, so the billing tables this migration reads
-- are built here in their production shapes. `vault` exists with no secret in
-- it, which is what makes lecture_deliver_ops_alerts() return early instead of
-- trying to reach the network from a test database.
create table if not exists public.entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_pro boolean not null default false,
  plan text,
  product_id text,
  platform text,
  environment text,
  expires_at timestamptz,
  original_transaction_id text,
  stripe_subscription_id text,
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.promo_grants (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text,
  granted_at timestamptz not null default now(),
  expires_at timestamptz
);
create table if not exists public.ops_alerts (
  id bigserial primary key,
  kind text not null,
  detail jsonb,
  delivered boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.ops_alert_recipients (
  user_id uuid primary key
);
create schema if not exists vault;
create table if not exists vault.decrypted_secrets (name text, decrypted_secret text);
create schema if not exists net;
create or replace function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', timeout_milliseconds integer default 5000)
returns bigint language sql as $fn$ select 1::bigint $fn$;
create or replace function public.is_pro(uid uuid) returns boolean
language sql stable as $fn$
  select coalesce((select e.is_pro and (e.expires_at is null or e.expires_at > now())
                     from public.entitlements e where e.user_id = uid limit 1), false)
      or exists (select 1 from public.promo_grants g where g.user_id = uid and g.expires_at > now());
$fn$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000001a1'),  -- real Apple purchase, lapsed
  ('00000000-0000-0000-0000-0000000001a2'),  -- real Stripe purchase, lapsed
  ('00000000-0000-0000-0000-0000000001a3'),  -- hand-made grant, lapsed
  ('00000000-0000-0000-0000-0000000001a4'),  -- lapsed but still Pro by promo
  ('00000000-0000-0000-0000-0000000001a5'),  -- still paying
  ('00000000-0000-0000-0000-0000000001a6');  -- lapsed long ago
insert into public.profiles (id, preferred_language) values
  ('00000000-0000-0000-0000-0000000001a1', 'en'),
  ('00000000-0000-0000-0000-0000000001a2', 'en'),
  ('00000000-0000-0000-0000-0000000001a3', 'en'),
  ('00000000-0000-0000-0000-0000000001a4', 'en'),
  ('00000000-0000-0000-0000-0000000001a5', 'en'),
  ('00000000-0000-0000-0000-0000000001a6', 'en');

insert into public.entitlements (user_id, is_pro, plan, product_id, platform, expires_at, original_transaction_id, stripe_subscription_id)
values
  ('00000000-0000-0000-0000-0000000001a1', false, 'monthly', 'semora_pro_monthly', 'ios', now() - interval '2 hours', '470001234567890', null),
  ('00000000-0000-0000-0000-0000000001a2', false, 'annual',  'price_x',            'web', now() - interval '1 day',   null, 'sub_1ABCDEF'),
  ('00000000-0000-0000-0000-0000000001a3', false, 'annual',  'semora_pro_annual',  'ios', now() - interval '3 hours', 'manual-test-grant', null),
  ('00000000-0000-0000-0000-0000000001a4', false, 'monthly', 'semora_pro_monthly', 'ios', now() - interval '4 hours', '470009999999999', null),
  ('00000000-0000-0000-0000-0000000001a5', true,  'monthly', 'semora_pro_monthly', 'ios', now() + interval '20 days', '470008888888888', null),
  ('00000000-0000-0000-0000-0000000001a6', false, 'monthly', 'semora_pro_monthly', 'ios', now() - interval '30 days', '470007777777777', null);

-- a4 lost the purchase but still holds Pro through a referral month.
insert into public.promo_grants (user_id, reason, expires_at)
values ('00000000-0000-0000-0000-0000000001a4', 'referral_referred', now() + interval '10 days');

-- ── 1. only real, recent, actually-lost subscriptions count ────────────────
do $$
declare
  found integer;
begin
  found := public.subscription_lapse_check();
  if found <> 2 then
    raise exception '149.1 expected 2 lapses (Apple + Stripe), got %', found;
  end if;
  if not exists (select 1 from public.subscription_lapses where user_id = '00000000-0000-0000-0000-0000000001a1') then
    raise exception '149.1 the lapsed Apple subscription was not recorded';
  end if;
  if not exists (select 1 from public.subscription_lapses where user_id = '00000000-0000-0000-0000-0000000001a2') then
    raise exception '149.1 the lapsed Stripe subscription was not recorded';
  end if;
  if exists (select 1 from public.subscription_lapses where user_id = '00000000-0000-0000-0000-0000000001a3') then
    raise exception '149.1 a hand-made grant must never read as lost revenue';
  end if;
  if exists (select 1 from public.subscription_lapses where user_id = '00000000-0000-0000-0000-0000000001a4') then
    raise exception '149.1 an account that still has Pro has lost nothing';
  end if;
  if exists (select 1 from public.subscription_lapses where user_id = '00000000-0000-0000-0000-0000000001a5') then
    raise exception '149.1 a live subscription is not a lapse';
  end if;
  if exists (select 1 from public.subscription_lapses where user_id = '00000000-0000-0000-0000-0000000001a6') then
    raise exception '149.1 an expiry from a month ago must not be announced as news';
  end if;
end;
$$;

-- ── 2. one alert, and it is deliverable ────────────────────────────────────
do $$
declare
  a record;
begin
  select * into a from public.ops_alerts where kind = 'subscription_lapsed' order by id desc limit 1;
  if a is null then
    raise exception '149.2 no alert was raised';
  end if;
  if (a.detail->>'count')::int <> 2 then
    raise exception '149.2 alert says count=%, expected 2', a.detail->>'count';
  end if;
  if coalesce(a.detail->>'summary', '') = '' then
    raise exception '149.2 the alert has no summary, so the email would be blank';
  end if;
  -- 144 filtered delivery on kind like 'lecture%'. If that filter is ever
  -- narrowed again this alert is written and never sent, which is the failure
  -- 144 itself existed to fix.
  if not exists (
    select 1 from pg_get_functiondef('public.lecture_deliver_ops_alerts()'::regprocedure) def
    where def like '%subscription%'
  ) then
    raise exception '149.2 delivery does not look at subscription alerts';
  end if;
end;
$$;

-- ── 3. running it again announces nothing new ──────────────────────────────
do $$
declare
  again integer;
  alerts integer;
begin
  again := public.subscription_lapse_check();
  if again <> 0 then
    raise exception '149.3 the same lapse was counted twice (%), so the hourly job would alert every hour', again;
  end if;
  select count(*) into alerts from public.ops_alerts where kind = 'subscription_lapsed';
  if alerts <> 1 then
    raise exception '149.3 expected exactly 1 alert after two passes, got %', alerts;
  end if;
end;
$$;

-- ── 4. a late renewal is a recovery, not a loss ────────────────────────────
do $$
declare
  rec timestamptz;
begin
  update public.entitlements
     set is_pro = true, expires_at = now() + interval '27 days'
   where user_id = '00000000-0000-0000-0000-0000000001a1';
  perform public.subscription_lapse_check();
  select recovered_at into rec from public.subscription_lapses
   where user_id = '00000000-0000-0000-0000-0000000001a1';
  if rec is null then
    raise exception '149.4 a subscription that came back is still recorded as lost';
  end if;
  -- and the row is kept, not deleted: the history is the point.
  if not exists (select 1 from public.subscription_lapses where user_id = '00000000-0000-0000-0000-0000000001a1') then
    raise exception '149.4 the lapse row was deleted rather than stamped';
  end if;
end;
$$;

-- ── 5. students can never read this table ──────────────────────────────────
do $$
begin
  if has_table_privilege('anon', 'public.subscription_lapses', 'select')
     or has_table_privilege('authenticated', 'public.subscription_lapses', 'select') then
    raise exception '149.5 subscription_lapses is readable by app clients';
  end if;
  if has_function_privilege('anon', 'public.subscription_lapse_check()', 'execute')
     or has_function_privilege('authenticated', 'public.subscription_lapse_check()', 'execute') then
    raise exception '149.5 the check is callable from the app';
  end if;
  if has_function_privilege('anon', 'public.lecture_deliver_ops_alerts()', 'execute')
     or has_function_privilege('authenticated', 'public.lecture_deliver_ops_alerts()', 'execute') then
    raise exception '149.5 the recreated delivery function lost its revoke';
  end if;
end;
$$;

select '149 ok' as result;
