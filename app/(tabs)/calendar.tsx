import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, isToday as isDateToday } from 'date-fns';
import { useAppStore, findCurrentSemester } from '@/store/appStore';
import { useTasks, useSemesters, useCourses, useToggleTaskComplete } from '@/lib/queries';
import { COLORS } from '@/lib/constants';
import type { TaskWithCourse } from '@/lib/queries';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getCalendarDays(year: number, month: number, todayDate: Date) {
  const today = todayDate.getDate();
  const todayMonth = todayDate.getMonth();
  const todayYear = todayDate.getFullYear();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Previous month padding
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const prevDays = new Date(prevYear, prevMonth + 1, 0).getDate();

  const days: { day: number; isToday: boolean; isCurrentMonth: boolean; isWeekend: boolean; dateStr: string }[] = [];
  for (let i = 0; i < firstDay; i++) {
    const d = prevDays - firstDay + 1 + i;
    const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, isToday: false, isCurrentMonth: false, isWeekend: i === 0 || i === 6, dateStr });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = (firstDay + d - 1) % 7;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, isToday: d === today && month === todayMonth && year === todayYear, isCurrentMonth: true, isWeekend: dow === 0 || dow === 6, dateStr });
  }
  // Next month padding
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    const padStart = days.length;
    for (let d = 1; d <= remaining; d++) {
      const nm = month === 11 ? 0 : month + 1;
      const ny = month === 11 ? year + 1 : year;
      const dateStr = `${ny}-${String(nm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = (padStart + d - 1) % 7;
      days.push({ day: d, isToday: false, isCurrentMonth: false, isWeekend: dow === 0 || dow === 6, dateStr });
    }
  }
  return days;
}

export default function CalendarScreen() {
  const router = useRouter();
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');

  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);
  const { data: semesters = [] } = useSemesters();
  const { data: courses = [] } = useCourses(selectedSemesterId);
  const toggleComplete = useToggleTaskComplete();

  useEffect(() => {
    if (semesters.length === 0) return;
    if (!selectedSemesterId || !semesters.some((s) => s.id === selectedSemesterId)) setSelectedSemester(findCurrentSemester(semesters));
  }, [semesters, selectedSemesterId]);

  const monthStart = format(startOfMonth(viewDate), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(viewDate), 'yyyy-MM-dd');

  const { data: monthTasks = [] } = useTasks(
    selectedSemesterId ? { semesterId: selectedSemesterId, dueDateFrom: monthStart, dueDateTo: monthEnd } : { semesterId: null }
  );

  const tasksByDate = new Map<string, TaskWithCourse[]>();
  monthTasks.forEach((t) => {
    const existing = tasksByDate.get(t.due_date) || [];
    existing.push(t);
    tasksByDate.set(t.due_date, existing);
  });

  const days = getCalendarDays(viewDate.getFullYear(), viewDate.getMonth(), new Date());
  const selectedTasks = tasksByDate.get(selectedDate) || [];
  const sortedDates = Array.from(tasksByDate.keys()).sort();
  const selectedDateObj = new Date(selectedDate + 'T00:00:00');
  const selectedLabel = isDateToday(selectedDateObj) ? 'Today' : format(selectedDateObj, 'EEEE, MMM d');
  const selectedItemCount = selectedTasks.length;

  // Color legend — unique courses with tasks this month
  const legendCourses = Array.from(new Set(monthTasks.map((t) => t.course_id)))
    .map((id) => courses.find((c) => c.id === id))
    .filter(Boolean);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Calendar</Text>
            <View style={styles.monthPickerRow}>
              <Text style={styles.monthSubtitle}>{MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}</Text>
              <FontAwesome name="caret-down" size={12} color={COLORS.ink3} />
            </View>
          </View>
          <View style={styles.modeToggle}>
            <TouchableOpacity style={[styles.modeBtn, viewMode === 'month' && styles.modeBtnActive]} onPress={() => setViewMode('month')}>
              <Text style={[styles.modeBtnText, viewMode === 'month' && styles.modeBtnTextActive]}>Month</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modeBtn, viewMode === 'list' && styles.modeBtnActive]} onPress={() => setViewMode('list')}>
              <Text style={[styles.modeBtnText, viewMode === 'list' && styles.modeBtnTextActive]}>List</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Month nav arrows */}
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => setViewDate(subMonths(viewDate, 1))} hitSlop={12}>
            <FontAwesome name="chevron-left" size={13} color={COLORS.brand} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setViewDate(new Date()); setSelectedDate(format(new Date(), 'yyyy-MM-dd')); }}>
            <Text style={styles.todayLink}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setViewDate(addMonths(viewDate, 1))} hitSlop={12}>
            <FontAwesome name="chevron-right" size={13} color={COLORS.brand} />
          </TouchableOpacity>
        </View>

        {viewMode === 'month' ? (
          <>
            {/* Day labels */}
            <View style={styles.dayLabels}>
              {DAY_LABELS.map((l, i) => (
                <Text key={i} style={styles.dayLabelText}>{l}</Text>
              ))}
            </View>

            {/* Calendar grid */}
            <View style={styles.grid}>
              {days.map((d, i) => {
                const dateTasks = tasksByDate.get(d.dateStr);
                const isSelected = d.dateStr === selectedDate;
                const hasExam = dateTasks?.some((t) => t.type === 'exam');

                return (
                  <TouchableOpacity
                    key={i}
                    style={styles.dayCell}
                    onPress={() => d.isCurrentMonth && setSelectedDate(d.dateStr)}
                    activeOpacity={0.6}
                  >
                    <View style={[
                      styles.dayInner,
                      d.isToday && styles.dayToday,
                      isSelected && !d.isToday && styles.daySelected,
                      hasExam && !d.isToday && !isSelected && styles.dayExam,
                    ]}>
                      <Text style={[
                        styles.dayText,
                        !d.isCurrentMonth && styles.dayOutside,
                        d.isWeekend && d.isCurrentMonth && styles.dayWeekend,
                        d.isToday && styles.dayTextToday,
                        isSelected && !d.isToday && styles.dayTextSelected,
                      ]}>{d.day}</Text>
                    </View>
                    {dateTasks && dateTasks.length > 0 && (
                      <View style={styles.dotsRow}>
                        {dateTasks.slice(0, 3).map((t, j) => (
                          <View key={j} style={[
                            styles.dot,
                            { backgroundColor: d.isToday ? '#fff' : t.courses.color },
                            d.isToday && { borderWidth: 1, borderColor: COLORS.brand },
                          ]} />
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Color legend */}
            {legendCourses.length > 0 && (
              <View style={styles.legend}>
                {legendCourses.map((c) => c && (
                  <View key={c.id} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: c.color }]} />
                    <Text style={styles.legendText}>{c.name}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Selected day agenda */}
            <Text style={styles.agendaTitle}>{selectedLabel} · {selectedItemCount} items</Text>
            {selectedTasks.length > 0 ? (
              <View style={styles.agendaCard}>
                {selectedTasks.map((task, i) => {
                  const isLast = i === selectedTasks.length - 1;
                  return (
                    <TouchableOpacity
                      key={task.id}
                      style={[styles.agendaRow, !isLast && styles.agendaRowBorder]}
                      onPress={() => router.push(`/task/${task.id}` as any)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.agendaTimeCol}>
                        {task.due_time ? (
                          <>
                            <Text style={[styles.agendaTime, !task.is_completed && { color: COLORS.coral }]}>{task.due_time.slice(0, 5)}</Text>
                            <Text style={[styles.agendaDueLabel, !task.is_completed && { color: COLORS.coral }]}>DUE</Text>
                          </>
                        ) : (
                          <Text style={styles.agendaTime}>--:--</Text>
                        )}
                      </View>
                      <View style={[styles.agendaBar, { backgroundColor: task.courses.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.agendaTaskTitle, task.is_completed && styles.agendaTaskDone]}>{task.title}</Text>
                        <Text style={styles.agendaTaskCourse}>{task.courses.name}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => toggleComplete.mutate({ id: task.id, is_completed: !task.is_completed })}
                        hitSlop={8}
                      >
                        <View style={[styles.cbx, task.is_completed && { backgroundColor: COLORS.teal, borderColor: COLORS.teal }]}>
                          {task.is_completed && <FontAwesome name="check" size={9} color="#fff" />}
                        </View>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.agendaEmpty}>
                <Text style={styles.agendaEmptyText}>No tasks on this date</Text>
              </View>
            )}
          </>
        ) : (
          <>
            {/* LIST VIEW — grouped by date */}
            {sortedDates.length > 0 ? (
              sortedDates.map((dateStr) => {
                const dateTasks = tasksByDate.get(dateStr) || [];
                const dateObj = new Date(dateStr + 'T00:00:00');
                const label = isDateToday(dateObj) ? 'Today' : format(dateObj, 'EEE, MMM d');
                return (
                  <View key={dateStr} style={{ marginBottom: 14 }}>
                    <Text style={styles.listDateLabel}>{label} · {dateTasks.length}</Text>
                    <View style={styles.agendaCard}>
                      {dateTasks.map((task, i) => (
                        <TouchableOpacity
                          key={task.id}
                          style={[styles.agendaRow, i < dateTasks.length - 1 && styles.agendaRowBorder]}
                          onPress={() => router.push(`/task/${task.id}` as any)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.agendaTimeCol}>
                            {task.due_time ? (
                              <Text style={[styles.agendaTime, !task.is_completed && { color: COLORS.coral }]}>{task.due_time.slice(0, 5)}</Text>
                            ) : (
                              <Text style={styles.agendaTime}>--:--</Text>
                            )}
                          </View>
                          <View style={[styles.agendaBar, { backgroundColor: task.courses.color }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.agendaTaskTitle, task.is_completed && styles.agendaTaskDone]}>{task.title}</Text>
                            <Text style={styles.agendaTaskCourse}>{task.courses.name}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => toggleComplete.mutate({ id: task.id, is_completed: !task.is_completed })}
                            hitSlop={8}
                          >
                            <View style={[styles.cbx, task.is_completed && { backgroundColor: COLORS.teal, borderColor: COLORS.teal }]}>
                              {task.is_completed && <FontAwesome name="check" size={9} color="#fff" />}
                            </View>
                          </TouchableOpacity>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.agendaEmpty}>
                <Text style={styles.agendaEmptyText}>No tasks this month</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 18, paddingBottom: 120 },
  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  title: { fontSize: 26, fontWeight: '600', color: COLORS.ink, letterSpacing: -0.5 },
  monthPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  monthSubtitle: { fontSize: 14, color: COLORS.ink2, fontWeight: '500' },
  modeToggle: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 9, padding: 3, borderWidth: 0.5, borderColor: COLORS.line },
  modeBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  modeBtnActive: { backgroundColor: COLORS.ink },
  modeBtnText: { fontSize: 14, fontWeight: '500', color: COLORS.ink3 },
  modeBtnTextActive: { color: '#fff' },
  // Nav
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 12, paddingHorizontal: 4 },
  todayLink: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
  // Day labels
  dayLabels: { flexDirection: 'row', marginBottom: 6 },
  dayLabelText: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '600', color: COLORS.ink3, letterSpacing: 0.8 },
  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', alignItems: 'center', paddingVertical: 2 },
  dayInner: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  dayToday: { backgroundColor: COLORS.brand },
  daySelected: { backgroundColor: COLORS.brand50, borderWidth: 1.5, borderColor: COLORS.brand },
  dayExam: { backgroundColor: COLORS.brand50 },
  dayText: { fontSize: 14, fontWeight: '400', color: COLORS.ink },
  dayOutside: { color: COLORS.ink3 },
  dayWeekend: { color: COLORS.ink3 },
  dayTextToday: { color: '#fff', fontWeight: '600' },
  dayTextSelected: { color: COLORS.brand, fontWeight: '600' },
  dotsRow: { flexDirection: 'row', gap: 2, marginTop: 1, height: 6, justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2 },
  // Legend
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 10, marginBottom: 14, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 14, color: COLORS.ink3 },
  // Agenda
  agendaTitle: { fontSize: 14, fontWeight: '600', color: COLORS.ink2, marginBottom: 8 },
  agendaCard: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 14, borderWidth: 0.5, borderColor: COLORS.line },
  agendaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  agendaRowBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  agendaTimeCol: { width: 42, alignItems: 'center' },
  agendaTime: { fontSize: 14, fontWeight: '600', color: COLORS.ink },
  agendaDueLabel: { fontSize: 11, color: COLORS.ink3 },
  agendaBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, minHeight: 28 },
  agendaTaskTitle: { fontSize: 14, fontWeight: '500', color: COLORS.ink },
  agendaTaskDone: { textDecorationLine: 'line-through', color: COLORS.ink3 },
  agendaTaskCourse: { fontSize: 14, color: COLORS.ink3, marginTop: 2 },
  cbx: { width: 20, height: 20, borderRadius: 7, borderWidth: 1.5, borderColor: COLORS.ink3, justifyContent: 'center', alignItems: 'center' },
  listDateLabel: { fontSize: 14, fontWeight: '600', color: COLORS.ink2, marginBottom: 6 },
  agendaEmpty: { backgroundColor: COLORS.card, borderRadius: 18, padding: 24, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.line },
  agendaEmptyText: { fontSize: 14, color: COLORS.ink3 },
});
