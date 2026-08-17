import React, { useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { Platform, View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/lib/constants';
import { useColors, useResolvedScheme } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useI18n } from '@/lib/i18n';
import { PlusMenu } from '@/components/PlusMenu';

function TabIcon({ name, color, focused }: { name: any; color: string; focused: boolean }) {
  const colors = useColors();
  return (
    <View style={[ts.iconWrap, focused && [ts.iconActive, { backgroundColor: colors.brand50 }]]}>
      <FontAwesome name={name} size={18} color={color} />
    </View>
  );
}

// The middle tab is an action hub, not a destination: pressing it is
// intercepted below (preventDefault) and opens the PlusMenu instead of
// switching to the scan screen, which is now reached through the menu.
function PlusFab() {
  const colors = useColors();
  return (
    <View style={[ts.fab, { backgroundColor: colors.brand }]}>
      <FontAwesome name="plus" size={19} color="#fff" />
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const scheme = useResolvedScheme();
  const isWeb = Platform.OS === 'web';
  const { isDesktop } = useResponsive();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const isDark = scheme === 'dark';
  const tabBarBgRgba = isDark ? 'rgba(18,18,20,0.92)' : 'rgba(250,249,245,0.92)';
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
    <PlusMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.ink3,
        headerShown: false,
        tabBarBackground: () =>
          !isWeb ? (
            <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.paper }]} pointerEvents="none" />
          ),
        tabBarStyle: {
          display: isDesktop ? 'none' : 'flex',
          position: isWeb ? undefined : ('absolute' as const),
          backgroundColor: isWeb ? colors.paper : tabBarBgRgba,
          borderTopWidth: 0.5,
          borderTopColor: colors.line,
          paddingBottom: isWeb ? 8 : insets.bottom,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500', marginTop: 2 },
      }}
      screenListeners={{
        tabPress: () => {
          if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('Today'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="sun-o" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: t('Courses'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="book" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: t('Add'),
          tabBarIcon: () => <PlusFab />,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '500', marginTop: 6 },
        }}
        listeners={{
          tabPress: (e) => {
            // Open the action menu instead of navigating to the scan tab.
            e.preventDefault();
            if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setMenuOpen(true);
          },
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: t('Calendar'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="calendar" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: t('Me'),
          tabBarIcon: ({ color, focused }) => <TabIcon name="user" color={color} focused={focused} />,
        }}
      />
    </Tabs>
    </>
  );
}

const ts = StyleSheet.create({
  iconWrap: { width: 36, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  iconActive: { backgroundColor: COLORS.brand50 },
  fab: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.brand, justifyContent: 'center', alignItems: 'center', marginTop: -6, marginBottom: 2 },
});
