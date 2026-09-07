import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { courseStudyTopics, examCoverage, firstCourseStep, firstStudyStep, nextStudyStep } from '@/lib/examSession';

const m = (topic: string, attempts: number, correct: number) =>
  ({ topic, attempts, correct, assisted_correct: 0 });

// ── coverage extraction ──────────────────────────────────────────────

Deno.test('an assessment that names its topics yields them in order', () => {
  assertEquals(
    examCoverage('Covers membrane transport, electrochemical gradients and the Na/K ATPase'),
    ['membrane transport', 'electrochemical gradients', 'the Na/K ATPase'],
  );
  // Real production string shapes.
  assertEquals(
    examCoverage('Basic Skills, Documentation, Vital Signs, Nursing Process'),
    ['Basic Skills', 'Documentation', 'Vital Signs', 'Nursing Process'],
  );
  assertEquals(examCoverage('Topics: osmosis; diffusion; active transport'),
    ['osmosis', 'diffusion', 'active transport']);
});

Deno.test('a description that says nothing about content yields nothing', () => {
  // The distinction that matters: no coverage must not look like one topic.
  for (const d of [
    null, undefined, '', '   ', '150 points, no makeup exams',
    'Late assignments accepted with penalty until December 15',
    'Section 5.1', 'Chapters 1-4', 'In class', 'TBA', 'In person', 'Cumulative',
  ]) {
    assertEquals(examCoverage(d as string), [], JSON.stringify(d));
  }
});

Deno.test('content must be claimed — by a label or by enumeration', () => {
  // A single unlabelled fragment is not a coverage claim, however topic-shaped.
  assertEquals(examCoverage('In class'), []);
  assertEquals(examCoverage('Photosynthesis'), [], 'a real topic, but structurally indistinguishable — silence is cheaper');
  // A label makes one item a claim...
  assertEquals(examCoverage('Covers photosynthesis'), ['photosynthesis']);
  // ...and so does enumerating.
  assertEquals(examCoverage('Photosynthesis, cellular respiration'), ['Photosynthesis', 'cellular respiration']);
});

Deno.test('administrative and pointer fragments are dropped, real topics kept', () => {
  // The mixed case: one real topic beside grading machinery and a pointer.
  assertEquals(
    examCoverage('Covers thermohaline circulation, Chapters 4-6, and grading policy'),
    ['thermohaline circulation'],
  );
});

Deno.test('duplicates and a leading label are removed', () => {
  assertEquals(examCoverage('This exam will cover: osmosis, Osmosis, diffusion'), ['osmosis', 'diffusion']);
  assertEquals(examCoverage('Exam 2 covers photosynthesis'), ['photosynthesis']);
});

Deno.test('a chemical name is not split at its slash', () => {
  // "the Na/K ATPase" became "the Na" + "K ATPase" while a slash counted as a
  // separator. It is part of the name far more often than it joins two topics.
  assertEquals(examCoverage('Covers the Na/K ATPase and osmosis'), ['the Na/K ATPase', 'osmosis']);
});

Deno.test('a grading fragment is not a topic even when it reads like one', () => {
  // isAcademicTopic gates the HEAD of a label, and "150 points" heads with a
  // number, so coverage needs its own short check for grading language.
  assertEquals(examCoverage('150 points, no makeup exams'), []);
  assertEquals(examCoverage('Covers osmosis, worth 30% of the grade'), ['osmosis']);
});

Deno.test('Spanish coverage survives', () => {
  assertEquals(
    examCoverage('Cubre transporte activo secundario y difusión facilitada'),
    ['transporte activo secundario', 'difusión facilitada'],
  );
});

// ── first step ───────────────────────────────────────────────────────

Deno.test('with coverage and no evidence, start at the first covered topic', () => {
  const cov = ['membrane transport', 'electrochemical gradients'];
  assertEquals(firstStudyStep(cov, []), { topic: 'membrane transport', reason: 'coverage' });
});

Deno.test('a reinforce topic the exam covers takes priority', () => {
  const cov = ['membrane transport', 'electrochemical gradients'];
  // 1 of 4 on the second topic — reinforce under D'0.
  const step = firstStudyStep(cov, [m('electrochemical gradients', 4, 1)]);
  assertEquals(step, { topic: 'electrochemical gradients', reason: 'reinforce' });
});

Deno.test('evidence about something the exam does NOT cover is ignored', () => {
  const step = firstStudyStep(['membrane transport'], [m('Roman history', 9, 1)]);
  assertEquals(step, { topic: 'membrane transport', reason: 'coverage' });
});

Deno.test('thin evidence does not redirect the session', () => {
  // 0 of 1 is insufficient under D'0 — not a weakness, so not a reason.
  const step = firstStudyStep(['osmosis', 'diffusion'], [m('diffusion', 1, 0)]);
  assertEquals(step, { topic: 'osmosis', reason: 'coverage' });
});

Deno.test('a strong topic does not become the starting point', () => {
  const step = firstStudyStep(['osmosis', 'diffusion'], [m('osmosis', 5, 5)]);
  assertEquals(step, { topic: 'osmosis', reason: 'coverage' }, 'still first by order, not by evidence');
  // ...and it is not labelled reinforce.
  assertEquals(step.reason === 'reinforce', false);
});

Deno.test('no coverage means study the material, not a guessed topic', () => {
  assertEquals(firstStudyStep([], []), { topic: null, reason: 'material' });
  // Evidence alone never invents an exam topic.
  assertEquals(firstStudyStep([], [m('mitosis', 9, 1)]), { topic: null, reason: 'material' });
});

Deno.test('a mastery label that loosely matches the covered phrase still counts', () => {
  const step = firstStudyStep(['secondary active transport'], [m('Secondary active transport', 6, 2)]);
  assertEquals(step.reason, 'reinforce');
});

// ── moving through the session ───────────────────────────────────────

Deno.test('the session walks the covered ground once, then stops', () => {
  const cov = ['osmosis', 'diffusion', 'active transport'];
  assertEquals(nextStudyStep(cov, []), 'osmosis');
  assertEquals(nextStudyStep(cov, ['osmosis']), 'diffusion');
  assertEquals(nextStudyStep(cov, ['osmosis', 'diffusion']), 'active transport');
  assertEquals(nextStudyStep(cov, ['osmosis', 'diffusion', 'active transport']), null);
  // Case-insensitive, so a returned topic label does not re-open a done one.
  assertEquals(nextStudyStep(cov, ['Osmosis', 'DIFFUSION']), 'active transport');
});

Deno.test('no coverage means no next step to walk to', () => {
  assertEquals(nextStudyStep([], []), null);
  assertEquals(nextStudyStep([], ['anything']), null);
});

// ── course-level study (S5) ──────────────────────────────────────────

Deno.test('a course names a topic only when the student has demonstrably missed one', () => {
  // There is no course-topic extraction. Deriving topics from task
  // descriptions produced "employing both primary" and "take-home" on real
  // data, so the only trustworthy source is a D'0 reinforce verdict.
  assertEquals(firstCourseStep([]), { topic: null, reason: 'material' });
  assertEquals(firstCourseStep([m('osmosis', 1, 0)]), { topic: null, reason: 'material' }, 'thin evidence is not a weakness');
  assertEquals(firstCourseStep([m('osmosis', 5, 5)]), { topic: null, reason: 'material' }, 'strong is not a reason');
  assertEquals(firstCourseStep([m('osmosis', 5, 1)]), { topic: 'osmosis', reason: 'reinforce' });
});

Deno.test('a course session can never speak with an exam\'s authority', () => {
  for (const mast of [[], [m('osmosis', 5, 1)], [m('x', 1, 0)]]) {
    assertEquals(firstCourseStep(mast).reason === 'coverage', false);
  }
});

Deno.test('a course session walks only demonstrated weaknesses', () => {
  const mast = [m('osmosis', 5, 1), m('diffusion', 1, 0), m('mitosis', 4, 0)];
  assertEquals(courseStudyTopics(mast), ['osmosis', 'mitosis']);
  assertEquals(nextStudyStep(courseStudyTopics(mast), ['osmosis']), 'mitosis');
  assertEquals(courseStudyTopics([]), []);
});
