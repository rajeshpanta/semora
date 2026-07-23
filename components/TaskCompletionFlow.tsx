import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { differenceInCalendarDays, differenceInHours } from 'date-fns';
import { COLORS, FONTS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import type { Task } from '@/types/database';

export type TaskCompletionCandidate = Pick<Task, 'id' | 'title' | 'due_date' | 'due_time'>;

export type TaskCompletionDecision = {
  submitted_late: boolean;
  late_penalty_percent: number | null;
};

type PendingRequest = {
  task: TaskCompletionCandidate;
  dueAt: Date;
  resolve: (decision: TaskCompletionDecision | null) => void;
};

type CompletionFlowContextValue = {
  confirmCompletion: (task: TaskCompletionCandidate) => Promise<TaskCompletionDecision | null>;
  confirmLatePenalty: (task: TaskCompletionCandidate) => Promise<TaskCompletionDecision | null>;
};

const CompletionFlowContext = createContext<CompletionFlowContextValue | null>(null);

function taskDueAt(task: TaskCompletionCandidate): Date {
  const due = new Date(`${task.due_date}T00:00:00`);
  if (task.due_time) {
    const [hours, minutes] = task.due_time.split(':').map(Number);
    // A displayed time such as 11:59 PM represents the whole minute. Do not
    // call work late at 11:59:01 when the student still sees "due 11:59".
    due.setHours(hours || 0, minutes || 0, 59, 999);
  } else {
    // A date-only assignment is due through the end of that local day.
    due.setHours(23, 59, 59, 999);
  }
  return due;
}

function latenessLabel(dueAt: Date): string {
  const now = new Date();
  const days = differenceInCalendarDays(now, dueAt);
  if (days >= 1) return days === 1 ? '1 day after the deadline' : `${days} days after the deadline`;
  const hours = Math.max(1, differenceInHours(now, dueAt));
  return hours === 1 ? 'about 1 hour after the deadline' : `about ${hours} hours after the deadline`;
}

export function TaskCompletionFlowProvider({ children }: { children: ReactNode }) {
  const colors = useColors();
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [step, setStep] = useState<'status' | 'penalty'>('status');
  const [penalty, setPenalty] = useState('10');
  const pendingRef = useRef<PendingRequest | null>(null);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => () => pendingRef.current?.resolve(null), []);

  const confirmCompletion = useCallback((task: TaskCompletionCandidate) => {
    const dueAt = taskDueAt(task);
    if (Date.now() <= dueAt.getTime()) {
      return Promise.resolve({ submitted_late: false, late_penalty_percent: null });
    }

    return new Promise<TaskCompletionDecision | null>((resolve) => {
      // Resolve a superseded request instead of leaving its caller hanging.
      pendingRef.current?.resolve(null);
      setStep('status');
      setPenalty('10');
      setPending({ task, dueAt, resolve });
    });
  }, []);

  const confirmLatePenalty = useCallback((task: TaskCompletionCandidate) => (
    new Promise<TaskCompletionDecision | null>((resolve) => {
      pendingRef.current?.resolve(null);
      setStep('penalty');
      setPenalty('10');
      setPending({ task, dueAt: taskDueAt(task), resolve });
    })
  ), []);

  const finish = (decision: TaskCompletionDecision | null) => {
    const request = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    request?.resolve(decision);
  };

  const parsedPenalty = Number(penalty);
  const penaltyValid = Number.isFinite(parsedPenalty) && parsedPenalty >= 0 && parsedPenalty <= 100;

  return (
    <CompletionFlowContext.Provider value={{ confirmCompletion, confirmLatePenalty }}>
      {children}
      <Modal
        visible={!!pending}
        transparent
        animationType="fade"
        onRequestClose={() => finish(null)}
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => finish(null)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}> 
            {step === 'status' ? (
              <>
                <View style={[styles.icon, { backgroundColor: colors.amber50 }]}> 
                  <FontAwesome name="clock-o" size={20} color={colors.amber} />
                </View>
                <Text style={[styles.title, { color: colors.ink }]}>Confirm submission timing</Text>
                <Text style={[styles.body, { color: colors.ink3 }]}> 
                  “{pending?.task.title}” is being completed {pending ? latenessLabel(pending.dueAt) : 'after the deadline'}. Was it actually submitted on time?
                </Text>
                <TouchableOpacity
                  style={[styles.primary, { backgroundColor: colors.teal }]}
                  onPress={() => finish({ submitted_late: false, late_penalty_percent: null })}
                >
                  <FontAwesome name="check-circle" size={15} color="#fff" />
                  <Text style={styles.primaryText}>Yes, submitted on time</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondary, { borderColor: colors.coral }]}
                  onPress={() => setStep('penalty')}
                >
                  <Text style={[styles.secondaryText, { color: colors.coral }]}>No, it was late</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => finish(null)} style={styles.cancel}>
                  <Text style={[styles.cancelText, { color: colors.ink3 }]}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={[styles.icon, { backgroundColor: colors.coral50 }]}> 
                  <FontAwesome name="percent" size={18} color={colors.coral} />
                </View>
                <Text style={[styles.title, { color: colors.ink }]}>Expected late penalty</Text>
                <Text style={[styles.body, { color: colors.ink3 }]}> 
                  Enter the percentage points your instructor may deduct. Semora records this estimate now; the final grade you enter later always wins.
                </Text>
                <View style={styles.chips}>
                  {[0, 5, 10, 20].map((value) => {
                    const selected = penalty === String(value);
                    return (
                      <TouchableOpacity
                        key={value}
                        style={[styles.chip, { borderColor: colors.line }, selected && { backgroundColor: colors.brand, borderColor: colors.brand }]}
                        onPress={() => setPenalty(String(value))}
                      >
                        <Text style={[styles.chipText, { color: selected ? '#fff' : colors.ink2 }]}>{value === 0 ? 'None' : `${value}%`}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={[styles.inputWrap, { borderColor: penaltyValid ? colors.line : colors.coral }]}> 
                  <TextInput
                    value={penalty}
                    onChangeText={setPenalty}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                    style={[styles.input, { color: colors.ink }]}
                    accessibilityLabel="Late penalty percentage"
                  />
                  <Text style={[styles.percent, { color: colors.ink3 }]}>percentage points</Text>
                </View>
                {penaltyValid && (
                  <Text style={[styles.capText, { color: colors.ink2 }]}>Estimated maximum before grading: {Math.max(0, 100 - parsedPenalty)}%</Text>
                )}
                <TouchableOpacity
                  style={[styles.primary, { backgroundColor: colors.coral }, !penaltyValid && styles.disabled]}
                  disabled={!penaltyValid}
                  onPress={() => finish({ submitted_late: true, late_penalty_percent: parsedPenalty })}
                >
                  <Text style={styles.primaryText}>Save late submission</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setStep('status')} style={styles.cancel}>
                  <Text style={[styles.cancelText, { color: colors.ink3 }]}>Back</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </CompletionFlowContext.Provider>
  );
}

export function useTaskCompletionFlow() {
  const value = useContext(CompletionFlowContext);
  if (!value) throw new Error('useTaskCompletionFlow must be used inside TaskCompletionFlowProvider');
  return value;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,11,36,0.34)' },
  sheet: { margin: 14, borderRadius: 24, borderWidth: 1, padding: 22, alignItems: 'stretch' },
  icon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  title: { fontFamily: FONTS.displaySemibold, fontSize: 22, textAlign: 'center' },
  body: { fontSize: 13.5, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 18 },
  primary: { minHeight: 52, borderRadius: 15, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secondary: { minHeight: 48, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryText: { fontSize: 14, fontWeight: '700' },
  cancel: { alignSelf: 'center', padding: 12 },
  cancelText: { fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: { flex: 1, minHeight: 42, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '700' },
  inputWrap: { minHeight: 50, borderWidth: 1.5, borderRadius: 13, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  input: { minWidth: 54, fontSize: 18, fontWeight: '800' },
  percent: { flex: 1, fontSize: 13 },
  capText: { textAlign: 'center', fontSize: 12.5, fontWeight: '600', marginVertical: 10 },
  disabled: { opacity: 0.45 },
});
