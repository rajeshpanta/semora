import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { academicDescription, isAcademicTopic } from './academicTopic.ts';

/**
 * THE CASE TABLE. Duplicated verbatim from
 * lib/academicTopic.test.ts because the client and
 * the edge function cannot share a module across the RN/Deno boundary.
 * Change a row here and you must change it there.
 */
const TOPICS: { label: string; academic: boolean; why: string }[] = [
  // ── the five real administrative labels in production ──────────────
  { label: 'Course grading', academic: false, why: 'the only real row that has ever cleared the floor' },
  { label: 'Course deadlines', academic: false, why: 'real' },
  { label: 'Grade scale', academic: false, why: 'real' },
  { label: 'Exam 1', academic: false, why: 'real — an assessment, not an idea' },
  { label: 'Assignment planning', academic: false, why: 'real' },
  // ── the chip fallback that started this ────────────────────────────
  { label: 'Homework 1', academic: false, why: 'the "Quiz me on Homework 1" case' },
  { label: 'Homework', academic: false, why: 'bare artifact' },

  // ── real academic topics from production, all must survive ─────────
  { label: 'Secondary active transport', academic: true, why: 'real' },
  { label: 'p-values', academic: true, why: 'real' },
  { label: 'hypothesis testing', academic: true, why: 'real' },
  { label: 'Na⁺/K⁺ ATPase', academic: true, why: 'real, unicode' },
  { label: 'Negative liberty', academic: true, why: 'real' },
  { label: 'difference principle', academic: true, why: 'real' },
  { label: 'Facilitated diffusion', academic: true, why: 'real' },
  { label: 'Difusión facilitada', academic: true, why: 'real, Spanish' },
  { label: 'Transporte activo secundario', academic: true, why: 'real, Spanish' },
  { label: 'Global livestock production', academic: true, why: 'real; broad but a subject' },
  { label: 'Livestock terminology', academic: true, why: 'real; vocabulary is course content' },

  // ── the false negatives a substring blacklist would cause ──────────
  { label: 'Late Antiquity', academic: true, why: 'contains "late" and is a history topic' },
  { label: 'Conic sections', academic: true, why: 'contains "sections"' },
  { label: 'Unit circle', academic: true, why: '"Unit" head, but no index follows' },
  { label: 'Unit vectors', academic: true, why: 'same' },
  { label: 'Essay structure', academic: true, why: '"Essay" head, but a real writing topic' },
  { label: 'Exam anxiety', academic: true, why: '"Exam" head, but a psychology topic' },
  { label: 'Lab safety', academic: true, why: '"Lab" head, real content' },
  { label: 'Final value theorem', academic: true, why: '"Final" head, real maths' },
  { label: 'Reading comprehension', academic: true, why: '"Reading" head, real topic' },
  { label: 'Topic sentences', academic: true, why: '"Topic" head, real writing topic' },
  { label: 'Class struggle', academic: true, why: 'sociology — "class" is deliberately NOT an admin head' },

  // ── artifacts named by index ───────────────────────────────────────
  { label: 'Unit 4', academic: false, why: 'index follows' },
  { label: 'Chapter 5', academic: false, why: 'a place in the book' },
  { label: 'Section 5.1', academic: false, why: 'a place in the book' },
  { label: 'Week 3', academic: false, why: 'a place in the calendar' },
  { label: 'Quiz 2', academic: false, why: 'assessment' },
  { label: 'Midterm', academic: false, why: 'bare assessment' },
  { label: 'Exam II', academic: false, why: 'roman numeral index' },
  { label: 'Lab 3', academic: false, why: 'indexed' },
  { label: 'Problem set 4', academic: false, why: 'indexed' },

  // ── other machinery ────────────────────────────────────────────────
  { label: 'Attendance', academic: false, why: 'machinery' },
  { label: 'Office hours', academic: false, why: 'machinery' },
  { label: 'Late work policy', academic: false, why: 'machinery' },
  { label: 'Extra credit', academic: false, why: 'machinery' },
  { label: 'Syllabus overview', academic: false, why: 'machinery' },
  { label: 'Points breakdown', academic: false, why: 'machinery' },

  // ── degenerate ─────────────────────────────────────────────────────
  { label: '', academic: false, why: 'empty' },
  { label: '  ', academic: false, why: 'blank' },
  { label: 'pH', academic: false, why: 'too short to carry a concept — accepted loss' },
];

Deno.test('a concept is told from a course artifact', () => {
  for (const c of TOPICS) {
    assertEquals(isAcademicTopic(c.label), c.academic, `${JSON.stringify(c.label)} — ${c.why}`);
  }
});

Deno.test('null and undefined are not topics', () => {
  assertEquals(isAcademicTopic(null), false);
  assertEquals(isAcademicTopic(undefined), false);
});

Deno.test('every real production mastery label lands where it should', () => {
  // The 15 real course_topic_mastery labels on 2026-09-06, verbatim.
  const real = [
    'Course grading', 'Course deadlines', 'Grade scale', 'Exam 1', 'Assignment planning',
    'Global livestock production', 'U.S. livestock production', 'Nevada livestock production',
    'Beef production', 'Pork production', 'Livestock markets', 'Livestock terminology',
    'Producer profit', 'Cash receipts', 'Environmental impacts',
  ];
  const admin = real.filter((t) => !isAcademicTopic(t));
  assertEquals(admin, ['Course grading', 'Course deadlines', 'Grade scale', 'Exam 1', 'Assignment planning']);
  assertEquals(real.length - admin.length, 10, 'the ten genuine topics survive');
});

// ── descriptions ─────────────────────────────────────────────────────

Deno.test('descriptions that name subject matter are kept', () => {
  assertEquals(academicDescription('Monopolistic Competition and oligopoly'), 'Monopolistic Competition and oligopoly');
  assertEquals(academicDescription('Chapter 1 – The Science of Psychology'), 'The Science of Psychology');
  assertEquals(
    academicDescription('Basic Skills, Documentation, Vital Signs, Nursing Process'),
    'Basic Skills, Documentation, Vital Signs, Nursing Process',
  );
  assertEquals(
    academicDescription('MLO 2.1: Recognize the importance of infection control'),
    'MLO 2.1: Recognize the importance of infection control',
  );
  assertEquals(academicDescription('  Physical and   Cognitive Development '), 'Physical and Cognitive Development');
});

Deno.test('bare pointers and machinery are left out', () => {
  // Real strings from production.
  for (const junk of [
    'Section 5.1',
    'Chapters 1, 2, and 3',
    'Problems 1, 3, 9, 15, 21',
    'Written report on spectroscopic methods; 50 points.',
    'Materials on OAKS; graded',
    'Required to remain enrolled.',
    'Late assignments accepted with penalty until December 15',
    'Students who have not completed enrollment by 5 pm will be purged',
    'Mandatory attendance quiz; not graded',
    'Unit Exam #1; 150 points',
    'Week 4; initial post Thursday and response Sunday.',
    'Paper containing discussion notes; participation category totals 100 points',
    '',
    'n/a',
  ]) {
    assertEquals(academicDescription(junk), null, `should be dropped: ${JSON.stringify(junk)}`);
  }
});

Deno.test('low-value strings that survive are documented, not chased', () => {
  // The filter's job is the DANGEROUS category — grading, deadlines, penalties,
  // enrolment — because those are what turn into administrative questions.
  // Some flat assessment-structure prose gets through, and that is deliberate:
  // chasing each one grows a lexical firewall that eventually eats real topics
  // (the Phase A lesson). The prompt rule against quizzing course logistics is
  // the backstop for this residue, not another regex.
  assertEquals(academicDescription('One test per module/chapter.'), 'One test per module/chapter.');
});

Deno.test('a pointer with real content behind it keeps the content', () => {
  assertEquals(academicDescription('Ch. 7 — Membrane transport and bioenergetics'), 'Membrane transport and bioenergetics');
  assertEquals(academicDescription('Week 6: Interval estimation'), 'Interval estimation');
  // ...and a pointer with nothing behind it is dropped entirely.
  assertEquals(academicDescription('Ch. 7'), null);
  assertEquals(academicDescription('Week 6'), null);
});

Deno.test('a pointer head inside a real word is not a pointer', () => {
  // "Unit circle" once became "rcle" because the roman-numeral branch matched
  // the "ci" of "circle", and "Weekly lab quiz" lost its "Week".
  assertEquals(academicDescription('Unit circle behaviour and radians'), 'Unit circle behaviour and radians');
  assertEquals(academicDescription('Weekly lab quiz at the start of lab'), 'Weekly lab quiz at the start of lab');
  assertEquals(academicDescription('Readings on Marx and Rawls'), 'Readings on Marx and Rawls');
  // ...while a genuine index still strips.
  assertEquals(academicDescription('Unit 4 — Thermodynamics and entropy'), 'Thermodynamics and entropy');
  assertEquals(academicDescription('Exam II covers osmosis and diffusion'), 'Exam II covers osmosis and diffusion');
});

Deno.test('null-ish input never throws', () => {
  assertEquals(academicDescription(null), null);
  assertEquals(academicDescription(undefined), null);
});
