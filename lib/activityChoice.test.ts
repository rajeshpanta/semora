import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deckRelatesToTopic, offeredActivities, type ActivityContext } from '@/lib/activityChoice';

const ctx = (o: Partial<ActivityContext>): ActivityContext =>
  ({ topic: 'membrane transport', hasLectureQuiz: false, hasRelatedDeck: false, reviewedThisSession: false, ...o });

const names = (c: ActivityContext) => offeredActivities(c).map((o) => o.activity);
const primary = (c: ActivityContext) => offeredActivities(c).find((o) => o.primary)?.activity;

// ── what gets offered ────────────────────────────────────────────────

Deno.test('with nothing but course material, practice is the whole offer', () => {
  assertEquals(names(ctx({})), ['practice']);
  assertEquals(primary(ctx({})), 'practice');
});

Deno.test('a lecture quiz becomes the check, and practice stays available', () => {
  assertEquals(names(ctx({ hasLectureQuiz: true })), ['lecture_quiz', 'practice']);
  assertEquals(primary(ctx({ hasLectureQuiz: true })), 'lecture_quiz');
});

Deno.test('a related deck leads, because reviewing prepares for the check', () => {
  assertEquals(names(ctx({ hasRelatedDeck: true })), ['flashcards', 'practice']);
  assertEquals(primary(ctx({ hasRelatedDeck: true })), 'flashcards');
  // ...and the check is still right there.
  assertEquals(names(ctx({ hasRelatedDeck: true, hasLectureQuiz: true })),
    ['flashcards', 'lecture_quiz', 'practice']);
});

Deno.test('after reviewing, the check leads — cards never conclude anything', () => {
  const c = ctx({ hasRelatedDeck: true, reviewedThisSession: true });
  assertEquals(primary(c), 'practice', 'verify, do not declare mastery');
  assertEquals(names(c), ['practice', 'flashcards']);
  // With a lecture quiz available it becomes the check instead.
  const q = ctx({ hasRelatedDeck: true, hasLectureQuiz: true, reviewedThisSession: true });
  assertEquals(primary(q), 'lecture_quiz');
  assertEquals(names(q), ['lecture_quiz', 'flashcards', 'practice']);
});

Deno.test('practice is always somewhere in the offer', () => {
  for (const hasLectureQuiz of [true, false]) {
    for (const hasRelatedDeck of [true, false]) {
      for (const reviewedThisSession of [true, false]) {
        const list = names(ctx({ hasLectureQuiz, hasRelatedDeck, reviewedThisSession }));
        assertEquals(list.includes('practice'), true, JSON.stringify({ hasLectureQuiz, hasRelatedDeck, reviewedThisSession }));
        assertEquals(new Set(list).size, list.length, 'no activity offered twice');
        assertEquals(offeredActivities(ctx({ hasLectureQuiz, hasRelatedDeck, reviewedThisSession })).filter((o) => o.primary).length, 1);
      }
    }
  }
});

Deno.test('flashcards are never offered without a defensible deck', () => {
  for (const hasLectureQuiz of [true, false]) {
    for (const reviewedThisSession of [true, false]) {
      assertEquals(
        names(ctx({ hasRelatedDeck: false, hasLectureQuiz, reviewedThisSession })).includes('flashcards'),
        false,
      );
    }
  }
});

// ── whether a deck is defensibly about the topic ─────────────────────

Deno.test('a deck named for the topic matches', () => {
  assertEquals(deckRelatesToTopic('Membrane transport — Week 11', [], 'membrane transport'), true);
  assertEquals(deckRelatesToTopic('BIOL 240 Membrane Transport', [], 'Membrane Transport'), true);
});

Deno.test('a deck named for a date matches nothing', () => {
  // Half the real decks in production are called this.
  assertEquals(deckRelatesToTopic('Lecture · Aug 17', [], 'membrane transport'), false);
  assertEquals(deckRelatesToTopic('Lecture · Aug 17', ['What is a comma splice?'], 'membrane transport'), false);
});

Deno.test('two cards mentioning the topic is a deck that covers it; one is not', () => {
  const one = ['What is membrane transport?', 'Define mitosis'];
  const two = ['What is membrane transport?', 'Name a membrane transport protein'];
  assertEquals(deckRelatesToTopic('Lecture · Aug 17', one, 'membrane transport'), false, 'one mention is thin');
  assertEquals(deckRelatesToTopic('Lecture · Aug 17', two, 'membrane transport'), true);
});

Deno.test('with no topic in play, any course deck is a legitimate review', () => {
  assertEquals(deckRelatesToTopic('Lecture · Aug 17', [], null), true);
  assertEquals(deckRelatesToTopic(null, null, null), true);
});

Deno.test('a topic too short to match on is not matched loosely', () => {
  assertEquals(deckRelatesToTopic('pH and buffers', [], 'pH'), false, 'two characters would match almost anything');
});

Deno.test('missing deck data never throws', () => {
  assertEquals(deckRelatesToTopic(null, null, 'osmosis'), false);
  assertEquals(deckRelatesToTopic(undefined, undefined, 'osmosis'), false);
  assertEquals(deckRelatesToTopic('Osmosis deck', undefined, 'osmosis'), true);
});
