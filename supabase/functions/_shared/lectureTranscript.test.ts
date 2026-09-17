import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  appBuildFrom,
  clientTooOld,
  parseAppVersion,
  decideLectureLanguage,
  isDailyQuotaError,
  keptTranscript,
  shouldReprobeLanguage,
  storeNameFor,
  normalizeLanguage,
  requestLanguage,
  buildPromptHint,
  PROMPT_MAX_CHARS,
  termsFromNotes,
  transcriptTimings,
} from './lectureTranscript.ts';

Deno.test('real speech is kept whole, with its speech seconds', () => {
  const r = keptTranscript({
    language: 'english',
    text: 'The chain rule. It composes.',
    segments: [
      { start: 0, end: 4, text: ' The chain rule.', no_speech_prob: 0.01, avg_logprob: -0.2, compression_ratio: 1.3 },
      { start: 4, end: 7, text: ' It composes.', no_speech_prob: 0.02, avg_logprob: -0.3, compression_ratio: 1.2 },
    ],
  });
  assertEquals(r, { text: 'The chain rule. It composes.', speechSeconds: 7, dropped: 0, language: 'en', rawLanguage: 'english' });
});

Deno.test('silence is dropped: high no-speech AND low confidence', () => {
  const r = keptTranscript({
    segments: [
      { start: 0, end: 30, text: 'Thank you.', no_speech_prob: 0.9, avg_logprob: -1.4 },
      { start: 30, end: 60, text: 'Real words here that matter a lot.', no_speech_prob: 0.1, avg_logprob: -0.3 },
    ],
  });
  assertEquals(r.text, 'Real words here that matter a lot.');
  assertEquals(r.dropped, 1);
});

Deno.test('a confident segment with high no-speech probability is kept (both conditions needed)', () => {
  const r = keptTranscript({
    segments: [{ start: 0, end: 10, text: 'Quiet but clear.', no_speech_prob: 0.8, avg_logprob: -0.4 }],
  });
  assertEquals(r.text, 'Quiet but clear.');
});

Deno.test('repetition loops are dropped', () => {
  const r = keptTranscript({
    segments: [
      { start: 0, end: 20, text: 'penny penny penny penny penny penny', compression_ratio: 3.1 },
      { start: 20, end: 40, text: 'Now the derivative.', compression_ratio: 1.4 },
    ],
  });
  assertEquals(r.text, 'Now the derivative.');
  assertEquals(r.dropped, 1);
});

Deno.test('under 1.5 seconds of kept speech is nothing (the 0-4 second parts that returned words)', () => {
  const r = keptTranscript({
    segments: [{ start: 0, end: 1, text: 'Thank you.', no_speech_prob: 0.3, avg_logprob: -0.5 }],
  });
  assertEquals(r.text, '');
  assertEquals(r.speechSeconds, 1);
});

Deno.test('a five-minute empty room yields no text', () => {
  const segments = Array.from({ length: 10 }, (_, i) => ({
    start: i * 30, end: i * 30 + 30, text: 'Thanks for watching!', no_speech_prob: 0.95, avg_logprob: -1.2,
  }));
  const r = keptTranscript({ duration: 300, segments });
  assertEquals(r.text, '');
  assertEquals(r.dropped, 10);
});

Deno.test('no segment detail falls back to the text, with unknown speech seconds', () => {
  assertEquals(keptTranscript({ text: ' hello ' }), { text: 'hello', speechSeconds: null, dropped: 0, language: null, rawLanguage: null });
  assertEquals(keptTranscript(null).text, '');
});

Deno.test('language names normalise to en/es only', () => {
  assertEquals(normalizeLanguage('English'), 'en');
  assertEquals(normalizeLanguage('es'), 'es');
  assertEquals(normalizeLanguage('spanish'), 'es');
  assertEquals(normalizeLanguage('welsh'), null);
  assertEquals(normalizeLanguage(undefined), null);
});

Deno.test('lecture language: two agreeing parts lock it, disagreement makes it mixed', () => {
  assertEquals(decideLectureLanguage(null, []), null);
  assertEquals(decideLectureLanguage(null, ['es']), null);
  assertEquals(decideLectureLanguage(null, ['es', 'es']), 'es');
  assertEquals(decideLectureLanguage(null, ['en', 'es']), 'mixed');
  assertEquals(decideLectureLanguage('en', ['en', 'en', 'en']), 'en');
  // 147: one re-probed part in another language is not a bilingual class
  assertEquals(decideLectureLanguage('en', ['en', 'es']), 'en');
  assertEquals(decideLectureLanguage('en', ['en', 'en', 'es']), 'en');
  assertEquals(decideLectureLanguage('en', ['en', 'en', 'es', 'es']), 'mixed');
  assertEquals(decideLectureLanguage('en', ['es', 'es']), 'mixed');
  assertEquals(decideLectureLanguage('mixed', ['en', 'en']), 'mixed');
});

Deno.test('a locked language is re-probed on every fourth part', () => {
  assertEquals([0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12].map(shouldReprobeLanguage),
    [false, false, false, true, false, false, false, true, false, true, false]);
  assertEquals(shouldReprobeLanguage(-1), false);
  assertEquals(shouldReprobeLanguage(NaN), false);
});

Deno.test('a per-day quota refusal is told apart from a busy minute', () => {
  assertEquals(isDailyQuotaError('{"error":{"message":"Rate limit reached for model `whisper-large-v3` in organization `org_x` service tier `on_demand` on seconds of audio per day (ASD): Limit 28800, Used 28800, Requested 300. Please try again in 2h13m."}}'), true);
  assertEquals(isDailyQuotaError('Rate limit reached on seconds of audio per hour (ASH): Limit 7200'), false);
  assertEquals(isDailyQuotaError('{"error":{"message":"Too many requests","type":"rate_limit_exceeded"}}'), false);
  assertEquals(isDailyQuotaError(''), false);
  assertEquals(isDailyQuotaError(null), false);
});

Deno.test('the store to update from follows the user agent', () => {
  assertEquals(storeNameFor('Semora/61 CFNetwork/1498.700.2 Darwin/24.6.0'), 'App Store');
  assertEquals(storeNameFor('Dalvik/2.1.0 (Linux; U; Android 14; Pixel 8 Build/AP2A)'), 'Play Store');
  assertEquals(storeNameFor(null), 'App Store');
});

Deno.test('only a locked single language is sent to the provider', () => {
  assertEquals(requestLanguage('en'), 'en');
  assertEquals(requestLanguage('mixed'), undefined);
  assertEquals(requestLanguage(null), undefined);
});

Deno.test('app build from the explicit header or the iOS user agent', () => {
  assertEquals(appBuildFrom('1.15 (61)', null), 61);
  assertEquals(appBuildFrom('61', null), 61);
  assertEquals(appBuildFrom(null, 'Semora/56 CFNetwork/1498.700.2 Darwin/24.6.0'), 56);
  assertEquals(appBuildFrom(null, 'okhttp/4.12.0'), null);
  assertEquals(appBuildFrom(null, null), null);
});

Deno.test('app versions parse', () => {
  assertEquals(parseAppVersion('1.15'), [1, 15, 0]);
  assertEquals(parseAppVersion('1.15.2 (61)'), [1, 15, 2]);
  assertEquals(parseAppVersion('Semora/56'), null);
});

Deno.test('too old: by version header when present, by user-agent build otherwise, unknown is allowed', () => {
  const min = { minVersion: '1.15', minBuild: 61 };
  assertEquals(clientTooOld({ versionHeader: '1.14', userAgent: null, ...min }), true);
  assertEquals(clientTooOld({ versionHeader: '1.15', userAgent: null, ...min }), false);
  assertEquals(clientTooOld({ versionHeader: '1.16.1', userAgent: null, ...min }), false);
  assertEquals(clientTooOld({ versionHeader: null, userAgent: 'Semora/56 CFNetwork/1498', ...min }), true);
  assertEquals(clientTooOld({ versionHeader: null, userAgent: 'Semora/61 CFNetwork/1498', ...min }), false);
  assertEquals(clientTooOld({ versionHeader: null, userAgent: 'okhttp/4', ...min }), null);
  // gate switched off
  assertEquals(clientTooOld({ versionHeader: '1.7', userAgent: 'Semora/47', minVersion: null, minBuild: null }), null);
});

Deno.test('timings are exactly the kept segments, rounded, relative to the part', () => {
  const data = {
    segments: [
      { start: 0, end: 30, text: 'Thank you.', no_speech_prob: 0.9, avg_logprob: -1.4 },
      { start: 30.04, end: 41.26, text: ' Mitosis has four phases.', no_speech_prob: 0.1, avg_logprob: -0.3 },
    ],
  };
  assertEquals(transcriptTimings(data), [[30, 41.3, 'Mitosis has four phases.']]);
  assertEquals(transcriptTimings(data, { filter: false }).length, 2);
  assertEquals(transcriptTimings({ text: 'no segments' }), []);
  assertEquals(transcriptTimings({ segments: [{ start: 0, end: 1, text: 'Hm.', no_speech_prob: 0.1, avg_logprob: -0.2 }] }), []);
});

Deno.test('the silence filter can be switched off remotely', () => {
  const data = { segments: [{ start: 0, end: 1, text: 'Thank you.', no_speech_prob: 0.9, avg_logprob: -1.4 }] };
  assertEquals(keptTranscript(data).text, '');
  assertEquals(keptTranscript(data, { filter: false }).text, 'Thank you.');
});

Deno.test('prompt: course words first, the tail always fits, never over the limit', () => {
  const tail = 'x'.repeat(2000) + ' the end of the sentence';
  const hint = buildPromptHint({
    courseName: 'BIO 110 Cell Biology', instructor: 'Dr. Okafor', title: 'Lecture 5',
    terms: Array.from({ length: 80 }, (_, i) => `Term${i}`), tail,
  });
  assertEquals(hint.length <= PROMPT_MAX_CHARS, true);
  assertEquals(hint.startsWith('BIO 110 Cell Biology. Dr. Okafor. Lecture 5. Term0, Term1'), true);
  assertEquals(hint.endsWith('the end of the sentence'), true);
  assertEquals(buildPromptHint({ title: 'Lecture', courseName: 'lecture' }), 'lecture');
  assertEquals(buildPromptHint({}), '');
  assertEquals(buildPromptHint({ tail: 'only tail' }), 'only tail');
});

Deno.test('key terms are read from earlier notes, in English or Spanish', () => {
  const md = '# T\n## Topic\n- a\n## Key terms\n- **Mitosis** — cell division\n- Anaphase: chromatids separate\n## Action items\n- read ch 5';
  assertEquals(termsFromNotes(md), ['Mitosis', 'Anaphase']);
  assertEquals(termsFromNotes('## Términos clave\n- Meiosis — división'), ['Meiosis']);
  assertEquals(termsFromNotes('no terms'), []);
});
