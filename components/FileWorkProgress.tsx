import { ActivityIndicator, StyleSheet, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Text } from '@/components/LocalizedReactNative';
import { useColors } from '@/lib/theme';

export function FileWorkProgress({
  title,
  detail,
  percent,
  complete = false,
  compact = false,
}: {
  title: string;
  detail?: string;
  percent?: number;
  complete?: boolean;
  compact?: boolean;
}) {
  const colors = useColors();
  const bounded = typeof percent === 'number' ? Math.max(0, Math.min(100, Math.round(percent))) : null;

  return (
    <View
      style={[
        styles.card,
        compact && styles.cardCompact,
        { backgroundColor: colors.brand50, borderColor: colors.brand100 },
      ]}
      accessibilityRole="progressbar"
      accessibilityLabel={title}
      accessibilityValue={bounded == null ? undefined : { min: 0, max: 100, now: bounded }}
    >
      <View style={styles.heading}>
        {complete ? (
          <FontAwesome name="check-circle" size={compact ? 14 : 16} color={colors.teal} />
        ) : (
          <ActivityIndicator size="small" color={colors.brand} />
        )}
        <Text style={[styles.title, compact && styles.titleCompact, { color: colors.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {bounded != null && (
          <Text style={[styles.percent, { color: colors.brand }]}>{bounded}%</Text>
        )}
      </View>
      {detail ? (
        <Text style={[styles.detail, { color: colors.ink3 }]} numberOfLines={1}>{detail}</Text>
      ) : null}
      {bounded != null && (
        <View style={[styles.track, { backgroundColor: colors.brand100 }]}>
          <View style={[styles.fill, { width: `${bounded}%`, backgroundColor: colors.brand }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 7,
  },
  cardCompact: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 11, gap: 5 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '700' },
  titleCompact: { fontSize: 12.5 },
  percent: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  detail: { fontSize: 11.5, paddingLeft: 23 },
  track: { height: 5, borderRadius: 999, overflow: 'hidden', marginTop: 1 },
  fill: { height: '100%', borderRadius: 999 },
});
