import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  captureFailureProps,
  fourCC,
  parseNativeErrorMessage,
  sanitizeCaptureDiagnostics,
} from '@/lib/lectureCaptureError';

Deno.test('fourCC reads an OSStatus as its four characters', () => {
  assertEquals(fourCC(561145187), '!rec');
  assertEquals(fourCC(560557684), '!int');
  assertEquals(fourCC(561017449), '!pri');
  assertEquals(fourCC(1936290409), 'siri');
  assertEquals(fourCC(2003329396), 'what');
  assertEquals(fourCC(-10868), null);
  assertEquals(fourCC(1), null);
  assertEquals(fourCC(Number.NaN), null);
});

Deno.test('the domain and code come out of the text 1.15.1 already sends, in English and Spanish', () => {
  assertEquals(
    parseNativeErrorMessage('The operation couldn’t be completed. (com.apple.coreaudio.avfaudio error 561145187.)'),
    { errCode: 561145187, errDomain: 'com.apple.coreaudio.avfaudio', errFourCC: '!rec' },
  );
  assertEquals(
    parseNativeErrorMessage('No se ha podido completar la operación. (Error com.apple.coreaudio.avfaudio 561145187.)'),
    { errCode: 561145187, errDomain: 'com.apple.coreaudio.avfaudio', errFourCC: '!rec' },
  );
  assertEquals(
    parseNativeErrorMessage('The operation couldn’t be completed. (OSStatus error 561017449.)'),
    { errCode: 561017449, errDomain: 'OSStatus', errFourCC: '!pri' },
  );
  assertEquals(
    parseNativeErrorMessage('The operation couldn’t be completed. (com.apple.coreaudio.avfaudio error -10868.)'),
    { errCode: -10868, errDomain: 'com.apple.coreaudio.avfaudio' },
  );
});

Deno.test("the recorder's own messages map to its own codes", () => {
  assertEquals(parseNativeErrorMessage('No microphone input is available.'), { errDomain: 'SemoraRecorder', errCode: 1 });
  assertEquals(parseNativeErrorMessage('The microphone started but delivered no audio.'), { errDomain: 'SemoraRecorder', errCode: 2 });
  assertEquals(parseNativeErrorMessage('The microphone stopped before any audio arrived.'), { errDomain: 'SemoraRecorder', errCode: 3 });
  assertEquals(parseNativeErrorMessage("The microphone's format changed under the recorder."), { errDomain: 'SemoraRecorder', errCode: 4 });
  assertEquals(parseNativeErrorMessage('The audio hardware changed during the attempt.'), { errDomain: 'SemoraRecorder', errCode: 5 });
  assertEquals(parseNativeErrorMessage('Something else'), null);
  assertEquals(parseNativeErrorMessage(undefined), null);
});

Deno.test('diagnostics keep only listed keys with flat values', () => {
  assertEquals(
    sanitizeCaptureDiagnostics({
      step: 'engine_start', errCode: 561145187, attempts: 3.9, locked: true,
      uri: 'file:///var/mobile/x/seg_001.m4a', nested: { a: 1 }, errDomain: 'x'.repeat(200), sinceBeganMs: Number.NaN,
    }),
    { step: 'engine_start', errCode: 561145187, attempts: 3, locked: true, errDomain: 'x'.repeat(64) },
  );
  assertEquals(sanitizeCaptureDiagnostics({ uri: 'file:///x' }), undefined);
  assertEquals(sanitizeCaptureDiagnostics(null), undefined);
  assertEquals(sanitizeCaptureDiagnostics(['step']), undefined);
  // The background-time readings and ladder restarts are listed on purpose.
  assertEquals(
    sanitizeCaptureDiagnostics({ bgRemainingAtBegan: 29.7, bgRemaining: 3, restarts: 1 }),
    { bgRemainingAtBegan: 29, bgRemaining: 3, restarts: 1 },
  );
});

Deno.test("a new build's detail wins; an old build's message is parsed; bare text is redacted", () => {
  assertEquals(
    captureFailureProps({
      message: '(OSStatus error 561017449.)',
      detail: { step: 'set_active', errCode: 561145187, errDomain: 'NSOSStatusErrorDomain', attempts: 1, final: true },
    }),
    { step: 'set_active', errCode: 561145187, errDomain: 'NSOSStatusErrorDomain', attempts: 1, final: true },
  );
  assertEquals(
    captureFailureProps({ message: 'The operation couldn’t be completed. (com.apple.coreaudio.avfaudio error 561145187.)' }),
    { errCode: 561145187, errDomain: 'com.apple.coreaudio.avfaudio', errFourCC: '!rec' },
  );
  const bare = captureFailureProps({ message: '“seg_003.m4a” couldn’t be moved to /var/mobile/Containers/Data/Application/ABC/Documents/lectures/x' });
  assert(typeof bare.errText === 'string');
  assert(!String(bare.errText).includes('/var/'), String(bare.errText));
  assertEquals(captureFailureProps({}), {});
});
