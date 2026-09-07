/**
 * Telling a concept apart from a course artifact.
 *
 * Semora's practice generator writes its own topic labels, and when a course
 * has no teaching material in front of it the only nouns available are the
 * ones on the syllabus: "Course grading", "Grade scale", "Exam 1", "Course
 * deadlines", "Assignment planning". Five of the fifteen real mastery rows in
 * production are labels of that kind. They are recorded faithfully and they
 * are not learning — a student who misses three questions about their own
 * grading scale has not shown a weakness in the subject, and Semora should
 * neither say so nor go looking for more evidence of it.
 *
 * The distinction this module draws is deliberately narrow:
 *
 *   A LEARNING TOPIC names an idea.
 *   AN ARTIFACT names a thing the course contains — an assessment, a policy,
 *   a position in the reading.
 *
 * That is a judgement about the HEAD of the label, not a search for forbidden
 * words anywhere in it, and the difference matters. "Late Antiquity" is a real
 * topic that happens to contain "late"; "Conic sections" contains "sections".
 * Scanning for banned substrings would lose both. Reading the head noun keeps
 * them and still rejects "Late work policy" and "Section 5.1".
 *
 * Two heads are conditional rather than absolute, because the same word can
 * open either kind of label:
 *
 *   "Unit 4"        an artifact           "Unit circle"     a topic
 *   "Exam 2"        an artifact           "Essay structure" a topic
 *
 * so those only count as artifacts when a number or nothing follows them.
 *
 * WHEN THIS IS WRONG it fails quiet. A rejected label is simply not chosen as
 * an automatic target and not printed as a weakness; nothing is deleted, no
 * mastery row changes, and a student who explicitly asks about it still gets
 * it. "Policy analysis" in a politics course will be passed over, and that
 * costs one silence — the opposite mistake costs a false claim about a person.
 *
 * Pure and dependency-free. Mirrored for the server in
 * supabase/functions/tutor-chat/academicTopic.ts — the two carry the same case
 * table in their tests and must be changed together.
 */

/**
 * Heads that are about running a course rather than teaching it. A label
 * beginning with one of these is an artifact regardless of what follows,
 * because these words almost never open the name of an idea.
 */
const ADMIN_HEAD =
  /^(course|grading|gradebook|grades|grade|deadlines|deadline|due|syllabus|attendance|enrollment|enroll|enrol|tuition|policies|policy|rubric|points|percentage|weighting|office hours|office hour|schedule|submissions|submission|late work|extra credit|make-?up|proctor|plagiarism|academic integrity|withdrawal|assignments|assignment|homework|hw)\b/i;

/**
 * Heads that open an artifact ONLY when a number, letter or nothing follows.
 * "Exam 2" is a thing on the calendar; "Exam anxiety" is a topic in a
 * psychology course, and this course had one.
 */
const NUMBERED_HEAD =
  /^(midterms?|finals|final|exams?|tests?|quiz(?:zes)?|projects?|papers?|essays?|discussions?|labs?|modules?|units?|weeks?|days?|lectures?|chapters?|ch|sections?|sec|pages?|pp|problem sets?|psets?|readings?|parts?|topics?)\b/i;

/**
 * What must follow a NUMBERED_HEAD for the label to still be an artifact.
 *
 * A RANGE OR LIST of indices is still just a location in the material, and the
 * first version of this only matched a single one — so "Chapter 9" was
 * correctly rejected while "Chapters 1-4", "Sections 3.1, 3.2", "Modules 4-6"
 * and "Unit 1 and 2" all passed as concepts. That was latent rather than live,
 * because nothing yet emits those strings as topic labels, but any feature
 * that put chapter pointers in front of the generator would have armed it.
 */
const INDEX = String.raw`\d+(?:\.\d+)*[a-z]?|[ivxlc]+`;
const ONLY_AN_INDEX = new RegExp(
  // an optional leading separator, then one index, then any number of further
  // indices joined by a range or list separator, then trailing punctuation
  String.raw`^[\s#:.\-–—]*(?:(?:${INDEX})(?:(?:\s*(?:[-–—,&+]|and|to|through|thru))+\s*(?:${INDEX}))*|[a-z])?[\s.)\-–—]*$`,
  'i',
);

/**
 * True when the label names an idea worth measuring, rather than a piece of
 * course machinery. Errs toward false: silence beats a confident wrong target.
 */
export function isAcademicTopic(topic: string | null | undefined): boolean {
  const t = String(topic ?? '').trim();
  // A one- or two-character label carries no concept, whatever it says.
  if (t.length < 3) return false;
  if (ADMIN_HEAD.test(t)) return false;

  const numbered = NUMBERED_HEAD.exec(t);
  if (numbered) {
    // Artifact only if the remainder is an index and nothing else.
    if (ONLY_AN_INDEX.test(t.slice(numbered[0].length))) return false;
  }
  return true;
}

/**
 * The same judgement applied to a block of syllabus or assignment prose before
 * it is put in front of the model as teaching material.
 *
 * A description earns its place by naming subject matter. Most do not: of the
 * 4,318 descriptions real syllabi produced, a third carry grading and deadline
 * language and several hundred are bare pointers. Feeding those to a generator
 * whose known failure is asking about deadlines would make the problem worse,
 * so the bar here is "says something about the material" rather than "exists".
 *
 * Returns the text to use, or null to leave it out. A leading pointer is kept
 * when real content follows it — "Chapter 1 – The Science of Psychology" is
 * worth having and "Section 5.1" is not.
 */
export function academicDescription(raw: string | null | undefined): string | null {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (text.length < 12) return null;

  // Strip a leading pointer and judge what is left. If nothing is left, the
  // pointer WAS the description — same rule the answer normaliser uses.
  const withoutPointer = text
    // Only a pointer FOLLOWED BY AN INDEX is a pointer. "Chapter 1 - X" points
    // at a place in the book; "Readings on Marx" names the subject, and an
    // earlier version of this stripped the head off both.
    .replace(
      /^(?:chapters?|ch|sections?|sec|units?|modules?|weeks?|pages?|pp|problems?|exercises?|readings?)\b\.?\s*(?:\d+(?:\.\d+)*[a-z]?|[ivxlc]+\b)(?:\s*(?:[-–—,&]|and|to|through)\s*\d+(?:\.\d+)*[a-z]?)*\s*/i,
      '',
    )
    // A strip can leave orphaned punctuation behind ("; covers ...").
    .replace(/^[\s;:,.\-–—]+/, '')
    .trim();
  if (withoutPointer.length < 12) return null;

  // Machinery language anywhere in a short string means the string is about
  // machinery. These are one-line fragments, not paragraphs, so a single
  // "50 points" or "late penalty" is the subject rather than an aside.
  // Day names are in here for the same reason and are a closed set of seven,
  // not an open blacklist: a weekday in a syllabus fragment is scheduling.
  if (
    /\b(point|pts|grade|grading|penalt|late|dropp|attend|enrol|extra credit|bonus|purge|policy|polic|office hour|worth|percent|submit|turn in|upload|canvas|zoom|blackboard|oaks|due|deadline|make-?up|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|%/i
      .test(text)
  ) {
    return null;
  }

  return withoutPointer;
}
