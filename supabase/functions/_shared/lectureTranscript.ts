/**
 * What a lecture part actually said, from a Whisper verbose_json response.
 *
 * Pure on purpose — no Deno.env, no network — so every rule here is tested in
 * lectureTranscript.test.ts.
 *
 * WHY FILTER AT ALL. Whisper fills silence with invented text. In the week to
 * 2026-09-16, parts the provider measured at 0-4 seconds returned 9-19
 * characters of words, and five-minute parts of an empty room returned about a
 * thousand. Those words were assembled into transcripts and handed to the notes
 * model as if the instructor had said them.
 *
 * The rules are Whisper's own reference thresholds, applied per segment:
 *   - a segment is silence when no_speech_prob > 0.6 AND avg_logprob < -1.0;
 *   - a segment is a repetition loop when compression_ratio > 2.4.
 * Anything left that adds up to under 1.5 seconds of speech is dropped too:
 * that is a cough, not a sentence, and it is where "Thank you." comes from.
 */

export type LectureLanguage = 'en' | 'es';

export interface WhisperSegment {
  start?: number;
  end?: number;
  text?: string;
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
}

export interface KeptTranscript {
  text: string;
  /** Seconds of kept speech, or null when the response carried no segments. */
  speechSeconds: number | null;
  /** Segments removed as silence or repetition. */
  dropped: number;
  /** The detected language when it is one Semora writes notes in. */
  language: LectureLanguage | null;
  /** Whatever the provider reported, for logs. */
  rawLanguage: string | null;
}

export const NO_SPEECH_PROB = 0.6;
export const LOGPROB_FLOOR = -1.0;
export const COMPRESSION_CEILING = 2.4;
export const MIN_SPEECH_SECONDS = 1.5;

/** 'english' / 'en' / 'EN' → 'en'; anything that is not English or Spanish → null. */
export function normalizeLanguage(raw: unknown): LectureLanguage | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (v === 'en' || v === 'english') return 'en';
  if (v === 'es' || v === 'spanish' || v === 'castilian') return 'es';
  return null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function isSilentSegment(s: WhisperSegment): boolean {
  const noSpeech = num(s.no_speech_prob);
  const logprob = num(s.avg_logprob);
  return noSpeech !== null && logprob !== null && noSpeech > NO_SPEECH_PROB && logprob < LOGPROB_FLOOR;
}

export function isRepetitionSegment(s: WhisperSegment): boolean {
  const ratio = num(s.compression_ratio);
  return ratio !== null && ratio > COMPRESSION_CEILING;
}

/**
 * `filter: false` is the remote kill switch (LECTURE_SILENCE_FILTER=off): every
 * segment with text is kept, as before 142, while speech seconds are still
 * measured.
 */
export function keptTranscript(data: unknown, options: { filter?: boolean } = {}): KeptTranscript {
  const filter = options.filter !== false;
  const d = (data && typeof data === 'object') ? data as Record<string, unknown> : {};
  const rawLanguage = typeof d.language === 'string' ? d.language : null;
  const language = normalizeLanguage(rawLanguage);
  const segments = Array.isArray(d.segments) ? d.segments as WhisperSegment[] : null;

  if (!segments) {
    // No segment detail: the only thing to go on is the text itself.
    const text = typeof d.text === 'string' ? d.text.trim() : '';
    return { text, speechSeconds: null, dropped: 0, language, rawLanguage };
  }

  let dropped = 0;
  let speech = 0;
  const kept: string[] = [];
  for (const s of segments) {
    const text = typeof s?.text === 'string' ? s.text.trim() : '';
    if (!text || (filter && (isSilentSegment(s) || isRepetitionSegment(s)))) {
      if (text) dropped += 1;
      continue;
    }
    const start = num(s.start) ?? 0;
    const end = num(s.end) ?? start;
    speech += Math.max(0, end - start);
    kept.push(text);
  }

  if (filter && speech < MIN_SPEECH_SECONDS) {
    return { text: '', speechSeconds: Math.round(speech), dropped: dropped + kept.length, language, rawLanguage };
  }

  return {
    text: kept.join(' ').replace(/\s+/g, ' ').trim(),
    speechSeconds: Math.round(speech),
    dropped,
    language,
    rawLanguage,
  };
}

/** One kept piece of a part: [start, end, text], seconds from the part's start. */
export type Timing = [number, number, string];

/**
 * When each kept sentence was said (145), for the timestamped transcript.
 * Exactly the segments keptTranscript keeps, so the two never disagree; empty
 * when the response had no segment detail or the part held no real speech.
 */
export function transcriptTimings(data: unknown, options: { filter?: boolean } = {}): Timing[] {
  const d = (data && typeof data === 'object') ? data as Record<string, unknown> : {};
  if (!Array.isArray(d.segments)) return [];
  if (!keptTranscript(data, options).text) return [];
  const filter = options.filter !== false;
  const out: Timing[] = [];
  for (const s of d.segments as WhisperSegment[]) {
    const text = typeof s?.text === 'string' ? s.text.trim() : '';
    if (!text || (filter && (isSilentSegment(s) || isRepetitionSegment(s)))) continue;
    const start = Math.max(0, num(s.start) ?? 0);
    const end = Math.max(start, num(s.end) ?? start);
    out.push([Math.round(start * 10) / 10, Math.round(end * 10) / 10, text]);
  }
  return out;
}

/** Whisper reads at most 224 tokens of prompt; ~800 characters stays inside it. */
export const PROMPT_MAX_CHARS = 800;
const PROMPT_VOCAB_CHARS = 380;

/**
 * The transcription prompt (4.1): the course's own words first, then the tail of
 * the previous part.
 *
 * Whisper spells what it has seen in the prompt, so a course name, the
 * instructor's name, the course's topics and the key terms of earlier lectures
 * turn "my o sis" into "mitosis". The vocabulary is capped so the previous
 * part's tail — which carries the sentence being continued — always fits; the
 * tail is cut from its start, never its end.
 */
export function buildPromptHint(input: {
  title?: string | null;
  courseName?: string | null;
  instructor?: string | null;
  terms?: (string | null | undefined)[];
  tail?: string | null;
}): string {
  const clean = (v: string | null | undefined) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const head: string[] = [];
  const seen = new Set<string>();
  const add = (v: string | null | undefined, max = 120) => {
    const c = clean(v).slice(0, max);
    const key = c.toLowerCase();
    if (!c || seen.has(key)) return;
    seen.add(key);
    head.push(c);
  };
  add(input.courseName);
  add(input.instructor, 60);
  add(input.title);
  let vocab = head.join('. ');
  const terms: string[] = [];
  for (const t of input.terms ?? []) {
    const c = clean(t).slice(0, 60);
    const key = c.toLowerCase();
    if (!c || seen.has(key)) continue;
    const next = [...terms, c].join(', ');
    if ((vocab ? vocab.length + 2 : 0) + next.length > PROMPT_VOCAB_CHARS) break;
    seen.add(key);
    terms.push(c);
  }
  if (terms.length) vocab = vocab ? `${vocab}. ${terms.join(', ')}.` : `${terms.join(', ')}.`;
  vocab = vocab.slice(0, PROMPT_VOCAB_CHARS);

  const tail = clean(input.tail);
  const room = PROMPT_MAX_CHARS - (vocab ? vocab.length + 1 : 0);
  const kept = tail.length > room ? tail.slice(tail.length - room) : tail;
  return [vocab, kept].filter(Boolean).join('\n');
}

/** "Mitosis — division of a cell" → "Mitosis"; bullets and bold stripped. */
export function termsFromNotes(notesMd: string | null | undefined, max = 30): string[] {
  if (!notesMd) return [];
  const section = notesMd.split(/^##\s+(?:Key terms|Términos clave)\s*$/im)[1];
  if (!section) return [];
  const out: string[] = [];
  for (const line of section.split('\n')) {
    if (/^##\s/.test(line)) break;
    const m = line.match(/^\s*[-*]\s+(.+)$/);
    if (!m) continue;
    const term = m[1].replace(/\*\*/g, '').split(/\s+[—–-]\s+|:\s/)[0].trim();
    if (term && term.length <= 60) out.push(term);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * The lecture's language, from the languages its parts were heard in.
 *
 * Only parts with at least a minute of speech are counted — Whisper's guess on
 * a quiet part is unreliable, and locking a lecture to the wrong language turns
 * every later part into nonsense. Two agreeing parts lock it. Before the lock,
 * parts that disagree mark it 'mixed'. After the lock the language is asked
 * again every fourth part (shouldReprobeLanguage), and it takes TWO re-probed
 * parts heard in another language to declare the class 'mixed' — one is more
 * often a guest speaker or a misheard part than a change of language, and a
 * mixed lecture gives up the boundary-word hint for good. A mixed lecture is
 * transcribed without a fixed language from then on, so a bilingual class
 * keeps both.
 */
export function decideLectureLanguage(
  current: LectureLanguage | 'mixed' | null,
  detections: LectureLanguage[],
): LectureLanguage | 'mixed' | null {
  if (current === 'mixed') return 'mixed';
  if (current) {
    const disagreeing = detections.filter((d) => d !== current).length;
    return disagreeing >= 2 ? 'mixed' : current;
  }
  const seen = new Set(detections);
  if (seen.size > 1) return 'mixed';
  if (detections.length >= 2) return detections[0];
  return null;
}

/** A locked lecture's language is re-probed on every fourth part (seq 3, 7, 11 …). */
export const LANGUAGE_REPROBE_EVERY = 4;

/**
 * Should this part be sent WITHOUT the lecture's locked language, to hear
 * whether the class has changed language? A forced request reports the
 * language it was forced to, so without these probes a lock was permanent
 * and a class that switched to Spanish after ten minutes of English had every
 * later part transcribed as English nonsense.
 */
export function shouldReprobeLanguage(seq: number): boolean {
  return Number.isInteger(seq) && seq >= 0 && (seq + 1) % LANGUAGE_REPROBE_EVERY === 0;
}

/**
 * Does a provider refusal name a PER-DAY quota rather than a per-minute one?
 * Groq words its 429s "… on seconds of audio per day (ASD): Limit 28800, Used
 * 28800 …"; a per-minute one says "per minute (ASH)" or gives seconds to wait.
 * A daily quota is not "try again in a few minutes" — it is "tomorrow".
 */
export function isDailyQuotaError(errorBody: string | null | undefined): boolean {
  if (typeof errorBody !== 'string' || !errorBody) return false;
  return /per day|\b(ASD|TPD|RPD)\b|daily/i.test(errorBody);
}

/** The store an update prompt should name: 'Play Store' when the user agent says Android, else 'App Store'. */
export function storeNameFor(userAgent: string | null | undefined, platform?: string | null): 'Play Store' | 'App Store' {
  // Apps from 1.15 say which platform they are (x-semora-platform); older
  // Android apps identify only through their user agent, which RN often sets
  // to okhttp/… — so the header wins when present.
  if (typeof platform === 'string' && platform.toLowerCase() === 'android') return 'Play Store';
  if (typeof platform === 'string' && platform.toLowerCase() === 'ios') return 'App Store';
  return typeof userAgent === 'string' && userAgent.includes('Android') ? 'Play Store' : 'App Store';
}

/** The language to ask the provider for, or undefined to let it detect. */
export function requestLanguage(lectureLanguage: string | null | undefined): LectureLanguage | undefined {
  return lectureLanguage === 'en' || lectureLanguage === 'es' ? lectureLanguage : undefined;
}

/** Parse "Semora/61 CFNetwork/…" (the iOS user agent) or an explicit "1.15 (61)" header into a build number. */
export function appBuildFrom(versionHeader: string | null, userAgent: string | null): number | null {
  const fromHeader = versionHeader?.match(/\((\d+)\)/)?.[1] ?? versionHeader?.match(/^\d+$/)?.[0];
  if (fromHeader) return Number(fromHeader);
  const fromAgent = userAgent?.match(/^Semora\/(\d+)\b/)?.[1];
  return fromAgent ? Number(fromAgent) : null;
}

/** "1.15" / "1.15.2" / "1.15 (61)" → [1, 15, 2]; anything else → null. */
export function parseAppVersion(value: string | null): number[] | null {
  const m = value?.trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}

/**
 * Is this app too old to record lectures?
 *
 * Apps from 1.15 send `x-semora-app-version`; older ones only carry their build
 * number in the iOS user agent. Either is compared with its own minimum. When
 * neither can be read, the answer is null — unknown — and unknown is always
 * allowed to record: a wrong guess would stop a student recording a class.
 */
export function clientTooOld(input: {
  versionHeader: string | null;
  userAgent: string | null;
  minVersion: string | null;
  minBuild: number | null;
}): boolean | null {
  const version = parseAppVersion(input.versionHeader);
  const minVersion = parseAppVersion(input.minVersion);
  if (version && minVersion) {
    for (let i = 0; i < 3; i++) {
      if (version[i] !== minVersion[i]) return version[i] < minVersion[i];
    }
    return false;
  }
  const build = appBuildFrom(input.versionHeader, input.userAgent);
  if (build !== null && input.minBuild !== null) return build < input.minBuild;
  return null;
}
