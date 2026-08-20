import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text, TextInput } from '@/components/LocalizedReactNative';
import {
  Fragment,
  useEffect,
  useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { COLORS, FONTS, TASK_TYPE_LABELS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import * as Notifications from 'expo-notifications';
import { scheduleTaskReminders, primeNotificationPermission } from '@/lib/notifications';
import { isSyncEnabled, syncTaskToCalendar } from '@/lib/calendarSync';
import { useAppStore } from '@/store/appStore';
import { useSession } from '@/app/_layout';
import { track } from '@/lib/analytics';
import type { ExtractedItem } from '@/lib/ai-extraction';

interface ReviewItem extends ExtractedItem {
  accepted: boolean;
  editing: boolean;
  // Set once at parse time when the server returned due_date: null ("Final
  // Exam — date TBA"). Immutable section marker: grouping by the CURRENT
  // due_date would make the card jump between sections on every keystroke
  // of the date field.
  needsDate: boolean;
}

// The date TextInput updates due_date on every keystroke, so this renders
// against partial strings like "2026-1". date-fns format() THROWS on an
// Invalid Date — crashing the screen mid-edit. Render the raw string until
// it parses.
function formatDateSafe(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt.getTime()) ? d : format(dt, 'MMM d, yyyy');
}

// Shared by save validation, the accept gate, and select-all. Round-trip
// check catches impossible calendar dates (2026-02-30 parses but rolls to
// Mar 2). null — the server found no date — fails by design: tasks.due_date
// is NOT NULL in the DB, so a dateless item can never reach the insert.
function isRealDate(s: string | null): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export default function SyllabusReviewScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ parseRunId?: string; courseId?: string; courseName?: string; semesterName?: string; items?: string }>();

  const [items, setItems] = useState<ReviewItem[]>(() => {
    try {
      const parsed: ExtractedItem[] = JSON.parse(params.items || '[]');
      return parsed.map((item) => ({
        ...item,
        // Dateless items ("Final Exam — date TBA") start deselected: they
        // can't be saved (tasks.due_date is NOT NULL) until the user sets a
        // date via the edit UI.
        accepted: item.due_date != null,
        editing: false,
        needsDate: item.due_date == null,
      }));
    } catch {
      return [];
    }
  });
  // "Old syllabus" banner: when MOST dated items are already in the past,
  // the document is probably last year's recycled PDF. Computed once from
  // the initial extraction (not live — the user fixing dates shouldn't
  // resurrect it) and dismissible; >=2 dated items so a single stray
  // past date doesn't cry wolf.
  const [showPastTermBanner, setShowPastTermBanner] = useState<boolean>(() => {
    const todayIso = format(new Date(), 'yyyy-MM-dd');
    const dated = items.filter((i) => isRealDate(i.due_date));
    const past = dated.filter((i) => (i.due_date as string) < todayIso);
    return dated.length >= 2 && past.length * 2 > dated.length;
  });
  const [saving, setSaving] = useState(false);
  const colors = useColors();
  const { contentMaxWidth, isWide, width } = useResponsive();
  const insets = useSafeAreaInsets();
  const narrow = width < 360;
  const isPro = useAppStore((s) => s.isPro);
  const ahaPaywallShown = useAppStore((s) => s.ahaPaywallShown);
  const { session } = useSession();
  const setAhaPaywallShown = useAppStore((s) => s.setAhaPaywallShown);
  const setHasImportedSyllabus = useAppStore((s) => s.setHasImportedSyllabus);

  const acceptedCount = items.filter((i) => i.accepted).length;

  // Extraction-quality telemetry, once per review session. Fire-and-forget.
  useEffect(() => {
    const dateless = items.filter((i) => i.needsDate).length;
    const suspect = items.filter((i) => i.date_suspect).length;
    // The stage between a successful parse and saving. Without it the funnel
    // could not distinguish "the AI failed" from "the student saw the result
    // and walked away" — two very different problems.
    track('scan_review_opened', { screen: 'review', items: items.length, dateless, suspect });
    if (showPastTermBanner) track('scan_past_term_banner_shown', { screen: 'review' });
    if (dateless > 0) track('scan_dateless_items', { screen: 'review', count: dateless });
    if (suspect > 0) track('scan_suspect_dates', { screen: 'review', count: suspect });
    // Mount-only: these describe the initial extraction, not later edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleAccept = (index: number) => {
    const item = items[index];
    // Gate: a dateless item can't join the save set until it has a real
    // date — tasks.due_date is NOT NULL, so letting it through would only
    // fail with a more confusing message at save time. Pop the editor open
    // so the fix is one tap away.
    if (!item.accepted && !isRealDate(item.due_date)) {
      Alert.alert(
        'Needs a date',
        `"${item.title}" doesn't have a due date yet. Set one to include it, or leave it deselected.`,
      );
      setItems((prev) => prev.map((it, i) => (i === index ? { ...it, editing: true } : it)));
      return;
    }
    setItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, accepted: !item.accepted } : item
    ));
    if (Platform.OS === 'ios') Haptics.selectionAsync();
  };

  const toggleEdit = (index: number) => {
    setItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, editing: !item.editing } : item
    ));
  };

  const updateItem = (index: number, field: keyof ExtractedItem, value: any) => {
    setItems((prev) => prev.map((item, i) =>
      i === index
        // Editing the date counts as verifying it — clear the server's
        // "outside this term" flag instead of warning about a value the
        // user has already looked at.
        ? { ...item, [field]: value, ...(field === 'due_date' ? { date_suspect: false } : {}) }
        : item
    ));
  };

  const handleSave = async () => {
    if (saving) return;
    const accepted = items.filter((i) => i.accepted);
    if (accepted.length === 0) {
      Alert.alert('No Items', 'Please accept at least one item to save.');
      return;
    }

    // Inline-edited dates are free text — catch malformed ones up front
    // instead of silently dropping rows mid-save. isRealDate (module scope)
    // also rejects null, so a dateless item that somehow got accepted can
    // never reach the NOT NULL due_date column.
    const badDates = accepted.filter((i) => !isRealDate(i.due_date));
    if (badDates.length > 0) {
      const names = badDates.slice(0, 3).map((b) => `"${b.title}"`).join(', ');
      Alert.alert(
        'Check dates',
        `${names}${badDates.length > 3 ? ` and ${badDates.length - 3} more` : ''} ${badDates.length === 1 ? 'has' : 'have'} a missing or invalid date. Use YYYY-MM-DD.`,
      );
      return;
    }

    // A cleared title would otherwise save a blank-named task that's
    // impossible to identify in the list. Block it up front.
    const blankTitles = accepted.filter((i) => !i.title.trim());
    if (blankTitles.length > 0) {
      Alert.alert(
        'Add titles',
        `${blankTitles.length === 1 ? 'One item has' : `${blankTitles.length} items have`} no title. Give each accepted item a title before saving.`,
      );
      return;
    }

    // Disable the button BEFORE any await — the primer below suspends this
    // function while the button would otherwise still be tappable, and a
    // second tap would run the whole insert loop twice (duplicate tasks).
    setSaving(true);
    Keyboard.dismiss();

    // Primed permission ask at the moment of maximum motivation — the user
    // is saving N concrete deadlines. Only when the OS prompt has never
    // been shown ('undetermined'); granted users sail through and denied
    // users are handled by the Today-screen recovery banner. Asked BEFORE
    // the save so reminder scheduling below runs with permission settled.
    // Same soft ask as before, now via the shared helper so the identical
    // moment can be raised from anywhere a student first shows intent —
    // adding a course by hand included (app/course/new.tsx).
    await primeNotificationPermission({
      title: 'Never miss these deadlines',
      message: `Want a heads-up before each of the ${accepted.length} deadline${accepted.length !== 1 ? 's' : ''} you're importing?`,
      confirm: 'Remind me',
      decline: 'Not now',
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Build every accepted row up front and insert in ONE call. The old
      // per-row loop did `console.warn; continue` on failure — silently
      // dropping a student's specific deadlines and then navigating away with
      // no way to recover them. An all-or-nothing batch insert means we either
      // save every selected deadline or none, and on failure we keep the user
      // on this screen (selections intact) to retry.
      const rows = accepted.map((item) => ({
        user_id: session.user.id,
        course_id: params.courseId,
        title: item.title.trim(),
        description: item.description,
        type: item.type,
        due_date: item.due_date,
        // Validate due_time format before saving (HH:MM in 00:00–23:59 only).
        due_time: item.due_time && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.due_time)
          ? `${item.due_time}:00`
          : null,
        weight: item.weight,
        source: 'gemini_parsed',
        parse_run_id: params.parseRunId,
      }));

      const { data: tasks, error } = await supabase
        .from('tasks')
        .insert(rows)
        .select();

      if (error || !tasks) {
        // Do NOT navigate away or touch parse_runs/paywall — leave the screen
        // exactly as it was so the user can retry with their selections intact.
        if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          "Couldn't save",
          'Your deadlines weren’t saved. Check your connection and try again — your selections are still here.',
          [{ text: 'OK' }],
        );
        return;
      }

      // The batch committed: every accepted row is now a real task.
      const savedCount = tasks.length;
      track('tasks_saved', { screen: 'review', count: savedCount });

      // Schedule notifications + mirror to the device calendar AFTER the
      // commit. Awaited (not fire-and-forget) so a 14-task import doesn't
      // fire 14 concurrent schedulers that each prune the iOS
      // 64-notification cap against a stale snapshot.
      for (const task of tasks) {
        await scheduleTaskReminders(
          task.id, task.title, params.courseName || 'Course', task.due_date, task.due_time, session.user.id,
        ).catch(() => {});
        // Bulk import is the app's main task-creation path — it must
        // sync like every other create, or "calendar sync" silently
        // misses the very tasks the scan funnel produces.
        if (isSyncEnabled()) {
          await syncTaskToCalendar(task as any, params.courseName || 'Course').catch(() => {});
        }
      }

      // Update parse run with accept/reject counts
      if (params.parseRunId) {
        await supabase
          .from('parse_runs')
          .update({
            items_accepted: savedCount,
            items_rejected: items.length - accepted.length,
          })
          .eq('id', params.parseRunId);
      }

      // Invalidate ALL queries so everything refreshes immediately
      await qc.invalidateQueries();

      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // A FULLY successful save is the bar for both of the things below. On a
      // partial failure the user must see the "Saved! (N failed)" alert rather
      // than a paywall that hides it, and neither one-time flag should burn on
      // a save that half-worked — both fire on the next complete save instead.
      const fullySaved = savedCount > 0 && savedCount === accepted.length;

      // Record the import itself before branching on tier. This is the signal
      // the review prompt's primary trigger reads, and it must be set for Pro
      // users too — they never enter the paywall branch below, so keying the
      // prompt off that branch's flag meant they could never qualify for it.
      if (fullySaved) setHasImportedSyllabus(true);

      // Reverse trial: at the peak of value (deadlines just imported), offer
      // Pro once, framed as momentum rather than a block. Only for free users
      // who haven't seen this prompt yet; `replace` so Back doesn't return here.
      if (!isPro && !ahaPaywallShown && fullySaved) {
        setAhaPaywallShown(true);
        router.replace({
          pathname: '/paywall',
          params: { context: 'postScan', count: String(savedCount), courseId: params.courseId },
        } as any);
        return;
      }

      // A clean import ends on the next-class prompt, not on an exit. The
      // median account has one course, which is the shape of a to-do list
      // rather than a semester — see app/syllabus/added.tsx for why this is
      // the moment that decides which one this account becomes.
      if (fullySaved) {
        router.replace({
          pathname: '/syllabus/added',
          params: {
            courseId: params.courseId,
            courseName: params.courseName,
            count: String(savedCount),
          },
        } as any);
        return;
      }

      // Partial save keeps the explicit alert: the failure count is the most
      // important thing on screen and must not be buried under a prompt.
      Alert.alert(
        'Saved!',
        `${savedCount} task${savedCount !== 1 ? 's' : ''} added to your course.${savedCount < accepted.length ? ` (${accepted.length - savedCount} failed)` : ''}`,
        [{ text: 'View Course', onPress: () => router.replace(`/course/${params.courseId}` as any) },
         { text: 'Go Home', onPress: () => router.replace('/(tabs)' as any) }],
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save tasks.');
    } finally {
      setSaving(false);
    }
  };

  // Dateless items render in their own "Needs a date" section, keyed by the
  // ORIGINAL index so toggles/edits hit the right row in `items`. needsDate
  // is frozen at parse time, so a card doesn't jump sections while the user
  // types a date into it.
  const indexed = items.map((item, index) => ({ item, index }));
  const datedEntries = indexed.filter((e) => !e.item.needsDate);
  const datelessEntries = indexed.filter((e) => e.item.needsDate);
  // Select-all only covers items that can actually be saved (real date) —
  // it must never sweep a dateless item into the save set.
  const selectableItems = items.filter((i) => isRealDate(i.due_date));
  const allSelected = selectableItems.length > 0 && selectableItems.every((i) => i.accepted);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} keyboardShouldPersistTaps="always">
        {/* Old-syllabus warning — most extracted dates are already in the
            past, which almost always means a recycled prior-term PDF. */}
        {showPastTermBanner && (
          <View style={[styles.pastTermBanner, { backgroundColor: colors.coral50, borderColor: colors.coral }]}>
            <FontAwesome name="exclamation-triangle" size={16} color={colors.coral} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.pastTermTitle, { color: colors.coral }]}>These dates look like a previous term</Text>
              <Text style={[styles.pastTermText, { color: colors.ink2 }]}>
                Most of these deadlines are already in the past — this may be an old syllabus. Double-check the dates before saving.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowPastTermBanner(false)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Dismiss previous-term warning"
            >
              <FontAwesome name="times" size={14} color={colors.ink3} />
            </TouchableOpacity>
          </View>
        )}

        {/* Header */}
        {/* Course info banner */}
        {params.courseName && (
          <View style={[styles.courseBanner, { backgroundColor: colors.brand50 }]}>
            <FontAwesome name="book" size={14} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.courseBannerName, { color: colors.brand }]}>{params.courseName}</Text>
              {params.semesterName && <Text style={[styles.courseBannerSem, { color: colors.ink3 }]}>{params.semesterName}</Text>}
            </View>
            <View style={[styles.autoCreatedBadge, { backgroundColor: colors.teal50 }]}><Text style={[styles.autoCreatedText, { color: colors.teal }]}>AUTO</Text></View>
          </View>
        )}

        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: colors.ink }]}>{items.length} items found</Text>
            <Text style={[styles.subtitle, { color: colors.ink3 }]}>{acceptedCount} selected to save</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              // Every item is dateless: "Select all" has nothing it can
              // legally select (tasks.due_date is NOT NULL). Give the same
              // guidance the per-item tap gives instead of a dead tap.
              if (selectableItems.length === 0) {
                Alert.alert(
                  'Needs a date',
                  "These items don't have due dates yet. Tap the pencil to set a date on each one you want to save, or leave them deselected.",
                );
                return;
              }
              setItems((prev) => prev.map((i) => (isRealDate(i.due_date) ? { ...i, accepted: !allSelected } : i)));
            }}
          >
            <Text style={[styles.toggleAllText, { color: colors.brand }]}>
              {allSelected ? 'Deselect all' : 'Select all'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Items — dated first, then a "Needs a date" parking lot for items
            the parser returned without a due date. One combined map so the
            card JSX isn't duplicated per section; entries carry their
            ORIGINAL index so edits/toggles hit the right row in `items`. */}
        {[...datedEntries, ...datelessEntries].map(({ item, index }, pos) => (
          <Fragment key={index}>
          {datelessEntries.length > 0 && pos === datedEntries.length && (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>Needs a date</Text>
              <Text style={[styles.sectionSub, { color: colors.ink3 }]}>
                Found in the syllabus without a due date (e.g. "TBA"). Tap the pencil to set one — an item can't be saved without a date.
              </Text>
            </View>
          )}
          <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.line }, !item.accepted && styles.itemRejected]}>
            <View style={styles.itemTop}>
              {/* Accept toggle */}
              <TouchableOpacity
                onPress={() => toggleAccept(index)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ checked: item.accepted }}
                accessibilityLabel={item.accepted ? `Deselect ${item.title}` : `Select ${item.title}`}
              >
                <View style={[styles.cbx, { borderColor: colors.ink3 }, item.accepted && { backgroundColor: colors.teal, borderColor: colors.teal }]}>
                  {item.accepted && <FontAwesome name="check" size={10} color="#fff" />}
                </View>
              </TouchableOpacity>

              <View style={{ flex: 1 }}>
                {item.editing ? (
                  <TextInput
                    style={[styles.editInput, { color: colors.ink, borderBottomColor: colors.brand }]}
                    value={item.title}
                    onChangeText={(t) => updateItem(index, 'title', t)}
                  />
                ) : (
                  <Text style={[styles.itemTitle, { color: colors.ink }, !item.accepted && { textDecorationLine: 'line-through', color: colors.ink3 }]}>
                    {item.title}
                  </Text>
                )}

                <View style={styles.itemMeta}>
                  <View style={[styles.typeBadge, { backgroundColor: colors.brand50 }]}>
                    <Text style={[styles.typeText, { color: colors.brand }]}>{TASK_TYPE_LABELS[item.type] || item.type}</Text>
                  </View>
                  <Text style={[styles.itemDate, { color: item.due_date ? colors.ink2 : colors.amber }]}>
                    {item.due_date ? formatDateSafe(item.due_date) : 'No date yet'}
                  </Text>
                  {item.due_time && <Text style={[styles.itemTime, { color: colors.ink3 }]}>{item.due_time}</Text>}
                  {item.weight != null && <Text style={[styles.itemWeight, { color: colors.ink3 }]}>{item.weight}%</Text>}
                </View>

                {/* Confidence indicator */}
                {item.confidence < 0.8 && (
                  <View style={[styles.lowConfidence, { backgroundColor: colors.amber50 }]}>
                    <FontAwesome name="exclamation-triangle" size={10} color={colors.amber} />
                    <Text style={[styles.lowConfidenceText, { color: colors.amber }]}>Low confidence — please verify</Text>
                  </View>
                )}

                {/* Server-side plausibility flag: the date parses but falls
                    outside the expected window for this term (often a
                    recycled prior-year PDF). Cleared when the user edits
                    the date — see updateItem. */}
                {item.date_suspect && (
                  <View style={[styles.lowConfidence, { backgroundColor: colors.coral50 }]}>
                    <FontAwesome name="calendar-times-o" size={10} color={colors.coral} />
                    <Text style={[styles.lowConfidenceText, { color: colors.coral }]}>Date looks outside this term — double-check</Text>
                  </View>
                )}
              </View>

              {/* Edit toggle */}
              <TouchableOpacity
                onPress={() => toggleEdit(index)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={item.editing ? `Done editing ${item.title}` : `Edit ${item.title}`}
              >
                <FontAwesome name={item.editing ? 'check-circle' : 'pencil'} size={16} color={item.editing ? colors.teal : colors.ink3} />
              </TouchableOpacity>
            </View>

            {/* Edit fields */}
            {item.editing && (
              <View style={styles.editFields}>
                {/* Type selector */}
                <Text style={[styles.editFieldLabel, { color: colors.ink3 }]}>Type</Text>
                {/* Wrap chips instead of an iPhone-style horizontal scroll —
                    wraps on a narrow split view and fills the row on iPad. */}
                <View style={styles.typeChipRow}>
                  {(['assignment', 'quiz', 'exam', 'project', 'reading', 'other'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeChip, item.type === t && { backgroundColor: colors.brand }]}
                      onPress={() => updateItem(index, 'type', t)}
                    >
                      <Text style={[styles.typeChipText, { color: colors.ink2 }, item.type === t && styles.typeChipTextActive]}>
                        {TASK_TYPE_LABELS[t]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={[styles.editRow, narrow && styles.editRowColumn]}>
                  <Text style={[styles.editLabel, narrow ? styles.editLabelColumn : isWide && styles.editLabelWide, { color: colors.ink3 }]}>Date:</Text>
                  <TextInput
                    style={[styles.editSmallInput, { borderColor: colors.line, color: colors.ink }]}
                    value={item.due_date ?? ''}
                    // Empty string normalizes back to null so "cleared the
                    // field" and "never had a date" stay the same state.
                    onChangeText={(t) => updateItem(index, 'due_date', t || null)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.ink3}
                  />
                </View>
                <View style={[styles.editRow, narrow && styles.editRowColumn]}>
                  <Text style={[styles.editLabel, narrow ? styles.editLabelColumn : isWide && styles.editLabelWide, { color: colors.ink3 }]}>Time:</Text>
                  <TextInput
                    style={[styles.editSmallInput, { borderColor: colors.line, color: colors.ink }]}
                    value={item.due_time || ''}
                    onChangeText={(t) => updateItem(index, 'due_time', t || null)}
                    placeholder="HH:MM"
                    placeholderTextColor={colors.ink3}
                  />
                </View>
                <View style={[styles.editRow, narrow && styles.editRowColumn]}>
                  <Text style={[styles.editLabel, narrow ? styles.editLabelColumn : isWide && styles.editLabelWide, { color: colors.ink3 }]}>Weight:</Text>
                  <TextInput
                    style={[styles.editSmallInput, { borderColor: colors.line, color: colors.ink }]}
                    value={item.weight != null ? String(item.weight) : ''}
                    onChangeText={(t) => { const n = parseFloat(t); updateItem(index, 'weight', t && !isNaN(n) ? n : null); }}
                    placeholder="%"
                    placeholderTextColor={colors.ink3}
                    keyboardType="decimal-pad"
                  />
                </View>

                {/* Description */}
                <Text style={[styles.editFieldLabel, { color: colors.ink3 }]}>Description</Text>
                <TextInput
                  style={[styles.editDescInput, { borderColor: colors.line, color: colors.ink, backgroundColor: colors.card }]}
                  value={item.description || ''}
                  onChangeText={(t) => updateItem(index, 'description', t || null)}
                  placeholder="Add notes..."
                  placeholderTextColor={colors.ink3}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>
            )}

            {item.description && !item.editing && (
              <Text style={[styles.itemDesc, { color: colors.ink3 }]}>{item.description}</Text>
            )}
          </View>
          </Fragment>
        ))}

        {items.length === 0 && (
          <View style={styles.emptyCard}>
            <FontAwesome name="search" size={24} color={colors.ink3} />
            <Text style={[styles.emptyText, { color: colors.ink }]}>No deadlines found in this document</Text>
            <Text style={[styles.emptySub, { color: colors.ink3 }]}>Try uploading a different syllabus</Text>
          </View>
        )}
      </ScrollView>

      {/* Save button */}
      {items.length > 0 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 18, backgroundColor: colors.paper, borderTopColor: colors.line }]}>
          {/* Every extracted item is dateless — the save button below is
              permanently disabled at "Save 0 tasks" until a date exists,
              so say why instead of leaving a mystery dead button. */}
          {selectableItems.length === 0 && (
            <Text style={[styles.footerHint, { color: colors.ink3 }]}>
              Add dates to include these tasks
            </Text>
          )}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.brand }, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || acceptedCount === 0}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <FontAwesome name="check" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Save {acceptedCount} tasks</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 18, paddingBottom: 100, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  courseBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.brand50, padding: 12, borderRadius: 12, marginBottom: 16 },
  courseBannerName: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
  courseBannerSem: { fontSize: 11, color: COLORS.ink3, marginTop: 1 },
  autoCreatedBadge: { backgroundColor: COLORS.teal50, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  autoCreatedText: { fontSize: 9, fontWeight: '700', color: COLORS.teal },
  // Old-syllabus warning banner
  pastTermBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  pastTermTitle: { fontSize: 14, fontWeight: '700' },
  pastTermText: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  // "Needs a date" section
  sectionHeader: { marginTop: 18, marginBottom: 10 },
  sectionTitle: { fontFamily: FONTS.displaySemibold, fontSize: 17, color: COLORS.ink },
  sectionSub: { fontSize: 12, lineHeight: 17, color: COLORS.ink3, marginTop: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  title: { fontFamily: FONTS.displaySemibold, fontSize: 23, color: COLORS.ink },
  subtitle: { fontSize: 13, color: COLORS.ink3, marginTop: 2 },
  toggleAllText: { fontSize: 13, fontWeight: '600', color: COLORS.brand },
  // Item card
  itemCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.line },
  itemRejected: { opacity: 0.5 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cbx: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: COLORS.ink3, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  cbxActive: { backgroundColor: COLORS.teal, borderColor: COLORS.teal },
  itemTitle: { fontSize: 15, fontWeight: '500', color: COLORS.ink },
  itemTitleRejected: { textDecorationLine: 'line-through', color: COLORS.ink3 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  typeBadge: { backgroundColor: COLORS.brand50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeText: { fontSize: 10, fontWeight: '600', color: COLORS.brand },
  itemDate: { fontSize: 12, color: COLORS.ink2 },
  itemTime: { fontSize: 12, color: COLORS.ink3 },
  itemWeight: { fontSize: 12, color: COLORS.ink3, fontWeight: '600' },
  itemDesc: { fontSize: 12, color: COLORS.ink3, marginTop: 8, marginLeft: 34 },
  lowConfidence: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, backgroundColor: COLORS.amber50, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start' },
  lowConfidenceText: { fontSize: 10, color: COLORS.amber, fontWeight: '500' },
  // Edit
  editInput: { fontSize: 15, fontWeight: '500', color: COLORS.ink, borderBottomWidth: 1, borderBottomColor: COLORS.brand, paddingBottom: 2 },
  editFields: { marginTop: 10, marginLeft: 34, gap: 6 },
  editFieldLabel: { fontSize: 11, fontWeight: '600', color: COLORS.ink3, marginTop: 4, marginBottom: 4 },
  typeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#f1f5f9' },
  typeChipActive: { backgroundColor: COLORS.brand },
  typeChipText: { fontSize: 11, fontWeight: '600', color: COLORS.ink2 },
  typeChipTextActive: { color: '#fff' },
  editDescInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: COLORS.ink, minHeight: 48, backgroundColor: '#fafafa' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editRowColumn: { flexDirection: 'column', alignItems: 'stretch', gap: 4 },
  editLabel: { fontSize: 12, color: COLORS.ink3, minWidth: 45, maxWidth: 50 },
  editLabelWide: { maxWidth: 60 },
  editLabelColumn: { maxWidth: undefined },
  editSmallInput: { flex: 1, height: 32, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, paddingHorizontal: 8, fontSize: 13, color: COLORS.ink },
  // Empty
  emptyCard: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '500', color: COLORS.ink },
  emptySub: { fontSize: 13, color: COLORS.ink3 },
  // Footer
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 18, paddingBottom: 34, backgroundColor: COLORS.paper, borderTopWidth: 0.5, borderTopColor: COLORS.line },
  footerHint: { fontSize: 12, color: COLORS.ink3, textAlign: 'center', marginBottom: 8 },
  saveBtn: { height: 52, backgroundColor: COLORS.brand, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
