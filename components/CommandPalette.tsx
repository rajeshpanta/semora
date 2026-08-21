import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { FONTS } from '@/lib/constants';
import { track } from '@/lib/analytics';
import { useAllCourses, useTasks } from '@/lib/queries';
import { useLectures } from '@/lib/lectures';
import { rankCandidates, type Candidate } from '@/lib/search';

/**
 * Search, in place.
 *
 * Clicking the search field used to `router.push('/search')` — it left the
 * screen you were on, unmounted it, and put you on a filter-chip page you then
 * had to navigate back out of. That is a destination, not a search box. The
 * whole value of a search field in a top bar is that it does not cost you your
 * place: you type, you see, you either jump or you press Escape and you are
 * exactly where you were.
 *
 * It is also account-wide and covers more than tasks. "Search everything" was
 * a promise the old screen did not keep — it searched tasks and nothing else,
 * so a course, a lecture note, or the settings page you were hunting for
 * simply were not there.
 *
 * Ranking lives in lib/search.ts and is tested on its own. This file is only
 * about turning rows into candidates and candidates into a list.
 */

type ResultKind = 'go' | 'course' | 'task' | 'lecture';

interface Row {
  key: string;
  kind: ResultKind;
  title: string;
  subtitle?: string;
  icon: string;
  route: string;
  /** Colour dot for course-owned rows. */
  tint?: string | null;
}

/**
 * Places, not records. A search box that cannot take you to Settings is not
 * searching everything — and "where is the setting for X" is one of the most
 * common things anyone types into one.
 *
 * `keywords` is never rendered. It is the vocabulary a student actually types
 * mapped onto the screen that answers it, so the palette matches intent rather
 * than our labels — "gpa" finds Progress, "dark mode" finds Settings.
 *
 * It carries BOTH languages in one string rather than going through the
 * catalogue, and that is deliberate: these are match targets, not UI text.
 * Matching is language-agnostic, so listing "ajustes tema idioma" beside
 * "settings theme language" makes a Spanish student's search work with no
 * locale plumbing at all — and a bilingual student searching in either
 * language finds the same screen. Translating this field instead would mean
 * whichever language the catalogue missed simply stops finding anything.
 */
const DESTINATIONS: { title: string; subtitle: string; icon: string; route: string; keywords: string }[] = [
  { title: 'Today', subtitle: 'Your day at a glance', icon: 'sun-o', route: '/', keywords: 'home dashboard now inicio hoy panel' },
  { title: 'Courses', subtitle: 'Every class this semester', icon: 'book', route: '/courses', keywords: 'classes subjects clases materias cursos asignaturas' },
  { title: 'Calendar', subtitle: 'Deadlines by month', icon: 'calendar', route: '/calendar', keywords: 'schedule month agenda dates calendario mes fechas horario' },
  { title: 'Import syllabus', subtitle: 'Scan or upload a syllabus', icon: 'magic', route: '/scan', keywords: 'scan upload pdf photo camera ai escanear subir foto camara programa temario' },
  { title: 'Connect Canvas', subtitle: 'Import every class automatically', icon: 'university', route: '/settings/lms', keywords: 'canvas lms sync blackboard moodle import classes sincronizar importar clases' },
  { title: 'Plan my week', subtitle: 'Build a study plan', icon: 'list-ul', route: '/planner', keywords: 'planner study smart plan schedule planificador estudio plan semana' },
  { title: 'Workload', subtitle: 'Where the heavy weeks are', icon: 'bar-chart', route: '/dashboard', keywords: 'workload chart busy insights carga trabajo grafico ocupado' },
  { title: 'Progress', subtitle: 'Grades and how the term is going', icon: 'line-chart', route: '/progress', keywords: 'grades gpa marks results insights notas calificaciones promedio resultados progreso' },
  { title: 'Notes', subtitle: 'Lectures and uploaded files', icon: 'file-text-o', route: '/lecture', keywords: 'lecture recording transcript notes documents clase grabacion transcripcion apuntes notas documentos archivos' },
  { title: 'Flashcards', subtitle: 'Decks built from your notes', icon: 'clone', route: '/decks', keywords: 'cards study review deck revision tarjetas estudio repaso mazo' },
  { title: 'AI tutor', subtitle: 'Ask about any course', icon: 'comments-o', route: '/tutor', keywords: 'chat ask help tutor ai question preguntar ayuda pregunta' },
  { title: 'Settings', subtitle: 'Account, reminders, appearance', icon: 'cog', route: '/settings', keywords: 'preferences options account profile theme dark mode language notifications ajustes configuracion cuenta perfil tema modo oscuro idioma notificaciones recordatorios' },
];

const KIND_LABEL: Record<ResultKind, string> = {
  go: 'Go to',
  course: 'Course',
  task: 'Task',
  lecture: 'Note',
};

const MAX_RESULTS = 24;

export default function CommandPalette({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<any>(null);
  const rowRefs = useRef<Record<number, any>>({});

  // Only fetch while the palette can actually be seen. These are three
  // account-wide reads and there is no reason for them to run on every screen
  // just because the shell mounts the palette.
  const { data: tasks = [] } = useTasks(visible ? undefined : { semesterId: null });
  const { data: courses = [] } = useAllCourses(visible);
  const { data: lectures = [] } = useLectures(visible);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setActive(0);
      return;
    }
    track('search_opened', { screen: 'command_palette' });
    // autoFocus alone loses the race with the Modal's own mount on web.
    const id = setTimeout(() => inputRef.current?.focus?.(), 60);
    return () => clearTimeout(id);
  }, [visible]);

  const candidates = useMemo<Candidate<Row>[]>(() => {
    if (!visible) return [];
    const out: Candidate<Row>[] = [];

    for (const destination of DESTINATIONS) {
      out.push({
        item: {
          key: `go:${destination.route}`,
          kind: 'go',
          title: destination.title,
          subtitle: destination.subtitle,
          icon: destination.icon,
          route: destination.route,
        },
        fields: [
          { text: destination.title, weight: 1 },
          // Not shown anywhere. This is the vocabulary a student actually
          // types — "dark mode", "gpa", "lms" — mapped onto the screen that
          // answers it, so the palette matches intent rather than our labels.
          { text: destination.keywords, weight: 0.62 },
          { text: destination.subtitle, weight: 0.4 },
        ],
        boost: 0.06,
      });
    }

    for (const course of courses) {
      out.push({
        item: {
          key: `course:${course.id}`,
          kind: 'course',
          title: course.name,
          subtitle: course.instructor || undefined,
          icon: 'book',
          route: `/course/${course.id}`,
          tint: course.color,
        },
        fields: [
          { text: course.name, weight: 1 },
          { text: course.instructor, weight: 0.55 },
        ],
        boost: 0.04,
      });
    }

    for (const task of tasks) {
      const due = task.due_date
        ? format(new Date(`${task.due_date}T00:00:00`), 'EEE, MMM d')
        : null;
      out.push({
        item: {
          key: `task:${task.id}`,
          kind: 'task',
          title: task.title,
          subtitle: [task.courses?.name, due].filter(Boolean).join(' · ') || undefined,
          icon: task.is_completed ? 'check-circle' : 'circle-o',
          route: `/task/${task.id}`,
          tint: task.courses?.color,
        },
        fields: [
          { text: task.title, weight: 1 },
          { text: task.courses?.name, weight: 0.82 },
          { text: task.description, weight: 0.5 },
          { text: task.type, weight: 0.4 },
        ],
        // Finished work is still findable, just never ahead of live work that
        // matched equally well.
        boost: task.is_completed ? -0.05 : 0,
      });
    }

    for (const lecture of lectures as any[]) {
      out.push({
        item: {
          key: `lecture:${lecture.id}`,
          kind: 'lecture',
          title: lecture.title || 'Untitled note',
          subtitle: lecture.courses?.name || undefined,
          icon: 'file-text-o',
          route: `/lecture/${lecture.id}`,
          tint: lecture.courses?.color,
        },
        fields: [
          { text: lecture.title, weight: 1 },
          { text: lecture.courses?.name, weight: 0.6 },
        ],
      });
    }

    return out;
  }, [visible, tasks, courses, lectures]);

  const hits = useMemo(
    () => rankCandidates(query, candidates, { limit: MAX_RESULTS }),
    [query, candidates],
  );

  // Nothing typed yet: offer the places rather than an empty box. A palette
  // that shows nothing until you type makes you guess what it can even do.
  const rows: { row: Row; complete: boolean }[] = useMemo(() => {
    if (!query.trim()) {
      return DESTINATIONS.slice(0, 8).map((destination) => ({
        row: {
          key: `go:${destination.route}`,
          kind: 'go' as const,
          title: destination.title,
          subtitle: destination.subtitle,
          icon: destination.icon,
          route: destination.route,
        },
        complete: true,
      }));
    }
    return hits.map((hit) => ({ row: hit.item, complete: hit.complete }));
  }, [query, hits]);

  useEffect(() => setActive(0), [query]);

  // Keep the highlighted row on screen while arrowing past the fold. Without
  // this the selection walks out of the scroll box and Enter opens something
  // the student cannot see — the worst possible outcome for a keyboard path.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = rowRefs.current[active];
    node?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const open = (row: Row) => {
    track('search_result_opened', { screen: 'command_palette', kind: row.kind, query_length: query.trim().length });
    onClose();
    router.push(row.route as any);
  };

  // Arrow keys and Enter, captured on the input so the list can be driven
  // without the mouse ever leaving the keyboard. Escape closes; the Modal's
  // own onRequestClose covers the same key on native.
  const onKeyPress = (event: any) => {
    const key = event?.nativeEvent?.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault?.();
      if (rows.length === 0) return;
      setActive((current) => {
        const next = key === 'ArrowDown' ? current + 1 : current - 1;
        return (next + rows.length) % rows.length;
      });
      return;
    }
    if (key === 'Enter') {
      event.preventDefault?.();
      const target = rows[active];
      if (target) open(target.row);
      return;
    }
    if (key === 'Escape') {
      event.preventDefault?.();
      onClose();
    }
  };

  // The index where partial matches begin, so the divider is drawn once.
  const firstPartial = rows.findIndex((entry) => !entry.complete);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.host}>
        <Pressable style={styles.backdrop} onPress={onClose} accessible={false} />
        {/* Near the top, not centred. The field lands under the bar that
            opened it, so the caret appears roughly where the eye already is. */}
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={[styles.inputRow, { borderBottomColor: colors.line }]}>
            <FontAwesome name="search" size={15} color={colors.ink3} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onKeyPress={onKeyPress}
              placeholder="Search tasks, courses, notes and settings"
              placeholderTextColor={colors.ink3}
              style={[styles.input, { color: colors.ink }] as any}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search everything"
            />
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('Close')}>
              <Text style={[styles.escHint, { color: colors.ink3, borderColor: colors.line }]}>esc</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {rows.length === 0 ? (
              <View style={styles.empty}>
                <FontAwesome name="search" size={22} color={colors.ink3} />
                <Text style={[styles.emptyTitle, { color: colors.ink }]}>Nothing matched</Text>
                <Text style={[styles.emptyText, { color: colors.ink3 }]}>
                  Try fewer words, or part of a course name.
                </Text>
              </View>
            ) : (
              rows.map((entry, index) => (
                <React.Fragment key={entry.row.key}>
                  {index === firstPartial && firstPartial > 0 && (
                    // Said out loud rather than blended in. These matched some
                    // of what was typed, not all of it, and a list that hides
                    // that difference is quietly answering a question nobody
                    // asked.
                    <Text style={[styles.divider, { color: colors.ink3, borderTopColor: colors.line }]}>
                      Closest matches
                    </Text>
                  )}
                  <Pressable
                    ref={(node: any) => { rowRefs.current[index] = node; }}
                    onPress={() => open(entry.row)}
                    onHoverIn={() => setActive(index)}
                    accessibilityRole="button"
                    style={[
                      styles.row,
                      index === active && { backgroundColor: colors.brand50 },
                    ]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: colors.paper }]}>
                      <FontAwesome
                        name={entry.row.icon as any}
                        size={13}
                        color={entry.row.tint || colors.ink3}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowTitle, { color: colors.ink }]} numberOfLines={1}>
                        {entry.row.title}
                      </Text>
                      {!!entry.row.subtitle && (
                        <Text style={[styles.rowSub, { color: colors.ink3 }]} numberOfLines={1}>
                          {entry.row.subtitle}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.kind, { color: colors.ink3, borderColor: colors.line }]}>
                      {KIND_LABEL[entry.row.kind]}
                    </Text>
                  </Pressable>
                </React.Fragment>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, alignItems: 'center' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 17, 20, 0.42)',
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(2px)' } : null),
  } as any,
  panel: {
    width: '100%',
    maxWidth: 620,
    marginTop: 84,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    boxShadow: '0 24px 60px rgba(17, 17, 20, 0.22)',
  } as any,
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  // outlineStyle is web-only; RN's TextStyle does not model 'none'.
  input: { flex: 1, fontSize: 15, height: '100%', outlineStyle: 'none' } as any,
  escHint: {
    fontSize: 10,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  list: { maxHeight: 420 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginHorizontal: 6,
    marginVertical: 1,
    borderRadius: 10,
    cursor: 'pointer',
  } as any,
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 13.5, fontWeight: '600' },
  rowSub: { fontSize: 11.5, marginTop: 1 },
  kind: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  divider: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 6,
    marginTop: 6,
    borderTopWidth: 1,
  },
  empty: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 30 },
  emptyTitle: { fontFamily: FONTS.display, fontSize: 15, marginTop: 10 },
  emptyText: { fontSize: 12.5, marginTop: 4, textAlign: 'center' },
});
