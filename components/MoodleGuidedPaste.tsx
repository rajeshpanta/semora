import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, StyleSheet, View } from 'react-native';
import { Text, TextInput, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useColors } from '@/lib/theme';
import { track } from '@/lib/analytics';
import { probeLmsSite } from '@/lib/lms';
import {
  MOODLE_FEED_HINTS,
  moodleWwwrootFromPage,
  type MoodleFeedVerdict,
} from '@/lib/moodleFeedUrl';
import {
  shouldEscalateLmsSetup,
  type LmsLaneChoice,
  type LmsSetupProgress,
} from '@/lib/lmsSetupProgress';

/**
 * Guided setup for a Moodle calendar link.
 *
 * ─── WHY THIS IS NOT CanvasGuidedPaste ──────────────────────
 * The shapes are the same because they work — a school first, then a lane,
 * then four numbered taps, then a masked field that validates while you look
 * at it. Everything inside them is different, and three things have no Canvas
 * equivalent at all:
 *
 *   There is no school directory. Canvas hosts are guessable
 *   (school.instructure.com) and Instructure publishes a list; Moodle is self
 *   hosted and there is no register of installations anywhere. So the student
 *   types their school's address and Semora's server asks the site itself
 *   whether it is a Moodle. That check is ADVISORY: a university firewall can
 *   refuse it while serving the calendar export perfectly, so "couldn't
 *   confirm" never blocks anyone.
 *
 *   Moodle's export page has a second button. "Export" downloads a .ics file
 *   instead of showing a link, and on an iPhone that opens a calendar preview.
 *   A student who takes it comes back holding nothing, with no idea why. So
 *   the card warns about it BEFORE they go, and the paste field names it if
 *   they did.
 *
 *   The sheet does not share Safari's session. On iOS this is
 *   SFSafariViewController, which since iOS 11 keeps its own cookie store — so
 *   a student at a single-sign-on school signs in inside the sheet every first
 *   time, MFA and all. The card says "Sign in if Moodle asks" for that reason,
 *   and points at the laptop lane for the schools whose identity provider
 *   refuses to open in an embedded browser at all.
 *
 * MOODLE_PLAN.md Phase 4.4.
 */

function useClipboardLink() {
  /**
   * Same reasoning as CanvasGuidedPaste: react-native still ships Clipboard in
   * core at 0.81, backed by a native module already in the binary, so this
   * works over the air. expo-clipboard is not installed and adding it would
   * make the whole road wait for a new build.
   */
  return useCallback(async (): Promise<string | null> => {
    if (Platform.OS === 'web') return null;
    try {
      const RN = require('react-native');
      const value = await RN?.Clipboard?.getString?.();
      return typeof value === 'string' ? value : null;
    } catch {
      return null;
    }
  }, []);
}

/** Moodle's own page for generating the link. */
function moodleExportPageUrl(wwwroot: string): string {
  return `${wwwroot.replace(/\/+$/, '')}/calendar/export.php`;
}

export function MoodleGuidedPaste({
  token,
  onTokenChange,
  verdict,
  progress,
  onProgressChange,
  working,
  autoAdvancing,
  source,
}: {
  token: string;
  onTokenChange: (value: string) => void;
  verdict: MoodleFeedVerdict | null;
  progress: LmsSetupProgress;
  onProgressChange: (next: LmsSetupProgress) => void;
  working: boolean;
  autoAdvancing: boolean;
  source: string;
}) {
  const colors = useColors();
  const readClipboard = useClipboardLink();

  const [siteInput, setSiteInput] = useState('');
  const [checking, setChecking] = useState(false);
  /** Set when the site check ran and could not confirm — advisory only. */
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [clipboardMiss, setClipboardMiss] = useState(false);
  const [justReturned, setJustReturned] = useState(false);
  const [showLink, setShowLink] = useState(false);

  const lane = progress.setupLane;
  const wwwroot = progress.wwwroot;
  const escalated = shouldEscalateLmsSetup(progress);

  const patch = useCallback(
    (next: Partial<LmsSetupProgress>) => onProgressChange({ ...progress, ...next }),
    [progress, onProgressChange],
  );

  // ── Step A: which Moodle ──────────────────────────────────
  const findMoodle = useCallback(async () => {
    const typed = siteInput.trim();
    if (!typed || checking) return;

    // A student who pasted a page from inside their Moodle has already
    // answered this; take the site root from it rather than making them retype.
    const fromPage = moodleWwwrootFromPage(typed);
    track('lms_setup_site_entered', {
      screen: 'lms_connect', provider: 'moodle', source,
      via: fromPage && /\/\S+\//.test(typed) ? 'pasted_page' : 'typed',
      funnel_step: 'site',
    });

    setChecking(true);
    setUnconfirmed(false);
    try {
      const probe = await probeLmsSite({ provider: 'moodle', site: typed });
      track('lms_setup_probe_result', {
        screen: 'lms_connect', provider: 'moodle', source, funnel_step: 'site',
        result: probe.isMoodle ? 'moodle' : (probe.reason ?? 'not_moodle'),
        via: probe.via ?? null,
        ws: probe.ws ?? null, mobile: probe.mobile ?? null,
        typeoflogin: probe.typeoflogin ?? null, sso: probe.sso ?? null,
      });
      if (probe.isMoodle && probe.wwwroot) {
        patch({
          host: (() => { try { return new URL(probe.wwwroot!).hostname; } catch { return null; } })(),
          wwwroot: probe.wwwroot.replace(/\/+$/, ''),
          schoolName: probe.siteName ?? null,
          precheck: {
            isMoodle: true,
            ...(probe.mobile !== undefined ? { mobile: probe.mobile } : {}),
            ...(probe.typeoflogin !== undefined ? { typeoflogin: probe.typeoflogin } : {}),
            ...(probe.sso !== undefined ? { sso: probe.sso } : {}),
          },
        });
        return;
      }
      // ADVISORY. The export fetch is the real test, so a school whose
      // firewall refuses the check still gets to continue.
      const guessed = fromPage ?? moodleWwwrootFromPage(typed);
      if (guessed) {
        setUnconfirmed(true);
        patch({
          host: (() => { try { return new URL(guessed).hostname; } catch { return null; } })(),
          wwwroot: guessed.replace(/\/+$/, ''),
          schoolName: null,
          precheck: { isMoodle: false },
        });
      } else {
        setUnconfirmed(true);
      }
    } catch {
      // A failure to CHECK is not a failure to connect.
      const guessed = moodleWwwrootFromPage(typed);
      setUnconfirmed(true);
      if (guessed) {
        patch({
          host: (() => { try { return new URL(guessed).hostname; } catch { return null; } })(),
          wwwroot: guessed.replace(/\/+$/, ''),
          schoolName: null,
          precheck: { isMoodle: false },
        });
      }
    } finally {
      setChecking(false);
    }
  }, [siteInput, checking, source, patch]);

  // ── Coming back from the browser ──────────────────────────
  //
  // The link is never read automatically: iOS shows its one-time paste
  // permission as the answer to a tap, and a silent read spends that
  // permission on a prompt the student did not ask for.
  const wentToBrowser = useRef(false);
  const reportedReturn = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (lane === 'phone' && !token) setJustReturned(true);
      // THE question this whole road turns on: did they come back?
      //
      // Without this event a student who opened their school's Moodle and
      // never returned is indistinguishable from one who returned and then
      // gave up at the paste field — and those need completely different
      // fixes. Fired once per trip.
      if (wentToBrowser.current && !reportedReturn.current) {
        reportedReturn.current = true;
        track('lms_setup_returned', {
          screen: 'lms_connect', provider: 'moodle', source, funnel_step: 'returned',
          had_link: !!token,
        });
      }
    });
    return () => subscription.remove();
  }, [lane, token, source]);

  const pasteFromClipboard = useCallback(async () => {
    track('lms_setup_manual_paste_tapped', { screen: 'lms_connect', provider: 'moodle', source, funnel_step: 'paste' });
    const value = await readClipboard();
    if (value && /\/calendar\/export_execute\.php/i.test(value)) {
      onTokenChange(value.trim());
      setClipboardMiss(false);
      track('lms_setup_autofilled', { screen: 'lms_connect', provider: 'moodle', source, funnel_step: 'paste' });
    } else {
      setClipboardMiss(true);
    }
  }, [readClipboard, onTokenChange, source]);

  const openExportPage = useCallback(
    (via: 'button' | 'rescue') => {
      const target = wwwroot ? moodleExportPageUrl(wwwroot) : null;
      if (!target) return;
      track('lms_setup_export_opened', { screen: 'lms_connect', provider: 'moodle', source, via, funnel_step: 'browser' });
      wentToBrowser.current = true;
      reportedReturn.current = false;
      if (Platform.OS === 'web') {
        void Linking.openURL(target);
        return;
      }
      try {
        // Already a dependency of the Canvas road, so this adds no native code.
        const WebBrowser = require('expo-web-browser');
        void WebBrowser.openBrowserAsync(target, { dismissButtonStyle: 'done' })
          .then(() => setJustReturned(true))
          .catch(() => Linking.openURL(target));
      } catch {
        void Linking.openURL(target);
      }
    },
    [wwwroot, source],
  );

  const chooseLane = useCallback(
    (next: LmsLaneChoice) => {
      track('lms_setup_lane_chosen', { screen: 'lms_connect', provider: 'moodle', source, setup_lane: next, funnel_step: 'lane' });
      patch({ setupLane: next });
    },
    [patch, source],
  );

  const problem = verdict && verdict.state === 'problem' ? verdict : null;

  // A link from somewhere that is not their Moodle at all.
  //
  // The likeliest single wrong paste on this screen is a CANVAS calendar feed,
  // because that is the flow Semora has taught everyone, and the generic
  // "this is not a Moodle calendar export link" sends that student back into
  // Moodle to look for something that was never there. Naming the host they
  // actually pasted turns it into one readable sentence.
  //
  // Keyed on the host rather than on a list of providers: any host that is not
  // the Moodle they chose is the same mistake, and a list would have to be
  // maintained against every LMS that exists.
  const foreignHost =
    problem?.code === 'wrong_page' && problem.host && wwwroot
      && !wwwroot.toLowerCase().includes(problem.host.toLowerCase())
      ? problem.host
      : null;
  const hint = foreignHost
    ? `That link is from ${foreignHost} — open its calendar export instead`
    : problem ? MOODLE_FEED_HINTS[problem.code] : null;

  // What the student pasted, when it was not the link.
  //
  // lms_discover_failed only fires once something is SUBMITTED, so a student
  // who pastes the wrong page, reads the hint and closes the app never
  // appeared anywhere. This is the difference between "nobody finds the link"
  // and "everybody finds the wrong page", which are different problems with
  // different fixes. Reported once per distinct problem, not per keystroke.
  const reportedProblem = useRef<string | null>(null);
  useEffect(() => {
    if (!problem) { reportedProblem.current = null; return; }
    // `other_lms` is its own row in the funnel because it needs a different
    // fix from every other rejection: not clearer Moodle instructions, but a
    // student who is on the wrong platform entirely.
    const code = foreignHost ? 'other_lms' : problem.code;
    if (reportedProblem.current === code) return;
    reportedProblem.current = code;
    track('lms_setup_paste_rejected', {
      screen: 'lms_connect', provider: 'moodle', source, funnel_step: 'paste',
      reason: `moodle_feed_url_${code}`,
      lane: lane ?? null,
    });
  }, [problem, source, lane, foreignHost]);

  return (
    <View style={styles.wrap}>
      {/* ── A. Which Moodle ──────────────────────────────── */}
      {!wwwroot && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Where is your Moodle?</Text>
          <Text style={[styles.label, { color: colors.ink2 }]}>Your school’s Moodle address</Text>
          <TextInput
            value={siteInput}
            onChangeText={setSiteInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
            autoComplete="off"
            importantForAutofill="no"
            placeholder="moodle.yourschool.edu — or paste any link from it"
            placeholderTextColor={colors.ink3}
            onSubmitEditing={findMoodle}
            style={[styles.input, { color: colors.ink, backgroundColor: colors.paper, borderColor: colors.line }]}
          />
          <Text style={[styles.note, { color: colors.ink2 }]}>
            If you are not sure, search “moodle” and your school’s name.
          </Text>
          <TouchableOpacity
            style={[styles.primary, { backgroundColor: siteInput.trim() ? colors.brand : colors.line }]}
            onPress={findMoodle}
            disabled={!siteInput.trim() || checking}
            accessibilityRole="button"
            accessibilityLabel="Find my Moodle"
          >
            {checking
              ? <ActivityIndicator size="small" color="#fff" />
              : <FontAwesome name="search" size={14} color="#fff" />}
            <Text style={styles.primaryText}>{checking ? 'Checking that address…' : 'Find my Moodle'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── The answer, which never blocks ───────────────── */}
      {!!wwwroot && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={styles.rowHead}>
            <FontAwesome
              name={unconfirmed ? 'question-circle' : 'check-circle'}
              size={15}
              color={unconfirmed ? colors.ink2 : colors.brand}
            />
            <Text style={[styles.cardTitle, { color: colors.ink, marginBottom: 0 }]}>
              {unconfirmed
                ? 'Couldn’t confirm this address — continue anyway'
                : `Found: ${progress.schoolName ?? progress.host ?? ''}`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.switchLane}
            onPress={() => { setUnconfirmed(false); patch({ host: null, wwwroot: null, schoolName: null, setupLane: null, precheck: null }); }}
            accessibilityRole="button"
            accessibilityLabel="Not your school? Change"
          >
            <Text style={[styles.link, { color: colors.brand }]}>Not your school? Change</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── B. Phone or laptop ───────────────────────────── */}
      {!!wwwroot && !lane && (
        <View style={{ gap: 10 }}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>How would you like to do it?</Text>
          <TouchableOpacity
            style={[styles.laneButton, { borderColor: colors.line, backgroundColor: colors.card }]}
            onPress={() => chooseLane('phone')}
            accessibilityRole="button"
            accessibilityLabel="Do it here on my phone"
          >
            <FontAwesome name="mobile" size={22} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.laneTitle, { color: colors.ink }]}>Do it here on my phone</Text>
              <Text style={[styles.laneText, { color: colors.ink2 }]}>
                Semora opens Moodle, you copy one link and come back.
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.laneButton, { borderColor: colors.line, backgroundColor: colors.card }]}
            onPress={() => chooseLane('laptop')}
            accessibilityRole="button"
            accessibilityLabel="I have a laptop nearby"
          >
            <FontAwesome name="laptop" size={20} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.laneTitle, { color: colors.ink }]}>I have a laptop nearby</Text>
              <Text style={[styles.laneText, { color: colors.ink2 }]}>
                Get the link there, then paste it here or on app.semoraai.com.
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ── C. The four taps ─────────────────────────────── */}
      {!!wwwroot && !!lane && !token && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Open your Moodle calendar</Text>
          {[
            'Sign in if Moodle asks.',
            'Tap Get calendar URL.',
            'Tap Copy URL.',
            lane === 'phone' ? 'Come back to Semora.' : 'Paste it here, or on app.semoraai.com.',
          ].map((step, index) => (
            <View key={step} style={styles.step}>
              <View style={[styles.stepDot, { backgroundColor: colors.brand50 }]}>
                <Text style={[styles.stepDotText, { color: colors.brand }]}>{String(index + 1)}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.ink2 }]}>{step}</Text>
            </View>
          ))}
          <Text style={[styles.note, { color: colors.ink2 }]}>
            Leave the options as they are — Semora sets the date range itself.
          </Text>
          {/* The two ways this goes wrong, said BEFORE they happen. */}
          <View style={styles.noteRow}>
            <FontAwesome name="info-circle" size={12} color={colors.ink3} />
            <Text style={[styles.note, { color: colors.ink2, flex: 1 }]}>
              If you tapped Export and a calendar file opened, go back and tap Get calendar URL instead.
            </Text>
          </View>
          <View style={styles.noteRow}>
            <FontAwesome name="info-circle" size={12} color={colors.ink3} />
            <Text style={[styles.note, { color: colors.ink2, flex: 1 }]}>
              If the page just says “no export”, your school turned this off — tap Scan a syllabus instead.
            </Text>
          </View>
          {lane === 'phone' && (
            <>
              <TouchableOpacity
                style={[styles.primary, { backgroundColor: colors.brand }]}
                onPress={() => openExportPage('button')}
                accessibilityRole="button"
                accessibilityLabel={`Open ${progress.host ?? 'Moodle'}`}
              >
                <FontAwesome name="external-link" size={14} color="#fff" />
                <Text style={styles.primaryText}>{`Open ${progress.host ?? 'Moodle'}`}</Text>
              </TouchableOpacity>
              <Text style={[styles.note, { color: colors.ink2 }]}>
                If your school’s sign-in refuses to open here, use the laptop steps.
              </Text>
            </>
          )}
          <TouchableOpacity
            style={styles.switchLane}
            onPress={() => chooseLane(lane === 'phone' ? 'laptop' : 'phone')}
            accessibilityRole="button"
            accessibilityLabel={lane === 'phone' ? 'I have a laptop nearby' : 'Do it here on my phone'}
          >
            <Text style={[styles.link, { color: colors.brand }]}>
              {lane === 'phone' ? 'I have a laptop nearby' : 'Do it here on my phone'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── D. The link ──────────────────────────────────── */}
      {!!wwwroot && !!lane && (
        <View style={{ gap: 8 }}>
          {justReturned && !token && (
            <Text style={[styles.cardTitle, { color: colors.ink }]}>Back already? Paste your link</Text>
          )}
          <Text style={[styles.label, { color: colors.ink2 }]}>Your Moodle calendar link</Text>
          <View style={styles.secretField}>
            <TextInput
              value={token}
              onChangeText={(value) => { onTokenChange(value); setClipboardMiss(false); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              textContentType="URL"
              autoComplete="off"
              importantForAutofill="no"
              secureTextEntry={!showLink}
              placeholder="https://…/calendar/export_execute.php?…"
              placeholderTextColor={colors.ink3}
              style={[styles.input, styles.secretInput, { color: colors.ink, backgroundColor: colors.card, borderColor: colors.line }]}
            />
            <TouchableOpacity
              style={styles.secretToggle}
              onPress={() => setShowLink((value) => !value)}
              accessibilityRole="button"
              accessibilityLabel={showLink ? 'Hide the link' : 'Show the link'}
            >
              <FontAwesome name={showLink ? 'eye-slash' : 'eye'} size={15} color={colors.ink3} />
            </TouchableOpacity>
          </View>

          {Platform.OS !== 'web' && !token && (
            <TouchableOpacity style={styles.pasteRow} onPress={pasteFromClipboard} accessibilityRole="button" accessibilityLabel="Paste from clipboard">
              <FontAwesome name="clipboard" size={13} color={colors.brand} />
              <Text style={[styles.link, { color: colors.brand }]}>Paste from clipboard</Text>
            </TouchableOpacity>
          )}
          {clipboardMiss && (
            <Text style={[styles.note, { color: colors.ink2 }]}>Nothing Moodle-shaped on the clipboard yet</Text>
          )}

          {autoAdvancing && (
            <View style={styles.autoRow}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={[styles.note, { color: colors.ink2 }]}>Link looks right — checking Moodle…</Text>
            </View>
          )}
          {!autoAdvancing && verdict?.state === 'ok' && (
            <View style={styles.autoRow}>
              <FontAwesome name="check-circle" size={13} color={colors.brand} />
              <Text style={[styles.note, { color: colors.ink2 }]}>{`Looks right — ${verdict.host}`}</Text>
            </View>
          )}
          {!!hint && !working && (
            <View style={styles.autoRow}>
              <FontAwesome name="exclamation-circle" size={13} color={colors.coral} />
              <Text style={[styles.note, { color: colors.ink2, flex: 1 }]}>{hint}</Text>
            </View>
          )}
          {/* Every rescue offers the way back to the page that has the link. */}
          {!!problem && !working && (
            <TouchableOpacity style={styles.pasteRow} onPress={() => openExportPage('rescue')} accessibilityRole="button" accessibilityLabel="Open it again">
              <FontAwesome name="refresh" size={13} color={colors.brand} />
              <Text style={[styles.link, { color: colors.brand }]}>Open it again</Text>
            </TouchableOpacity>
          )}

          <View style={styles.noteRow}>
            <FontAwesome name="question-circle" size={12} color={colors.ink3} />
            <Text style={[styles.note, { color: colors.ink2, flex: 1 }]}>
              <Text style={{ fontWeight: '700' }}>Older Moodle? </Text>
              If your Export page shows the link as text with no Copy button, select it and copy it by hand.
            </Text>
          </View>
        </View>
      )}

      {/* ── E. Two failures is enough ─────────────────────── */}
      {escalated && (
        <View style={[styles.rescue, { backgroundColor: colors.card, borderColor: colors.coral }]}>
          <Text style={[styles.rescueTitle, { color: colors.ink }]}>Not working?</Text>
          <Text style={[styles.rescueText, { color: colors.ink2 }]}>
            Getting the link on a laptop is easier, and you can paste it here afterwards.
          </Text>
          {lane !== 'laptop' && (
            <TouchableOpacity onPress={() => chooseLane('laptop')} accessibilityRole="button" accessibilityLabel="Show me the laptop steps">
              <Text style={[styles.link, { color: colors.brand }]}>Show me the laptop steps</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => {
              track('lms_setup_help_opened', { screen: 'lms_connect', provider: 'moodle', source, attempts: progress.attempts, funnel_step: 'help' });
              void Linking.openURL('https://semoraai.com/support');
            }}
            accessibilityRole="button"
            accessibilityLabel="Ask Semora for help"
          >
            <Text style={[styles.link, { color: colors.brand }]}>Ask Semora for help</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  cardTitle: { fontSize: 17, fontWeight: '800', marginBottom: 10 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  laneButton: { flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1.5, borderRadius: 14, padding: 16 },
  laneTitle: { fontSize: 16, fontWeight: '800' },
  laneText: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepDotText: { fontSize: 12, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 13, lineHeight: 19 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 13 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  switchLane: { paddingVertical: 8, alignItems: 'center' },
  link: { fontSize: 13, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  secretField: { position: 'relative', justifyContent: 'center' },
  secretInput: { paddingRight: 44 },
  secretToggle: { position: 'absolute', right: 6, padding: 10 },
  pasteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 4 },
  // ink2 rather than ink3: these lines carry the instructions, and ink3 is
  // 3.37:1, which fails WCAG AA at this size.
  note: { fontSize: 12, lineHeight: 17 },
  rescue: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  rescueTitle: { fontSize: 14, fontWeight: '700' },
  rescueText: { fontSize: 13, lineHeight: 19 },
});
