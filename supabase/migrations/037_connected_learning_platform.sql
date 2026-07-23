-- ============================================================
-- SEMORA CONNECTED LEARNING PLATFORM
-- LMS imports, live classroom collaboration, and sync metadata.
-- Additive only; the shared Citizen app is not touched.
-- ============================================================

-- ─── LMS connections (credentials remain device-local) ─────

create table public.lms_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('canvas', 'blackboard', 'moodle', 'google_classroom')),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  base_url text,
  account_label text,
  sync_enabled boolean not null default true,
  last_synced_at timestamptz,
  last_sync_status text not null default 'never'
    check (last_sync_status in ('never', 'syncing', 'success', 'partial', 'error', 'credentials_required')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lms_connections_user_idx on public.lms_connections(user_id, created_at desc);
comment on table public.lms_connections is
  'SEMORA: LMS connection metadata. Access credentials are stored only in device SecureStore.';

create table public.lms_course_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.lms_connections(id) on delete cascade,
  external_course_id text not null,
  external_name text not null,
  local_course_id uuid not null references public.courses(id) on delete cascade,
  sync_enabled boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(connection_id, external_course_id),
  unique(connection_id, local_course_id)
);

create index lms_course_links_user_idx on public.lms_course_links(user_id);
create index lms_course_links_local_course_idx on public.lms_course_links(local_course_id);
comment on table public.lms_course_links is
  'SEMORA: maps one external LMS course to one user-owned Semora course.';

alter table public.tasks
  add column if not exists lms_connection_id uuid references public.lms_connections(id) on delete set null,
  add column if not exists lms_external_course_id text,
  add column if not exists lms_external_id text,
  add column if not exists lms_external_updated_at timestamptz,
  add column if not exists lms_url text,
  add column if not exists lms_last_synced_at timestamptz,
  add column if not exists lms_removed_at timestamptz;

alter table public.tasks
  add constraint tasks_lms_external_unique unique(lms_connection_id, lms_external_id);

create index tasks_lms_course_idx
  on public.tasks(lms_connection_id, lms_external_course_id)
  where lms_connection_id is not null;

-- Keep all LMS links inside the caller's tenant even if a client is modified.
create or replace function public.lms_course_links_assert_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  connection_user uuid;
  course_user uuid;
begin
  select user_id into connection_user from public.lms_connections where id = new.connection_id;
  select user_id into course_user from public.courses where id = new.local_course_id;
  if connection_user is null or course_user is null then
    raise exception 'Referenced LMS connection or course does not exist' using errcode = '23503';
  end if;
  if connection_user <> new.user_id or course_user <> new.user_id then
    raise exception 'LMS course link must stay inside one user account' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger lms_course_links_assert_owner_trigger
  before insert or update of user_id, connection_id, local_course_id
  on public.lms_course_links
  for each row execute function public.lms_course_links_assert_owner();

create or replace function public.set_semora_connected_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tasks predate the app's newer updated-at convention. Conflict detection for
-- offline edits needs this timestamp to reflect every server-side change.
create trigger semora_tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_semora_connected_updated_at();
create trigger lms_connections_updated_at
  before update on public.lms_connections
  for each row execute function public.set_semora_connected_updated_at();
create trigger lms_course_links_updated_at
  before update on public.lms_course_links
  for each row execute function public.set_semora_connected_updated_at();

alter table public.lms_connections enable row level security;
alter table public.lms_course_links enable row level security;

create policy "own_lms_connections" on public.lms_connections
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "own_lms_course_links" on public.lms_course_links
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Atomic, idempotent LMS import. LMS-owned fields refresh; student-owned
-- planning, reminders, local completion, and manual grades are preserved.
create or replace function public.apply_lms_assignment_sync(
  p_connection_id uuid,
  p_items jsonb,
  p_external_course_ids text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  connection_user uuid;
  item jsonb;
  local_course uuid;
  external_course text;
  external_assignment text;
  due_on date;
  due_clock time;
  task_kind public.task_type;
  processed int := 0;
  skipped int := 0;
  received_ids text[] := array[]::text[];
begin
  select user_id into connection_user
  from public.lms_connections
  where id = p_connection_id;

  if connection_user is null or connection_user <> auth.uid() then
    raise exception 'LMS connection not found' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'LMS items must be an array' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    begin
      local_course := nullif(item ->> 'local_course_id', '')::uuid;
      external_course := nullif(item ->> 'external_course_id', '');
      external_assignment := nullif(item ->> 'external_id', '');
      due_on := nullif(item ->> 'due_date', '')::date;
      due_clock := nullif(item ->> 'due_time', '')::time;
    exception when others then
      skipped := skipped + 1;
      continue;
    end;

    if local_course is null or external_course is null or external_assignment is null
       or due_on is null or nullif(btrim(item ->> 'title'), '') is null
       or not exists (
         select 1 from public.lms_course_links link
         where link.connection_id = p_connection_id
           and link.external_course_id = external_course
           and link.local_course_id = local_course
           and link.user_id = auth.uid()
           and link.sync_enabled
       ) then
      skipped := skipped + 1;
      continue;
    end if;

    task_kind := case lower(coalesce(item ->> 'type', 'assignment'))
      when 'quiz' then 'quiz'::public.task_type
      when 'exam' then 'exam'::public.task_type
      when 'project' then 'project'::public.task_type
      when 'reading' then 'reading'::public.task_type
      when 'other' then 'other'::public.task_type
      else 'assignment'::public.task_type
    end;

    insert into public.tasks (
      user_id, course_id, title, description, type, due_date, due_time,
      points_possible, score, points_earned, is_completed, completed_at,
      source, lms_connection_id, lms_external_course_id, lms_external_id,
      lms_external_updated_at, lms_url, lms_last_synced_at, lms_removed_at
    ) values (
      auth.uid(), local_course, btrim(item ->> 'title'), nullif(item ->> 'description', ''),
      task_kind, due_on, due_clock,
      nullif(item ->> 'points_possible', '')::numeric,
      nullif(item ->> 'score', '')::numeric,
      nullif(item ->> 'points_earned', '')::numeric,
      coalesce((item ->> 'is_completed')::boolean, false),
      case when coalesce((item ->> 'is_completed')::boolean, false) then now() else null end,
      'manual'::public.source_type, p_connection_id, external_course, external_assignment,
      nullif(item ->> 'external_updated_at', '')::timestamptz,
      nullif(item ->> 'url', ''), now(), null
    )
    on conflict on constraint tasks_lms_external_unique do update set
      course_id = excluded.course_id,
      title = excluded.title,
      description = excluded.description,
      type = excluded.type,
      due_date = excluded.due_date,
      due_time = excluded.due_time,
      points_possible = coalesce(excluded.points_possible, public.tasks.points_possible),
      score = coalesce(excluded.score, public.tasks.score),
      points_earned = coalesce(excluded.points_earned, public.tasks.points_earned),
      is_completed = public.tasks.is_completed or excluded.is_completed,
      completed_at = case
        when public.tasks.is_completed then public.tasks.completed_at
        when excluded.is_completed then coalesce(public.tasks.completed_at, now())
        else public.tasks.completed_at
      end,
      lms_external_course_id = excluded.lms_external_course_id,
      lms_external_updated_at = excluded.lms_external_updated_at,
      lms_url = excluded.lms_url,
      lms_last_synced_at = now(),
      lms_removed_at = null;

    received_ids := array_append(received_ids, external_assignment);
    processed := processed + 1;
  end loop;

  -- Never delete work that disappeared upstream. Mark it so the UI can explain
  -- the source change while preserving the student's completion and grades.
  if coalesce(array_length(p_external_course_ids, 1), 0) > 0 then
    update public.tasks
    set lms_removed_at = now(), lms_last_synced_at = now()
    where user_id = auth.uid()
      and lms_connection_id = p_connection_id
      and lms_external_course_id = any(p_external_course_ids)
      and not (lms_external_id = any(received_ids));
  end if;

  update public.lms_connections
  set last_synced_at = now(),
      last_sync_status = case when skipped > 0 then 'partial' else 'success' end,
      last_error = case when skipped > 0 then skipped || ' items skipped because they had no usable due date or course mapping' else null end
  where id = p_connection_id and user_id = auth.uid();

  update public.lms_course_links
  set last_synced_at = now()
  where connection_id = p_connection_id and user_id = auth.uid();

  return jsonb_build_object('processed', processed, 'skipped', skipped);
end;
$$;

revoke all on function public.apply_lms_assignment_sync(uuid, jsonb, text[]) from public, anon;
grant execute on function public.apply_lms_assignment_sync(uuid, jsonb, text[]) to authenticated;

-- ─── Live course collaboration ─────────────────────────────

create table public.course_collaborations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  course_name text not null,
  course_color text not null default '#6366f1',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(course_id)
);

create table public.course_collaboration_members (
  collaboration_id uuid not null references public.course_collaborations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  display_name text not null default 'Classmate',
  local_course_id uuid references public.courses(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key(collaboration_id, user_id)
);

create table public.course_collaboration_invites (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references public.course_collaborations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses int not null default 30 check (max_uses between 1 and 200),
  use_count int not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.shared_deadlines (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references public.course_collaborations(id) on delete cascade,
  source_task_id uuid references public.tasks(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 240),
  description text,
  task_type public.task_type not null default 'assignment',
  due_date date not null,
  due_time time,
  points_possible numeric,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(collaboration_id, source_task_id)
);

create table public.group_assignments (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null references public.course_collaborations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 240),
  description text,
  due_date date not null,
  due_time time,
  is_completed boolean not null default false,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tasks
  add column if not exists collaboration_deadline_id uuid references public.shared_deadlines(id) on delete set null,
  add column if not exists group_assignment_id uuid references public.group_assignments(id) on delete set null;
create unique index tasks_user_collaboration_deadline_unique
  on public.tasks(user_id, collaboration_deadline_id)
  where collaboration_deadline_id is not null;
create unique index tasks_user_group_assignment_unique
  on public.tasks(user_id, group_assignment_id)
  where group_assignment_id is not null;

comment on table public.course_collaborations is 'SEMORA: live shared-course collaboration spaces.';
comment on table public.course_collaboration_members is 'SEMORA: accepted members and roles for live course collaboration.';
comment on table public.course_collaboration_invites is 'SEMORA: expiring unguessable join links for course collaboration.';
comment on table public.shared_deadlines is 'SEMORA: owner-published course deadlines visible to collaboration members.';
comment on table public.group_assignments is 'SEMORA: live group assignments shared by collaboration members.';

create index collaboration_members_user_idx on public.course_collaboration_members(user_id);
create index shared_deadlines_collaboration_due_idx on public.shared_deadlines(collaboration_id, due_date);
create index group_assignments_collaboration_due_idx on public.group_assignments(collaboration_id, due_date);

-- Live updates are scoped by RLS on the subscribed rows.
do $$
begin
  alter publication supabase_realtime add table public.course_collaborations;
exception when duplicate_object or undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.course_collaboration_members;
exception when duplicate_object or undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.shared_deadlines;
exception when duplicate_object or undefined_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.group_assignments;
exception when duplicate_object or undefined_object then null;
end $$;

create trigger course_collaborations_updated_at
  before update on public.course_collaborations
  for each row execute function public.set_semora_connected_updated_at();
create trigger shared_deadlines_updated_at
  before update on public.shared_deadlines
  for each row execute function public.set_semora_connected_updated_at();
create trigger group_assignments_updated_at
  before update on public.group_assignments
  for each row execute function public.set_semora_connected_updated_at();

create or replace function public.semora_collaboration_role(
  p_collaboration_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role
  from public.course_collaboration_members
  where collaboration_id = p_collaboration_id and user_id = auth.uid()
  limit 1;
$$;
revoke all on function public.semora_collaboration_role(uuid) from public, anon;
grant execute on function public.semora_collaboration_role(uuid) to authenticated;

alter table public.course_collaborations enable row level security;
alter table public.course_collaboration_members enable row level security;
alter table public.course_collaboration_invites enable row level security;
alter table public.shared_deadlines enable row level security;
alter table public.group_assignments enable row level security;

create policy "members_read_collaborations" on public.course_collaborations
  for select to authenticated
  using (public.semora_collaboration_role(id) is not null);
create policy "owners_create_collaborations" on public.course_collaborations
  for insert to authenticated
  with check (
    auth.uid() = owner_user_id
    and exists (select 1 from public.courses c where c.id = course_id and c.user_id = auth.uid())
  );
create policy "owners_update_collaborations" on public.course_collaborations
  for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
create policy "owners_delete_collaborations" on public.course_collaborations
  for delete to authenticated using (owner_user_id = auth.uid());

create policy "members_read_members" on public.course_collaboration_members
  for select to authenticated
  using (public.semora_collaboration_role(collaboration_id) is not null);

create policy "invite_creators_read" on public.course_collaboration_invites
  for select to authenticated using (created_by = auth.uid());

create policy "members_read_shared_deadlines" on public.shared_deadlines
  for select to authenticated
  using (public.semora_collaboration_role(collaboration_id) is not null);
create policy "editors_create_shared_deadlines" on public.shared_deadlines
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.semora_collaboration_role(collaboration_id) in ('owner', 'editor')
  );
create policy "editors_update_shared_deadlines" on public.shared_deadlines
  for update to authenticated
  using (public.semora_collaboration_role(collaboration_id) in ('owner', 'editor'))
  with check (public.semora_collaboration_role(collaboration_id) in ('owner', 'editor'));
create policy "editors_delete_shared_deadlines" on public.shared_deadlines
  for delete to authenticated
  using (public.semora_collaboration_role(collaboration_id) in ('owner', 'editor'));

create policy "members_read_group_assignments" on public.group_assignments
  for select to authenticated
  using (public.semora_collaboration_role(collaboration_id) is not null);
create policy "editors_create_group_assignments" on public.group_assignments
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.semora_collaboration_role(collaboration_id) in ('owner', 'editor')
  );
create policy "editors_update_group_assignments" on public.group_assignments
  for update to authenticated
  using (public.semora_collaboration_role(collaboration_id) in ('owner', 'editor'))
  with check (public.semora_collaboration_role(collaboration_id) in ('owner', 'editor'));
create policy "creator_or_owner_delete_group_assignments" on public.group_assignments
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.semora_collaboration_role(collaboration_id) = 'owner'
  );

-- Shared rows may be edited by multiple people, so tenant-defining columns are
-- immutable and all referenced people/tasks must belong to the collaboration.
create or replace function public.assert_shared_deadline_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (
    new.collaboration_id <> old.collaboration_id
    or new.created_by <> old.created_by
    or new.source_task_id is distinct from old.source_task_id
  ) then
    raise exception 'Shared deadline ownership cannot be changed' using errcode = '42501';
  end if;
  if new.source_task_id is not null and not exists (
    select 1 from public.tasks
    where id = new.source_task_id and user_id = new.created_by
  ) then
    raise exception 'Shared source task must belong to its creator' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger assert_shared_deadline_integrity_trigger
  before insert or update on public.shared_deadlines
  for each row execute function public.assert_shared_deadline_integrity();

create or replace function public.assert_group_assignment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (
    new.collaboration_id <> old.collaboration_id
    or new.created_by <> old.created_by
  ) then
    raise exception 'Group assignment ownership cannot be changed' using errcode = '42501';
  end if;
  if new.assigned_to is not null and not exists (
    select 1 from public.course_collaboration_members
    where collaboration_id = new.collaboration_id and user_id = new.assigned_to
  ) then
    raise exception 'Assignee must be a collaboration member' using errcode = '42501';
  end if;
  if new.completed_by is not null and not exists (
    select 1 from public.course_collaboration_members
    where collaboration_id = new.collaboration_id and user_id = new.completed_by
  ) then
    raise exception 'Completer must be a collaboration member' using errcode = '42501';
  end if;
  if new.is_completed and new.completed_by is null then
    new.completed_by = auth.uid();
  elsif not new.is_completed then
    new.completed_by = null;
    new.completed_at = null;
  end if;
  if new.is_completed and new.completed_at is null then
    new.completed_at = now();
  end if;
  return new;
end;
$$;

create trigger assert_group_assignment_integrity_trigger
  before insert or update on public.group_assignments
  for each row execute function public.assert_group_assignment_integrity();

-- Owner membership is created with the collaboration in the same transaction.
create or replace function public.add_course_collaboration_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_name text;
begin
  select coalesce(nullif(btrim(display_name), ''), split_part(email, '@', 1), 'Owner')
  into owner_name from public.profiles where id = new.owner_user_id;
  insert into public.course_collaboration_members(
    collaboration_id, user_id, role, display_name, local_course_id
  ) values (new.id, new.owner_user_id, 'owner', coalesce(owner_name, 'Owner'), new.course_id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger add_course_collaboration_owner_trigger
  after insert on public.course_collaborations
  for each row execute function public.add_course_collaboration_owner();

create or replace function public.create_course_collaboration(p_course_id uuid)
returns public.course_collaborations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  course_row public.courses;
  result public.course_collaborations;
begin
  select * into course_row from public.courses where id = p_course_id and user_id = auth.uid();
  if course_row.id is null then raise exception 'Course not found' using errcode = '42501'; end if;
  insert into public.course_collaborations(owner_user_id, course_id, course_name, course_color)
  values(auth.uid(), course_row.id, course_row.name, course_row.color)
  on conflict(course_id) do update set
    course_name = excluded.course_name,
    course_color = excluded.course_color,
    is_active = true
  returning * into result;
  return result;
end;
$$;

create or replace function public.create_course_collaboration_invite(p_collaboration_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invite_token text;
begin
  if public.semora_collaboration_role(p_collaboration_id) not in ('owner', 'editor') then
    raise exception 'Only editors can invite classmates' using errcode = '42501';
  end if;
  invite_token := encode(gen_random_bytes(24), 'hex');
  insert into public.course_collaboration_invites(collaboration_id, created_by, token)
  values(p_collaboration_id, auth.uid(), invite_token);
  return invite_token;
end;
$$;

create or replace function public.join_course_collaboration(
  p_token text,
  p_display_name text default null
)
returns public.course_collaborations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invite_row public.course_collaboration_invites;
  result public.course_collaborations;
  member_name text;
  already_member boolean;
begin
  select * into invite_row
  from public.course_collaboration_invites
  where token = p_token and not revoked and expires_at > now() and use_count < max_uses
  for update;
  if invite_row.id is null then raise exception 'This collaboration invite is invalid or expired' using errcode = '22023'; end if;

  select coalesce(
    nullif(btrim(p_display_name), ''),
    nullif(btrim(display_name), ''),
    split_part(email, '@', 1),
    'Classmate'
  ) into member_name from public.profiles where id = auth.uid();

  select exists (
    select 1 from public.course_collaboration_members
    where collaboration_id = invite_row.collaboration_id and user_id = auth.uid()
  ) into already_member;

  insert into public.course_collaboration_members(collaboration_id, user_id, role, display_name)
  values(invite_row.collaboration_id, auth.uid(), 'editor', coalesce(member_name, 'Classmate'))
  on conflict(collaboration_id, user_id) do update
    set display_name = excluded.display_name;

  if not already_member then
    update public.course_collaboration_invites set use_count = use_count + 1 where id = invite_row.id;
  end if;

  select * into result from public.course_collaborations where id = invite_row.collaboration_id and is_active;
  if result.id is null then raise exception 'This collaboration is no longer active' using errcode = '22023'; end if;
  return result;
end;
$$;

create or replace function public.set_collaboration_local_course(
  p_collaboration_id uuid,
  p_course_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.courses
    where id = p_course_id and user_id = auth.uid()
  ) then
    raise exception 'Local course not found' using errcode = '42501';
  end if;

  update public.course_collaboration_members
  set local_course_id = p_course_id
  where collaboration_id = p_collaboration_id and user_id = auth.uid();

  if not found then
    raise exception 'Collaboration membership not found' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.sync_collaboration_to_planner(
  p_collaboration_id uuid,
  p_semester_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  collaboration_row public.course_collaborations;
  local_course uuid;
  deadline_count int := 0;
  group_count int := 0;
begin
  select collaboration.* into collaboration_row
  from public.course_collaborations collaboration
  join public.course_collaboration_members member
    on member.collaboration_id = collaboration.id
   and member.user_id = auth.uid()
  where collaboration.id = p_collaboration_id and collaboration.is_active;

  if collaboration_row.id is null then
    raise exception 'Collaboration not found' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.semesters
    where id = p_semester_id and user_id = auth.uid()
  ) then
    raise exception 'Semester not found' using errcode = '42501';
  end if;

  select member.local_course_id into local_course
  from public.course_collaboration_members member
  join public.courses course
    on course.id = member.local_course_id and course.user_id = auth.uid()
  where member.collaboration_id = p_collaboration_id and member.user_id = auth.uid();

  if local_course is null then
    insert into public.courses(user_id, semester_id, name, color, icon)
    values(auth.uid(), p_semester_id, collaboration_row.course_name, collaboration_row.course_color, 'people')
    returning id into local_course;

    update public.course_collaboration_members
    set local_course_id = local_course
    where collaboration_id = p_collaboration_id and user_id = auth.uid();
  end if;

  insert into public.tasks(
    user_id, course_id, title, description, type, due_date, due_time,
    points_possible, collaboration_deadline_id, source
  )
  select
    auth.uid(), local_course, deadline.title, deadline.description,
    deadline.task_type, deadline.due_date, deadline.due_time,
    deadline.points_possible, deadline.id, 'manual'::public.source_type
  from public.shared_deadlines deadline
  where deadline.collaboration_id = p_collaboration_id
  on conflict (user_id, collaboration_deadline_id)
    where collaboration_deadline_id is not null
  do update set
    course_id = excluded.course_id,
    title = excluded.title,
    description = excluded.description,
    type = excluded.type,
    due_date = excluded.due_date,
    due_time = excluded.due_time,
    points_possible = coalesce(excluded.points_possible, public.tasks.points_possible);
  get diagnostics deadline_count = row_count;

  insert into public.tasks(
    user_id, course_id, title, description, type, due_date, due_time,
    is_completed, completed_at, group_assignment_id, source
  )
  select
    auth.uid(), local_course, assignment.title, assignment.description,
    'assignment'::public.task_type, assignment.due_date, assignment.due_time,
    assignment.is_completed, assignment.completed_at, assignment.id,
    'manual'::public.source_type
  from public.group_assignments assignment
  where assignment.collaboration_id = p_collaboration_id
  on conflict (user_id, group_assignment_id)
    where group_assignment_id is not null
  do update set
    course_id = excluded.course_id,
    title = excluded.title,
    description = excluded.description,
    due_date = excluded.due_date,
    due_time = excluded.due_time,
    is_completed = public.tasks.is_completed or excluded.is_completed,
    completed_at = case
      when public.tasks.is_completed then public.tasks.completed_at
      when excluded.is_completed then excluded.completed_at
      else public.tasks.completed_at
    end;
  get diagnostics group_count = row_count;

  return jsonb_build_object(
    'course_id', local_course,
    'deadlines_synced', deadline_count,
    'group_assignments_synced', group_count
  );
end;
$$;

create or replace function public.publish_course_deadlines(p_collaboration_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  collaboration_row public.course_collaborations;
  published int := 0;
begin
  select * into collaboration_row
  from public.course_collaborations
  where id = p_collaboration_id and owner_user_id = auth.uid() and is_active;
  if collaboration_row.id is null then
    raise exception 'Only the course owner can publish deadlines' using errcode = '42501';
  end if;

  insert into public.shared_deadlines(
    collaboration_id, source_task_id, created_by, title, description,
    task_type, due_date, due_time, points_possible, source_updated_at
  )
  select
    collaboration_row.id, task.id, auth.uid(), task.title, task.description,
    task.type, task.due_date, task.due_time, task.points_possible, task.updated_at
  from public.tasks task
  where task.course_id = collaboration_row.course_id
    and task.user_id = auth.uid()
    and not task.is_completed
  on conflict(collaboration_id, source_task_id) do update set
    title = excluded.title,
    description = excluded.description,
    task_type = excluded.task_type,
    due_date = excluded.due_date,
    due_time = excluded.due_time,
    points_possible = excluded.points_possible,
    source_updated_at = excluded.source_updated_at;

  get diagnostics published = row_count;
  return published;
end;
$$;

revoke all on function public.create_course_collaboration(uuid) from public, anon;
revoke all on function public.create_course_collaboration_invite(uuid) from public, anon;
revoke all on function public.join_course_collaboration(text, text) from public, anon;
revoke all on function public.publish_course_deadlines(uuid) from public, anon;
revoke all on function public.set_collaboration_local_course(uuid, uuid) from public, anon;
revoke all on function public.sync_collaboration_to_planner(uuid, uuid) from public, anon;
grant execute on function public.create_course_collaboration(uuid) to authenticated;
grant execute on function public.create_course_collaboration_invite(uuid) to authenticated;
grant execute on function public.join_course_collaboration(text, text) to authenticated;
grant execute on function public.publish_course_deadlines(uuid) to authenticated;
grant execute on function public.set_collaboration_local_course(uuid, uuid) to authenticated;
grant execute on function public.sync_collaboration_to_planner(uuid, uuid) to authenticated;
