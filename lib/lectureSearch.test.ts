import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { lectureMatchesSearch } from '@/lib/lectureSearch';

const lecture = {
  title: 'Lecture 5',
  courses: { name: 'BIO 110' },
  notes_md: '## La célula\n- Mitosis has four phases',
  transcript: 'today we talk about the Krebs cycle',
};

Deno.test('every word must match, anywhere, ignoring case and accents', () => {
  assertEquals(lectureMatchesSearch(lecture, ''), true);
  assertEquals(lectureMatchesSearch(lecture, 'bio mitosis'), true);
  assertEquals(lectureMatchesSearch(lecture, 'CELULA'), true);
  assertEquals(lectureMatchesSearch(lecture, 'krebs'), true);
  assertEquals(lectureMatchesSearch(lecture, 'krebs photosynthesis'), false);
  assertEquals(lectureMatchesSearch({ title: null, courses: null }, 'x'), false);
});
