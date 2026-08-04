-- ============================================================
-- SEMORA SHARED DECKS — publish a flashcard deck to a Course Space
-- ============================================================
-- Roadmap Phase E. One person builds a deck (by hand or via the
-- generate-flashcards edge function) and publishes it to a course space;
-- every member pulls a PRIVATE COPY into their own decks/cards.
--
-- COPY-ON-SYNC, NOT LIVE SHARED STATE — the shape shared_deadlines and
-- group_assignments already establish (migration 037). Two reasons it must
-- work this way here specifically:
--
--   1. decks/cards carry per-user SM-2 scheduling state (ease, interval,
--      due_at, reps). That state is meaningless shared: my "due tomorrow" is
--      not yours. A copy lets every member schedule independently from a
--      common starting point.
--   2. decks_assert_parent_owner / cards_assert_parent_owner (migration 024)
--      are strictly single-owner. Rather than weaken a real cross-tenant
--      guard, published content lives in its own tables that never join a
--      user's private rows.
--
-- Published tables hold CONTENT ONLY. No scheduling columns are published, so
-- a publisher cannot leak how badly they know their own deck.
--
-- NOT PRO-GATED, deliberately. Joining a space is already free (045's
-- growth-loop reasoning) and decks/cards have no server-side quota today —
-- 044 gates courses and scans only. Gating publish here would be the first
-- server-side flashcard limit and belongs in a pricing decision, not this
-- migration.
--
-- CHANGE CONTROL: the guard against re-copying is a CONTENT HASH, not a
-- timestamp. An earlier draft keyed it on shared_decks.updated_at, which
-- publish bumps on every call — so tapping Publish twice with no edits
-- silently destroyed every member's review history. Do not "simplify" this
-- back to a timestamp.
-- ============================================================

-- ── Published deck ──────────────────────────────────────────
create table if not exists public.shared_decks (
  id uuid primary key default gen_random_uuid(),
  collaboration_id uuid not null
    references public.course_collaborations(id) on delete cascade,
  -- The publisher's own deck. Nullable so deleting your local deck does not
  -- yank the published copy out from under classmates who already synced.
  source_deck_id uuid references public.decks(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  card_count integer not null default 0,
  -- md5 over the ordered front/back pairs. The ONLY signal sync uses to decide
  -- whether a member's copy must be rebuilt.
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shared_decks_title_len check (length(btrim(title)) between 1 and 240),
  -- Republishing the same deck updates in place instead of stacking a new row
  -- in the space on every edit.
  unique (collaboration_id, source_deck_id)
);

comment on table public.shared_decks is
  'SEMORA: a flashcard deck published to a course space (051). Content only, no SM-2 '
  'state. Members copy it into their own decks/cards via sync_collaboration_decks().';

-- ── Published cards ─────────────────────────────────────────
-- The blank checks are load-bearing, not hygiene: public.cards has NOT NULL +
-- non-blank constraints, so a single blank published card made every member's
-- sync abort — taking down the whole space, not just the bad deck.
create table if not exists public.shared_deck_cards (
  id uuid primary key default gen_random_uuid(),
  shared_deck_id uuid not null
    references public.shared_decks(id) on delete cascade,
  front text not null,
  back text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint shared_deck_cards_front_not_blank check (length(btrim(front)) > 0),
  constraint shared_deck_cards_back_not_blank check (length(btrim(back)) > 0)
);

comment on table public.shared_deck_cards is
  'SEMORA: front/back content of a deck published to a course space (051). No SM-2 state.';

create index if not exists shared_deck_cards_deck_idx
  on public.shared_deck_cards(shared_deck_id, position);
-- FK target index: without it every `delete from decks` seq-scans shared_decks.
create index if not exists shared_decks_source_deck_idx
  on public.shared_decks(source_deck_id) where source_deck_id is not null;

-- ── Local provenance ────────────────────────────────────────
-- `add column ... references` is NOT idempotent: on a re-apply the column
-- exists so the whole clause is skipped and the FK is silently never created.
-- Split so the constraint is added under its own guard.
alter table public.decks add column if not exists source_shared_deck_id uuid;
alter table public.decks add column if not exists source_content_hash text;
alter table public.cards add column if not exists source_shared_deck_id uuid;

do $$ begin
  alter table public.decks add constraint decks_source_shared_deck_fkey
    foreign key (source_shared_deck_id) references public.shared_decks(id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.cards add constraint cards_source_shared_deck_fkey
    foreign key (source_shared_deck_id) references public.shared_decks(id) on delete set null;
exception when duplicate_object then null; end $$;

create unique index if not exists decks_user_source_shared_idx
  on public.decks(user_id, source_shared_deck_id)
  where source_shared_deck_id is not null;
create index if not exists cards_source_shared_deck_idx
  on public.cards(source_shared_deck_id) where source_shared_deck_id is not null;

-- ── RLS ─────────────────────────────────────────────────────
-- Members read. NOTHING writes directly: both writers are SECURITY DEFINER
-- RPCs, so there is no INSERT or UPDATE policy at all. An earlier draft used
-- `for all` to editors, which let any editor rewrite another member's
-- published cards, relocate a deck into a different space by editing
-- collaboration_id, or set updated_at to 'infinity'.
alter table public.shared_decks enable row level security;
alter table public.shared_deck_cards enable row level security;

drop policy if exists "members_read_shared_decks" on public.shared_decks;
create policy "members_read_shared_decks" on public.shared_decks
  for select to authenticated
  using (public.semora_collaboration_role(collaboration_id) is not null);

drop policy if exists "editors_write_shared_decks" on public.shared_decks;
drop policy if exists "author_or_owner_delete_shared_decks" on public.shared_decks;
-- Mirrors 037's creator_or_owner_delete_group_assignments.
create policy "author_or_owner_delete_shared_decks" on public.shared_decks
  for delete to authenticated
  using (
    created_by = auth.uid()
    or public.semora_collaboration_role(collaboration_id) = 'owner'
  );

drop policy if exists "members_read_shared_deck_cards" on public.shared_deck_cards;
create policy "members_read_shared_deck_cards" on public.shared_deck_cards
  for select to authenticated
  using (
    exists (
      select 1 from public.shared_decks d
      where d.id = shared_deck_id
        and public.semora_collaboration_role(d.collaboration_id) is not null
    )
  );

drop policy if exists "editors_write_shared_deck_cards" on public.shared_deck_cards;

-- ── Integrity trigger (defence in depth) ────────────────────
create or replace function public.assert_shared_deck_integrity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and (
    new.collaboration_id <> old.collaboration_id
    or new.created_by <> old.created_by
    or new.source_deck_id is distinct from old.source_deck_id
  ) then
    raise exception 'Shared deck ownership cannot be changed' using errcode = '42501';
  end if;
  if new.source_deck_id is not null and not exists (
    select 1 from public.decks where id = new.source_deck_id and user_id = new.created_by
  ) then
    raise exception 'Shared source deck must belong to its creator' using errcode = '42501';
  end if;
  new.updated_at := coalesce(new.updated_at, now());
  return new;
end;
$$;

-- Deliberately NOT the generic set_updated_at trigger: forcing updated_at =
-- now() here would fire on the ON CONFLICT path even when content_hash is
-- unchanged, and the sync guard would stop being able to tell a real edit from
-- a no-op republish.
drop trigger if exists assert_shared_deck_integrity_trigger on public.shared_decks;
create trigger assert_shared_deck_integrity_trigger
  before insert or update on public.shared_decks
  for each row execute function public.assert_shared_deck_integrity();

-- ── RPC: publish ────────────────────────────────────────────
create or replace function public.publish_deck_to_collaboration(
  p_deck_id uuid,
  p_collaboration_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deck_row public.decks;
  shared_id uuid;
  new_hash text;
  published int := 0;
begin
  select * into deck_row
  from public.decks
  where id = p_deck_id and user_id = auth.uid();
  if deck_row.id is null then
    raise exception 'Deck not found' using errcode = 'P0002';
  end if;

  -- coalesce is REQUIRED. semora_collaboration_role() returns NULL for a
  -- non-member, and `NULL not in (...)` evaluates to NULL, not TRUE — so the
  -- bare form fails OPEN and let a non-member publish into a space they had
  -- never joined. Verified exploitable before this coalesce was added.
  if coalesce(public.semora_collaboration_role(p_collaboration_id), '')
       not in ('owner', 'editor') then
    raise exception 'Only the space owner or an editor can publish a deck'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.course_collaborations
    where id = p_collaboration_id and is_active
  ) then
    raise exception 'This course space is no longer active' using errcode = '42501';
  end if;

  select md5(coalesce(string_agg(c.front || e'\x1f' || c.back, e'\x1e'
                                 order by c.created_at, c.id), ''))
    into new_hash
  from public.cards c where c.deck_id = p_deck_id;

  insert into public.shared_decks (
    collaboration_id, source_deck_id, created_by, title, card_count, content_hash
  )
  values (
    p_collaboration_id, p_deck_id, auth.uid(), deck_row.title,
    (select count(*) from public.cards where deck_id = p_deck_id),
    new_hash
  )
  on conflict (collaboration_id, source_deck_id) do update
    set title = excluded.title,
        card_count = excluded.card_count,
        content_hash = excluded.content_hash,
        -- Only move updated_at when the CONTENT actually changed. Bumping it
        -- unconditionally is what made a no-op republish wipe every member's
        -- review history.
        updated_at = case
          when public.shared_decks.content_hash is distinct from excluded.content_hash
          then now() else public.shared_decks.updated_at end
  returning id into shared_id;

  -- Full replace rather than a diff: decks are small, and this keeps the
  -- published copy an exact mirror without tracking per-card identity.
  delete from public.shared_deck_cards where shared_deck_id = shared_id;

  insert into public.shared_deck_cards (shared_deck_id, front, back, position)
  select shared_id, c.front, c.back,
         row_number() over (order by c.created_at, c.id)
  from public.cards c
  where c.deck_id = p_deck_id
    and length(btrim(c.front)) > 0
    and length(btrim(c.back)) > 0;
  get diagnostics published = row_count;

  return jsonb_build_object('shared_deck_id', shared_id, 'cards_published', published);
end;
$$;

revoke all on function public.publish_deck_to_collaboration(uuid, uuid) from public, anon;
grant execute on function public.publish_deck_to_collaboration(uuid, uuid) to authenticated;

-- ── RPC: sync into the caller's own decks ───────────────────
create or replace function public.sync_collaboration_decks(
  p_collaboration_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  shared record;
  local_deck_id uuid;
  local_hash text;
  inserted int;
  decks_synced int := 0;
  decks_skipped int := 0;
  cards_synced int := 0;
begin
  if public.semora_collaboration_role(p_collaboration_id) is null then
    raise exception 'Not a member of this course space' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.course_collaborations
    where id = p_collaboration_id and is_active
  ) then
    raise exception 'This course space is no longer active' using errcode = '42501';
  end if;

  for shared in
    select * from public.shared_decks
    where collaboration_id = p_collaboration_id
      -- Skip your own publications: you already have the source deck, and
      -- copying it back would leave you studying two of everything.
      and created_by <> auth.uid()
  loop
    -- Per-deck fault isolation, as 037's apply_lms_assignment_sync does. One
    -- unexpected bad row must degrade to "that deck did not sync", never to
    -- "nobody in this space can sync anything".
    begin
      select id, source_content_hash into local_deck_id, local_hash
      from public.decks
      where user_id = auth.uid() and source_shared_deck_id = shared.id;

      -- Content is byte-identical to what this member already has: leave their
      -- deck completely alone. This is the common path — sync runs on every
      -- open — and it is what protects ease/interval/due_at/reps.
      if local_deck_id is not null
         and local_hash is not null
         and local_hash is not distinct from shared.content_hash then
        update public.decks set title = shared.title, updated_at = now()
          where id = local_deck_id and title is distinct from shared.title;
        decks_skipped := decks_skipped + 1;
        continue;
      end if;

      if local_deck_id is null then
        insert into public.decks (user_id, title, source_shared_deck_id, source_content_hash)
        values (auth.uid(), shared.title, shared.id, shared.content_hash)
        -- Two devices syncing at once would otherwise abort the whole RPC on
        -- the unique index.
        on conflict (user_id, source_shared_deck_id) where source_shared_deck_id is not null
          do update set title = excluded.title,
                        source_content_hash = excluded.source_content_hash
        returning id into local_deck_id;
      else
        update public.decks
          set title = shared.title,
              source_content_hash = shared.content_hash,
              updated_at = now()
        where id = local_deck_id;
      end if;

      -- Scoped to cards that CAME FROM this shared deck. Deleting by deck_id
      -- alone would also destroy any cards the member added themselves, which
      -- turns "republish refreshes the shared cards" into "republish erases
      -- your own notes".
      delete from public.cards
      where deck_id = local_deck_id
        and user_id = auth.uid()
        and source_shared_deck_id = shared.id;

      -- public.cards has no position column and lib/flashcards.ts orders by
      -- created_at, so the author's order is carried across as a sub-second
      -- offset rather than being silently discarded.
      insert into public.cards (user_id, deck_id, front, back, source_shared_deck_id, created_at)
      select auth.uid(), local_deck_id, sc.front, sc.back, shared.id,
             now() + (sc.position * interval '1 millisecond')
      from public.shared_deck_cards sc
      where sc.shared_deck_id = shared.id;

      -- Accumulate. Assigning row_count straight into cards_synced would
      -- report only the last deck's cards when several sync at once.
      get diagnostics inserted = row_count;
      cards_synced := cards_synced + inserted;
      decks_synced := decks_synced + 1;
    exception when others then
      decks_skipped := decks_skipped + 1;
      continue;
    end;
  end loop;

  return jsonb_build_object(
    'decks_synced', decks_synced,
    'decks_skipped', decks_skipped,
    'cards_synced', cards_synced
  );
end;
$$;

revoke all on function public.sync_collaboration_decks(uuid) from public, anon;
grant execute on function public.sync_collaboration_decks(uuid) to authenticated;

-- ── Realtime ────────────────────────────────────────────────
-- `undefined_object` matters: without it, a project where the publication does
-- not exist aborts the migration after all the DDL above has already run.
alter table public.shared_decks replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.shared_decks;
exception when duplicate_object or undefined_object then null;
end $$;
