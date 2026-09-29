/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --allow-read --config lib/deno.test.json lib/shareLinks.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { fromFileUrl } from 'https://deno.land/std@0.224.0/path/mod.ts';
import {
  RELOAD_REPLAY_MS, parseShareInput, parseShareUrl, routeSystemUrl, shareTargetHref,
} from './shareLinks';
import { markReloading } from './reloadMarker';
import { redirectSystemPath } from '../app/+native-intent.tsx';
import { isProtectedRoute } from './appUpdate';
import { __reset, items } from './__testing__/expo-secure-store.stub.ts';

const CODE = 'K7QM4XR9TZ2';
const JOIN = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef';
const COLLAB = '0123456789abcdef'.repeat(3);

Deno.test('each share URL maps to the screen and param that already handle it', () => {
  assertEquals(shareTargetHref(parseShareUrl(`https://semoraai.com/invite/${CODE}`)!), `/invite?code=${CODE}`);
  assertEquals(shareTargetHref(parseShareUrl(`https://semoraai.com/join/${JOIN}`)!), `/join?token=${JOIN}`);
  assertEquals(shareTargetHref(parseShareUrl(`https://semoraai.com/collaborate/${COLLAB}`)!), `/collaborate?token=${COLLAB}`);
});

Deno.test('tracking params, trailing slashes, an /es prefix and case do not break it', () => {
  assertEquals(parseShareUrl(`https://semoraai.com/invite/${CODE}?utm_source=imessage`), { kind: 'invite', value: CODE });
  assertEquals(parseShareUrl(`https://semoraai.com/invite/${CODE}/`), { kind: 'invite', value: CODE });
  assertEquals(parseShareUrl(`https://semoraai.com/es/join/${JOIN}`), { kind: 'join', value: JOIN });
  // A hand-typed link with autocapitalisation on: kind and code both folded.
  assertEquals(parseShareUrl(`https://SEMORAAI.COM/INVITE/${CODE.toLowerCase()}`), { kind: 'invite', value: CODE });
  assertEquals(parseShareUrl(`https://semoraai.com/Join/${JOIN.toUpperCase()}`), { kind: 'join', value: JOIN });
});

Deno.test('punctuation dragged in from a sentence is dropped', () => {
  assertEquals(parseShareUrl(`https://semoraai.com/invite/${CODE}.`), { kind: 'invite', value: CODE });
  assertEquals(parseShareUrl(`https://semoraai.com/invite/${CODE})`), { kind: 'invite', value: CODE });
  assertEquals(parseShareInput(`Try Semora (https://semoraai.com/invite/${CODE}).`), { kind: 'invite', value: CODE });
  assertEquals(parseShareInput(`Here: semoraai.com/join/${JOIN}!`), { kind: 'join', value: JOIN });
});

Deno.test('everything that is not a share link passes through as null', () => {
  for (const url of [
    'semora://invite?code=ABC',
    'semora://auth/callback?code=xyz',
    'com.googleusercontent.apps.123:/oauth2redirect?code=1',
    'https://semoraai.com/',
    'https://semoraai.com/invite/',
    'https://semoraai.com/pricing',
    'https://semoraai.com/blog/some-post',
    `https://app.semoraai.com/invite?code=${CODE}`,
    `https://evil.example/invite/${CODE}`,
    `https://mysemoraai.com/invite/${CODE}`,
    `http://semoraai.com/invite/${CODE}`,
    `https://semoraai.com/invite/${'x'.repeat(300)}`,
    'https://semoraai.com/invite/%E0%A4%A',
    '',
  ]) {
    assertEquals(parseShareUrl(url), null, url);
  }
});

Deno.test('typed or pasted input: code, link, or the whole share message', () => {
  assertEquals(parseShareInput(CODE), { kind: 'invite', value: CODE });
  assertEquals(parseShareInput(' k7qm-4xr9-tz2 '), { kind: 'invite', value: CODE });
  assertEquals(parseShareInput(`semoraai.com/invite/${CODE}`), { kind: 'invite', value: CODE });
  assertEquals(parseShareInput(`SEMORAAI.COM/INVITE/${CODE}`), { kind: 'invite', value: CODE });
  assertEquals(
    parseShareInput(`Join me on Semora — use my link and we both get a free month of Pro: https://semoraai.com/invite/${CODE}`),
    { kind: 'invite', value: CODE },
  );
  assertEquals(parseShareInput(`use my code ${CODE} on Semora`), { kind: 'invite', value: CODE });
  assertEquals(parseShareInput(`https://semoraai.com/join/${JOIN}`), { kind: 'join', value: JOIN });
  assertEquals(parseShareInput(`Join my Bio 101 course space in Semora:\nhttps://semoraai.com/collaborate/${COLLAB}`), { kind: 'collaborate', value: COLLAB });
  assertEquals(parseShareInput(JOIN.toUpperCase()), { kind: 'join', value: JOIN });
  assertEquals(parseShareInput(COLLAB), { kind: 'collaborate', value: COLLAB });
  // A lookalike domain is never treated as a Semora LINK (see parseShareUrl's
  // null list), but a valid code inside the text is still just a code — the
  // server validates it, so extracting it gives a lookalike no extra power.
  assertEquals(parseShareInput(`mysemoraai.com/invite/${CODE}`), { kind: 'invite', value: CODE });
  // A non-share semoraai.com link must not hide a code typed next to it.
  assertEquals(parseShareInput(`see https://semoraai.com/pricing and use ${CODE}`), { kind: 'invite', value: CODE });
});

Deno.test('input that is not a code or a Semora link is refused', () => {
  for (const input of [
    '', '   ', 'hello', 'K7QM4XR9TZ', 'K7QM4XR9TZ20', 'O0O0O0O0O0O',
    'K7QM4XR9TL2', // L is not in the code alphabet
    'https://example.com/invite/ABC', 'https://semoraai.com/pricing',
    'the word STRENGTHENS is not a code', // spellable from the alphabet, no digit, inside a sentence
  ]) {
    assertEquals(parseShareInput(input), null, input);
  }
});

Deno.test('routeSystemUrl: foreign URLs untouched, our non-share URLs go home', () => {
  for (const path of [
    `semora://invite?code=${CODE}`, 'semora://auth/callback?code=abc', 'semora://collaborate?token=x',
    'com.googleusercontent.apps.1:/oauth2redirect', `/invite?code=${CODE}`, 'https://example.com/x',
  ]) {
    assertEquals(routeSystemUrl(path, true, null, 1000), path, path);
    // A reload stamp changes nothing for them either.
    assertEquals(routeSystemUrl(path, true, 1000, 1000), path, path);
  }
  for (const path of [
    'https://semoraai.com/pricing', 'https://semoraai.com/invite/', `https://semoraai.com/invite/${'x'.repeat(300)}`,
    'https://semoraai.com/invite/x/../../settings/delete-account', 'https://www.semoraai.com/',
  ]) {
    assertEquals(routeSystemUrl(path, true, null, 1000), '/', path);
  }
});

Deno.test('routeSystemUrl: only the initial URL right after an update reload is a replay', () => {
  const url = `https://semoraai.com/invite/${CODE}`;
  const open = `/invite?code=${CODE}`;
  const reloadAt = 5_000_000;
  // The launch URL coming back seconds after AppUpdateGate reloaded.
  assertEquals(routeSystemUrl(url, true, reloadAt, reloadAt + 3_000), '/');
  assertEquals(routeSystemUrl(url, true, reloadAt, reloadAt + RELOAD_REPLAY_MS - 1), '/');
  // No reload: every launch from a link is a real tap — the first time, and
  // the same link tapped again after iOS closed the app, and after an update
  // was installed at an ordinary launch in between (both misfired before).
  assertEquals(routeSystemUrl(url, true, null, reloadAt), open);
  // A stamp from an older reload says nothing about this launch.
  assertEquals(routeSystemUrl(url, true, reloadAt, reloadAt + RELOAD_REPLAY_MS), open);
  assertEquals(routeSystemUrl(url, true, reloadAt, reloadAt + 7 * 24 * 60 * 60 * 1000), open);
  // A stamp in the future (the clock moved back) is not trusted.
  assertEquals(routeSystemUrl(url, true, reloadAt, reloadAt - 1), open);
  // A link tapped while the app is running is never a replay.
  assertEquals(routeSystemUrl(url, false, reloadAt, reloadAt + 1_000), open);
  // Every kind of share is treated alike.
  assertEquals(routeSystemUrl(`https://semoraai.com/join/${JOIN}`, true, reloadAt, reloadAt + 1_000), '/');
  assertEquals(routeSystemUrl(`https://semoraai.com/join/${JOIN}`, true, null, reloadAt), `/join?token=${JOIN}`);
});

Deno.test('app/+native-intent end to end, through the real device store', () => {
  __reset();
  const url = `https://semoraai.com/collaborate/${COLLAB}?utm_source=x`;
  const open = `/collaborate?token=${COLLAB}`;
  assertEquals(redirectSystemPath({ path: url, initial: true }), open);
  // Tapped again with the app closed: opens again.
  assertEquals(redirectSystemPath({ path: url, initial: true }), open);
  // AppUpdateGate stamps its reload; the launch URL that comes back with the
  // new JavaScript is sent home.
  markReloading(Date.now());
  assertEquals(redirectSystemPath({ path: url, initial: true }), '/');
  // While the app runs, the same link opens even straight after a reload.
  assertEquals(redirectSystemPath({ path: url, initial: false }), open);
  // A stamp older than the replay window is ignored.
  markReloading(Date.now() - RELOAD_REPLAY_MS - 1);
  assertEquals(redirectSystemPath({ path: url, initial: true }), open);
  // Unrelated URLs are never touched and never read the keychain.
  __reset();
  assertEquals(redirectSystemPath({ path: 'semora://auth/callback?code=abc', initial: true }), 'semora://auth/callback?code=abc');
  assertEquals(redirectSystemPath({ path: 'https://semoraai.com/pricing', initial: false }), '/');
  assertEquals(items.size, 0, 'nothing written');
  __reset();
});

Deno.test('the only reload in the app stamps itself first, so its replay is recognised', async () => {
  const gate = await Deno.readTextFile(new URL('../components/AppUpdateGate.tsx', import.meta.url));
  const reloads = gate.match(/reloadAsync\(/g)?.length ?? 0;
  assert(reloads >= 1, 'AppUpdateGate reloads');
  assertEquals(gate.match(/markReloading\(\);\s*await Updates\.reloadAsync\(\)/g)?.length ?? 0, reloads,
    'every Updates.reloadAsync() in AppUpdateGate is stamped with markReloading() right before it');
  // Nothing else in the app's own code reloads (a reload elsewhere would
  // replay a share link unstamped and drop the student back on it).
  for (const dir of ['app', 'components', 'lib', 'store', 'hooks']) {
    const root = new URL(`../${dir}/`, import.meta.url);
    const exists = await Deno.stat(root).then(() => true, () => false);
    if (!exists) continue;
    for await (const file of walk(root)) {
      if (file.endsWith('AppUpdateGate.tsx') || /\.test\.tsx?$/.test(file)) continue;
      const text = await Deno.readTextFile(file);
      assert(!/reloadAsync\(|DevSettings\.reload\(/.test(text), `${file} reloads the app without the replay stamp`);
    }
  }
});

Deno.test('an update never reloads the app on a screen a share link lands on', () => {
  for (const [kind, value] of [['invite', CODE], ['join', JOIN], ['collaborate', COLLAB]] as const) {
    const href = shareTargetHref({ kind, value });
    assert(isProtectedRoute(href.split('?')[0]), `${href} is protected`);
  }
  assert(isProtectedRoute('/redeem'), '/redeem is protected');
});

// ── Drift guard ──────────────────────────────────────────────────────────────
// The associated-domains entitlement is native (it moves the runtime); the
// rewrite that makes those links land anywhere is JS (it does not). If they
// ever part — the file deleted, or an OTA published from a tree without it —
// every share link would open Semora on "This screen doesn't exist" and no
// error would be logged. This fails first.
Deno.test('app.json claiming semoraai.com requires a native-intent that rewrites every claimed kind to a real screen', async () => {
  const appJson = JSON.parse(await Deno.readTextFile(new URL('../app.json', import.meta.url)));
  const domains: string[] = appJson.expo?.ios?.associatedDomains ?? [];
  if (!domains.includes('applinks:semoraai.com')) return;

  const intent = await Deno.readTextFile(new URL('../app/+native-intent.tsx', import.meta.url));
  assert(/export function redirectSystemPath/.test(intent), 'app/+native-intent.tsx must export redirectSystemPath');
  assert(/routeSystemUrl/.test(intent), 'app/+native-intent.tsx must route through lib/shareLinks routeSystemUrl');

  for (const [kind, value] of [['invite', CODE], ['join', JOIN], ['collaborate', COLLAB]] as const) {
    const href = redirectSystemPath({ path: `https://semoraai.com/${kind}/${value}`, initial: false });
    const screen = href.split('?')[0].slice(1);
    const exists = await Deno.stat(new URL(`../app/${screen}.tsx`, import.meta.url)).then(() => true, () => false);
    assert(exists, `${kind} rewrites to /${screen}, but app/${screen}.tsx does not exist`);
  }
  __reset();
});

async function* walk(dir: URL): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? '/' : ''), dir);
    if (entry.isDirectory) yield* walk(url);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield fromFileUrl(url);
  }
}
