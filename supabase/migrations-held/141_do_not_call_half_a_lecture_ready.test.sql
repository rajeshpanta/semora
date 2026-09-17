-- Tests for migration 141 (an incomplete lecture is not announced as ready).
--
-- These run against a THROWAWAY database, never production:
--
--   createdb semora_mig_test
--   psql -v ON_ERROR_STOP=1 -d semora_mig_test \
--     -f supabase/tests/141_do_not_call_half_a_lecture_ready.test.sql
--   dropdb semora_mig_test
--
-- pg_net and the vault do not exist here, so both are stubbed: net.http_post
-- records the push it was asked to send into a table, which is exactly what the
-- assertions need to read. Everything else — the 8am-to-8pm local rule, the
-- 24-hour window, one push per lecture ever — is the real function's own code.
--
-- The lecture in the second fixture is 2026-09-14's, in miniature: notes
-- written from the audio that arrived, four parts that never did, and a push
-- that said "Your lecture notes are ready".

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());

create table public.profiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  timezone text
);

create table public.push_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  token   text not null
);

create table public.lecture_recordings (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  title                   text,
  status                  text not null default 'recording',
  notes_md                text,
  notes_auto_attempts     integer not null default 0,
  notes_ready_notified_at timestamptz,
  parts_missing           integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ── stubs ───────────────────────────────────────────────────────────────────
create schema if not exists vault;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values ('push_send_secret', 'test-secret');

create table public.sent_pushes (
  id   bigserial primary key,
  body jsonb not null
);

create schema if not exists net;
create function net.http_post(
  url text,
  headers jsonb default '{}'::jsonb,
  body jsonb default '{}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint
language plpgsql
as $stub$
begin
  insert into public.sent_pushes (body) values (body);
  return 1;
end
$stub$;

-- ── the migration under test ────────────────────────────────────────────────
\ir ../migrations/141_do_not_call_half_a_lecture_ready.sql

-- ── fixtures ────────────────────────────────────────────────────────────────
-- The local-hour gate is real, so the timezone is chosen to put both students
-- at midday wherever this happens to run. Otherwise the test would pass or fail
-- depending on the hour.
do $fixture$
declare tz text;
begin
  select name into tz from pg_timezone_names
   where extract(hour from (now() at time zone name)) = 12
   limit 1;
  if tz is null then raise exception 'no timezone puts us at midday'; end if;

  insert into auth.users (id) values
    ('aaaaaaaa-0000-0000-0000-000000000001'),
    ('aaaaaaaa-0000-0000-0000-000000000002');
  insert into public.profiles (id, timezone) values
    ('aaaaaaaa-0000-0000-0000-000000000001', tz),
    ('aaaaaaaa-0000-0000-0000-000000000002', tz);
  insert into public.push_tokens (user_id, token) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 't1'),
    ('aaaaaaaa-0000-0000-0000-000000000002', 't2');

  -- Complete.
  insert into public.lecture_recordings
    (id, user_id, title, status, notes_md, notes_auto_attempts, parts_missing)
  values ('bbbbbbbb-0000-0000-0000-000000000001',
          'aaaaaaaa-0000-0000-0000-000000000001',
          'Organic Chemistry', 'ready', '# notes', 1, 0);

  -- Four parts short. This is 04cd64e7.
  insert into public.lecture_recordings
    (id, user_id, title, status, notes_md, notes_auto_attempts, parts_missing)
  values ('bbbbbbbb-0000-0000-0000-000000000002',
          'aaaaaaaa-0000-0000-0000-000000000002',
          'Lecture · Sep 14', 'ready', '# notes', 1, 4);
end
$fixture$;

select public.notify_lecture_notes_ready();

-- ── a complete lecture reads exactly as it always did ───────────────────────
do $test$
declare b jsonb;
begin
  select body into b from public.sent_pushes
   where body->'data'->>'lectureId' = 'bbbbbbbb-0000-0000-0000-000000000001';
  if b is null then raise exception 'the complete lecture got no push'; end if;
  if b->>'title' <> 'Your lecture notes are ready' then
    raise exception 'complete title changed: %', b->>'title';
  end if;
  if b->>'body' <> 'We finished the notes for “Organic Chemistry”.' then
    raise exception 'complete body changed: %', b->>'body';
  end if;
  if b->'translations'->'es'->>'title' <> 'Tus apuntes de la clase están listos' then
    raise exception 'complete Spanish title changed: %', b->'translations'->'es'->>'title';
  end if;
  raise notice '141 ok: a complete lecture is announced exactly as before';
end
$test$;

-- ── an incomplete one says so, in both languages, with the count ────────────
do $test$
declare b jsonb;
begin
  select body into b from public.sent_pushes
   where body->'data'->>'lectureId' = 'bbbbbbbb-0000-0000-0000-000000000002';
  if b is null then raise exception 'the incomplete lecture got no push at all'; end if;
  if b->>'title' <> 'Your lecture notes are ready, with parts missing' then
    raise exception 'incomplete title is %', b->>'title';
  end if;
  if b->>'body' not like '%4 parts are still missing.%' then
    raise exception 'incomplete body does not carry the count: %', b->>'body';
  end if;
  if b->>'body' not like '%Lecture · Sep 14%' then
    raise exception 'incomplete body lost the title: %', b->>'body';
  end if;
  if b->'translations'->'es'->>'title' <> 'Tus apuntes están listos, pero faltan partes' then
    raise exception 'incomplete Spanish title is %', b->'translations'->'es'->>'title';
  end if;
  if b->'translations'->'es'->>'body' not like '%Todavía faltan 4 partes.%' then
    raise exception 'incomplete Spanish body is %', b->'translations'->'es'->>'body';
  end if;
  raise notice '141 ok: an incomplete lecture is announced as incomplete, with the count';
end
$test$;

-- ── one part missing reads as one part, not "1 parts" ───────────────────────
do $test$
declare b jsonb; tz text;
begin
  select timezone into tz from public.profiles limit 1;
  insert into auth.users (id) values ('aaaaaaaa-0000-0000-0000-000000000003');
  insert into public.profiles (id, timezone) values ('aaaaaaaa-0000-0000-0000-000000000003', tz);
  insert into public.push_tokens (user_id, token) values ('aaaaaaaa-0000-0000-0000-000000000003', 't3');
  insert into public.lecture_recordings
    (id, user_id, title, status, notes_md, notes_auto_attempts, parts_missing)
  values ('bbbbbbbb-0000-0000-0000-000000000003',
          'aaaaaaaa-0000-0000-0000-000000000003',
          null, 'ready', '# notes', 1, 1);

  perform public.notify_lecture_notes_ready();

  select body into b from public.sent_pushes
   where body->'data'->>'lectureId' = 'bbbbbbbb-0000-0000-0000-000000000003';
  if b->>'body' not like '%1 part is still missing.%' then
    raise exception 'singular is wrong: %', b->>'body';
  end if;
  if b->'translations'->'es'->>'body' not like '%Todavía falta 1 parte.%' then
    raise exception 'Spanish singular is wrong: %', b->'translations'->'es'->>'body';
  end if;
  -- An untitled lecture still gets a sentence.
  if b->>'body' not like 'We wrote up your lecture from the audio that reached us.%' then
    raise exception 'untitled body is wrong: %', b->>'body';
  end if;
  raise notice '141 ok: one missing part reads as one part, titled or not';
end
$test$;

-- ── still one push per lecture, ever ────────────────────────────────────────
do $test$
declare n integer;
begin
  perform public.notify_lecture_notes_ready();
  perform public.notify_lecture_notes_ready();
  select count(*) into n from public.sent_pushes;
  if n <> 3 then raise exception 'expected 3 pushes in total, got %', n; end if;
  raise notice '141 ok: repeat runs send nothing; still one push per lecture';
end
$test$;
