-- Tests for 145 (run after harness.sql, 140, 142, 143, 144, 145 on a THROWAWAY database).
set client_min_messages = warning;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');
insert into public.lecture_recordings (id, user_id, title, status, source)
values ('45000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'L', 'recording', 'recording');
grant insert, select, update on public.lecture_recordings, public.lecture_segments to authenticated;

-- ── marks ──
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin
  assert public.lecture_add_important_marks('45000000-0000-0000-0000-000000000001', array[5]) is null, 'another user cannot mark';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare m integer[];
begin
  m := public.lecture_add_important_marks('45000000-0000-0000-0000-000000000001', array[300, 60, 64, -1, 99999]);
  assert m = array[60, 300], format('merged, deduped, bounded: %s', m);
  m := public.lecture_add_important_marks('45000000-0000-0000-0000-000000000001', array[300, 60, 900]);
  assert m = array[60, 300, 900], format('resend is idempotent: %s', m);
  m := public.lecture_add_important_marks('45000000-0000-0000-0000-000000000001', (select array_agg(g * 20) from generate_series(1, 400) g));
  assert cardinality(m) = 200, format('capped at 200: %s', cardinality(m));
end $$;

-- ── a document note still inserts; a phone cannot write timings ──
insert into public.lecture_recordings (user_id, title, transcript, source, source_filename)
values ('00000000-0000-0000-0000-00000000000a', 'Doc', 'text', 'document', 'a.pdf');
insert into public.lecture_segments (lecture_id, user_id, seq, status, seconds, timings)
values ('45000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 0, 'done', 120, '[[0,1,"x"]]');
reset role;
do $$
declare r record;
begin
  select * into r from public.lecture_segments where lecture_id = '45000000-0000-0000-0000-000000000001' and seq = 0;
  assert r.timings is null and r.status = 'pending', 'phone insert cannot set timings or status';
  assert exists (select 1 from public.lecture_recordings where source = 'document' and important_marks is null), 'document note inserted';
  assert not has_function_privilege('anon', 'public.lecture_add_important_marks(uuid, integer[])', 'execute'), 'anon cannot mark';
end $$;

-- the server can
update public.lecture_segments set timings = '[[0,1.5,"hello"]]', status = 'done'
where lecture_id = '45000000-0000-0000-0000-000000000001' and seq = 0;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update public.lecture_segments set timings = null, seconds = 1 where lecture_id = '45000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  assert (select timings from public.lecture_segments where seq = 0) = '[[0,1.5,"hello"]]'::jsonb, 'a done part is the server''s';
end $$;
