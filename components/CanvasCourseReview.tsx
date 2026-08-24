import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Alert, Text, TextInput, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DatePicker } from '@/components/DatePicker';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { formatLocalDate } from '@/lib/dates';
import { useCreateSemester } from '@/lib/queries';
import { courseFactsOf, type DiscoveredLmsCourse } from '@/lib/lms';
import {
  conflictsWith,
  coursesOutside,
  formatSpan,
  itemCountOf,
  matchSemester,
  spanOf,
  suggestNewSemester,
} from '@/lib/termMatch';
import type { Semester } from '@/types/database';

/**
 * "Here is what Canvas has, and here is where it goes."
 *
 * ONE component, deliberately, for two moments that are the same question:
 *   - connecting Canvas for the first time (app/settings/lms-connect.tsx)
 *   - a later sync finding courses for a new term (app/settings/lms/new-courses.tsx)
 *
 * A new term arriving in January is not a different problem from a first
 * import in August; it is the identical decision asked later. Giving it a
 * second implementation would guarantee the two eventually disagree about what
 * "Fall 2026" means, and the whole point of lib/termMatch.ts is that they
 * cannot.
 *
 * The design is propose → prove → block:
 *   PROPOSE  pre-select the semester the coursework matches, never the one the
 *            app happened to have selected. That default is what filed a real
 *            student's Fall term into their Summer semester.
 *   PROVE    show the date range the decision rests on, next to the choice, so
 *            it is checkable at a glance rather than taken on faith.
 *   BLOCK    a semester that cannot contain this work requires a confirmation.
 *            Not a passive warning — the wrong answer needs friction.
 *
 * When nothing matches, the semester is created HERE. The old flow pushed to
 * /semester/new, which unmounted the connect screen and destroyed the
 * credential, the discovered courses and the selection, so the student came
 * back to an empty form and had to paste their feed again.
 */
export function CanvasCourseReview({
  courses,
  semesters,
  selected,
  onToggle,
  onSelectAll,
  semesterId,
  onSemesterChange,
  onSemesterCreated,
  footer,
}: {
  courses: DiscoveredLmsCourse[];
  semesters: Semester[];
  selected: Set<string>;
  onToggle: (courseId: string) => void;
  onSelectAll: (ids: string[]) => void;
  semesterId: string;
  onSemesterChange: (id: string) => void;
  /** Called after an inline create so the caller can refetch its semester list. */
  onSemesterCreated?: (semester: Semester) => void;
  footer: React.ReactNode;
}) {
  const colors = useColors();
  const { t, locale } = useI18n();
  const createSemester = useCreateSemester();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState<Date | null>(null);
  const [newEnd, setNewEnd] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);

  const facts = useMemo(() => courses.map(courseFactsOf), [courses]);
  const span = useMemo(() => spanOf(facts), [facts]);
  const totalItems = useMemo(() => itemCountOf(facts), [facts]);
  const match = useMemo(() => matchSemester(facts, semesters), [facts, semesters]);
  const suggestion = useMemo(() => suggestNewSemester(facts), [facts]);

  const chosen = semesters.find((semester) => semester.id === semesterId) ?? null;
  const outside = useMemo(
    () => (chosen ? coursesOutside(facts, chosen) : new Set<string>()),
    [facts, chosen],
  );

  const rangeLabel = formatSpan(span, locale === 'es' ? 'es' : 'en');
  const summary = [
    `${courses.length} ${courses.length === 1 ? t('course') : t('courses')}`,
    totalItems !== null
      ? `${totalItems} ${totalItems === 1 ? t('deadline') : t('deadlines')}`
      : null,
    rangeLabel || null,
  ].filter(Boolean).join(' · ');

  const openCreate = () => {
    // Prefilled from the coursework itself, so the common case is a glance and
    // a tap rather than three fields to reason about.
    setNewName(suggestion?.name ?? '');
    setNewStart(suggestion ? new Date(`${suggestion.startDate}T12:00:00`) : null);
    setNewEnd(suggestion ? new Date(`${suggestion.endDate}T12:00:00`) : null);
    setCreating(true);
  };

  const saveSemester = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert(t('Name this semester'), t('Give the semester a name so you can find it later.'));
      return;
    }
    setSaving(true);
    try {
      const created = await createSemester.mutateAsync({
        name,
        start_date: newStart ? formatLocalDate(newStart) : null,
        end_date: newEnd ? formatLocalDate(newEnd) : null,
        is_active: false,
      } as any);
      setCreating(false);
      onSemesterChange(created.id);
      onSemesterCreated?.(created);
    } catch (error) {
      // The free plan allows one semester (010_free_semester_limit). Its own
      // message says what to do; the caller decides whether to route to the
      // paywall, because this component is used from two screens with
      // different ideas of what happens next.
      Alert.alert(
        t('Could not create semester'),
        error instanceof Error ? error.message : t('Please try again.'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* PROVE. Above everything, because someone about to import a semester
          of work should see what they are importing before they see any
          controls for it. */}
      <View style={[styles.summary, { backgroundColor: colors.brand50 }]}>
        <FontAwesome name="calendar-check-o" size={15} color={colors.brand} />
        <Text style={[styles.summaryText, { color: colors.ink }]}>{summary}</Text>
      </View>

      <Text style={[styles.label, { color: colors.ink2 }]}>{t('Semester')}</Text>
      <Text style={[styles.hint, { color: colors.ink3 }]}>
        {match.confidence === 'strong'
          ? t('Semora matched this to the semester below. Change it if that is wrong.')
          : semesters.length === 0
            ? t('There is nowhere to put these yet. Create the semester below.')
            : t('Nothing here clearly matches these dates. Pick a semester or create one.')}
      </Text>

      <View style={styles.chips}>
        {semesters.map((semester) => {
          const active = semesterId === semester.id;
          const suggested = match.semesterId === semester.id && match.confidence === 'strong';
          const clashes = conflictsWith(facts, semester);
          return (
            <TouchableOpacity
              key={semester.id}
              onPress={() => onSemesterChange(semester.id)}
              style={[
                styles.chip,
                {
                  borderColor: active ? colors.brand : colors.line,
                  backgroundColor: active ? colors.brand50 : colors.card,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? colors.brand : colors.ink2 }]}>
                {semester.name}
              </Text>
              {suggested && (
                <View style={[styles.badge, { backgroundColor: colors.brand }]}>
                  <Text style={styles.badgeText}>{t('Matches')}</Text>
                </View>
              )}
              {/* Marked on the chip, not only at the moment of saving. A
                  warning that appears after the decision is a scolding; one
                  that appears before it is information. */}
              {!suggested && clashes && (
                <FontAwesome name="exclamation-triangle" size={11} color={colors.ink3} />
              )}
            </TouchableOpacity>
          );
        })}

        {!creating && (
          <TouchableOpacity
            onPress={openCreate}
            style={[styles.chip, { borderColor: colors.brand, backgroundColor: colors.card }]}
          >
            <FontAwesome name="plus" size={11} color={colors.brand} />
            <Text style={[styles.chipText, { color: colors.brand }]}>
              {suggestion ? `${t('New')} · ${suggestion.name}` : t('New semester')}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {creating && (
        <View style={[styles.createCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.createTitle, { color: colors.ink }]}>{t('New semester')}</Text>
          <Text style={[styles.hint, { color: colors.ink3 }]}>
            {t('Prefilled from the dates in this Canvas coursework.')}
          </Text>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder={t('Semester name')}
            placeholderTextColor={colors.ink3}
            style={[styles.input, { color: colors.ink, backgroundColor: colors.paper, borderColor: colors.line }]}
          />
          <View style={styles.dateRow}>
            <View style={styles.dateCell}>
              <Text style={[styles.dateLabel, { color: colors.ink3 }]}>{t('Starts')}</Text>
              <DatePicker value={newStart} onChange={setNewStart} placeholder={t('Optional')} />
            </View>
            <View style={styles.dateCell}>
              <Text style={[styles.dateLabel, { color: colors.ink3 }]}>{t('Ends')}</Text>
              <DatePicker value={newEnd} onChange={setNewEnd} placeholder={t('Optional')} />
            </View>
          </View>
          <View style={styles.createActions}>
            <TouchableOpacity onPress={() => setCreating(false)} style={styles.createCancel}>
              <Text style={[styles.link, { color: colors.ink3 }]}>{t('Cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveSemester}
              disabled={saving}
              style={[styles.createSave, { backgroundColor: colors.brand }]}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.createSaveText}>{t('Create semester')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.selectHead}>
        <Text style={[styles.label, { color: colors.ink2, marginTop: 0 }]}>
          {t('Courses')} ({selected.size})
        </Text>
        <TouchableOpacity
          onPress={() => onSelectAll(selected.size === courses.length ? [] : courses.map((c) => c.id))}
        >
          <Text style={[styles.link, { color: colors.brand }]}>
            {selected.size === courses.length ? t('Clear') : t('Select all')}
          </Text>
        </TouchableOpacity>
      </View>

      {courses.map((course) => {
        const isSelected = selected.has(course.id);
        const isOutside = outside.has(course.id);
        const courseSpan = formatSpan(spanOf([courseFactsOf(course)]), locale === 'es' ? 'es' : 'en');
        const detail = [
          typeof course.item_count === 'number'
            ? `${course.item_count} ${course.item_count === 1 ? t('deadline') : t('deadlines')}`
            : null,
          courseSpan || null,
        ].filter(Boolean).join(' · ');
        return (
          <TouchableOpacity
            key={course.id}
            onPress={() => onToggle(course.id)}
            style={[
              styles.course,
              { backgroundColor: colors.card, borderColor: isSelected ? colors.brand : colors.line },
            ]}
          >
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: isSelected ? colors.brand : 'transparent',
                  borderColor: isSelected ? colors.brand : colors.line,
                },
              ]}
            >
              {isSelected && <FontAwesome name="check" size={11} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.courseName, { color: colors.ink }]}>{course.name}</Text>
              {!!detail && <Text style={[styles.courseMeta, { color: colors.ink3 }]}>{detail}</Text>}
              {/* Said plainly rather than by hiding the row. A course the
                  student knows belongs here can still be ticked; one that
                  does not is now visibly the odd one out. */}
              {isOutside && chosen && (
                <Text style={[styles.courseWarn, { color: colors.ink3 }]}>
                  {t('Runs outside')} {chosen.name}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      {footer}
    </>
  );
}

/**
 * BLOCK. Returns true when the caller may proceed.
 *
 * Lives beside the component rather than inside it because both callers do
 * something different afterwards, but the question — "does this semester
 * contradict this coursework?" — has to be asked identically in both.
 */
export function confirmSemesterConflict(
  courses: DiscoveredLmsCourse[],
  semester: Semester | null,
  span: string,
  onConfirm: () => void,
): boolean {
  if (!semester || !conflictsWith(courses.map(courseFactsOf), semester)) return true;
  Alert.alert(
    'Different semester?',
    `This work runs ${span}, which is outside ${semester.name}. Importing it here will file it under the wrong term.`,
    [
      { text: 'Go back', style: 'cancel' },
      { text: 'Import anyway', style: 'destructive', onPress: onConfirm },
    ],
  );
  return false;
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
  },
  summaryText: { flex: 1, fontSize: 14, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700', marginTop: 18, marginBottom: 4 },
  hint: { fontSize: 12.5, lineHeight: 17, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  badge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3 },
  createCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12 },
  createTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  input: {
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 10,
  },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateCell: { flex: 1 },
  dateLabel: { fontSize: 11.5, fontWeight: '600', marginBottom: 4 },
  createActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14, marginTop: 12 },
  createCancel: { paddingVertical: 8 },
  createSave: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, minWidth: 130, alignItems: 'center' },
  createSaveText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  selectHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
  link: { fontSize: 13, fontWeight: '600' },
  course: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    marginTop: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  courseName: { fontSize: 14.5, fontWeight: '600' },
  courseMeta: { fontSize: 12, marginTop: 3 },
  courseWarn: { fontSize: 11.5, marginTop: 4, fontStyle: 'italic' },
});
