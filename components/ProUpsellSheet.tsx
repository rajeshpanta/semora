import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Alert } from '@/components/LocalizedReactNative';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { getProducts, purchaseProduct, PRODUCT_IDS } from '@/lib/purchases';
import { track } from '@/lib/analytics';
import { FREE_COURSE_PHRASE, FREE_SEMESTER_LIMIT } from '@/lib/syllabus';
import { useQuery } from '@tanstack/react-query';
import {
  CANVAS_PROMO_SOURCE,
  canvasFreePromoQuery,
  canvasOfferFor,
  canvasPromoPlacementFor,
  lmsConnectionsQuery,
} from '@/lib/lms';
import { useAppStore } from '@/store/appStore';

// The upgrade moment, as a sheet rather than a screen.
//
// Hitting the free limit used to fire a plain Alert whose "Upgrade" button
// pushed a full paywall screen. That is two taps and a context switch at the
// exact instant the student is trying to do something — and the alert had no
// room to say what Pro actually gives, so the decision was made on nothing.
// This puts the offer where the refusal happens.
//
// NOTE ON HONESTY: no social-proof count appears here. Semora has ~47 accounts;
// a "join 20,000+ students" line would be fabricated, and in a purchase flow
// that is false advertising (App Store 2.3), not marketing. The trust line
// below says only things that are true.

export type ProUpsellReason =
  | 'scan' | 'notes' | 'lecture' | 'course' | 'canvas'
  | 'tutor' | 'flashcards' | 'insights' | 'dashboard' | 'planner'
  | 'pomodoro' | 'grades' | 'reminders' | 'streak' | 'risk'
  | 'share' | 'collaboration' | 'calendar' | 'quiz' | 'semester';

const COPY: Record<ProUpsellReason, { title: string; subtitle: string }> = {
  scan: {
    title: 'Scan every syllabus',
    subtitle: 'You have used your one free AI action. Pro reads every syllabus you have.',
  },
  notes: {
    title: 'Turn every file into notes',
    subtitle: 'You have used your one free AI action. Pro has no limit on files or lectures.',
  },
  lecture: {
    title: 'Record every lecture',
    subtitle: 'You have used your one free AI action. Pro records and transcribes all term.',
  },
  // Deliberately NOT the "one free AI action" line the other three share. A
  // student who hits the course cap may still have their free action unspent —
  // they are blocked by how many classes a free semester holds, not by AI use.
  // Telling them they have used something they have not is the kind of wrong
  // that makes a paywall feel like a trick.
  // Canvas is the strongest reason to upgrade Semora has, so it says what it
  // does rather than what it costs. Deliberately NOT the "one free AI action"
  // line: nobody hits this by running out of anything — Canvas sync simply
  // requires Pro, and pretending otherwise would be a different lie.
  canvas: {
    title: 'Let Canvas fill in your semester',
    subtitle: 'Pro connects Canvas: every class imports itself, and deadlines stay right when your instructor moves them.',
  },
  // One entry per wall, each in its own words.
  //
  // A single generic "This is a Pro feature" line would have been less code and
  // worse: a student who taps the AI tutor and a student who taps grade
  // forecasting want different things, and telling them both the same sentence
  // is how a paywall reads as a toll booth rather than an offer. None of these
  // borrow the "you have used your one free AI action" line unless the student
  // actually did — running out and never having access are different facts.
  tutor: {
    title: 'Ask about any class',
    subtitle: 'Pro adds a tutor that already knows this course — its syllabus, its deadlines, and the notes you upload.',
  },
  flashcards: {
    title: 'Study with flashcards',
    subtitle: 'Pro builds decks from your notes and lectures, and schedules the review for you.',
  },
  insights: {
    title: 'See how the term is going',
    subtitle: 'Pro tracks what you finish, what slips, and where the workload is about to spike.',
  },
  dashboard: {
    title: 'See the whole workload',
    subtitle: 'Pro charts every deadline across every class, so a heavy week is visible before you are in it.',
  },
  planner: {
    title: 'Plan the whole term',
    subtitle: 'Free plans the next 7 days. Pro plans the whole semester, and rebuilds it when a date moves.',
  },
  pomodoro: {
    title: 'Focus timer',
    subtitle: 'Pro adds a focus timer that logs what you worked on against the deadline it belongs to.',
  },
  grades: {
    title: 'Know your grade',
    subtitle: 'Pro forecasts your grade from your own syllabus weighting, and uses your school\u2019s scale, not a guess.',
  },
  reminders: {
    title: 'Reminders on your schedule',
    subtitle: 'Free reminds you the day something is due. Pro reminds you 3 days and 1 day ahead, and stays quiet overnight.',
  },
  streak: {
    title: 'Keep your streak',
    subtitle: 'Pro tracks the days you stay on top of everything, and what it took to get there.',
  },
  risk: {
    title: 'See trouble coming',
    subtitle: 'Pro flags a class slipping out of reach while there is still time to do something about it.',
  },
  share: {
    title: 'Share this with your class',
    subtitle: 'Pro sends a classmate every deadline in one link. Opening a link a friend sent is always free.',
  },
  collaboration: {
    title: 'Host a shared space',
    subtitle: 'Pro hosts a space where a class keeps changing deadlines and group work in one place. Joining someone else\u2019s is free.',
  },
  calendar: {
    title: 'Put deadlines in your calendar',
    subtitle: 'Pro syncs every deadline to the calendar you already check, and keeps it right when a date moves.',
  },
  quiz: {
    title: 'Practice before the exam',
    subtitle: 'Pro turns your notes and lectures into practice questions, with answers, as many times as you want.',
  },
  semester: {
    title: 'Every semester at once',
    subtitle: `Free accounts hold ${FREE_SEMESTER_LIMIT} semester. Pro keeps them all, so last term stays where you left it.`,
  },
  course: {
    title: 'Add every class',
    // Says "you add yourself" because that is now the whole of the limit.
    // Canvas classes do not count against it, and a subtitle that said "free
    // semesters hold 1 course" full stop would be selling Pro by describing a
    // restriction the reader can walk around for nothing — which is the kind
    // of true-but-not-honest that a paywall cannot afford.
    subtitle: `Free semesters hold ${FREE_COURSE_PHRASE} you add yourself — classes that come from Canvas do not count. Pro has no limit on either.`,
  },
};

/**
 * The scan wall when the free action is still UNSPENT.
 *
 * COPY.scan is written for the hard wall — the student who ran out — and both
 * its lines are shaped by that: a title about scanning, and a subtitle that
 * opens by naming what they have used up. Neither fits the student who arrives
 * from "Become Pro" on the confirmation, because they have not run out of
 * anything and did not come here blocked.
 *
 * So this variant sells rather than explains. It names no free-tier limit at
 * all — a paywall reached voluntarily has no reason to describe the tier the
 * reader is already living in — and the headline is about the outcome they
 * want rather than the feature that happened to be under their thumb.
 */
const SCAN_UNSPENT = {
  title: 'Stay on top of your semester by becoming Pro',
  subtitle: 'Everything Semora can do, for every class you have this term.',
};

const BENEFITS = [
  'Unlimited scans, lectures and file uploads',
  'Notes, flashcards and practice quizzes',
  'AI tutor, Smart Plan and grade forecasting',
];

export function ProUpsellSheet({
  visible,
  reason,
  onClose,
  freeActionSpent = true,
}: {
  visible: boolean;
  reason: ProUpsellReason;
  onClose: () => void;
  /**
   * Has the student actually used their one free AI action?
   *
   * Defaults to true so every existing caller — including ProUpsellHost, which
   * serves roughly fifty walls — keeps the copy it has today. Only the scan
   * screen passes false, and only from the path where the action is unspent.
   */
  freeActionSpent?: boolean;
}) {
  const colors = useColors();
  const router = useRouter();
  const [plan, setPlan] = useState<'annual' | 'monthly'>('annual');
  // Real store prices where StoreKit gives them; these are the fallbacks and
  // the web values. Never show a price the payment sheet will not honour.
  const [monthlyPrice, setMonthlyPrice] = useState('$3.99');
  const [annualPrice, setAnnualPrice] = useState('$19.99');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    track('pro_upsell_shown', { screen: 'upsell_sheet', reason });
    getProducts().then((p) => {
      if (p?.monthly?.displayPrice) setMonthlyPrice(p.monthly.displayPrice);
      if (p?.annual?.displayPrice) setAnnualPrice(p.annual.displayPrice);
    }).catch(() => {});
  }, [visible, reason]);

  const copy = COPY[reason];
  // Only the scan wall is reachable both ways; every other reason is unchanged.
  const unspentScan = reason === 'scan' && !freeActionSpent;
  const title = unspentScan ? SCAN_UNSPENT.title : copy.title;
  const subtitle = unspentScan ? SCAN_UNSPENT.subtitle : copy.subtitle;
  // Canvas is the free answer to "I cannot get my classes in", so it is offered
  // on exactly those two walls and nowhere else — putting it on the flashcards
  // or calendar sheet would be noise in a place that has to stay a clear yes/no.
  const isPro = useAppStore((st) => st.isPro);
  const { data: lmsConnections } = useQuery(lmsConnectionsQuery);
  const { data: canvasFreePromo } = useQuery(canvasFreePromoQuery);
  const { offer: canvasOffer, free: canvasFree } = canvasOfferFor(lmsConnections, isPro, canvasFreePromo);
  // One rule, in one testable place — see canvasPromoPlacementFor. The syllabus
  // wall gets the limited-time promotional card BELOW the Pro offer; the course
  // wall keeps the plain escape it has shipped with since 2026-08-21, same
  // words and same position; every other wall gets nothing.
  const placement = canvasPromoPlacementFor(reason, canvasOffer, canvasFree);
  const canvasScanPromo = placement === 'scan_promo';
  const canvasEscape = placement === 'course_escape';

  const choose = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    track('pro_upsell_continue', { screen: 'upsell_sheet', reason, plan });

    // WEB: go straight to Stripe from here.
    //
    // This used to push /paywall for everyone, which made hitting the free
    // limit cost three taps across two screens — refusal, sheet, paywall, then
    // the actual buy button. On web there is no reason for the middle screen:
    // the sheet already shows both prices and what Pro includes, and
    // purchaseProduct() simply redirects the tab to Stripe Checkout. One tap.
    //
    // NATIVE still routes to /paywall on purpose. StoreKit purchases need the
    // transaction listeners, receipt validation and restore path that live on
    // that screen; running a native purchase from a modal would duplicate all
    // of it, and getting receipt validation subtly wrong is how a paying
    // customer ends up without Pro.
    if (Platform.OS !== 'web') {
      onClose();
      router.push({ pathname: '/paywall', params: { context: `upsell_${reason}`, plan } } as any);
      return;
    }

    setStarting(true);
    try {
      await purchaseProduct(plan === 'annual' ? PRODUCT_IDS.annual : PRODUCT_IDS.monthly);
      // Reached only if the redirect has not taken effect yet; the tab is on
      // its way to Stripe. Deliberately NOT tracked as a cancellation — that
      // mistake is what made every web checkout look abandoned.
      track('purchase_checkout_started', { screen: 'upsell_sheet', reason, plan });
    } catch (err: any) {
      setStarting(false);
      const title = err?.code === 'ALREADY_PRO' ? 'You already have Pro' : 'Could not start checkout';
      Alert.alert(title, err?.message ?? 'Something went wrong. Please try again.');
      return;
    }
    setStarting(false);
    onClose();
  };

  const dismiss = () => {
    track('pro_upsell_dismissed', { screen: 'upsell_sheet', reason });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.host}>
        <Pressable style={styles.backdrop} onPress={dismiss} accessible={false} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <TouchableOpacity
              style={styles.close}
              onPress={dismiss}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <FontAwesome name="times" size={17} color={colors.ink3} />
            </TouchableOpacity>

            {/* Horizontal padding keeps a long title clear of the absolutely
                positioned close button. "Turn every file into notes" ran
                under the x on a 393pt phone without it. */}
            <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: colors.ink2 }]}>{subtitle}</Text>

            {/* The free way out, above the prices.
                Only on the two walls Canvas actually answers: out of courses,
                or out of AI actions. Both are "I cannot get my classes in",
                and while the offer is live the honest response to that is not
                a price. Showing it after the plan cards would be showing it to
                someone who has already decided.
                Suppressed once Canvas is healthy — then the student's classes
                are already arriving and this wall is about something else. */}
            {canvasEscape && (
              <TouchableOpacity
                style={[styles.canvasEscape, { borderColor: colors.teal, backgroundColor: colors.teal50 }]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Connect Canvas free, limited time offer"
                onPress={() => {
                  track('canvas_offer_tapped', { screen: 'upsell_sheet', offer: canvasOffer, free: true, reason, source: 'course_upsell' });
                  onClose();
                  router.push({ pathname: '/settings/lms', params: { source: 'course_upsell' } } as any);
                }}
              >
                <FontAwesome name="university" size={15} color={colors.teal} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.canvasEscapeTitle, { color: colors.ink }]}>Or connect Canvas — free</Text>
                  <Text style={[styles.canvasEscapeText, { color: colors.ink2 }]}>
                    Limited time: every class you have imports itself, no Pro and no limit.
                  </Text>
                </View>
                <FontAwesome name="chevron-right" size={12} color={colors.teal} />
              </TouchableOpacity>
            )}

            <View style={styles.benefits}>
              {BENEFITS.map((b) => (
                <View key={b} style={styles.benefitRow}>
                  <FontAwesome name="check" size={13} color={colors.teal} style={styles.check} />
                  <Text style={[styles.benefitText, { color: colors.ink }]}>{b}</Text>
                </View>
              ))}
            </View>

            {/* Only claims that survive checking. */}
            <Text style={[styles.trust, { color: colors.ink3 }]}>
              Cancel anytime · Secure checkout
            </Text>

            <PlanCard
              selected={plan === 'annual'}
              onPress={() => setPlan('annual')}
              name="Yearly"
              badge="MOST POPULAR"
              // 19.99/52 ≈ 0.38. The saving is against 12 × 3.99 = 47.88,
              // which is 58% — not a rounder number invented to look better.
              headline="$0.38"
              headlineUnit="/week"
              save="Save 58%"
              strike={`${monthlyPrice}/mo`}
              footnote={`Billed ${annualPrice}/year`}
              colors={colors}
            />
            <PlanCard
              selected={plan === 'monthly'}
              onPress={() => setPlan('monthly')}
              name="Monthly"
              headline={monthlyPrice}
              headlineUnit="/month"
              footnote="Cancel anytime"
              colors={colors}
            />

            <TouchableOpacity
              style={[styles.cta, { backgroundColor: colors.brand }, starting && { opacity: 0.6 }]}
              onPress={choose}
              disabled={starting}
              activeOpacity={0.85}
              accessibilityRole="button"
              // Web goes straight to Stripe now, so the label has to say so —
              // "Continue" implied another screen, which is exactly the step
              // that was removed.
              accessibilityLabel={Platform.OS === 'web' ? 'Subscribe to Pro' : 'Continue to checkout'}
            >
              {starting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>
                  {Platform.OS === 'web'
                    ? `Get Pro — ${plan === 'annual' ? annualPrice + '/year' : monthlyPrice + '/month'}`
                    : 'Continue'}
                </Text>
              )}
            </TouchableOpacity>

            {/* The limited-time Canvas offer — syllabus wall only, BELOW the
                Pro offer.

                Position is the whole argument. The course wall's version sits
                above the prices because there the free route is simply the
                better answer: Canvas classes do not count against the course
                cap, so charging someone to walk around a wall they can walk
                around for nothing would be the dishonest option. Syllabus is
                not that. AI scanning is a Pro capability and Canvas is not a
                substitute for it — a calendar feed carries dates, never the
                grading weights, policies and rubric a syllabus scan reads out
                of the document. Putting this above the prices would advertise
                a swap that is not on offer.

                So it reads as what it is: the alternative for someone who is
                not buying today, placed after they have seen and declined the
                thing being sold, and before "Not now" — which is the outcome
                it exists to convert. */}
            {canvasScanPromo && (
              <TouchableOpacity
                style={[styles.canvasPromo, { borderColor: colors.teal, backgroundColor: colors.teal50 }]}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Limited-time offer: try Canvas Sync free"
                onPress={() => {
                  // SAME event name and same existing fields, so every query
                  // written against canvas_offer_tapped keeps working across
                  // the change. `promo` and `source` are additive, and `source`
                  // is what survives into the connect flow — see the params
                  // below and lms-connect's funnel events.
                  track('canvas_offer_tapped', {
                    screen: 'upsell_sheet',
                    offer: canvasOffer,
                    free: true,
                    reason,
                    promo: true,
                    source: CANVAS_PROMO_SOURCE,
                  });
                  onClose();
                  router.push({
                    pathname: '/settings/lms',
                    params: { source: CANVAS_PROMO_SOURCE },
                  } as any);
                }}
              >
                <View style={[styles.canvasPromoPill, { backgroundColor: colors.teal }]}>
                  <Text style={[styles.canvasPromoPillText, { color: colors.card }]}>LIMITED-TIME OFFER</Text>
                </View>
                <View style={styles.canvasPromoRow}>
                  <FontAwesome name="university" size={15} color={colors.teal} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.canvasPromoTitle, { color: colors.ink }]}>
                      School uses Canvas? Try Canvas Sync free
                    </Text>
                    {/* Deliberately "the deadlines already on your Canvas
                        calendar" and not "your classes". Every connection in
                        production is a calendar feed, which carries dated work
                        and nothing else — a class with no dated items in the
                        feed cannot appear, and grades, submissions,
                        announcements and course materials never sync at all.
                        Promising the class and delivering its deadlines is the
                        version of this that generates refunds. */}
                    <Text style={[styles.canvasPromoText, { color: colors.ink2 }]}>
                      Import the deadlines already on your Canvas calendar, and Semora keeps them
                      updated when your instructor moves them.
                    </Text>
                    {/* Said BEFORE the tap, not discovered after it. Connecting
                        means fetching a link out of Canvas in a browser, which
                        is a real errand to hand someone on a phone. */}
                    <Text style={[styles.canvasPromoNote, { color: colors.ink3 }]}>
                      Takes a minute: you’ll copy your Canvas calendar link.
                    </Text>
                  </View>
                  <FontAwesome name="chevron-right" size={12} color={colors.teal} />
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.notNow} onPress={dismiss} accessibilityRole="button">
              <Text style={[styles.notNowText, { color: colors.ink3 }]}>Not now</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PlanCard({
  selected, onPress, name, badge, headline, headlineUnit, save, strike, footnote, colors,
}: {
  selected: boolean; onPress: () => void; name: string; badge?: string;
  headline: string; headlineUnit: string; save?: string; strike?: string;
  footnote: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.plan,
        { borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brand50 : 'transparent' },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${headline}${headlineUnit}, ${footnote}`}
    >
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.brand }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      {/* The save pill and the struck price live on the LEFT, beside the plan
          name, not stacked into the price column. Crowding all four onto one
          right-aligned row overflowed a 393pt phone: "/week" vanished and the
          "Billed $19.99/year" footnote clipped to "Billed $19.9". */}
      <View style={styles.planRow}>
        <View style={[styles.radio, { borderColor: selected ? colors.brand : colors.ink3 }]}>
          {selected ? <View style={[styles.radioDot, { backgroundColor: colors.brand }]} /> : null}
        </View>
        <View style={styles.planLeft}>
          <Text style={[styles.planName, { color: colors.ink }]}>{name}</Text>
          {save || strike ? (
            <View style={styles.saveRow}>
              {save ? (
                <View style={[styles.savePill, { backgroundColor: colors.teal }]}>
                  <Text style={styles.saveText}>{save}</Text>
                </View>
              ) : null}
              {strike ? <Text style={[styles.strike, { color: colors.ink3 }]}>{strike}</Text> : null}
            </View>
          ) : null}
        </View>
        <View style={styles.planRight}>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.ink }]}>{headline}</Text>
            <Text style={[styles.priceUnit, { color: colors.ink2 }]}>{headlineUnit}</Text>
          </View>
          <Text style={[styles.planFootnote, { color: colors.ink2 }]} numberOfLines={1}>{footnote}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,6,10,0.72)' },
  sheet: {
    width: '100%', maxWidth: 440, maxHeight: '88%',
    borderRadius: 24, borderWidth: 0.5, padding: 22,
  },
  close: { position: 'absolute', right: 0, top: 0, padding: 6, zIndex: 2 },
  title: { fontFamily: FONTS.displaySemibold, fontSize: 24, textAlign: 'center', marginTop: 6, letterSpacing: -0.3, paddingHorizontal: 30 },
  subtitle: { fontSize: 14.5, lineHeight: 20.5, textAlign: 'center', marginTop: 8 },
  canvasEscape: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderWidth: 1, borderRadius: 13,
    paddingHorizontal: 13, paddingVertical: 11, marginTop: 16,
  },
  canvasEscapeTitle: { fontSize: 13.5, fontWeight: '800' },
  canvasEscapeText: { fontSize: 12, lineHeight: 17, marginTop: 2 },

  // Secondary by construction, not by hoping. The Pro CTA above is a filled
  // brand-coloured button; this is an outlined card in the accent colour, one
  // step down in weight at every level — border not fill, 13.5pt title against
  // the CTA's centred bold label. Same visual family as canvasEscape so the two
  // Canvas offers read as one feature, deliberately not as two experiments.
  canvasPromo: {
    borderWidth: 1, borderRadius: 13,
    paddingHorizontal: 13, paddingVertical: 12, marginTop: 14,
  },
  canvasPromoRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  // alignSelf keeps the pill to its own content width; a full-bleed bar would
  // out-weigh the Pro badge on the annual plan card.
  canvasPromoPill: {
    alignSelf: 'flex-start', borderRadius: 5,
    paddingHorizontal: 7, paddingVertical: 3, marginBottom: 9,
  },
  // NO hardcoded colour here. `colors.teal` is a dark green in light mode and a
  // bright mint (#34D399) in dark, so white would be crisp in one theme and
  // barely legible in the other — the same trap that made an earlier promo
  // card's text invisible. `colors.card` is the palette's own opposite of an
  // accent fill and stays high-contrast in both directions; it is applied
  // inline because a StyleSheet cannot read the active palette.
  canvasPromoPillText: { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.6 },
  canvasPromoTitle: { fontSize: 13.5, fontWeight: '800' },
  canvasPromoText: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  canvasPromoNote: { fontSize: 11, lineHeight: 15, marginTop: 5 },
  benefits: { marginTop: 20, gap: 11 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  check: { marginTop: 2.5 },
  benefitText: { flex: 1, fontSize: 14.5, lineHeight: 20 },
  trust: { fontSize: 12.5, textAlign: 'center', marginTop: 16 },
  plan: { borderWidth: 1.5, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 14, marginTop: 12 },
  badge: {
    position: 'absolute', top: -9, alignSelf: 'center', left: 0, right: 0,
    marginHorizontal: 'auto', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 9, width: 118,
  },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6, textAlign: 'center' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planLeft: { flex: 1, minWidth: 0, gap: 5 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  planRight: { alignItems: 'flex-end', flexShrink: 0 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 4.5 },
  planName: { fontSize: 15.5, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  savePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 },
  saveText: { color: '#08281C', fontSize: 10, fontWeight: '800' },
  strike: { fontSize: 12.5, textDecorationLine: 'line-through' },
  price: { fontSize: 20, fontWeight: '800' },
  priceUnit: { fontSize: 12.5 },
  planFootnote: { fontSize: 11.5, marginTop: 3 },
  cta: { borderRadius: 15, paddingVertical: 16, alignItems: 'center', marginTop: 18 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  notNow: { alignItems: 'center', paddingVertical: 13 },
  notNowText: { fontSize: 14.5, fontWeight: '600' },
});
