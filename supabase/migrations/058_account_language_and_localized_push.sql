-- ============================================================
-- ACCOUNT LANGUAGE + LOCALIZED SERVER PUSH
-- ============================================================
-- One preference follows a student across iPhone, iPad, and web. The device
-- token also carries the resolved language so send-push can localize while the
-- app is closed without reading the protected auth schema.
-- ============================================================

alter table public.profiles
  add column if not exists preferred_language text not null default 'en';

alter table public.profiles
  drop constraint if exists profiles_preferred_language_check;
alter table public.profiles
  add constraint profiles_preferred_language_check
  check (preferred_language in ('en', 'es'));

comment on column public.profiles.preferred_language is
  'SEMORA: account-wide interface and AI response language (en or es).';

alter table public.push_tokens
  add column if not exists preferred_language text not null default 'en';

alter table public.push_tokens
  drop constraint if exists push_tokens_preferred_language_check;
alter table public.push_tokens
  add constraint push_tokens_preferred_language_check
  check (preferred_language in ('en', 'es'));

update public.push_tokens t
set preferred_language = p.preferred_language
from public.profiles p
where p.id = t.user_id
  and t.preferred_language is distinct from p.preferred_language;

comment on column public.push_tokens.preferred_language is
  'SEMORA: resolved device language used for localized server push delivery.';
