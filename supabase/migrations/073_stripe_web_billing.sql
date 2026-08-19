-- ============================================================
-- STRIPE WEB BILLING
-- ============================================================
-- Web visitors could see the paywall but not buy: purchasing was
-- iOS-only, so anyone on app.semoraai.com was told to go find an
-- iPhone. This adds Stripe as a SECOND writer of the same
-- `entitlements` row, so `is_pro()` — which every Pro gate, RLS
-- policy and quota trigger already reads — needs no change at all.
-- Buy on web, Pro works on the phone; buy on the phone, Pro works
-- in the browser.
--
-- Stripe code exists ONLY in the web bundle (lib/purchases.web.ts,
-- which Metro resolves ahead of the native module and iOS never
-- loads). The iOS binary contains no Stripe code and no reference
-- to outside purchasing, so App Store guideline 3.1.1 stays out of
-- scope exactly as it was.
-- ============================================================

-- 1. `platform` must admit web-billed rows.
alter table public.entitlements drop constraint if exists entitlements_platform_check;
alter table public.entitlements
  add constraint entitlements_platform_check check (platform in ('ios', 'android', 'web'));

-- 2. Stripe customer mapping.
--
-- Separate from `entitlements` on purpose: a customer exists from the
-- moment checkout STARTS, whereas an entitlement row only means
-- something once a payment succeeds. Keeping them apart means an
-- abandoned checkout leaves no trace that looks like a subscription.
create table if not exists public.stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);

alter table public.stripe_customers enable row level security;

-- Read-only to its owner; only the service role writes (edge functions).
-- Matches the entitlements policy shape.
create policy "users read own stripe customer"
  on public.stripe_customers
  for select
  using (auth.uid() = user_id);

-- 3. Webhook idempotency.
--
-- Stripe retries a webhook until it gets a 2xx, and will happily deliver
-- the same event twice on its own. Recording every processed event id
-- makes replays no-ops rather than double-writes.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
-- No policies: service role only. Clients have no business reading this.

comment on table public.stripe_customers is
  'Maps a Semora user to their Stripe customer. Written by the stripe-checkout edge function.';
comment on table public.stripe_events is
  'Processed Stripe webhook event ids, for idempotency. Service-role only.';
