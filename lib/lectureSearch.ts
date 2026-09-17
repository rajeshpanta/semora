/**
 * Search across a student's lectures (Record Lecture plan 4.10).
 *
 * Every word typed must appear somewhere in the lecture — its name, its class,
 * its notes or its transcript — ignoring case and accents, so "celula" finds
 * "célula". Client-side: the list is already loaded and a student's lectures
 * number in the dozens.
 *
 * Pure — tested in lectureSearch.test.ts.
 */

export interface SearchableLecture {
  title?: string | null;
  notes_md?: string | null;
  transcript?: string | null;
  courses?: { name?: string | null } | null;
}

export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** The words of a query, folded. Empty for a blank query. */
export function searchWords(query: string): string[] {
  return foldForSearch(query).split(/\s+/).filter(Boolean);
}

/** Everything searchable about a lecture, folded once (memoize per lecture). */
export function foldLecture(lecture: SearchableLecture): string {
  return foldForSearch(
    [lecture.title, lecture.courses?.name, lecture.notes_md, lecture.transcript].filter(Boolean).join('\n'),
  );
}

export function foldedMatches(folded: string, words: string[]): boolean {
  return words.every((w) => folded.includes(w));
}

export function lectureMatchesSearch(lecture: SearchableLecture, query: string): boolean {
  const words = searchWords(query);
  if (!words.length) return true;
  return foldedMatches(foldLecture(lecture), words);
}
