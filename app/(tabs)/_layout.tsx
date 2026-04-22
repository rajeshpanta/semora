import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import { Platform, View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { COLORS } from '@/lib/constants';
import { useColors, useResolvedScheme } from '@/lib/theme';

function TabIcon({ name, color, focused }: { name: any; color: string; focused: boolean }) {
  const colors = useColors();
  return (
    <View style={[ts.iconWrap, focused && [ts.iconActive, { backgroundColor: colors.brand50 }]]}>
      <FontAwesome name={name} size={18} color={color} />
    </View>
  );
}

function ScanFab() {
  const colors = useColors();
  return (
    <View style={[ts.fab, { backgroundColor: colors.brand }]}>
      <FontAwesome name="camera" size={18} color="#fff" />
    </View>
  );
}

export default function TabLayout() {
  const colors = useColors();
  const scheme = useResolvedScheme();
  const isWeb = Platform.OS === 'web';
  const insets = useSafeAreaInsets();
  const isDark = scheme === 'dark';
  const tabBarBgRgba = isDark ? 'rgba(18,18,20,0.92)' : 'rgba(250,249,245,0.92)';

  return (
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
          title: 'Today',
          tabBarIcon: ({ color, focused }) => <TabIcon name="sun-o" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="courses"
        options={{
          title: 'Courses',
          tabBarIcon: ({ color, focused }) => <TabIcon name="book" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          tabBarIcon: () => <ScanFab />,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '500', marginTop: 6 },
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarIcon: ({ color, focused }) => <TabIcon name="calendar" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarIcon: ({ color, focused }) => <TabIcon name="user" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const ts = StyleSheet.create({
  iconWrap: { width: 36, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  iconActive: { backgroundColor: COLORS.brand50 },
  fab: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.brand, justifyContent: 'center', alignItems: 'center', marginTop: -6, marginBottom: 2 },
});
