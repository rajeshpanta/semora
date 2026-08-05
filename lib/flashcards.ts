import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Flashcards + spaced repetition (Pro). Types, React Query hooks, and a
// pure SM-2-lite scheduler live together here so this feature is a single
// self-contained module (lib/queries.ts is shared/contended). Backed by
// the `decks` + `cards` tables from migration 024. All reads/writes are
// owner-scoped by RLS; the client passes user_id on insert to satisfy the
// `auth.uid() = user_id` write check.

// ── Types ───────────────────────────────────────────────────

export interface Deck {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Card {
  id: string;
  user_id: string;
  deck_id: string;
  front: string;
  back: string;
  // SM-2-lite scheduling state (see migration 024 + scheduleCard below).
  ease: number;
  interval: number; // days until next review
  due_at: string; // ISO timestamp
  reps: number;
  created_at: string;
  updated_at: string;
}

/** A deck row annotated with its due/total card counts for the list UI. */
export interface DeckWithCounts extends Deck {
  card_count: number;
  due_count: number;
}

export type NewDeck = { title: string; course_id?: string | null };
export type NewCard = { deck_id: string; front: string; back: string };

export type Grade = 'again' | 'hard' | 'good' | 'easy';

// ── Query Keys ──────────────────────────────────────────────

export const flashcardKeys = {
  decks: ['decks'] as const,
  deck: (id: string) => ['deck', id] as const,
  cards: (deckId: string) => ['cards', deckId] as const,
};

// ── SRS scheduler (pure) ────────────────────────────────────
//
// A small SM-2 variant. `scheduleCard` takes the card's current state and
// a grade and returns the NEXT { ease, interval, due_at } — no I/O, no
// Date.now() unless `now` is omitted, so it's trivially testable and the
// mutation just persists whatever it returns.
//
//   again → lapse: reset the learning progress, review again in ~10 min.
//   hard  → shrink the interval and nudge ease down.
//   good  → standard SM-2 step: interval *= ease.
//   easy  → bigger step with an ease bonus.
//
// Ease is clamped to the SM-2 floor of 1.3 (mirrors the cards_ease_min
// check constraint) so a run of hard/again grades can't drive it to zero.

export const MIN_EASE = 1.3;
const AGAIN_INTERVAL_DAYS = 10 / (60 * 24); // ~10 minutes, in days
const FIRST_GOOD_INTERVAL = 1; // days, first successful review
const SECOND_GOOD_INTERVAL = 6; // days, second successful review (SM-2)
const HARD_INTERVAL_MULTIPLIER = 1.2;
const EASY_BONUS = 1.3;

export interface ScheduleResult {
  ease: number;
  interval: number;
  due_at: string;
}

function clampEase(ease: number): number {
  return Math.max(MIN_EASE, ease);
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Compute the next scheduling state for a card given a review grade.
 * Pure: `now` defaults to the current time but can be injected for tests
 * and deterministic scheduling. Only reads ease/interval/reps off `card`.
 */
export function scheduleCard(
  card: Pick<Card, 'ease' | 'interval' | 'reps'>,
  grade: Grade,
  now: Date = new Date(),
): ScheduleResult {
  let ease = card.ease;
  let interval: number;

  switch (grade) {
    case 'again':
      // Lapse: knock ease down and send the card back to (near-immediate)
      // relearning. The next 'good' restarts the 1→6→ease ladder.
      ease = clampEase(ease - 0.2);
      interval = AGAIN_INTERVAL_DAYS;
      break;

    case 'hard':
      ease = clampEase(ease - 0.15);
      // A brand-new/relapsed card (interval 0) still graduates, just on a
      // shorter first step than 'good'.
      interval =
        card.interval <= 0
          ? FIRST_GOOD_INTERVAL
          : card.interval * HARD_INTERVAL_MULTIPLIER;
      break;

    case 'good':
      // SM-2 ladder: first success → 1 day, second → 6 days, then × ease.
      if (card.interval <= 0) interval = FIRST_GOOD_INTERVAL;
      else if (card.reps <= 1) interval = SECOND_GOOD_INTERVAL;
      else interval = card.interval * ease;
      break;

    case 'easy':
      ease = clampEase(ease + 0.15);
      if (card.interval <= 0) interval = SECOND_GOOD_INTERVAL;
      else interval = card.interval * ease * EASY_BONUS;
      break;
  }

  // Round day-scale intervals to whole days for stable due dates; keep the
  // sub-day relapse interval intact so 'again' actually reappears soon.
  const roundedInterval = interval >= 1 ? Math.round(interval) : interval;

  return {
    ease,
    interval: roundedInterval,
    due_at: addDays(now, roundedInterval).toISOString(),
  };
}

/** Cards due for review at `now` (defaults to current time). */
export function dueCards(cards: Card[], now: Date = new Date()): Card[] {
  const cutoff = now.getTime();
  return cards.filter((c) => new Date(c.due_at).getTime() <= cutoff);
}

// ── Query Hooks ─────────────────────────────────────────────

async function getUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session.user.id;
}

/**
 * All of the user's decks with per-deck total/due card counts. We fetch
 * decks and their cards' due_at in one query (cards(due_at)) and reduce
 * client-side — decks are few and cards per deck are bounded, so this is
 * cheaper than a per-deck count round-trip.
 */
export function useDecks() {
  return useQuery({
    queryKey: flashcardKeys.decks,
    queryFn: async (): Promise<DeckWithCounts[]> => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('decks')
        .select('*, cards(due_at)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((d: any) => {
        const cards: { due_at: string }[] = d.cards ?? [];
        const { cards: _drop, ...deck } = d;
        return {
          ...(deck as Deck),
          card_count: cards.length,
          due_count: cards.filter((c) => c.due_at <= nowIso).length,
        };
      });
    },
  });
}

/** Minimal course descriptor for grouping/labeling decks by course. */
export interface CourseLite {
  id: string;
  name: string;
  color: string;
  icon: string;
}

/**
 * All of the user's courses (id/name/color/icon only) for labeling and
 * grouping decks. Kept in this module (not lib/queries.ts) so the feature
 * stays self-contained; RLS scopes it to the caller. Rides no semester
 * filter on purpose — decks can point at courses from any semester.
 */
export function useCourseLookup() {
  return useQuery({
    queryKey: ['courseLookup'],
    queryFn: async (): Promise<Record<string, CourseLite>> => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, name, color, icon');
      if (error) throw error;
      const map: Record<string, CourseLite> = {};
      for (const c of (data ?? []) as CourseLite[]) map[c.id] = c;
      return map;
    },
  });
}

export function useDeck(deckId: string | undefined) {
  return useQuery({
    queryKey: flashcardKeys.deck(deckId!),
    queryFn: async (): Promise<Deck> => {
      const { data, error } = await supabase
        .from('decks')
        .select('*')
        .eq('id', deckId!)
        .single();
      if (error) throw error;
      return data as Deck;
    },
    enabled: !!deckId,
  });
}

export function useCards(deckId: string | undefined) {
  return useQuery({
    queryKey: flashcardKeys.cards(deckId!),
    queryFn: async (): Promise<Card[]> => {
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('deck_id', deckId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Card[];
    },
    enabled: !!deckId,
  });
}

// ── Mutation Hooks ──────────────────────────────────────────

export function useCreateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: NewDeck): Promise<Deck> => {
      const user_id = await getUserId();
      const { data: result, error } = await supabase
        .from('decks')
        .insert({
          title: data.title,
          // Normalize undefined → null so an uncategorized deck persists
          // (PostgREST strips undefined keys).
          course_id: data.course_id ?? null,
          user_id,
        })
        .select()
        .single();
      if (error) throw error;
      return result as Deck;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: flashcardKeys.decks });
    },
  });
}

export function useUpdateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<NewDeck>): Promise<Deck> => {
      const { data: result, error } = await supabase
        .from('decks')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result as Deck;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: flashcardKeys.decks });
      qc.invalidateQueries({ queryKey: flashcardKeys.deck(result.id) });
    },
  });
}

export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      // Cards cascade in the DB (cards.deck_id ON DELETE CASCADE).
      const { error } = await supabase.from('decks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: flashcardKeys.decks });
    },
  });
}

export function useCreateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: NewCard): Promise<Card> => {
      const user_id = await getUserId();
      // New cards inherit the table defaults (ease 2.5, interval 0,
      // due_at now, reps 0) so they're immediately due in the next study
      // session — no client-side scheduling needed at creation.
      const { data: result, error } = await supabase
        .from('cards')
        .insert({ deck_id: data.deck_id, front: data.front, back: data.back, user_id })
        .select()
        .single();
      if (error) throw error;
      return result as Card;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: flashcardKeys.cards(result.deck_id) });
      // The deck list shows total/due badges sourced from card rows.
      qc.invalidateQueries({ queryKey: flashcardKeys.decks });
    },
  });
}

export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation({
    // Accepts both content edits (front/back) and scheduling updates
    // (ease/interval/due_at/reps) — study mode writes the latter.
    mutationFn: async ({
      id,
      ...data
    }: { id: string } & Partial<Pick<Card, 'front' | 'back' | 'ease' | 'interval' | 'due_at' | 'reps'>>): Promise<Card> => {
      const { data: result, error } = await supabase
        .from('cards')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result as Card;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: flashcardKeys.cards(result.deck_id) });
      qc.invalidateQueries({ queryKey: flashcardKeys.decks });
    },
  });
}

export function useDeleteCard() {
  const qc = useQueryClient();
  return useMutation({
    // Pass deckId so onSuccess can scope invalidation without re-reading
    // the deleted row (mirrors useDeleteCourseMeeting in lib/queries.ts).
    mutationFn: async ({ id }: { id: string; deckId: string }): Promise<void> => {
      const { error } = await supabase.from('cards').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: flashcardKeys.cards(variables.deckId) });
      qc.invalidateQueries({ queryKey: flashcardKeys.decks });
    },
  });
}

export interface GenerateFlashcardsResult {
  deckId: string;
  deckTitle: string;
  cardsAdded: number;
}

/** A task the "generate for a specific X" scope picker can target. */
export interface ScopeTask {
  id: string;
  title: string;
  type: string;
  due_date: string | null;
}

// Task types worth targeting a flashcard generation at. Excludes 'project'
// (usually something built, not recalled) and 'other' (too ambiguous to
// surface as a scope option).
const SCOPEABLE_TASK_TYPES = ['exam', 'quiz', 'assignment', 'reading'] as const;

/**
 * A course's exams, quizzes, assignments, and readings — anything a student
 * might want flashcards focused on specifically, not just exams/quizzes —
 * for the scope picker on the generate flow. Sourced from live `tasks`, not
 * the original parse_runs extraction — tasks are the edited, current source
 * of truth (same reasoning tutor-chat's grounding uses tasks over parse_runs
 * for deadlines).
 */
export function useScopeTasks(courseId: string | undefined) {
  return useQuery({
    queryKey: ['scopeTasks', courseId],
    queryFn: async (): Promise<ScopeTask[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, type, due_date')
        .eq('course_id', courseId!)
        .in('type', SCOPEABLE_TASK_TYPES)
        .order('due_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ScopeTask[];
    },
    enabled: !!courseId,
  });
}

/**
 * Generate flashcards for a course from its scanned syllabus + uploaded
 * lecture notes via the `generate-flashcards` edge function (Pro-gated
 * server-side — see that function for why manual card entry stays ungated
 * but this path isn't). Pass `deckId` to add generated cards to an existing
 * deck, or omit it to create a new one titled after the course. Pass
 * `taskId` (from useScopeTasks) to scope generation to one specific task
 * instead of the whole course.
 *
 * Mirrors useSendTutorMessage's raw-fetch pattern (not supabase.functions.
 * invoke) so a PRO_REQUIRED failure's `code` is easy to read off the thrown
 * error and route straight to the paywall, same as the tutor chat does.
 */
export function useGenerateFlashcards() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { courseId: string; deckId?: string; deckTitle?: string; taskId?: string; noteIds?: string[] }): Promise<GenerateFlashcardsResult> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) throw new Error('Supabase URL not configured');

      const response = await fetch(`${supabaseUrl}/functions/v1/generate-flashcards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(args),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        const e = new Error(err.error || `Server error: ${response.status}`) as Error & { code?: string };
        e.code = err.code;
        throw e;
      }

      return (await response.json()) as GenerateFlashcardsResult;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: flashcardKeys.decks });
      qc.invalidateQueries({ queryKey: flashcardKeys.cards(result.deckId) });
    },
  });
}

/**
 * Grade a card in study mode: run the pure scheduler and persist the next
 * state. Returns the updated card. Separated from useUpdateCard so callers
 * pass a grade, not raw scheduling fields.
 */
export function useReviewCard() {
  const updateCard = useUpdateCard();
  return useMutation({
    mutationFn: async ({ card, grade }: { card: Card; grade: Grade }): Promise<Card> => {
      const next = scheduleCard(card, grade);
      return updateCard.mutateAsync({
        id: card.id,
        ease: next.ease,
        interval: next.interval,
        due_at: next.due_at,
        // reps counts consecutive successes; 'again' resets it.
        reps: grade === 'again' ? 0 : card.reps + 1,
      });
    },
  });
}
