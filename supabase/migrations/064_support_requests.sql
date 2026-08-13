-- ============================================================
-- SEMORA SUPPORT REQUESTS — durable capture for the website contact form
-- ============================================================
-- Before this, semoraai.com/support "sent" a message by building a `mailto:`
-- URL and telling the visitor "Your email app is ready with your message."
-- On a laptop with no OS mail handler — Gmail in a browser, which is most of
-- the audience — the click did nothing at all, and the page still claimed
-- success. Nothing was ever captured server-side, so every one of those
-- messages was lost silently. This table is the fix: the form POSTs, the row
-- lands here first, and only then is an email attempted.
--
-- ORDER MATTERS: store, THEN notify. Email is the fragile half (SMTP creds
-- expire, providers throttle), so it must never be the thing standing between
-- a student and a captured support request. `email_status` records how the
-- notification actually went, which means a delivery outage shows up as rows
-- marked 'failed' rather than as silence.
--
-- WRITER: the `submit-support` edge function ONLY, via the service-role client.
-- RLS is enabled with NO policies, so anon/authenticated clients can neither
-- read nor write — support requests carry a stranger's name, email and
-- free text, and no app client has any business reading them.
--
-- SHARED PROJECT: this is a SEMORA table (the Citizen app has no contact form).
-- Tagged via `comment on table` per supabase/SUPABASE_OWNERSHIP.md.
-- ============================================================

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- ── What the visitor sent ──────────────────────────────────
  name text not null,
  email text not null,
  -- Free-form on purpose: the form offers a <select>, but the option labels
  -- are translated per locale and will be re-worded over time. Storing the
  -- label the visitor actually saw beats a lossy enum that drifts.
  topic text,
  message text not null,
  -- Which language the form was filled in, so replies go out in that language.
  locale text not null default 'en',

  -- ── Where it came from ─────────────────────────────────────
  source text not null default 'website',
  page_path text,
  user_agent text,
  -- SHA-256(ip + SUPPORT_IP_SALT), never the raw address. Enough to rate-limit
  -- a flood from one source without the site keeping a log of who visited it.
  ip_hash text,

  -- ── Notification outcome ───────────────────────────────────
  -- pending → the row landed but the email attempt has not finished
  -- sent    → the notification email was accepted by the SMTP server
  -- failed  → SMTP rejected or errored; the message is still safe here
  -- skipped → no SMTP credentials configured on this deployment
  email_status text not null default 'pending',
  email_error text,
  emailed_at timestamptz,

  -- ── Triage ─────────────────────────────────────────────────
  -- Set by hand (dashboard) once the request has been answered, so the
  -- unhandled view below stays a real inbox rather than an ever-growing list.
  handled_at timestamptz,

  -- Length caps mirror the edge function's validation. Belt and braces: the
  -- function is the only writer today, but a constraint is what stops a future
  -- caller (or a hand-written insert) from parking a megabyte of text here.
  constraint support_requests_name_len check (length(btrim(name)) between 1 and 120),
  constraint support_requests_email_len check (length(btrim(email)) between 3 and 254),
  constraint support_requests_topic_len check (topic is null or length(topic) <= 120),
  constraint support_requests_message_len check (length(btrim(message)) between 1 and 5000),
  constraint support_requests_locale_valid check (locale in ('en', 'es')),
  constraint support_requests_email_status_valid
    check (email_status in ('pending', 'sent', 'failed', 'skipped'))
);

comment on table public.support_requests is
  'SEMORA: contact-form submissions from semoraai.com/support and /es/ayuda (064). '
  'Written ONLY by the submit-support edge function with the service-role key; '
  'RLS is on with no policies so no client can read or write it.';

comment on column public.support_requests.ip_hash is
  'SHA-256 of the submitting IP plus SUPPORT_IP_SALT. Rate limiting only — the raw IP is never stored.';

comment on column public.support_requests.email_status is
  'Outcome of the notification email. A row is authoritative even when this is failed/skipped.';

-- Newest first is how this is always read.
create index if not exists idx_support_requests_created
  on public.support_requests (created_at desc);

-- The rate-limit lookup: "how many from this source in the last hour".
create index if not exists idx_support_requests_ip_recent
  on public.support_requests (ip_hash, created_at desc);

-- Same question keyed on the address, so one person cannot dodge the IP cap by
-- switching networks mid-flood. Plain column, not lower(email): the function
-- lowercases before both the insert and the lookup, so a functional index here
-- would simply never be used.
create index if not exists idx_support_requests_email_recent
  on public.support_requests (email, created_at desc);

-- The working inbox: everything still owed a reply. Partial, so it stays small
-- forever regardless of how much answered history accumulates.
create index if not exists idx_support_requests_unhandled
  on public.support_requests (created_at desc)
  where handled_at is null;

-- No policies, deliberately. Service role bypasses RLS; everyone else is
-- locked out of both directions. See the header note.
alter table public.support_requests enable row level security;

-- ── Retention ───────────────────────────────────────────────
-- Answered requests are correspondence, not analytics, and this table holds
-- third-party personal data (name + email + whatever the student typed, which
-- in practice includes course names and occasionally screenshots described in
-- prose). Nothing here needs to live for years. Deleting only ANSWERED rows
-- means an unanswered request can never be swept out from under you.
create or replace function public.purge_old_support_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.support_requests
  where handled_at is not null
    and handled_at < now() - interval '180 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.purge_old_support_requests() is
  'SEMORA: deletes support requests answered more than 180 days ago (064). Call from cron; unanswered rows are never touched.';

revoke all on function public.purge_old_support_requests() from public, anon, authenticated;
