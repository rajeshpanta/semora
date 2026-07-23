import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import type { AcademicRiskReport, RecoveryStep } from '@/lib/academicRisk';
import { useColors } from '@/lib/theme';
import { FONTS } from '@/lib/constants';

export function AcademicRiskCard({
  report,
  onOpenTask,
  onOpenCourse,
  onOpenPlanner,
}: {
  report: AcademicRiskReport;
  onOpenTask: (id: string) => void;
  onOpenCourse: (id: string) => void;
  onOpenPlanner: () => void;
}) {
  const colors = useColors();
  if (!report.risks.length) return null;

  const run = (step: RecoveryStep) => {
    if (step.action === 'task' && step.targetId) onOpenTask(step.targetId);
    else if (step.action === 'course' && step.targetId) onOpenCourse(step.targetId);
    else onOpenPlanner();
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: report.highCount ? colors.coral50 : colors.amber50 }]}>
          <FontAwesome name="life-ring" size={15} color={report.highCount ? colors.coral : colors.amber} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.ink }]}>Academic check-in</Text>
          <Text style={[styles.sub, { color: colors.ink3 }]}>
            {report.highCount ? `${report.highCount} high-risk signal${report.highCount === 1 ? '' : 's'} detected` : 'A few things are worth correcting now'}
          </Text>
        </View>
      </View>

      {report.risks.slice(0, 3).map((risk) => (
        <TouchableOpacity
          key={risk.id}
          style={[styles.riskRow, { borderTopColor: colors.line }]}
          onPress={() => risk.taskId ? onOpenTask(risk.taskId) : risk.courseId ? onOpenCourse(risk.courseId) : onOpenPlanner()}
        >
          <View style={[styles.dot, { backgroundColor: risk.severity === 'high' ? colors.coral : colors.amber }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.riskTitle, { color: colors.ink }]}>{risk.title}</Text>
            <Text style={[styles.riskDetail, { color: colors.ink3 }]}>{risk.detail}</Text>
          </View>
          <FontAwesome name="chevron-right" size={10} color={colors.ink3} />
        </TouchableOpacity>
      ))}

      {report.recoveryPlan.length > 0 && (
        <View style={[styles.recovery, { backgroundColor: colors.brand50 }]}>
          <Text style={[styles.recoveryLabel, { color: colors.brand }]}>RECOVERY PLAN</Text>
          {report.recoveryPlan.slice(0, 3).map((step, index) => (
            <TouchableOpacity key={step.id} style={styles.step} onPress={() => run(step)}>
              <View style={[styles.stepNumber, { backgroundColor: colors.brand }]}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepTitle, { color: colors.ink }]}>{step.title}</Text>
                <Text style={[styles.stepDetail, { color: colors.ink3 }]}>{step.detail}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 0.5, borderRadius: 18, padding: 15, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONTS.displaySemibold, fontSize: 17 },
  sub: { fontSize: 11.5, marginTop: 1 },
  riskRow: { minHeight: 58, borderTopWidth: 0.5, marginTop: 10, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  riskTitle: { fontSize: 13, fontWeight: '700' },
  riskDetail: { fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  recovery: { borderRadius: 13, padding: 11, marginTop: 12 },
  recoveryLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.7, marginBottom: 4 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
  stepNumber: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  stepTitle: { fontSize: 12.5, fontWeight: '700' },
  stepDetail: { fontSize: 10.5, lineHeight: 14, marginTop: 1 },
});
