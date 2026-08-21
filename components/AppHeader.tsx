import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/LocalizedReactNative';
import { FONTS } from '@/lib/constants';
import { useColors } from '@/lib/theme';

/**
 * The header every screen shares.
 *
 * Each tab used to build its own. They disagreed about the one thing a header
 * has to get right — where the title sits — so Today aligned to the top,
 * Calendar to the bottom and Scan to the centre, and the title physically
 * moved as you switched tabs. Scan also kept its subtitle outside the header
 * row entirely, and Today had no title at all, opening instead with a date in
 * small caps that made it read like a different product.
 *
 * One component, one baseline. Left is always title over context; right is
 * always this page's actions in a fixed slot.
 *
 * The division of labour it encodes: GLOBAL actions (search, new task) live in
 * the sidebar because they belong to the app and must never move, and PAGE
 * actions live here because they belong to the screen you are on. That is why
 * search is not in this component.
 */
export default function AppHeader({
  title,
  context,
  actions,
}: {
  title: string;
  /** One line under the title. Say something worth reading — a bare
   *  "Fall 2026" is decoration; "Fall 2026 · 4 courses · 5 overdue" is a
   *  reason to look. Accepts nodes so a screen can hang a picker off it. */
  context?: React.ReactNode;
  /** This screen's controls, right-aligned on the title's baseline. */
  actions?: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <View style={styles.titleBlock}>
        <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {typeof context === 'string'
          ? <Text style={[styles.context, { color: colors.ink3 }]}>{context}</Text>
          : context
            ? <View style={styles.contextSlot}>{context}</View>
            : null}
      </View>
      {!!actions && <View style={styles.actions}>{actions}</View>}
    </View>
  );
}

/** Shared style for a plain context line a screen composes itself. */
export const appHeaderContextStyle = { fontSize: 13, lineHeight: 18 } as const;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // flex-start, always. This is the whole point of the component.
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
    minHeight: 46,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { fontFamily: FONTS.display, fontSize: 26, lineHeight: 32 },
  context: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  contextSlot: { marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
});
