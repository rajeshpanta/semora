import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, AppState, Linking, Platform, StyleSheet, View } from 'react-native';
import { Text, TextInput, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useColors } from '@/lib/theme';
import { track } from '@/lib/analytics';
import { probeLmsSite } from '@/lib/lms';
import {
  MOODLE_FEED_HINTS,
  describeMoodleFeedInput,
  isCanvasFeedLink,
  readMoodleSiteEntry,
  type MoodleFeedVerdict,
} from '@/lib/moodleFeedUrl';
import {
  moodleLinkStepReady,
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
 * On the web there is no lane to choose. The student is already at a
 * computer, so the phone-or-laptop card is skipped and the Open button is
 * always there — asking a web user to "open app.semoraai.com on your laptop"
 * was a loop back to the page they were reading.
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
  onSwitchToCanvas,
}: {
  token: string;
  onTokenChange: (value: string) => void;
  verdict: MoodleFeedVerdict | null;
  progress: LmsSetupProgress;
  onProgressChange: (next: LmsSetupProgress) => void;
  working: boolean;
  autoAdvancing: boolean;
  source: string;
  /** Hands a pasted Canvas feed link to the Canvas flow, link and all. */
  onSwitchToCanvas?: () => void;
}) {
  const colors = useColors();
  const readClipboard = useClipboardLink();
  const isWeb = Platform.OS === 'web';

  const [siteInput, setSiteInput] = useState('');
  const [checking, setChecking] = useState(false);
  /**
   * The first box never fails in silence. Set when what was typed cannot be
   * an address at all — a school's name, a word with no dot — so the screen
   * says so under the field instead of spinning and changing nothing.
   */
  const [siteProblem, setSiteProblem] = useState<'not_address' | 'canvas_link' | null>(null);
  const [clipboardMiss, setClipboardMiss] = useState(false);
  const [justReturned, setJustReturned] = useState(false);
  const [showLink, setShowLink] = useState(false);

  const lane = progress.setupLane;
  const wwwroot = progress.wwwroot;
  const escalated = shouldEscalateLmsSetup(progress);
  /** The paste step is showing: a lane was chosen, or this is the web. */
  const linkStep = moodleLinkStepReady(progress, isWeb);
  /**
   * What the site check said, read from saved progress rather than component
   * state, so a student who leaves for the browser and comes back is not
   * shown a confident "Found:" for an address that was never confirmed. A
   * reconnect prefills the site with no check at all; that is a school Semora
   * has already synced, so it counts as found.
   */
  const siteDoubt = progress.precheck && !progress.precheck.isMoodle
    ? (progress.precheck.reason === 'not_moodle' ? 'not_moodle' : 'unconfirmed')
    : null;

  const patch = useCallback(
    (next: Partial<LmsSetupProgress>) => onProgressChange({ ...progress, ...next }),
    [progress, onProgressChange],
  );

  // ── Step A: which Moodle ──────────────────────────────────
  const findMoodle = useCallback(async () => {
    const typed = siteInput.trim();
    if (!typed || checking) return;

    // The calendar link itself, pasted into the first box. That is exactly
    // what the laptop steps end with on the web app, and it answers both
    // questions at once — which Moodle, and the link — so take it rather than
    // asking the student to paste it a second time one screen later.
    const direct = describeMoodleFeedInput(typed);
    if (direct.state === 'ok') {
      track('lms_setup_site_entered', {
        screen: 'lms_connect', provider: 'moodle', source, via: 'pasted_link', funnel_step: 'site',
      });
      setSiteProblem(null);
      patch({
        host: direct.host,
        wwwroot: direct.wwwroot,
        schoolName: null,
        // No check: the link came out of the student's own signed-in Moodle,
        // which is stronger evidence than anything the probe could add.
        precheck: null,
        setupLane: lane ?? (isWeb ? null : 'phone'),
      });
      onTokenChange(typed);
      return;
    }

    // A Canvas feed link in the first box is the same mistake as in the last
    // one, and gets the same answer: offer Canvas, not a probe of Instructure.
    if (onSwitchToCanvas && isCanvasFeedLink(typed)) {
      setSiteProblem('canvas_link');
      track('lms_setup_site_rejected', {
        screen: 'lms_connect', provider: 'moodle', source, funnel_step: 'site', reason: 'canvas_link',
      });
      return;
    }

    // A name, or a word with no dot, is not something the server can check.
    // Say so here rather than spending a probe on it and then showing nothing.
    const entry = readMoodleSiteEntry(typed);
    if (entry.state !== 'address') {
      setSiteProblem('not_address');
      track('lms_setup_site_rejected', {
        screen: 'lms_connect', provider: 'moodle', source, funnel_step: 'site', reason: 'not_address',
      });
      return;
    }
    setSiteProblem(null);

    // A student who pasted a page from inside their Moodle has already
    // answered this; take the site root from it rather than making them retype.
    track('lms_setup_site_entered', {
      screen: 'lms_connect', provider: 'moodle', source,
      via: /\/\S+\//.test(entry.site.replace(/^https:\/\//i, '')) ? 'pasted_page' : 'typed',
      upgraded_http: entry.upgraded,
      funnel_step: 'site',
    });

    const guessed = entry.wwwroot.replace(/\/+$/, '');
    const guessedHost = (() => { try { return new URL(guessed).hostname; } catch { return null; } })();
    setChecking(true);
    try {
      // Always the https form. The probe refuses http:// outright, and every
      // Moodle a student can sign in to serves https anyway.
      const probe = await probeLmsSite({ provider: 'moodle', site: entry.site });
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
      // firewall refuses the check still gets to continue. What the check
      // said is kept, because "this answered and is not Moodle" (usually the
      // school's main website) and "this could not be reached" need
      // different words on the next card.
      patch({
        host: guessedHost,
        wwwroot: guessed,
        schoolName: null,
        precheck: { isMoodle: false, reason: probe.reason ?? 'not_moodle' },
      });
    } catch {
      // A failure to CHECK is not a failure to connect.
      patch({
        host: guessedHost,
        wwwroot: guessed,
        schoolName: null,
        precheck: { isMoodle: false, reason: 'unreachable' },
      });
    } finally {
      setChecking(false);
    }
  }, [siteInput, checking, source, patch, lane, isWeb, onTokenChange, onSwitchToCanvas]);

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

  /**
   * The explicit tap takes WHATEVER is on the clipboard, not only a link that
   * already looks right.
   *
   * It used to accept export_execute.php and nothing else, and answer every
   * other paste with one line — so the student who copied the sign-in page,
   * the Export page or a Canvas link was told only that nothing fit, while
   * the hints that name each of those mistakes sat unused under the field.
   * Putting the paste in the box lets the verdict say what it actually is.
   * Canvas has always done this; this is the same rule.
   */
  const pasteFromClipboard = useCallback(async () => {
    track('lms_setup_manual_paste_tapped', { screen: 'lms_connect', provider: 'moodle', source, funnel_step: 'paste' });
    const value = await readClipboard();
    if (value && value.trim()) {
      onTokenChange(value.trim());
      setClipboardMiss(false);
      setJustReturned(false);
      if (/\/calendar\/export_execute\.php/i.test(value)) {
        track('lms_setup_autofilled', { screen: 'lms_connect', provider: 'moodle', source, funnel_step: 'paste' });
      }
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
  // A Canvas calendar feed in particular is not a wrong page to send them back
  // for. It is a working link for a different platform, so the answer is to
  // offer that platform — with the link they already have — rather than a
  // hint that sends a Canvas student into a Moodle they do not use.
  const canvasLink = !!problem && !!onSwitchToCanvas && isCanvasFeedLink(token);
  const hint = canvasLink
    ? null
    : foreignHost
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
      canvas_link: canvasLink,
    });
  }, [problem, source, lane, foreignHost, canvasLink]);

  /** The four taps, in the words that fit where the student is doing them. */
  const phoneSteps = ['Sign in if Moodle asks.', 'Tap Get calendar URL.', 'Tap Copy URL.', 'Come back to Semora.'];
  const webSteps = ['Sign in if Moodle asks.', 'Click Get calendar URL, then Copy URL.', 'Come back to this tab and paste it below.'];
  const renderStep = (text: string, index: number, extra?: ReactNode) => (
    <View key={`${index}-${text}`} style={styles.step}>
      <View style={[styles.stepDot, { backgroundColor: colors.brand50 }]}>
        <Text style={[styles.stepDotText, { color: colors.brand }]}>{String(index + 1)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.stepText, { color: colors.ink2 }]}>{text}</Text>
        {extra}
      </View>
    </View>
  );

  /**
   * What to expect on Moodle's own export page, said BEFORE it goes wrong.
   * Read with the Moodle steps, so each lane places it straight after the
   * step that has the student on that page.
   */
  const moodlePageNotes = (
    <>
      <Text style={[styles.note, { color: colors.ink2 }]}>
        Leave the options as they are — Semora sets the date range itself.
      </Text>
      <View style={styles.noteRow}>
        <FontAwesome name="info-circle" size={12} color={colors.ink3} />
        <Text style={[styles.note, { color: colors.ink2, flex: 1 }]}>
          If you tapped Export and a calendar file opened, go back and tap Get calendar URL instead.
        </Text>
      </View>
      <View style={styles.noteRow}>
        <FontAwesome name="info-circle" size={12} color={colors.ink3} />
        <Text style={[styles.note, { color: colors.ink2, flex: 1 }]}>
          If the page just says “no export”, your school turned this off. Semora will offer to read your syllabus instead.
        </Text>
      </View>
      {/* A single-sign-on school often drops the student on the
          dashboard after login rather than on the page Semora opened.
          This is the way back from there, by the menu. */}
      <View style={styles.noteRow}>
        <FontAwesome name="info-circle" size={12} color={colors.ink3} />
        <Text style={[styles.note, { color: colors.ink2, flex: 1 }]}>
          <Text style={{ fontWeight: '700' }}>Landed somewhere else? </Text>
          Go to Calendar → Import or export calendars → Export calendar.
        </Text>
      </View>
    </>
  );

  /** "Is your school on Canvas?" — the same offer from either box. */
  const renderCanvasOffer = (onPress: () => void) => (
    <View style={[styles.rescue, { backgroundColor: colors.brand50, borderColor: colors.brand }]}>
      <Text style={[styles.rescueTitle, { color: colors.ink }]}>Is your school on Canvas?</Text>
      <Text style={[styles.rescueText, { color: colors.ink2 }]}>
        That is a Canvas calendar link, not a Moodle one. Semora can connect Canvas with it instead.
      </Text>
      <TouchableOpacity
        style={[styles.primary, { backgroundColor: working ? colors.line : colors.brand }]}
        onPress={onPress}
        // Switching drops whatever check is running; not while one is.
        disabled={working}
        accessibilityRole="button"
        accessibilityLabel="Connect Canvas instead"
      >
        <FontAwesome name="exchange" size={14} color="#fff" />
        <Text style={styles.primaryText}>Connect Canvas instead</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.wrap}>
      {/* ── A. Which Moodle ──────────────────────────────── */}
      {!wwwroot && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Where is your Moodle?</Text>
          <Text style={[styles.label, { color: colors.ink2 }]}>Your school’s Moodle address</Text>
          <TextInput
            value={siteInput}
            onChangeText={(value) => { setSiteInput(value); setSiteProblem(null); }}
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
          {/* Said in words, under the box, the moment it happens. Before
              this a school name or an address with no dot sent the button
              spinning and then left the screen exactly as it was. */}
          {siteProblem === 'not_address' && (
            <View style={styles.noteRow}>
              <FontAwesome name="exclamation-circle" size={12} color={colors.coral} />
              <Text style={[styles.note, { color: colors.ink2, flex: 1 }]}>
                That isn’t a web address yet. Type it like moodle.yourschool.edu, or paste any link from your Moodle.
              </Text>
            </View>
          )}
          {/* The link goes across with them, so Canvas can use it at once. */}
          {siteProblem === 'canvas_link' && !!onSwitchToCanvas && renderCanvasOffer(() => {
            onTokenChange(siteInput.trim());
            onSwitchToCanvas();
          })}
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
              name={siteDoubt ? 'question-circle' : 'check-circle'}
              size={15}
              color={siteDoubt ? colors.ink2 : colors.brand}
            />
            <Text style={[styles.cardTitle, { color: colors.ink, marginBottom: 0, flex: 1 }]}>
              {siteDoubt === 'not_moodle'
                ? 'This doesn’t look like a Moodle site'
                : siteDoubt
                ? 'Couldn’t confirm this address — continue anyway'
                : `Found: ${progress.schoolName ?? progress.host ?? ''}`}
            </Text>
          </View>
          {/* The address itself whenever it was not confirmed, so a typo is
              visible before the student is sent off to it. */}
          {!!siteDoubt && !!progress.host && (
            <Text style={[styles.address, { color: colors.ink }]} selectable>{progress.host}</Text>
          )}
          {/* Distinct from "couldn't confirm". This address answered and is
              not a Moodle — most often the school's main website, whose
              Moodle lives at another address — and continuing to it opens a
              page that does not exist. Still advisory: some Moodles hide
              every sign the check looks for. */}
          {siteDoubt === 'not_moodle' && (
            <Text style={[styles.note, { color: colors.ink2 }]}>
              That address answered, but not like Moodle. It may be your school’s main website — check the address, or continue if you’re sure it’s right.
            </Text>
          )}
          <TouchableOpacity
            style={styles.switchLane}
            onPress={() => {
              setSiteProblem(null);
              // A link pasted for the old school would only be refused as
              // "a different Moodle" against the new one.
              if (token) onTokenChange('');
              patch({ host: null, wwwroot: null, schoolName: null, setupLane: null, precheck: null });
            }}
            accessibilityRole="button"
            accessibilityLabel={siteDoubt ? 'Change the address' : 'Not your school? Change'}
          >
            <Text style={[styles.link, { color: colors.brand }]}>
              {siteDoubt ? 'Change the address' : 'Not your school? Change'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── B. Phone or laptop — not asked on the web ───── */}
      {!!wwwroot && !lane && !isWeb && (
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

      {/* ── C. The taps ──────────────────────────────────── */}
      {linkStep && !token && (
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {isWeb || lane === 'phone' ? (
            <>
              <Text style={[styles.cardTitle, { color: colors.ink }]}>Open your Moodle calendar</Text>
              {(isWeb ? webSteps : phoneSteps).map((step, index) => renderStep(step, index))}
              {moodlePageNotes}
            </>
          ) : (
            <>
              {/* The laptop lane used to be the phone's four taps with a
                  different last line, and never said WHERE to go on the
                  laptop. A student cannot type "your Moodle's export page"
                  into an address bar; they can type this. */}
              <View style={styles.rowHead}>
                <FontAwesome name="laptop" size={16} color={colors.brand} />
                <Text style={[styles.cardTitle, { color: colors.ink, marginBottom: 0 }]}>Get the link on your laptop</Text>
              </View>
              {renderStep('On your laptop, open this address:', 0, (
                <Text style={[styles.address, { color: colors.ink }]} selectable>{moodleExportPageUrl(wwwroot!)}</Text>
              ))}
              {renderStep('Sign in if Moodle asks.', 1)}
              {renderStep('Click Get calendar URL, then Copy URL.', 2)}
              {/* In the order they are read. These are about the Moodle page
                  the student has open at step 3, so they sit under step 3 —
                  after the Semora steps they were being read once the
                  student had already left that page. */}
              {moodlePageNotes}
              <Text style={[styles.subhead, { color: colors.ink }]}>Then paste it into Semora on the web</Text>
              {/* The whole thing can be finished there: the web app's own
                  first box takes the calendar link and goes straight on. No
                  code-and-handoff channel, for the reason CanvasGuidedPaste
                  gives — the link is a live credential and never needs to
                  leave the browser it was copied in. */}
              {renderStep('Open app.semoraai.com in a new tab and sign in.', 3)}
              {renderStep('Open Settings, then Canvas or LMS Sync, and choose Moodle.', 4)}
              {/* The step the card used to stop short of. The first box on
                  the web ("Where is your Moodle?") takes the calendar link
                  itself and goes straight on to the courses. */}
              {renderStep('Paste the link into the first box there.', 5)}
              <Text style={[styles.note, { color: colors.ink2 }]}>
                Your classes appear here the next time you open Semora.
              </Text>
            </>
          )}
          {(isWeb || lane === 'phone') && (
            <>
              {/* Always on the web: there is no lane there to hide it behind,
                  and a new tab is exactly the right way to open it. */}
              <TouchableOpacity
                style={[styles.primary, { backgroundColor: colors.brand }]}
                onPress={() => openExportPage('button')}
                accessibilityRole="button"
                accessibilityLabel={`Open ${progress.host ?? 'Moodle'}`}
              >
                <FontAwesome name="external-link" size={14} color="#fff" />
                <Text style={styles.primaryText}>{`Open ${progress.host ?? 'Moodle'}`}</Text>
              </TouchableOpacity>
              {!isWeb && (
                <Text style={[styles.note, { color: colors.ink2 }]}>
                  If your school’s sign-in refuses to open here, use the laptop steps.
                </Text>
              )}
            </>
          )}
          {!isWeb && (
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
          )}
        </View>
      )}

      {/* ── D. The link ──────────────────────────────────── */}
      {linkStep && (
        <View style={{ gap: 8 }}>
          {/* Back from Moodle with the link in hand. The same block Canvas
              shows, for the same reason: the read raises iOS's own paste
              permission alert, and that alert only reads as normal when it
              answers a tap the student has just made — so the tap is the big
              button, not a small link under the field. */}
          {justReturned && !token && !isWeb && (
            <View style={[styles.rescue, { backgroundColor: colors.brand50, borderColor: colors.brand }]}>
              <Text style={[styles.rescueTitle, { color: colors.ink }]}>Back already? Paste your link</Text>
              <Text style={[styles.rescueText, { color: colors.ink2 }]}>
                Copied the link? Tap below and Semora fills it in. iOS may ask permission to paste — that is expected, and Semora only ever reads the one link.
              </Text>
              <TouchableOpacity
                style={[styles.primary, { backgroundColor: colors.brand }]}
                onPress={() => { void pasteFromClipboard(); }}
                accessibilityRole="button"
                accessibilityLabel="Paste my Moodle link"
              >
                <FontAwesome name="clipboard" size={14} color="#fff" />
                <Text style={styles.primaryText}>Paste my Moodle link</Text>
              </TouchableOpacity>
            </View>
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

          {!isWeb && !token && !justReturned && (
            <TouchableOpacity style={styles.pasteRow} onPress={pasteFromClipboard} accessibilityRole="button" accessibilityLabel="Paste from clipboard">
              <FontAwesome name="clipboard" size={13} color={colors.brand} />
              <Text style={[styles.link, { color: colors.brand }]}>Paste from clipboard</Text>
            </TouchableOpacity>
          )}
          {clipboardMiss && !token && (
            <Text style={[styles.note, { color: colors.ink2 }]}>Nothing to paste yet. Copy the link in Moodle first.</Text>
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
          {/* A Canvas link: the student is on the wrong screen, not the
              wrong page. Switching keeps the link, so Canvas picks it up
              and goes straight on. */}
          {canvasLink && !working && renderCanvasOffer(() => onSwitchToCanvas?.())}
          {/* Every rescue offers the way back to the page that has the link. */}
          {!!problem && !working && !canvasLink && (
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
          {/* The laptop is the rescue on a phone. On the web the student is
              already on one, so the offer would be a loop — and the card
              was left with a title and two links, saying nothing to someone
              who had just failed twice. Canvas's web card says the same. */}
          {isWeb ? (
            <Text style={[styles.rescueText, { color: colors.ink2 }]}>
              This step trips people up. Nothing you have done so far is lost.
            </Text>
          ) : (
            <Text style={[styles.rescueText, { color: colors.ink2 }]}>
              Getting the link on a laptop is easier, and you can paste it here afterwards.
            </Text>
          )}
          {lane !== 'laptop' && !isWeb && (
            <TouchableOpacity onPress={() => chooseLane('laptop')} accessibilityRole="button" accessibilityLabel="Show me the laptop steps">
              <Text style={[styles.link, { color: colors.brand }]}>Show me the laptop steps</Text>
            </TouchableOpacity>
          )}
          {/* The route out that always works.
              A student can be stuck here for a reason they cannot fix — their
              school turned calendar export off, or its firewall refuses
              Semora's server — and until now the only thing offered at that
              point was a support page, which cannot help them either. The
              syllabus scanner is Semora's own core feature and needs nothing
              from Moodle at all. */}
          <TouchableOpacity
            onPress={() => {
              track('lms_setup_scan_offered', {
                screen: 'lms_connect', provider: 'moodle', source,
                attempts: progress.attempts, funnel_step: 'help', reason: 'escalation',
              });
              router.push('/scan' as never);
            }}
            accessibilityRole="button"
            accessibilityLabel="Scan a syllabus instead"
          >
            <Text style={[styles.link, { color: colors.brand }]}>Scan a syllabus instead</Text>
          </TouchableOpacity>
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
  address: { fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: 3 },
  subhead: { fontSize: 13, fontWeight: '800', marginTop: 6 },
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
