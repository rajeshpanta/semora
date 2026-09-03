import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, StyleSheet, View } from 'react-native';
import { Text, TextInput, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useColors } from '@/lib/theme';
import { track } from '@/lib/analytics';
import {
  CANVAS_FEED_HINTS,
  type CanvasFeedVerdict,
} from '@/lib/canvasFeedUrl';
import {
  canvasCalendarPageUrl,
  manualCanvasHost,
  searchCanvasSchools,
  type CanvasSchool,
} from '@/lib/canvasSchools';
import {
  shouldEscalate,
  type CanvasLaneChoice,
  type CanvasSetupProgress,
} from '@/lib/canvasSetupProgress';

/**
 * Guided Paste.
 *
 * ─── THE MEASUREMENT THIS ANSWERS ───────────────────────────
 * 22 sessions reached the Canvas connect screen over 60 days. 13 of them —
 * 59% — never attempted a paste at all, and 7 more pasted, failed and left.
 * Two connected.
 *
 * The old screen was a set of instructions: open your school's Canvas in a
 * browser, go to Calendar, find Calendar Feed, copy the URL, come back. Every
 * one of those steps is easy on a laptop and an errand on a phone, and the
 * very first one assumes the student knows their school's Canvas address —
 * which is usually nothing like the school's name (UCLA's is
 * bruinlearn.ucla.edu). A student who does not know it cannot even begin, and
 * a screen made of instructions has nothing to offer them. That is the 59%.
 *
 * So this stops explaining and starts doing the parts it can:
 *
 *   · find the school's Canvas address from its NAME, using Instructure's own
 *     directory, so nobody has to know a hostname;
 *   · open that school's calendar page directly, so "navigate to Calendar →
 *     Calendar Feed" becomes one tap;
 *   · read the link out of the clipboard when they come back, so the paste
 *     step usually does not need a paste;
 *   · when they paste the WRONG Canvas page, use the hostname it contains
 *     rather than telling them to go and find the right one;
 *   · and when someone is genuinely stuck on a phone, hand the job to their
 *     laptop instead of repeating the instructions a third time.
 *
 * Nothing here can obtain the feed link on the student's behalf. It lives
 * behind their Canvas login, in a dialog, and Semora must never hold their
 * Canvas password. The goal is narrower and achievable: make the trip as
 * short as possible and never leave them at a dead end.
 */

function useClipboardFeed() {
  /**
   * react-native still ships Clipboard in core at 0.81 (deprecated, warns on
   * access) and it is backed by a native module already in the binary — so
   * this works over the air. expo-clipboard is NOT installed, and adding it
   * would have made the whole lane wait for a new binary.
   *
   * Wrapped because it is deprecated: the day it is removed this degrades to
   * "the student pastes manually", which is exactly the old behaviour.
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

export function CanvasGuidedPaste({
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
  verdict: CanvasFeedVerdict | null;
  progress: CanvasSetupProgress;
  onProgressChange: (next: CanvasSetupProgress) => void;
  working: boolean;
  autoAdvancing: boolean;
  source: string;
}) {
  const colors = useColors();
  const readClipboard = useClipboardFeed();

  const [query, setQuery] = useState('');
  const [schools, setSchools] = useState<CanvasSchool[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualHost, setManualHost] = useState('');
  const [showPrivateUrl, setShowPrivateUrl] = useState(false);
  const [clipboardMiss, setClipboardMiss] = useState(false);
  /** Set when the student comes back from Canvas, so the paste can be offered. */
  const [justReturned, setJustReturned] = useState(false);

  const lane = progress.setupLane;
  const host = progress.host;
  const escalated = shouldEscalate(progress);

  // ── School search ─────────────────────────────────────────
  const searchSeq = useRef(0);
  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) { setSchools([]); setSearchFailed(false); return; }
    const seq = ++searchSeq.current;
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      const { ok, schools: found } = await searchCanvasSchools(term, controller.signal);
      // A slower earlier request must never overwrite a newer answer.
      if (seq !== searchSeq.current) return;
      setSearching(false);
      setSearchFailed(!ok);
      setSchools(found);
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  const chooseLane = (next: CanvasLaneChoice) => {
    // `setup_lane`, NOT `lane`. `lane` already means connect/repair/expand in
    // the Phase 2 funnel taxonomy and is the key every Canvas query scopes on;
    // emitting phone/laptop under the same name would put two unrelated
    // vocabularies in one column — the exact mistake `step` vs `onboarding_step`
    // made, caught here before a single event was emitted.
    track('canvas_setup_lane_chosen', {
      screen: 'lms_connect', source, lane: 'connect', setup_lane: next,
    });
    onProgressChange({ ...progress, setupLane: next });
  };

  const chooseSchool = (school: CanvasSchool) => {
    track('canvas_setup_school_chosen', {
      screen: 'lms_connect', source, lane: 'connect', via: 'directory',
    });
    onProgressChange({ ...progress, host: school.domain, schoolName: school.name });
  };

  const chooseManualHost = () => {
    const resolved = manualCanvasHost(manualHost);
    if (!resolved) return;
    track('canvas_setup_school_chosen', { screen: 'lms_connect', source, lane: 'connect', via: 'manual' });
    onProgressChange({ ...progress, host: resolved, schoolName: resolved });
  };

  /**
   * Read the clipboard and fill the field if it holds a Canvas feed link.
   *
   * Only ever called from a tap. iOS will show its paste permission alert here,
   * and that is correct: the student asked for this a moment ago.
   */
  const absorbClipboard = useCallback(async () => {
    const clip = await readClipboard();
    if (clip && /\/feeds\/calendars\//i.test(clip)) {
      track('canvas_setup_autofilled', { screen: 'lms_connect', source, lane: 'connect' });
      onTokenChange(clip.trim());
      setJustReturned(false);
      return true;
    }
    setClipboardMiss(true);
    return false;
  }, [readClipboard, onTokenChange, source]);

  /**
   * ─── WHY SEMORA NO LONGER READS THE CLIPBOARD BY ITSELF ────
   *
   * Phase 3 read it automatically the moment the student came back from
   * Canvas, which was the whole "usually needs no paste" promise. On iOS 16 and
   * later that is not a silent read: touching UIPasteboard's contents from code
   * the user did not ask for raises the system's own "Allow Paste?" alert.
   *
   * So the student returned holding their private Canvas credential and was met
   * by an iOS permission dialog nobody had mentioned — in a flow whose entire
   * job is to feel safe enough to paste a bearer token into. This codebase has
   * twice decided that unexplained Apple chrome reads as a warning that
   * something is wrong: once for the Passwords/QuickType heuristics on the
   * field below, and once for the webcal:// prompt the copy warns about in
   * advance. Firing a third one automatically undoes both.
   *
   * There is no API in React Native core that checks the clipboard without
   * reading it (expo-clipboard's hasStringAsync does, and would need a new
   * binary — and would only avoid the prompt when there is nothing to paste,
   * which is the case that matters least).
   *
   * The fix is not a native module. It is to stop taking the action nobody
   * asked for. Coming back from Canvas now OFFERS the paste as a prominent
   * button; iOS then asks permission as the direct result of a tap the student
   * just made, which is exactly the interaction Apple's prompt is designed for
   * and the only version of it that reads as normal.
   */
  const awaitingReturn = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !awaitingReturn.current) return;
      awaitingReturn.current = false;
      // Offer, do not take. See the note above.
      setJustReturned(true);
    });
    return () => sub.remove();
  }, []);

  /** Open the school's calendar page, then look for the link on return. */
  const openCalendar = async (targetHost: string, via: string) => {
    const url = canvasCalendarPageUrl(targetHost);
    track('canvas_setup_calendar_opened', { screen: 'lms_connect', source, lane: 'connect', via });
    setClipboardMiss(false);
    let inAppSheet = false;
    try {
      const WebBrowser = require('expo-web-browser');
      if (WebBrowser?.openBrowserAsync) {
        inAppSheet = true;
        await WebBrowser.openBrowserAsync(url, { dismissButtonStyle: 'done' });
      } else {
        await Linking.openURL(url);
      }
    } catch {
      inAppSheet = false;
      await Linking.openURL(url).catch(() => {});
    }
    // Native only. useClipboardFeed returns null on web by design, so offering
    // "tap and Semora fills it in" there would be a button that cannot do what
    // it says. On the web app the student pastes into the field directly, which
    // is what a browser makes easy anyway.
    if (Platform.OS === 'web') return;
    if (inAppSheet) {
      // The sheet has been dismissed: we are already back.
      setJustReturned(true);
    } else {
      awaitingReturn.current = true;
    }
  };

  /**
   * The explicit tap. Deliberately more permissive than the automatic read:
   * that one only accepts something that already looks like a feed, because it
   * fires unasked and must never overwrite the field with a shopping list. This
   * one was asked for, so whatever is on the clipboard goes in and the verdict
   * line explains it — being shown "that is a Canvas page, not the feed" is
   * more useful than a button that silently does nothing.
   */
  const pasteFromClipboard = async () => {
    const clip = await readClipboard();
    if (clip && clip.trim()) {
      track('canvas_setup_manual_paste_tapped', { screen: 'lms_connect', source, lane: 'connect' });
      onTokenChange(clip.trim());
      setClipboardMiss(false);
    } else {
      setClipboardMiss(true);
    }
  };

  const s = styles;

  // ── The wrong-page rescue ─────────────────────────────────
  // A paste that was a real Canvas URL from the wrong page contains the one
  // fact this whole flow is otherwise stuck asking for. Offer the calendar
  // page for THAT host instead of explaining where to find it.
  const rescueHost =
    verdict?.state === 'problem' && verdict.code === 'wrong_page' ? verdict.host : undefined;

  return (
    <View style={s.wrap}>
      {/* ── Lane choice ───────────────────────────────────── */}
      {!lane && (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[s.cardTitle, { color: colors.ink }]}>How do you want to do this?</Text>
          <Text style={[s.cardIntro, { color: colors.ink3 }]}>
            Canvas keeps your calendar link behind your login, so one trip to Canvas is
            unavoidable. Semora can make it a short one.
          </Text>
          <TouchableOpacity
            onPress={() => chooseLane('phone')}
            style={[s.laneButton, { borderColor: colors.brand, backgroundColor: colors.brand50 }]}
          >
            <FontAwesome name="mobile" size={18} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={[s.laneTitle, { color: colors.ink }]}>Do it here on my phone</Text>
              <Text style={[s.laneText, { color: colors.ink2 }]}>
                Semora opens your school’s Canvas calendar, then fills the link in with one tap when
                you come back.
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => chooseLane('laptop')}
            style={[s.laneButton, { borderColor: colors.line, backgroundColor: colors.card }]}
          >
            <FontAwesome name="laptop" size={18} color={colors.ink2} />
            <View style={{ flex: 1 }}>
              <Text style={[s.laneTitle, { color: colors.ink }]}>I have a laptop nearby</Text>
              <Text style={[s.laneText, { color: colors.ink2 }]}>
                Finish on the bigger screen. Nothing to copy between devices.
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Laptop lane ───────────────────────────────────── */}
      {lane === 'laptop' && (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={s.rowHead}>
            <FontAwesome name="laptop" size={16} color={colors.brand} />
            <Text style={[s.cardTitle, { color: colors.ink, marginBottom: 0 }]}>Finish on your laptop</Text>
          </View>
          {/* Deliberately NOT a code-and-handoff channel. Sending the feed URL
              between two devices would mean inventing a place to park a live
              bearer credential; Semora already runs on the web, so the honest
              answer is to do the whole thing there once, where the link never
              leaves the browser it was copied in. */}
          <View style={s.step}>
            <View style={[s.stepDot, { backgroundColor: colors.brand50 }]}><Text style={[s.stepDotText, { color: colors.brand }]}>1</Text></View>
            <Text style={[s.stepText, { color: colors.ink2 }]}>
              On your laptop, open <Text style={{ fontWeight: '700', color: colors.ink }}>app.semoraai.com</Text> and sign in.
            </Text>
          </View>
          <View style={s.step}>
            <View style={[s.stepDot, { backgroundColor: colors.brand50 }]}><Text style={[s.stepDotText, { color: colors.brand }]}>2</Text></View>
            <Text style={[s.stepText, { color: colors.ink2 }]}>
              Go to Settings → Connected classes → Connect Canvas, and paste the link there.
            </Text>
          </View>
          <View style={s.step}>
            <View style={[s.stepDot, { backgroundColor: colors.brand50 }]}><Text style={[s.stepDotText, { color: colors.brand }]}>3</Text></View>
            <Text style={[s.stepText, { color: colors.ink2 }]}>
              {/* Precise on purpose: the phone refetches its connections when it
                  next comes to the foreground, so the classes are simply there.
                  There is no live push, and promising one would be a small lie
                  the student would catch within a minute of staring at Today. */}
              Your classes are here the next time you open Semora. You can close this screen.
            </Text>
          </View>
          <TouchableOpacity onPress={() => chooseLane('phone')} style={s.switchLane}>
            <Text style={[s.link, { color: colors.brand }]}>Actually, let me try on my phone</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Phone lane: which school ──────────────────────── */}
      {lane === 'phone' && !host && (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[s.cardTitle, { color: colors.ink }]}>Which school?</Text>
          <Text style={[s.cardIntro, { color: colors.ink3 }]}>
            So Semora can open the right Canvas. Most schools’ Canvas address looks nothing
            like their name, so it is easier to search.
          </Text>
          {!manualEntry ? (
            <>
              <TextInput
                value={query}
                onChangeText={setQuery}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Your college or university"
                placeholderTextColor={colors.ink3}
                style={[s.input, { color: colors.ink, backgroundColor: colors.paper, borderColor: colors.line }]}
              />
              {searching && <ActivityIndicator style={{ marginTop: 10 }} />}
              {!searching && schools.map((school) => (
                <TouchableOpacity
                  key={school.domain}
                  onPress={() => chooseSchool(school)}
                  style={[s.schoolRow, { borderColor: colors.line }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.schoolName, { color: colors.ink }]} numberOfLines={2}>{school.name}</Text>
                    <Text style={[s.schoolHost, { color: colors.ink3 }]}>{school.domain}</Text>
                  </View>
                  <FontAwesome name="chevron-right" size={12} color={colors.ink3} />
                </TouchableOpacity>
              ))}
              {!searching && query.trim().length >= 3 && schools.length === 0 && (
                <Text style={[s.note, { color: colors.ink3 }]}>
                  {searchFailed
                    ? 'Could not reach the school directory just now.'
                    : 'No match. Your school may use its own Canvas address.'}
                </Text>
              )}
              <TouchableOpacity onPress={() => setManualEntry(true)} style={s.switchLane}>
                <Text style={[s.link, { color: colors.brand }]}>I know my Canvas web address</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput
                value={manualHost}
                onChangeText={setManualHost}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="yourschool.instructure.com"
                placeholderTextColor={colors.ink3}
                style={[s.input, { color: colors.ink, backgroundColor: colors.paper, borderColor: colors.line }]}
              />
              <TouchableOpacity
                disabled={!manualCanvasHost(manualHost)}
                onPress={chooseManualHost}
                style={[s.primary, { backgroundColor: manualCanvasHost(manualHost) ? colors.brand : colors.line }]}
              >
                <Text style={s.primaryText}>Use this address</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setManualEntry(false)} style={s.switchLane}>
                <Text style={[s.link, { color: colors.brand }]}>Search for my school instead</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* ── Phone lane: fetch the link ────────────────────── */}
      {lane === 'phone' && !!host && (
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={s.rowHead}>
            <FontAwesome name="university" size={15} color={colors.brand} />
            <Text style={[s.cardTitle, { color: colors.ink, marginBottom: 0 }]} numberOfLines={1}>
              {progress.schoolName ?? host}
            </Text>
          </View>
          <Text style={[s.cardIntro, { color: colors.ink3 }]}>
            Semora will open {host}. Sign in if it asks, then find
            <Text style={{ fontWeight: '700' }}> Calendar Feed</Text> in the calendar sidebar and copy the link.
          </Text>
          <TouchableOpacity
            onPress={() => openCalendar(host, 'phone_lane')}
            style={[s.primary, { backgroundColor: colors.brand }]}
          >
            <FontAwesome name="external-link" size={14} color="#fff" />
            <Text style={s.primaryText}>Open my Canvas calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onProgressChange({ ...progress, host: null, schoolName: null })} style={s.switchLane}>
            <Text style={[s.link, { color: colors.brand }]}>Different school</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── The paste field ───────────────────────────────── */}
      {lane !== 'laptop' && (
        <>
          <Text style={[s.label, { color: colors.ink2 }]}>Paste your private Calendar Feed link</Text>
          <View style={s.secretField}>
            <TextInput
              value={token}
              onChangeText={onTokenChange}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              secureTextEntry={!showPrivateUrl}
              // secureTextEntry alone tells iOS "this is a password", and with
              // no content-type hint iOS applies its credential heuristics —
              // Passwords sheet, QuickType bar, sometimes Face ID. In a step
              // whose instruction is "paste a calendar link", unexplained Apple
              // chrome reads as a warning that something is wrong. These three
              // say what the field is; the masking is unchanged.
              textContentType="URL"
              autoComplete="off"
              importantForAutofill="no"
              placeholder="webcal://…/feeds/calendars/user_….ics"
              placeholderTextColor={colors.ink3}
              style={[s.input, s.secretInput, { color: colors.ink, backgroundColor: colors.card, borderColor: colors.line }]}
            />
            <TouchableOpacity
              accessibilityLabel={showPrivateUrl ? 'Hide Calendar Feed URL' : 'Show Calendar Feed URL'}
              onPress={() => setShowPrivateUrl((current) => !current)}
              style={s.secretToggle}
            >
              <FontAwesome name={showPrivateUrl ? 'eye-slash' : 'eye'} size={15} color={colors.ink3} />
            </TouchableOpacity>
          </View>

          {/* Back from Canvas with the link in hand. Offered as a real button
              rather than done silently, because the read raises iOS's own paste
              permission alert and that alert only makes sense as the answer to
              something the student just tapped. */}
          {justReturned && !token && Platform.OS !== 'web' && (
            <View style={[s.rescue, { backgroundColor: colors.brand50, borderColor: colors.brand }]}>
              <Text style={[s.rescueText, { color: colors.ink2 }]}>
                Copied the link? Tap below and Semora fills it in. iOS may ask permission to paste —
                that is expected, and Semora only ever reads the one link.
              </Text>
              <TouchableOpacity
                onPress={() => { void absorbClipboard(); }}
                style={[s.primary, { backgroundColor: colors.brand }]}
              >
                <FontAwesome name="clipboard" size={14} color="#fff" />
                <Text style={s.primaryText}>Paste my Calendar Feed link</Text>
              </TouchableOpacity>
            </View>
          )}
          {(!justReturned || Platform.OS === 'web') && !token && (
            <TouchableOpacity onPress={pasteFromClipboard} style={s.pasteRow}>
              <FontAwesome name="clipboard" size={12} color={colors.brand} />
              <Text style={[s.link, { color: colors.brand }]}>Paste from clipboard</Text>
            </TouchableOpacity>
          )}
          {clipboardMiss && !token && (
            <Text style={[s.note, { color: colors.ink3 }]}>
              Nothing that looks like a Canvas link is on your clipboard yet. Copy it in Canvas first.
            </Text>
          )}

          {/* Auto-advance: the student does not have to find a button. */}
          {autoAdvancing && (
            <View style={s.autoRow}>
              <ActivityIndicator size="small" color={colors.teal} />
              <Text style={[s.note, { color: colors.teal }]}>Link looks right — checking Canvas…</Text>
            </View>
          )}

          {/* Silent until they have typed something: an error under an empty
              box reads as a failure they already made. */}
          {verdict && verdict.state !== 'empty' && !autoAdvancing && (
            <View style={s.noteRow}>
              <FontAwesome
                name={verdict.state === 'ok' ? 'check-circle' : 'exclamation-circle'}
                size={12}
                color={verdict.state === 'ok' ? colors.teal : colors.ink2}
              />
              <Text style={[s.note, { color: verdict.state === 'ok' ? colors.teal : colors.ink2, flex: 1 }]}>
                {verdict.state === 'ok'
                  ? `Looks right — ${verdict.host}`
                  : CANVAS_FEED_HINTS[verdict.code]}
              </Text>
            </View>
          )}

          {/* ── Wrong-page rescue ──────────────────────────── */}
          {!!rescueHost && !working && (
            <View style={[s.rescue, { backgroundColor: colors.brand50, borderColor: colors.brand }]}>
              <Text style={[s.rescueText, { color: colors.ink2 }]}>
                That link is from {rescueHost} — the right school, the wrong page. Semora can open
                its calendar for you.
              </Text>
              <TouchableOpacity
                onPress={() => openCalendar(rescueHost, 'wrong_page_rescue')}
                style={[s.primary, { backgroundColor: colors.brand }]}
              >
                <FontAwesome name="external-link" size={14} color="#fff" />
                <Text style={s.primaryText}>Open {rescueHost} calendar</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* ── Escalation ────────────────────────────────────── */}
      {escalated && lane !== 'laptop' && (
        <View style={[s.rescue, { backgroundColor: colors.amber50, borderColor: colors.line }]}>
          <Text style={[s.rescueTitle, { color: colors.ink }]}>Not working?</Text>
          <Text style={[s.rescueText, { color: colors.ink2 }]}>
            This step trips people up, and it is usually easier on a computer. Nothing you have
            done so far is lost.
          </Text>
          <TouchableOpacity onPress={() => chooseLane('laptop')} style={[s.primary, { backgroundColor: colors.brand }]}>
            <FontAwesome name="laptop" size={14} color="#fff" />
            <Text style={s.primaryText}>Show me the laptop steps</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              track('canvas_setup_help_opened', { screen: 'lms_connect', source, lane: 'connect', attempts: progress.attempts });
              Linking.openURL('https://semoraai.com/support').catch(() => {});
            }}
            style={s.switchLane}
          >
            <Text style={[s.link, { color: colors.brand }]}>Ask Semora for help</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardIntro: { fontSize: 13, lineHeight: 19 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  laneButton: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  laneTitle: { fontSize: 14, fontWeight: '700' },
  laneText: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepDotText: { fontSize: 12, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 13, lineHeight: 19 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  schoolRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingVertical: 12 },
  schoolName: { fontSize: 14, fontWeight: '600' },
  schoolHost: { fontSize: 12, marginTop: 2 },
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
  note: { fontSize: 12, lineHeight: 17 },
  rescue: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  rescueTitle: { fontSize: 14, fontWeight: '700' },
  rescueText: { fontSize: 13, lineHeight: 19 },
});
