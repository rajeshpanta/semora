import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { buildTimeline, formatTimestamp, largestPartSeconds } from '@/lib/lectureTimeline';

const t = (s: number, e: number, text: string) => [s, e, text] as [number, number, string];

Deno.test('parts laid end to end; paragraphs about a minute, broken at sentence ends', () => {
  const { hasTimings, blocks } = buildTimeline([
    { seq: 1, seconds: 120, status: 'done', timings: [t(0, 20, 'Second part.')] },
    { seq: 0, seconds: 120, status: 'done', timings: [t(0, 30, 'One.'), t(30, 70, 'Two.'), t(70, 90, 'Three')] },
  ], [85]);
  assertEquals(hasTimings, true);
  assertEquals(blocks, [
    { kind: 'paragraph', start: 0, text: 'One. Two.', marked: false },
    { kind: 'paragraph', start: 70, text: 'Three Second part.', marked: true },
  ]);
});

Deno.test('a missing or failed part shows as a gap where it was', () => {
  const { blocks } = buildTimeline([
    { seq: 0, seconds: 120, status: 'done', timings: [t(0, 10, 'Before.')] },
    { seq: 1, seconds: 120, status: 'failed', timings: null },
    { seq: 3, seconds: 120, status: 'done', timings: [t(0, 10, 'After.')] },
  ], null);
  assertEquals(blocks, [
    { kind: 'paragraph', start: 0, text: 'Before.', marked: false },
    { kind: 'gap', start: 360, parts: 2 },
    { kind: 'paragraph', start: 360, text: 'After.', marked: false },
  ]);
});

Deno.test('a part with no row still takes its time: later stamps and marks do not shift early', () => {
  // seq 1 never arrived; seq 2 starts after 0 and 1, at 240, not at 120.
  const { blocks } = buildTimeline([
    { seq: 0, seconds: 120, status: 'done', timings: [t(0, 10, 'Zero.')] },
    { seq: 2, seconds: 45, status: 'done', timings: [t(5, 15, 'Two.')] },
  ], [250]);
  assertEquals(blocks, [
    { kind: 'paragraph', start: 0, text: 'Zero.', marked: false },
    { kind: 'gap', start: 240, parts: 1 },
    { kind: 'paragraph', start: 245, text: 'Two.', marked: true },
  ]);
});

Deno.test('parts missing before the first row are counted from seq 0', () => {
  const { blocks } = buildTimeline([
    { seq: 2, seconds: 120, status: 'done', timings: [t(0, 10, 'Late start.')] },
  ], null);
  assertEquals(blocks, [
    { kind: 'gap', start: 240, parts: 2 },
    { kind: 'paragraph', start: 240, text: 'Late start.', marked: false },
  ]);
});

Deno.test('largestPartSeconds ignores unknown lengths', () => {
  assertEquals(largestPartSeconds([{ seconds: null }, { seconds: 45 }, { seconds: 120 }]), 120);
  assertEquals(largestPartSeconds([{ seconds: null }]), 0);
});

Deno.test('lectures from before timings: none, so the plain transcript is used', () => {
  assertEquals(buildTimeline([{ seq: 0, seconds: 300, status: 'done', timings: null }], []), { hasTimings: false, blocks: [] });
});

Deno.test('one late part with timings does not turn an older lecture into a one-part transcript', () => {
  // Recorded before timings existed; part 2 arrived after today's deploy.
  const parts = [
    { seq: 0, seconds: 120, status: 'done', timings: null },
    { seq: 1, seconds: 120, status: 'done', timings: [] },
    { seq: 2, seconds: 120, status: 'done', timings: [t(0, 10, 'Late.')] },
  ];
  assertEquals(buildTimeline(parts, []), { hasTimings: false, blocks: [] });
  // A failed part carries no timings and does not count against it.
  const withFailed = [
    { seq: 0, seconds: 120, status: 'done', timings: [t(0, 10, 'One.')] },
    { seq: 1, seconds: 120, status: 'failed', timings: null },
  ];
  assertEquals(buildTimeline(withFailed, []).hasTimings, true);
});

Deno.test('timestamps', () => {
  assertEquals(formatTimestamp(0), '0:00');
  assertEquals(formatTimestamp(75), '1:15');
  assertEquals(formatTimestamp(3725), '1:02:05');
});
