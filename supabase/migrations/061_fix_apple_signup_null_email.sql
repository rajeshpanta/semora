-- ============================================================
-- 061 — Sign in with Apple fails: "Database error saving new user"
-- ============================================================
-- Reported from a physical device: Google sign-in works, Apple fails on both
-- sign-up and sign-in.
--
-- Cause. `handle_new_user` (001) fires after insert on auth.users and does:
--     insert into public.profiles (id, email) values (new.id, new.email);
-- while profiles.email is NOT NULL. Apple is the only provider that omits the
-- address: it returns the email on the FIRST authorization of an app and never
-- again on subsequent ones. So `new.email` arrives NULL, the insert violates
-- the NOT NULL constraint, the trigger raises, and GoTrue rolls the whole
-- signup back and surfaces its generic "Database error saving new user".
-- Google always returns an email, which is exactly why it was unaffected.
--
-- Two changes, because either alone would leave the door open:
--
--   1. profiles.email becomes nullable. It was never justified as NOT NULL —
--      nothing in the app or in SQL reads the column, and the identity of
--      record is auth.users.email. A mirrored convenience field should not be
--      able to veto account creation.
--
--   2. The trigger stops being able to fail the signup at all. Creating a
--      profile row is bookkeeping; a user must never be denied an account
--      because bookkeeping failed. It now tolerates a duplicate id and
--      swallows anything else, and app/_layout.tsx already upserts the profile
--      on first launch, so a skipped row self-heals on the next open.
--
-- Also takes the email from Apple's identity payload when the top-level column
-- is null, so the field is still populated whenever the information exists.
-- ============================================================

alter table public.profiles alter column email drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email)
  values (
    new.id,
    -- Apple sends the address only on first authorization; when the column is
    -- null it may still be present in the identity payload.
    coalesce(new.email, new.raw_user_meta_data ->> 'email')
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    -- Never block account creation on profile bookkeeping. The client upserts
    -- the profile on launch, so this row is recreated on the next app open.
    raise warning 'handle_new_user: profile insert skipped for %: %', new.id, sqlerrm;
    return new;
end;
$$;

comment on function public.handle_new_user() is
  'Mirrors a new auth user into public.profiles. Deliberately cannot fail the signup: Apple omits the email on re-authorization, and a NOT NULL violation here previously surfaced to users as "Database error saving new user".';
