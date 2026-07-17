-- ============================================================
-- FLASHCARDS + SPACED REPETITION (Pro feature)
-- ============================================================
-- Two tables: `decks` (a named set of cards, optionally scoped to a
-- course) and `cards` (a front/back pair carrying SM-2-lite scheduling
-- state). Study mode grades each card again/hard/good/easy and advances
-- its ease/interval/due_at; the client scheduler (lib/flashcards.ts)
-- computes the next values and the mutation persists them here.
--
-- Tenant safety mirrors migrations 015/018: every child carries a
-- denormalized user_id, RLS is `auth.uid() = user_id`, and BEFORE
-- INSERT/UPDATE triggers assert that the referenced parent
-- (decks.course_id → courses, cards.deck_id → decks) resolves to a row
-- owned by the SAME user — so a card can't reference another user's deck
-- and a deck can't reference another user's course.
--
-- SEMORA-owned (verify against supabase/SUPABASE_OWNERSHIP.md). Additive
-- only. Tagged via COMMENT ON TABLE per the ownership convention so the
-- shared-project audit (Semora + Citizen) can attribute it correctly.
-- ============================================================

-- ─── decks ──────────────────────────────────────────────────────
-- course_id is nullable: a deck can be scoped to a course (shows under
-- that course on the deck list) or "uncategorized" (course_id null).
-- ON DELETE SET NULL so deleting a course keeps its decks around as
-- uncategorized rather than silently destroying the user's study set.
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint decks_title_not_blank check (length(btrim(title)) > 0)
);
create index if not exists decks_user_id_idx on public.decks(user_id);
create index if not exists decks_course_id_idx on public.decks(course_id);

-- ─── cards ──────────────────────────────────────────────────────
-- SM-2-lite scheduling state lives inline on each card:
--   ease     — ease factor (SM-2 EF), clamped >= 1.3 by the scheduler
--   interval — days until next review (0 for a brand-new/relapsed card)
--   due_at   — when the card next becomes due (defaults now() so fresh
--              cards are immediately due in the first study session)
--   reps     — count of consecutive successful reviews (resets on 'again')
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid not null references public.decks(id) on delete cascade,
  front text not null,
  back text not null,
  ease real not null default 2.5,
  interval real not null default 0,
  due_at timestamptz not null default now(),
  reps integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cards_front_not_blank check (length(btrim(front)) > 0),
  constraint cards_back_not_blank check (length(btrim(back)) > 0),
  constraint cards_ease_min check (ease >= 1.3),
  constraint cards_interval_nonneg check (interval >= 0),
  constraint cards_reps_nonneg check (reps >= 0)
);
create index if not exists cards_deck_id_idx on public.cards(deck_id);
create index if not exists cards_user_id_idx on public.cards(user_id);
-- Due-card lookups scan by deck + due_at (dueCards filter / due-count
-- badges); a composite index keeps that cheap as decks grow.
create index if not exists cards_deck_due_idx on public.cards(deck_id, due_at);

-- Tag ownership in the DB so the shared-project audit can attribute
-- these tables without cross-referencing the repo.
comment on table public.decks is
  'SEMORA: flashcard decks (Pro). Optionally scoped to a course; one row per named study set.';
comment on table public.cards is
  'SEMORA: flashcards with SM-2-lite spaced-repetition state (ease/interval/due_at/reps).';

-- ─── RLS ────────────────────────────────────────────────────────
-- Owner-only, authenticated users manage ONLY their own rows; no anon.
alter table public.decks enable row level security;
alter table public.cards enable row level security;

create policy "own_decks" on public.decks
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own_cards" on public.cards
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Cross-tenant FK protection ─────────────────────────────────
-- Reuses parent_row_user_id() from migration 015. Asserts the referenced
-- parent resolves to a row owned by the same user as the row being
-- written. decks.course_id is optional (uncategorized decks) so it's
-- skipped when null; cards.deck_id is required.
create or replace function public.decks_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_user uuid;
begin
  -- Optional FK: course_id (null => uncategorized deck)
  if new.course_id is not null then
    parent_user := public.parent_row_user_id('public.courses'::regclass, new.course_id);
    if parent_user is null then
      raise exception 'Referenced course does not exist'
        using errcode = '23503';
    end if;
    if parent_user <> new.user_id then
      raise exception 'Cross-tenant write blocked: deck cannot reference a course owned by another user'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists decks_assert_parent_owner_trigger on public.decks;
create trigger decks_assert_parent_owner_trigger
  before insert or update of course_id, user_id on public.decks
  for each row execute function public.decks_assert_parent_owner();

create or replace function public.cards_assert_parent_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_user uuid;
begin
  parent_user := public.parent_row_user_id('public.decks'::regclass, new.deck_id);
  if parent_user is null then
    raise exception 'Referenced deck does not exist'
      using errcode = '23503';
  end if;
  if parent_user <> new.user_id then
    raise exception 'Cross-tenant write blocked: card cannot reference a deck owned by another user'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists cards_assert_parent_owner_trigger on public.cards;
create trigger cards_assert_parent_owner_trigger
  before insert or update of deck_id, user_id on public.cards
  for each row execute function public.cards_assert_parent_owner();

-- ─── updated_at triggers ────────────────────────────────────────
-- Self-contained per-table setter, matching migration 023's pattern
-- (no shared moddatetime trigger exists in earlier migrations).
create or replace function public.decks_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists decks_set_updated_at_trigger on public.decks;
create trigger decks_set_updated_at_trigger
  before update on public.decks
  for each row execute function public.decks_set_updated_at();

create or replace function public.cards_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists cards_set_updated_at_trigger on public.cards;
create trigger cards_set_updated_at_trigger
  before update on public.cards
  for each row execute function public.cards_set_updated_at();
