/**
 * Which study activity fits what the student needs right now.
 *
 * S3 proved one activity could report back. The point of a second is that the
 * conductor stops meaning "sometimes launch a lecture quiz" and starts meaning
 * "choose an appropriate activity" — so the rule for choosing has to be
 * written down, deterministic, and honest about what it cannot know.
 *
 * THE TWO KINDS ARE NOT INTERCHANGEABLE, and the whole design rests on that:
 *
 *   PRACTICE and LECTURE QUIZ verify. Both are graded against a key the
 *   student never chose, so getting one wrong means something.
 *
 *   FLASHCARDS prepare. Again/Hard/Good/Easy is the student telling Semora how
 *   it went, with nothing checking them — 92% of every rating ever recorded is
 *   positive and "Hard" has never once been pressed. A card review is a real
 *   activity and it is not a measurement.
 *
 * So cards may come BEFORE a check, never instead of one, and finishing a deck
 * never concludes anything about what the student knows.
 *
 * WHEN CARDS ARE OFFERED AT ALL. Only when a deck can be tied to the thing
 * about to be studied — by its title or by what its cards actually say. Half
 * the real decks in production are called "Lecture · Aug 17", which relates to
 * nothing, and offering those as though they were about membrane transport
 * would be the same invention this codebase has spent several phases removing.
 * No defensible deck means no card offer, not a guess.
 *
 * There is deliberately no scoring here and no attempt to infer whether a
 * concept is "factual" or "conceptual" — the data cannot support that, and a
 * confident wrong answer costs more than an honest choice between two.
 *
 * Pure and dependency-free.
 */

export type StudyActivity = 'practice' | 'lecture_quiz' | 'flashcards';

export interface ActivityContext {
  /** The concept about to be studied, when the session has one. */
  topic: string | null;
  /** A lecture quiz exists for this course. */
  hasLectureQuiz: boolean;
  /** A deck defensibly related to `topic` (or to the course when topic is null). */
  hasRelatedDeck: boolean;
  /** Cards were reviewed earlier in this session — the check should follow. */
  reviewedThisSession: boolean;
}

export interface ActivityOffer {
  activity: StudyActivity;
  /** The one Semora leads with. The rest stay available to the student. */
  primary: boolean;
}

/**
 * What to offer, best first.
 *
 * The order encodes one pedagogical claim and nothing more: reviewing prepares,
 * and a check confirms. Everything else is availability.
 *
 *   just reviewed cards        -> lead with a check, because that is the point
 *   a related deck exists      -> lead with review, offer the check beside it
 *   otherwise                  -> lead with a check
 *
 * Practice is always available: it is the one activity that needs no deck, no
 * lecture and no coverage, so a session can never be left with nothing to do.
 */
export function offeredActivities(ctx: ActivityContext): ActivityOffer[] {
  const check: StudyActivity = ctx.hasLectureQuiz ? 'lecture_quiz' : 'practice';
  const offers: ActivityOffer[] = [];

  if (ctx.reviewedThisSession) {
    // They have just reviewed. Verifying is the next useful thing, and saying
    // "ready to check that?" is honest in a way "you have mastered it" is not.
    offers.push({ activity: check, primary: true });
    if (ctx.hasRelatedDeck) offers.push({ activity: 'flashcards', primary: false });
  } else if (ctx.hasRelatedDeck) {
    offers.push({ activity: 'flashcards', primary: true });
    offers.push({ activity: check, primary: false });
  } else {
    offers.push({ activity: check, primary: true });
  }

  // Practice is the floor. It is added when the check was a lecture quiz so the
  // student always has a graded option that needs nothing but course material.
  if (!offers.some((o) => o.activity === 'practice')) {
    offers.push({ activity: 'practice', primary: false });
  }
  return offers;
}

/**
 * Is this deck defensibly about this topic?
 *
 * Title first, then what the cards say. A deck named for a date relates to
 * nothing, so it matches nothing — and with no topic in play, any deck in the
 * course is a legitimate review of that course and none is a claim about a
 * concept.
 */
export function deckRelatesToTopic(
  deckTitle: string | null | undefined,
  cardText: readonly string[] | null | undefined,
  topic: string | null,
): boolean {
  if (!topic) return true;
  const needle = topic.toLocaleLowerCase().trim();
  if (needle.length < 4) return false;

  const title = String(deckTitle ?? '').toLocaleLowerCase();
  if (title.includes(needle)) return true;

  // A single card mentioning the topic is thin; two is a deck that covers it.
  let hits = 0;
  for (const t of cardText ?? []) {
    if (String(t ?? '').toLocaleLowerCase().includes(needle)) hits += 1;
    if (hits >= 2) return true;
  }
  return false;
}
