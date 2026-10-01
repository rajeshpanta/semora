'use strict';
// One case per way Semora returns to the tabs. Each case reproduces the stack
// the student is really in (the same router calls the screens make on the way
// there), then performs the call site under test through A.toTabs():
//   legacy mode -> the raw call the site made before Priority 2,
//   helper mode -> returnToTabs(tab) from lib/tabNavigation.ts.
// `expect.tab` is the tab the student must land on.
// `expect.keepsOriginal` means the tab navigator that was already at the bottom
// must be the one returned to (same route key: no remount, no copy).
// `expect.freshTabs` (after a sign-in) means the opposite: one tab navigator,
// freshly mounted, because the old one belongs to the previous session.
// `expect.names` instead gives the whole root stack the student must be in.
// LINKS drive app/+native-intent.tsx through expo-router's own entry points: a
// cold-start URL (`initialUrl`) is what expo-linking reports at launch, a warm
// one is emitted on its 'url' event. `pre` runs before the app boots.

const RELOAD_KEY = 'semora.appUpdate.reloadingAt'; // lib/reloadMarker.ts
const CODE = 'K7QM4XR9TZ2'; // a well-formed referral code (lib/shareLinks.ts REFERRAL_CODE)
const INVITE = `https://semoraai.com/invite/${CODE}`;
const PRICING = 'https://semoraai.com/pricing'; // on our site, not a share link
const stamp = (agoMs) => () => {
  const M = (globalThis.__NAVSIM_SECURE__ = globalThis.__NAVSIM_SECURE__ || new Map());
  M.set(RELOAD_KEY, String(Date.now() - agoMs));
};
const toSettingsLms = async (A) => {
  await A.act(() => A.router.push('/me'));
  await A.act(() => A.router.push('/settings'));
  await A.act(() => A.router.push('/settings/lms'));
};
// Signed out at launch, then signed in with a share token pending: AuthGate
// replaces the sign-in screen with /join, which is then the only screen.
const joinAlone = async (A) => {
  await A.act(() => A.ext.set({ loading: false }));
  await A.act(() => A.ext.set({ pendingShare: 'T', session: true }));
  A.ext.s.pendingShare = null;
};

async function importTo(A, { viaPaste = false, courseId = 'c1' } = {}) {
  await A.act(() => A.router.push('/scan'));
  if (viaPaste) {
    await A.act(() => A.router.push('/syllabus/paste'));
    await A.act(() => A.router.push({ pathname: '/syllabus/upload', params: { fileName: 'Pasted syllabus text.txt', mimeType: 'text/plain' } }));
  } else {
    await A.act(() => A.router.push({ pathname: '/syllabus/upload', params: { fileUri: 'file:///x.pdf', fileName: 'x.pdf', mimeType: 'application/pdf' } }));
  }
  await A.act(() => A.router.replace({ pathname: '/syllabus/review', params: { parseRunId: 'p1', courseId, courseName: 'Bio' } }));
  await A.act(() => A.router.replace({ pathname: '/syllabus/added', params: courseId ? { courseId, courseName: 'Bio', count: '12' } : { count: '12' } }));
}

const CASES = [
  // ---- syllabus import ----------------------------------------------------
  { id: 'added-done-for-now', site: "app/syllabus/added.tsx goHome ('Done for now')", expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => { await importTo(A); await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)'))); } },
  { id: 'added-add-another-class', site: "app/syllabus/added.tsx goScan ('Add another class')", expect: { tab: 'scan', keepsOriginal: true },
    run: async (A) => { await importTo(A); await A.act(() => A.toTabs('scan', () => A.router.replace('/(tabs)/scan'))); } },
  { id: 'added-three-imports-then-home', site: 'added.tsx goScan x2, then goHome (one session, three classes)', expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      for (let i = 0; i < 2; i++) { await importTo(A, { courseId: 'c' + i }); await A.act(() => A.toTabs('scan', () => A.router.replace('/(tabs)/scan'))); }
      await importTo(A, { courseId: 'c9' });
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'added-view-course-without-course', site: "app/syllabus/added.tsx goCourse fallback (no courseId)", expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => { await importTo(A, { courseId: null }); await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)'))); } },
  { id: 'paste-import-done-for-now', site: 'paste -> upload -> review -> added, goHome', expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => { await importTo(A, { viaPaste: true }); await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)'))); } },
  { id: 'postscan-paywall-back-to-added-then-home', site: 'added -> paywall (postScan, course) -> added -> goHome', expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      await importTo(A);
      await A.act(() => A.router.replace({ pathname: '/paywall', params: { context: 'postScan', count: '12', courseId: 'c1' } }));
      await A.act(() => A.router.replace({ pathname: '/syllabus/added', params: { courseId: 'c1', count: '12' } }));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'postscan-paywall-close-no-course', site: 'app/paywall.tsx handleClose (postScan, no course)', expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      await importTo(A);
      await A.act(() => A.router.replace({ pathname: '/paywall', params: { context: 'postScan', count: '12' } }));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'review-go-home', site: "app/syllabus/review.tsx partial-save alert 'Go Home'", expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      await A.act(() => A.router.push('/scan'));
      await A.act(() => A.router.push({ pathname: '/syllabus/upload', params: { fileUri: 'f' } }));
      await A.act(() => A.router.replace({ pathname: '/syllabus/review', params: { courseId: 'c1' } }));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  // ---- Canvas / Moodle ----------------------------------------------------
  { id: 'canvas-from-today-see-deadlines', site: "app/settings/lms-connect.tsx 'See my deadlines' (opened from Today)", expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      await A.act(() => A.router.push({ pathname: '/settings/lms-connect', params: { provider: 'canvas', source: 'today_empty' } }));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'canvas-from-settings-see-deadlines', site: "lms-connect 'See my deadlines' (Me -> Settings -> Canvas & LMS -> Connect)", expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      await A.act(() => A.router.push('/me'));
      await A.act(() => A.router.push('/settings'));
      await A.act(() => A.router.push('/settings/lms'));
      await A.act(() => A.router.push({ pathname: '/settings/lms-connect', params: { provider: 'canvas', source: 'settings' } }));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'canvas-from-added-see-deadlines', site: "added.tsx Canvas row -> lms-connect 'See my deadlines'", expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      await importTo(A);
      await A.act(() => A.router.push({ pathname: '/settings/lms-connect', params: { provider: 'canvas', source: 'syllabus_added' } }));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'lms-connect-scan-a-syllabus', site: "app/settings/lms-connect.tsx dead-end alert 'Scan a syllabus'", expect: { tab: 'scan', keepsOriginal: true },
    run: async (A) => {
      await A.act(() => A.router.push({ pathname: '/settings/lms-connect', params: { provider: 'moodle' } }));
      await A.act(() => A.toTabs('scan', () => A.router.push('/scan')));
    } },
  { id: 'moodle-scan-instead', site: "components/MoodleGuidedPaste.tsx 'Scan a syllabus instead' (inside lms-connect)", expect: { tab: 'scan', keepsOriginal: true },
    run: async (A) => {
      await A.act(() => A.router.push('/me'));
      await A.act(() => A.router.push('/settings'));
      await A.act(() => A.router.push('/settings/lms'));
      await A.act(() => A.router.push({ pathname: '/settings/lms-connect', params: { provider: 'moodle' } }));
      await A.act(() => A.toTabs('scan', () => A.router.push('/scan')));
    } },
  // ---- invite / join / share / paywall with nothing underneath -------------
  { id: 'invite-start-using-pro-warm-link', site: "app/invite.tsx 'Start using Pro' (link opened while the app runs)", expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      await A.act(() => A.emitUrl('semora://invite?code=ABC'));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'invite-start-using-pro-cold-link', site: "app/invite.tsx 'Start using Pro' (app launched by the link)", initialUrl: 'semora://invite?code=ABC', expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => { await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)'))); } },
  { id: 'invite-alone-no-back', site: 'app/invite.tsx close/expired with nothing to go back to', expect: { tab: 'index', keepsOriginal: false },
    run: async (A) => {
      await A.act(() => A.router.replace({ pathname: '/invite', params: { code: 'ABC' } }));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'join-alone-no-back', site: 'app/join.tsx close with nothing to go back to', expect: { tab: 'index', keepsOriginal: false },
    run: async (A) => {
      await A.act(() => A.router.replace({ pathname: '/join', params: { token: 'T' } }));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'share-semester-alone-no-back', site: 'app/share-semester.tsx close with nothing to go back to', expect: { tab: 'index', keepsOriginal: false },
    run: async (A) => {
      await A.act(() => A.router.replace('/share-semester'));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'paywall-alone-no-back', site: 'app/paywall.tsx close with nothing to go back to', expect: { tab: 'index', keepsOriginal: false },
    run: async (A) => {
      await A.act(() => A.router.replace('/paywall'));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  // ---- sign-in redirect (AuthGate) ----------------------------------------
  { id: 'signin-after-signout-on-pushed-screen', site: 'app/_layout.tsx AuthGate post-sign-in (signed out while on Settings)', authGate: true, expect: { tab: 'index', freshTabs: true },
    run: async (A) => {
      await A.act(() => A.router.push('/me'));
      await A.act(() => A.router.push('/settings'));
      await A.act(() => A.ext.set({ session: false }));
      await A.act(() => A.ext.set({ session: true }));
    } },
  { id: 'signin-after-delete-account', site: 'AuthGate post-sign-in (account deleted on Settings -> Delete Account, then a new sign-in)', authGate: true, expect: { tab: 'index', freshTabs: true },
    run: async (A) => {
      await A.act(() => A.router.push('/settings'));
      await A.act(() => A.router.push('/settings/delete-account'));
      await A.act(() => A.ext.set({ session: false }));
      await A.act(() => A.ext.set({ session: true }));
    } },
  { id: 'signin-cold-signed-out', site: 'AuthGate post-sign-in (cold start signed out)', authGate: true, boot: { loading: true, session: false }, expect: { tab: 'index', keepsOriginal: false },
    run: async (A) => {
      await A.act(() => A.ext.set({ loading: false }));
      await A.act(() => A.ext.set({ session: true }));
    } },
  { id: 'signin-first-launch', site: 'AuthGate post-sign-in (first launch: onboarding -> sign-in)', authGate: true, boot: { loading: true, session: false, hasOnboarded: false }, expect: { tab: 'index', keepsOriginal: false },
    run: async (A) => {
      await A.act(() => A.ext.set({ loading: false }));
      await A.act(() => { A.ext.set({ hasOnboarded: true }); A.router.replace('/(auth)/sign-in'); });
      await A.act(() => A.ext.set({ session: true }));
    } },
  { id: 'signin-after-link-on-signin-screen', site: 'AuthGate post-sign-in (an emailed link opened while on the sign-in screen)', authGate: true, boot: { loading: true, session: false }, expect: { tab: 'index', keepsOriginal: false },
    run: async (A) => {
      await A.act(() => A.ext.set({ loading: false }));
      await A.act(() => A.emitUrl('semora://auth/callback?code=abc'));
      await A.act(() => A.ext.set({ session: true }));
    } },
  // ---- notification fallback ----------------------------------------------
  { id: 'push-fallback-on-pushed-screen', site: 'app/_layout.tsx unknown/weekly-digest push tapped on a task screen', expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      await A.act(() => A.router.push('/task/t1'));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'push-fallback-on-a-tab', site: 'app/_layout.tsx unknown push tapped while on the Courses tab', expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      await A.act(() => A.router.push('/courses'));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  // ---- +not-found ----------------------------------------------------------
  { id: 'not-found-home-link', site: "app/+not-found.tsx 'Go to home screen!'", expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      await A.act(() => A.router.push('/nope/nothing'));
      await A.act(() => A.toTabs('index', () => A.router.navigate('/')));
    } },
  // ---- new in 1.15.2 -------------------------------------------------------
  { id: 'lms-blackboard-scan-instead', site: "app/settings/lms.tsx Blackboard 'No token? Scan a syllabus instead' (Me -> Settings -> Canvas & LMS)", expect: { tab: 'scan', keepsOriginal: true },
    run: async (A) => { await toSettingsLms(A); await A.act(() => A.toTabs('scan', () => A.router.push('/scan'))); } },
  { id: 'lms-blackboard-scan-via-plus-menu', site: "app/settings/lms.tsx 'Scan a syllabus instead', reached from the + menu", expect: { tab: 'scan', keepsOriginal: true },
    run: async (A) => {
      await A.act(() => A.router.push({ pathname: '/settings/lms' }));
      await A.act(() => A.toTabs('scan', () => A.router.push('/scan')));
    } },
  { id: 'lms-connect-blackboard-scan-instead', site: "app/settings/lms-connect.tsx Blackboard token form 'Scan a syllabus instead'", expect: { tab: 'scan', keepsOriginal: true },
    run: async (A) => {
      await toSettingsLms(A);
      await A.act(() => A.router.push({ pathname: '/settings/lms-connect', params: { provider: 'blackboard', source: 'settings' } }));
      await A.act(() => A.toTabs('scan', () => A.router.push('/scan')));
    } },
  { id: 'lms-connect-blackboard-from-added', site: "lms-connect Blackboard 'Scan a syllabus instead', opened from syllabus/added", expect: { tab: 'scan', keepsOriginal: true },
    run: async (A) => {
      await importTo(A);
      await A.act(() => A.router.push({ pathname: '/settings/lms-connect', params: { provider: 'blackboard', source: 'syllabus_added' } }));
      await A.act(() => A.toTabs('scan', () => A.router.push('/scan')));
    } },
  { id: 'moodle-scan-instead-from-settings', site: "components/MoodleGuidedPaste.tsx 'Scan a syllabus instead' (Settings -> Canvas & LMS -> Moodle)", expect: { tab: 'scan', keepsOriginal: true },
    run: async (A) => {
      await toSettingsLms(A);
      await A.act(() => A.router.push({ pathname: '/settings/lms-connect', params: { provider: 'moodle', source: 'settings' } }));
      await A.act(() => A.toTabs('scan', () => A.router.push('/scan')));
    } },
  { id: 'redeem-invite-start-using-pro', site: "Me -> /redeem -> invite -> 'Start using Pro'", expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      await A.act(() => A.router.push('/me'));
      await A.act(() => A.router.push('/redeem'));
      await A.act(() => A.router.replace(`/invite?code=${CODE}`));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'join-signed-out-universal-link', site: 'app/join.tsx signed-out redirect, after a https join link opened on the sign-in screen', authGate: true, boot: { loading: true, session: false }, expect: { names: ['(auth)'] },
    run: async (A) => {
      await A.act(() => A.ext.set({ loading: false }));
      await A.act(() => A.emitUrl('https://semoraai.com/join/' + 'ab'.repeat(32)));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'join-own-share-done-alone', site: "app/join.tsx own-share 'Done' with nothing to go back to (/join after sign-in)", authGate: true, boot: { loading: true, session: false }, expect: { tab: 'index' },
    run: async (A) => { await joinAlone(A); await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)'))); } },
  // ---- robustness: a copy already exists (only possible from paths outside the app's own buttons) ----
  { id: 'legacy-copy-then-helper-from-pushed-screen', site: 'a second tab navigator already exists; return from a pushed screen above it', expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      await importTo(A);
      await A.act(() => A.router.replace('/(tabs)')); // the old behaviour: second copy
      await A.act(() => A.router.push('/task/t1'));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'legacy-copy-then-helper-from-the-copy', site: 'a second tab navigator already exists and is focused (e.g. a push tapped on it)', expect: { tab: 'courses', keepsOriginal: true },
    run: async (A) => {
      await importTo(A);
      await A.act(() => A.router.replace('/(tabs)')); // second copy, focused
      await A.act(() => A.toTabs('courses', () => A.router.replace('/(tabs)/courses')));
    } },
];

// app/+native-intent.tsx. A semoraai.com URL that is not a share link goes to
// Today; share links open their screen; everything else passes through.
const LINKS = [
  // ---- the app is running -------------------------------------------------
  { id: 'link-warm-site-on-pushed-screen', site: `${PRICING} while on Me -> Settings -> Canvas & LMS`, expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => { await toSettingsLms(A); await A.act(() => A.emitUrl(PRICING)); } },
  { id: 'link-warm-site-on-today', site: `${PRICING} while on Today`, expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => { await A.act(() => A.emitUrl(PRICING)); } },
  { id: 'link-warm-site-on-courses-tab', site: `${PRICING} while on the Courses tab`, expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => { await A.act(() => A.router.push('/courses')); await A.act(() => A.emitUrl(PRICING)); } },
  { id: 'link-warm-site-on-modal', site: `${PRICING} while New Task is open over a task`, expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => { await A.act(() => A.router.push('/task/t1')); await A.act(() => A.router.push('/task/new')); await A.act(() => A.emitUrl(PRICING)); } },
  { id: 'link-warm-site-on-added', site: `${PRICING} while on syllabus/added`, expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => { await importTo(A); await A.act(() => A.emitUrl(PRICING)); } },
  { id: 'link-warm-site-bare-origin', site: 'https://www.semoraai.com while on a task', expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => { await A.act(() => A.router.push('/task/t1')); await A.act(() => A.emitUrl('https://www.semoraai.com')); } },
  { id: 'link-warm-site-twice', site: `${PRICING} twice, with a screen opened in between`, expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => { await toSettingsLms(A); await A.act(() => A.emitUrl(PRICING)); await A.act(() => A.router.push('/settings')); await A.act(() => A.emitUrl(PRICING)); } },
  { id: 'link-warm-site-on-join-alone', site: `${PRICING} while /join is the only screen (after sign-in)`, authGate: true, boot: { loading: true, session: false }, expect: { tab: 'index' },
    run: async (A) => { await joinAlone(A); await A.act(() => A.emitUrl(PRICING)); } },
  { id: 'link-warm-site-signed-out', site: `${PRICING} while signed out on the sign-in screen`, authGate: true, boot: { loading: true, session: false }, expect: { names: ['(auth)'] },
    run: async (A) => { await A.act(() => A.ext.set({ loading: false })); await A.act(() => A.emitUrl(PRICING)); } },
  { id: 'link-warm-invite-on-pushed-screen', site: `${INVITE} while on Settings`, expect: { names: ['(tabs)', 'settings/index', 'invite'], keepsOriginal: true },
    run: async (A) => { await A.act(() => A.router.push('/settings')); await A.act(() => A.emitUrl(INVITE)); } },
  { id: 'link-warm-invite-then-start-using-pro', site: `${INVITE} on Settings, then 'Start using Pro'`, expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => {
      await A.act(() => A.router.push('/settings'));
      await A.act(() => A.emitUrl(INVITE));
      await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)')));
    } },
  { id: 'link-warm-invite-fresh-reload-stamp', site: `${INVITE} while running, just after an update reload (a warm link is never a replay)`, pre: stamp(5000), expect: { names: ['(tabs)', 'invite'], keepsOriginal: true },
    run: async (A) => { await A.act(() => A.emitUrl(INVITE)); } },
  { id: 'link-warm-scheme-unknown', site: 'semora://anything while on a task (passed through)', expect: { names: ['(tabs)', 'task/[id]', '+not-found'], keepsOriginal: true },
    run: async (A) => { await A.act(() => A.router.push('/task/t1')); await A.act(() => A.emitUrl('semora://anything')); } },
  { id: 'link-warm-scheme-collaborate', site: 'semora://collaborate?token=abc while on a task (passed through)', expect: { names: ['(tabs)', 'task/[id]', 'collaborate'], keepsOriginal: true },
    run: async (A) => { await A.act(() => A.router.push('/task/t1')); await A.act(() => A.emitUrl('semora://collaborate?token=abc')); } },
  // ---- the app is launched by the link -------------------------------------
  { id: 'link-cold-home-screen', site: 'launched from the home screen (no URL)', expect: { tab: 'index' }, run: async () => {} },
  { id: 'link-cold-site', site: `launched by ${PRICING}`, initialUrl: PRICING, expect: { tab: 'index' }, run: async () => {} },
  { id: 'link-cold-invite', site: `launched by ${INVITE}`, initialUrl: INVITE, expect: { names: ['(tabs)', 'invite'] }, run: async () => {} },
  { id: 'link-cold-invite-replay-after-reload', site: `${INVITE} replayed 5 s after an update reload`, initialUrl: INVITE, pre: stamp(5000), expect: { tab: 'index' }, run: async () => {} },
  { id: 'link-cold-invite-old-reload-stamp', site: `${INVITE} with a reload stamp 2 min old (a real tap)`, initialUrl: INVITE, pre: stamp(120000), expect: { names: ['(tabs)', 'invite'] }, run: async () => {} },
  { id: 'link-cold-scheme-unknown', site: 'launched by semora://anything', initialUrl: 'semora://anything', expect: { names: ['(tabs)', '+not-found'] }, run: async () => {} },
  { id: 'link-cold-invite-then-warm-site', site: `launched by ${INVITE}, then ${PRICING} while on the invite`, initialUrl: INVITE, expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => { await A.act(() => A.emitUrl(PRICING)); } },
  { id: 'link-cold-invite-then-start-using-pro', site: `launched by ${INVITE}, then 'Start using Pro'`, initialUrl: INVITE, expect: { tab: 'index', keepsOriginal: true },
    run: async (A) => { await A.act(() => A.toTabs('index', () => A.router.replace('/(tabs)'))); } },
];

// Navigation that must NOT change: the tabs' own buttons switch tabs inside the
// one navigator. Run in both modes as controls.
const CONTROLS = [
  { id: 'control-today-push-scan', site: "app/(tabs)/index.tsx router.push('/scan') (tab switch, unchanged)", expect: { tab: 'scan', keepsOriginal: true },
    run: async (A) => { await A.act(() => A.router.push('/scan')); } },
  { id: 'control-plus-menu-camera', site: "components/PlusMenu.tsx push({pathname:'/scan', params:{action}}) (unchanged)", expect: { tab: 'scan', keepsOriginal: true },
    run: async (A) => { await A.act(() => A.router.push({ pathname: '/scan', params: { action: 'camera' } })); } },
  { id: 'control-added-view-course', site: "added.tsx goCourse with a course: replace('/course/:id') (unchanged)", expect: { names: ['(tabs)', 'course/[id]'] },
    run: async (A) => { await importTo(A); await A.act(() => A.router.replace('/course/c1')); } },
];

module.exports = { CASES, LINKS, CONTROLS };
