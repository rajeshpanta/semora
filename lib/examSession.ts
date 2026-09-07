/**
 * Where to start studying for a particular assessment.
 *
 * S1 made the tutor understand that an exam is not an assignment. This decides
 * the next thing: given the exam Semora is looking at, what should the student
 * actually do first — and it decides it from structured data, with no model
 * call, so tapping "study for this" does not cost a round trip before anything
 * useful happens.
 *
 * WHAT COUNTS AS COVERAGE. Only what the assessment itself says. A description
 * reading "Covers membrane transport, electrochemical gradients and the Na/K
 * ATPase" names three things to study; a course called "Cell Biology 240" names
 * none. Inferring topics from a course title is how a previous phase ended up
 * quizzing students on their own grading scale, so this never does it: no
 * coverage means no coverage, and the session says so rather than inventing a
 * syllabus.
 *
 * Each candidate goes through lib/academicTopic, so "Chapters 1-4" and "50
 * points" cannot become study targets — the same gate that governs automatic
 * practice targeting.
 *
 * HOW THE FIRST STEP IS CHOSEN, in order:
 *
 *   1. a covered topic the student has demonstrably struggled with
 *   2. the first covered topic
 *   3. nothing — study from the course material generally
 *
 * Learning evidence is enrichment, never a requirement. Three real courses have
 * any at all, so a session that waited for it would never start. Rule 1 fires
 * only when a `reinforce` verdict (D'0: at least three attempts, under 70%)
 * belongs to a topic the assessment actually names — evidence about something
 * the exam does not cover is not a reason to spend the student's time on it.
 *
 * Pure and dependency-free.
 */

import { isAcademicTopic } from '@/lib/academicTopic';
import { readTopicEvidence, type TopicEvidence } from '@/lib/learningEvidence';

export interface ExamStep {
  /** The concept to start on, or null when there is nothing defensible. */
  topic: string | null;
  /**
   * Why this one — the session says it out loud rather than showing a score.
   *   reinforce  the assessment covers it and the student has missed it before
   *   coverage   the assessment names it
   *   material   no coverage is known; work from the course material
   */
  reason: 'reinforce' | 'coverage' | 'material';
}

/**
 * Grading and logistics language, which isAcademicTopic cannot catch because it
 * reads the HEAD of a label and "150 points" heads with a number. Same closed
 * category lib/academicTopic already filters in prose; kept short on purpose.
 */
const NOT_CONTENT = /\b(point|pts|graded|grading|penalt|makeup|make-?up|due|deadline|percent|worth|submit|late)\b|%|\d{2,}/i;

/** A leading "covers …" or "topics: …" is a label, not part of the topic. */
const COVERAGE_LEAD =
  /^\s*(this\s+|el\s+|la\s+)?(exam|quiz|test|midterm|final|examen|prueba)?\s*[ivxlc\d]*\s*(will\s+|va\s+a\s+)?(covers?|covering|includes?|topics?|material|content|units?|on|cubre|abarca|incluye|temas?|contenido)\s*[:—–-]?\s*/i;

/**
 * The topics an assessment says it covers, in the order it names them.
 *
 * Splitting on the punctuation a professor actually writes — commas, semicolons,
 * bullets, "and" — then dropping anything that is not a concept. Returns an
 * empty list when the description says nothing about content, which is the
 * common case and must stay distinguishable from "one topic".
 */
export function examCoverage(description: string | null | undefined): string[] {
  const raw = String(description ?? '').replace(/\s+/g, ' ').trim();
  if (raw.length < 6) return [];

  // Does this description CLAIM to say what is covered? Either it says so
  // ("covers …", "topics:") or it enumerates. A single unlabelled fragment —
  // "In class", "In person", "Cumulative" — is neither, and reading it as a
  // topic is exactly the invention this module exists to avoid. The cost is
  // that a bare one-word description that IS a topic gets dropped; silence is
  // the cheaper mistake.
  const led = COVERAGE_LEAD.test(raw);
  const body = raw.replace(COVERAGE_LEAD, '');
  const seen = new Set<string>();
  const out: string[] = [];

  for (const piece of body.split(/[;,·•]|\s+\band\b\s+|\s+\by\b\s+/i)) {
    const t = piece.replace(/[.]+$/, '').trim();
    // Two characters cannot name a concept, and a very long fragment is a
    // sentence about logistics rather than a topic.
    if (t.length < 4 || t.length > 60) continue;
    if (NOT_CONTENT.test(t)) continue;
    if (!isAcademicTopic(t)) continue;
    const key = t.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return led || out.length > 1 ? out : [];
}

/** Loose match — the mastery label and the coverage phrase rarely agree exactly. */
function related(topic: string, covered: string): boolean {
  const a = topic.toLocaleLowerCase().trim();
  const b = covered.toLocaleLowerCase().trim();
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * The first thing to do in this session.
 *
 * `mastery` is whatever course_topic_mastery rows the caller already holds; an
 * empty list is normal and simply means rule 1 cannot fire.
 */
export function firstStudyStep(
  coverage: readonly string[],
  mastery: readonly (TopicEvidence & { topic: string })[] = [],
): ExamStep {
  if (coverage.length === 0) return { topic: null, reason: 'material' };

  // Only weakness the assessment actually covers earns priority. An
  // administrative label cannot reach here — isAcademicTopic already removed
  // it from `coverage`, and a mastery row only matters if it matches one.
  for (const covered of coverage) {
    const weak = mastery.find(
      (m) => related(m.topic, covered) && readTopicEvidence(m).verdict === 'reinforce',
    );
    if (weak) return { topic: covered, reason: 'reinforce' };
  }

  return { topic: coverage[0], reason: 'coverage' };
}

/**
 * What to study after `done` in this session — the next covered topic that has
 * not been visited yet, or null when the covered ground is finished.
 *
 * Session-scoped: `done` is whatever the student has already worked on since
 * they opened this session. Nothing is persisted, because nothing here is a
 * claim about the student — only about where they are in one sitting.
 */
export function nextStudyStep(
  coverage: readonly string[],
  done: readonly string[],
): string | null {
  const seen = new Set(done.map((d) => d.toLocaleLowerCase().trim()));
  return coverage.find((c) => !seen.has(c.toLocaleLowerCase().trim())) ?? null;
}
