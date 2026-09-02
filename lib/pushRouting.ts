/**
 * Where a server-sent push notification should land the student.
 *
 * ─── WHY THIS IS A TABLE AND NOT A CHAIN OF ifs ───
 * It used to be a chain, and the chain broke silently in production.
 *
 * The original was correct:
 *
 *   if (type === 'flashcards_due') push('/flashcards');
 *   else                           replace('/(tabs)');
 *
 * Then the Canvas held-back-courses push was added, and its `if` went in
 * BETWEEN that `if` and its `else`. An `else` binds to the nearest preceding
 * `if`, so the fallback silently detached from flashcards and reattached to
 * Canvas. From that commit on, tapping a flashcards notification pushed
 * /flashcards and then immediately fell into the fallback and replaced it with
 * the tabs root — the deep link opened the app and threw the student home.
 *
 * It shipped over the air and was live on 35 devices before anyone noticed,
 * because nothing about it looks wrong when you read it.
 *
 * A table cannot fail that way. Adding a destination is adding a row; there is
 * no `else` left to detach from anything. That is the entire reason this file
 * exists, and it is why the next push type should be added HERE and not as a
 * branch at the call site.
 *
 * ─── AND WHY IT IS IN lib/ ───
 * The chain lived inside a screen component, where the test setup cannot reach
 * it, so there was nothing that could have caught the break. This module has no
 * React, no router and no navigation state — it maps a payload to a string, and
 * pushRouting.test.ts holds it to that. Same reason canvasFeedUrl and
 * proCanvasEducation are out here.
 */

/** How to get there. `replace` is the fallback's mode: home is not a place you go BACK from. */
export type PushNavMode = 'push' | 'replace';

export type PushRoute = {
  /** The push type as sent by the server, or null if the payload carried none. */
  type: string | null;
  /** Route to navigate to. */
  path: string;
  mode: PushNavMode;
  /** False when the type was missing, unrecognised, or its payload was unusable. */
  known: boolean;
};

/** Where anything unrecognised goes. Matches the behaviour that has always been the fallback. */
export const PUSH_FALLBACK_PATH = '/(tabs)';

/**
 * A resolver returns the path for its type, or null to fall back to home.
 *
 * Null rather than a thrown error on a bad payload: a notification that arrives
 * with a missing field should still open the app, which is what the student
 * asked for by tapping it. Refusing to navigate at all would be a worse answer
 * than a slightly wrong screen.
 */
type Resolver = (data: Record<string, unknown>) => string | null;

/**
 * Anything that reaches a path segment has to be verified here, not trusted.
 * These ids come from our own server today, but a route built by pasting an
 * arbitrary string into a template is one bad payload away from navigating
 * somewhere unintended.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A Map, not an object literal, and that is not a style choice.
 *
 * `ROUTES[type]` on a plain object walks the prototype chain, and `type` comes
 * off a push payload. A notification carrying `type: "toString"` resolved to
 * Object.prototype.toString, which returned the string "[object Undefined]" —
 * reported as a known route and navigated to. `type: "hasOwnProperty"` threw
 * outright and took the notification handler down with it.
 *
 * A Map only ever returns what was put in it, so the whole class is gone by
 * construction rather than by a guard someone has to remember to keep. That is
 * the same reasoning as the table itself: this file exists because a rule you
 * have to remember is a rule that eventually gets broken.
 */
const ROUTES: Map<string, Resolver> = new Map(Object.entries({
  // supabase/cron/flashcards_due_push.sql
  flashcards_due: () => '/flashcards',

  // Migration 108. Lands on the screen that RESOLVES the situation rather than
  // in Settings to go looking for it.
  lms_new_courses: () => '/settings/lms/new-courses',

  // Migration 112. Sent when the server wrote notes the student never watched
  // being made, so the lecture itself is the only useful destination — telling
  // someone their notes are ready and dropping them on the home tab makes them
  // go hunting for the thing you just told them about.
  lecture_notes_ready: (data) => {
    const id = data.lectureId;
    return typeof id === 'string' && UUID.test(id) ? `/lecture/${id}` : null;
  },

  // supabase/cron/reengagement_push.sql — the weekly digest is a summary of
  // everything, so the tabs root IS its destination. Listed explicitly rather
  // than left to fall through, so that "no row" always means "nobody has
  // decided yet" instead of "decided, and the decision was home".
  weekly_digest: () => null,
} as Record<string, Resolver>));

/**
 * Resolve a notification's `data` payload to a destination.
 *
 * Accepts `unknown` because this is the boundary: the payload arrives from a
 * push service as whatever the sender put in it.
 */
export function resolvePushRoute(data: unknown): PushRoute {
  const payload: Record<string, unknown> =
    data && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  const rawType = payload.type;
  const type = typeof rawType === 'string' && rawType.length > 0 ? rawType : null;
  if (type === null) {
    return { type: null, path: PUSH_FALLBACK_PATH, mode: 'replace', known: false };
  }

  const resolver = ROUTES.get(type);
  const path = resolver ? resolver(payload) : null;

  return path === null
    ? { type, path: PUSH_FALLBACK_PATH, mode: 'replace', known: false }
    : { type, path, mode: 'push', known: true };
}

/**
 * True when this payload is a server-sent push at all.
 *
 * The caller needs this as a separate question from "where does it go",
 * because local reminders carry a taskId and no type and are routed by a
 * completely different path — one that must not be swallowed by the fallback.
 */
export function isServerPush(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const type = (data as Record<string, unknown>).type;
  return typeof type === 'string' && type.length > 0;
}
