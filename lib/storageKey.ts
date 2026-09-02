/**
 * Turning a student's filename into a storage object key.
 *
 * Supabase Storage does not accept every string as a key. Characters like
 * `> | [ ] { } #` and anything non-ASCII are rejected outright, and because
 * both upload paths in this app are deliberately NON-CRITICAL — a dropped file
 * must never fail a scan the student already spent an AI action on — a rejected
 * key failed silently and left a database row pointing at a file that was never
 * written. The student's syllabus imported fine; only "View Syllabus" was
 * broken, and it was broken forever.
 *
 * That is not a rare shape. Concourse, a syllabus system a lot of colleges use,
 * exports every file as `Course Name > Syllabus | Concourse.pdf`. Ten students
 * hit this in two weeks, four of them on that exact pattern, the rest on square
 * brackets, an en dash, and an Arabic title carrying bidi control marks.
 *
 * The sanitised name is for the KEY ONLY. Callers keep the original filename in
 * their own `file_name` column, because that is what the student recognises and
 * what the UI shows them.
 *
 * The expression matches lib/tutor.ts's course-note upload, which already did
 * this correctly — the syllabus path simply predates it.
 */

/**
 * A filename reduced to characters a storage key accepts.
 *
 * Keeps letters, digits, underscore, dot and hyphen; collapses every run of
 * anything else into a single underscore. A name with nothing left to keep
 * (a title written entirely in a non-Latin script) still yields a usable key,
 * because callers prefix it with a timestamp that makes it unique anyway.
 */
export function safeStorageName(fileName: string): string {
  const safe = (fileName ?? '').replace(/[^\w.\-]+/g, '_');
  return safe === '' || safe === '_' ? 'file' : safe;
}

/**
 * `<userId>/<timestamp>_<safe name>` — the layout the storage RLS policies
 * check, where the first path segment must be the owner's id.
 */
export function userScopedStorageKey(userId: string, fileName: string, now: number): string {
  return `${userId}/${now}_${safeStorageName(fileName)}`;
}
