/**
 * The directory is a third party's response and the hostname it yields becomes
 * a URL we send a student to. Both facts make this worth testing precisely.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  parseCanvasSchools, manualCanvasHost, canvasCalendarPageUrl,
} from '@/lib/canvasSchools.ts';

Deno.test('reads the real shape Instructure returns', () => {
  // Captured verbatim from the live endpoint while writing this.
  const live = [
    { id: 128018, name: 'De Anza College', domain: 'deanza.instructure.com', distance: null },
    { id: 136507, name: 'UCLA', domain: 'bruinlearn.ucla.edu', distance: null },
    { id: 127235, name: 'Stanford University', domain: 'canvas.stanford.edu', distance: null },
  ];
  const out = parseCanvasSchools(live);
  assertEquals(out.length, 3);
  assertEquals(out[1].domain, 'bruinlearn.ucla.edu');
  // None of these could be guessed from the school name. That is the point.
  assertEquals(out.map((s) => s.name), ['De Anza College', 'UCLA', 'Stanford University']);
});

Deno.test('a hostile or malformed directory response yields nothing, never a bad URL', () => {
  assertEquals(parseCanvasSchools(null), []);
  assertEquals(parseCanvasSchools({ not: 'an array' }), []);
  assertEquals(parseCanvasSchools([{ name: 'No domain' }]), []);
  assertEquals(parseCanvasSchools([{ name: 'X', domain: 'https://evil.com/path' }]), []);
  assertEquals(parseCanvasSchools([{ name: 'X', domain: 'user@evil.com' }]), []);
  assertEquals(parseCanvasSchools([{ name: 'X', domain: '10.0.0.1' }]).length, 0);
  assertEquals(parseCanvasSchools([{ name: 'X', domain: 'nodots' }]), []);
});

Deno.test('duplicate domains collapse', () => {
  const out = parseCanvasSchools([
    { id: 1, name: 'A', domain: 'x.instructure.com' },
    { id: 2, name: 'A again', domain: 'x.instructure.com' },
  ]);
  assertEquals(out.length, 1);
});

Deno.test('a hand-typed address is accepted in every shape a student writes it', () => {
  for (const input of [
    'deanza.instructure.com',
    'https://deanza.instructure.com',
    'https://deanza.instructure.com/',
    'https://deanza.instructure.com/courses/123',
    'DeAnza.Instructure.COM',
    '  deanza.instructure.com  ',
    'https://deanza.instructure.com:443/calendar',
  ]) {
    assertEquals(manualCanvasHost(input), 'deanza.instructure.com', input);
  }
});

Deno.test('a hand-typed address that is not a hostname is refused', () => {
  for (const bad of ['', '   ', 'nodots', 'http://', '10.0.0.1', 'my school', '/calendar']) {
    assertEquals(manualCanvasHost(bad), null, bad);
  }
});

Deno.test('credentials in a typed address are stripped, not carried', () => {
  // A pasted URL with an embedded user must not turn into a host we then send
  // the student to with the credential still attached.
  assertEquals(manualCanvasHost('https://someone:pw@deanza.instructure.com/x'), 'deanza.instructure.com');
});

Deno.test('the calendar page URL is always https and always /calendar', () => {
  assertEquals(canvasCalendarPageUrl('deanza.instructure.com'), 'https://deanza.instructure.com/calendar');
});
