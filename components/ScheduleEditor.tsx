import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DatePicker } from '@/components/DatePicker';
import { useColors } from '@/lib/theme';
import {
  DAY_BUTTONS,
  timeStringToDate,
  dateToTimeString,
} from '@/lib/schedule';
import type { CourseMeetingKind } from '@/types/database';

// Multi-block schedule editor. Each block represents one recurring
// meeting that maps 1:1 to a `course_meetings` row.
//
// Why an array instead of single fields on the course: real classes
// frequently have a lecture on MWF + a lab on Tu at a different time.
// One row can't represent both, and asking the user to pick "MWFTu" with
// one start/end ignores that the lab runs at a different hour.
//
// Block IDs:
//   - Existing rows from the DB: id = the course_meetings.id (uuid).
//   - New blocks added in the editor: id = "new-…" (local-only). The
//     parent diffs by id at save time to decide insert / update / delete.

export type ScheduleBlock = {
  id: string;
  days_of_week: number[];
  start_time: string | null;
  end_time: string | null;
  kind: CourseMeetingKind;
};

export const NEW_BLOCK_PREFIX = 'new-';
export const isNewBlock = (id: string) => id.startsWith(NEW_BLOCK_PREFIX);

const makeLocalId = () =>
  `${NEW_BLOCK_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const emptyBlock = (): ScheduleBlock => ({
  id: makeLocalId(),
  days_of_week: [],
  start_time: null,
  end_time: null,
  kind: 'lecture',
});

const KIND_OPTIONS: ReadonlyArray<{ value: CourseMeetingKind; label: string }> = [
  { value: 'lecture', label: 'Lecture' },
  { value: 'lab', label: 'Lab' },
  { value: 'discussion', label: 'Discussion' },
];

type Props = {
  value: ScheduleBlock[];
  onChange: (next: ScheduleBlock[]) => void;
  /** Used to color selected day chips. Usually the course color. */
  accentColor: string;
  /** Helper text shown above the empty state. */
  hint?: string;
  /** Whether the lecture/lab/discussion chip is offered. Off for
   *  office hours since "kind" doesn't apply. Default true. */
  showKind?: boolean;
  /** Noun used in CTAs ("Add a {noun}", "Remove this {noun}?"). Default
   *  "meeting"; office hours pass "office hour block". */
  noun?: string;
};

export function ScheduleEditor({
  value, onChange, accentColor, hint, showKind = true, noun = 'meeting',
}: Props) {
  const colors = useColors();
  const blocks = value;
  // Kind selector clutters the single-block case (and is irrelevant for
  // office hours). Render it only when allowed and there's >1 block.
  const renderKind = showKind && blocks.length > 1;

  const addBlock = () => onChange([...blocks, emptyBlock()]);

  const updateBlock = (id: string, patch: Partial<ScheduleBlock>) =>
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const removeBlock = (id: string) => {
    const block = blocks.find((b) => b.id === id);
    const hasContent =
      !!block &&
      (block.days_of_week.length > 0 || block.start_time !== null || block.end_time !== null);
    const drop = () => onChange(blocks.filter((b) => b.id !== id));
    if (!hasContent) {
      drop();
      return;
    }
    Alert.alert(`Remove this ${noun}?`, 'You can add it back later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: drop },
    ]);
  };

  if (blocks.length === 0) {
    return (
      <View>
        {hint ? (
          <Text style={[styles.hint, { color: colors.ink3 }]}>{hint}</Text>
        ) : null}
        <TouchableOpacity
          style={[styles.addBtn, { borderColor: colors.line }]}
          onPress={addBlock}
          activeOpacity={0.75}
        >
          <FontAwesome name="plus" size={12} color={accentColor} />
          <Text style={[styles.addBtnText, { color: accentColor }]}>Add a {noun}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      {blocks.map((block, i) => (
        <MeetingBlock
          key={block.id}
          block={block}
          accentColor={accentColor}
          showKind={renderKind}
          showRemove={blocks.length > 1}
          isFirst={i === 0}
          onChange={(patch) => updateBlock(block.id, patch)}
          onRemove={() => removeBlock(block.id)}
        />
      ))}
      <TouchableOpacity
        style={[styles.addBtn, { borderColor: colors.line, marginTop: 12 }]}
        onPress={addBlock}
        activeOpacity={0.75}
      >
        <FontAwesome name="plus" size={12} color={accentColor} />
        <Text style={[styles.addBtnText, { color: accentColor }]}>Add another {noun}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Inner block ────────────────────────────────────────────────

type BlockProps = {
  block: ScheduleBlock;
  accentColor: string;
  showKind: boolean;
  showRemove: boolean;
  isFirst: boolean;
  onChange: (patch: Partial<ScheduleBlock>) => void;
  onRemove: () => void;
};

function MeetingBlock({
  block, accentColor, showKind, showRemove, isFirst, onChange, onRemove,
}: BlockProps) {
  const colors = useColors();
  const startDate = useMemo(() => timeStringToDate(block.start_time), [block.start_time]);
  const endDate = useMemo(() => timeStringToDate(block.end_time), [block.end_time]);

  const toggleDay = (day: number) => {
    const next = block.days_of_week.includes(day)
      ? block.days_of_week.filter((d) => d !== day)
      : [...block.days_of_week, day];
    onChange({ days_of_week: next });
  };

  return (
    <View
      style={[
        styles.block,
        { borderColor: colors.line, backgroundColor: colors.card },
        !isFirst && { marginTop: 12 },
      ]}
    >
      {showRemove ? (
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={onRemove}
          hitSlop={10}
          accessibilityLabel="Remove meeting"
        >
          <FontAwesome name="times" size={14} color={colors.ink3} />
        </TouchableOpacity>
      ) : null}

      {showKind ? (
        <View style={styles.kindRow}>
          {KIND_OPTIONS.map((k) => {
            const selected = block.kind === k.value;
            return (
              <TouchableOpacity
                key={k.value}
                onPress={() => onChange({ kind: k.value })}
                style={[
                  styles.kindBtn,
                  { borderColor: colors.line },
                  selected && { backgroundColor: accentColor, borderColor: accentColor },
                ]}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[
                  styles.kindBtnText,
                  { color: colors.ink2 },
                  selected && { color: '#fff' },
                ]}>
                  {k.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <View style={styles.dayRow}>
        {DAY_BUTTONS.map((d) => {
          const selected = block.days_of_week.includes(d.value);
          return (
            <TouchableOpacity
              key={`${d.value}-${d.label}`}
              onPress={() => toggleDay(d.value)}
              style={[
                styles.dayBtn,
                { borderColor: colors.line },
                selected && { backgroundColor: accentColor, borderColor: accentColor },
              ]}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[
                styles.dayBtnText,
                { color: colors.ink2 },
                selected && { color: '#fff' },
              ]}>
                {d.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.timeRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.timeLabel, { color: colors.ink2 }]}>Start time</Text>
          <DatePicker
            value={startDate}
            mode="time"
            placeholder="Add start"
            onChange={(d) => onChange({ start_time: dateToTimeString(d) })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.timeLabel, { color: colors.ink2 }]}>End time</Text>
          {block.start_time ? (
            <DatePicker
              value={endDate}
              mode="time"
              placeholder="Add end"
              onChange={(d) => onChange({ end_time: dateToTimeString(d) })}
            />
          ) : (
            // Without a start time, an end time would render as
            // "TBD – 11:00 AM" on the Today tab — confusing. Force start
            // first.
            <View style={[styles.endDisabled, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink3, fontSize: 13 }}>Set start first</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, marginBottom: 10, lineHeight: 16 },
  block: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    paddingTop: 14,
  },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  kindRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  kindBtn: {
    flex: 1, height: 30, borderRadius: 8, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  kindBtnText: { fontSize: 12, fontWeight: '600' },
  dayRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  dayBtn: {
    flex: 1, height: 38, borderRadius: 10, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  dayBtnText: { fontSize: 14, fontWeight: '600' },
  timeRow: { flexDirection: 'row', gap: 12 },
  timeLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  endDisabled: {
    height: 48, borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 14, justifyContent: 'center',
    opacity: 0.6,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  addBtnText: { fontSize: 14, fontWeight: '600' },
});
