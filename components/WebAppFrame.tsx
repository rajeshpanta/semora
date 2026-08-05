import { Pressable } from '@/components/LocalizedReactNative';
import { Text } from '@/components/LocalizedReactNative';
import {
  useEffect,
  type ComponentProps,
  type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { usePathname, useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { useColors } from '@/lib/theme';
import { useResponsive, WEB_SIDEBAR_WIDTH } from '@/lib/responsive';
import { displayName } from '@/lib/user';
import { FONTS } from '@/lib/constants';
import { useI18n } from '@/lib/i18n';

type IconName = ComponentProps<typeof FontAwesome>['name'];

type NavigationItem = {
  label: string;
  icon: IconName;
  path: string;
  exact?: boolean;
};

const PRIMARY_ITEMS: NavigationItem[] = [
  { label: 'Today', icon: 'sun-o', path: '/', exact: true },
  { label: 'Courses', icon: 'book', path: '/courses' },
  { label: 'Calendar', icon: 'calendar', path: '/calendar' },
  { label: 'Import syllabus', icon: 'magic', path: '/scan' },
];

const TOOL_ITEMS: NavigationItem[] = [
  { label: 'Smart Plan', icon: 'bolt', path: '/planner' },
  { label: 'Workload', icon: 'bar-chart', path: '/dashboard' },
  { label: 'Progress', icon: 'line-chart', path: '/insights' },
  { label: 'Flashcards', icon: 'clone', path: '/flashcards' },
  { label: 'Focus timer', icon: 'clock-o', path: '/pomodoro' },
  { label: 'AI tutor', icon: 'comments-o', path: '/tutor' },
];

const IMMERSIVE_PATHS = [
  '/onboarding',
  '/sign-in',
  '/forgot-password',
  '/reset-password',
  '/paywall',
  '/share-semester',
  '/join',
  '/invite',
  '/collaborate',
];

function isActive(pathname: string, item: NavigationItem) {
  if (item.exact) return pathname === item.path;
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

function SidebarItem({
  item,
  active,
  onPress,
}: {
  item: NavigationItem;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        styles.navItem,
        active && { backgroundColor: colors.brand50 },
        !active && hovered && { backgroundColor: colors.paper },
        pressed && { opacity: 0.68 },
      ]}
    >
      <View style={[styles.navIcon, active && { backgroundColor: colors.card }]}>
        <FontAwesome name={item.icon} size={15} color={active ? colors.brand : colors.ink3} />
      </View>
      <Text style={[styles.navText, { color: active ? colors.brand : colors.ink2 }]}>
        {t(item.label)}
      </Text>
    </Pressable>
  );
}

function DesktopSidebar({ session }: { session: Session }) {
  const colors = useColors();
  const pathname = usePathname();
  const router = useRouter();
  const name = displayName(session.user, 'Student');
  const email = session.user.email ?? '';
  const { locale, t } = useI18n();

  const navigate = (path: string) => {
    if (path === '/' || PRIMARY_ITEMS.some((item) => item.path === path)) {
      router.replace(path as any);
    } else {
      router.push(path as any);
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (editing) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        router.push('/search' as any);
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'a'
      ) {
        event.preventDefault();
        router.push('/task/new' as any);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const current =
      [...PRIMARY_ITEMS, ...TOOL_ITEMS].find((item) => isActive(pathname, item))?.label ??
      (pathname.startsWith('/settings') ? 'Settings' : 'Semora');
    document.documentElement.lang = locale;
    document.title = `${t(current)} · Semora`;
  }, [pathname, locale]);

  return (
    <View
      style={[
        styles.sidebar,
        { backgroundColor: colors.card, borderRightColor: colors.line },
      ]}
    >
      <View style={styles.brandBlock}>
        <View style={[styles.brandMark, { backgroundColor: colors.brand }]}>
          <Text style={styles.brandMarkText}>S</Text>
        </View>
        <View>
          <Text style={[styles.brandName, { color: colors.ink }]}>Semora</Text>
          <Text style={[styles.brandTag, { color: colors.ink3 }]}>STUDENT OS</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Create a new task')}
        onPress={() => router.push('/task/new' as any)}
        style={({ pressed, hovered }: any) => [
          styles.newTaskButton,
          { backgroundColor: colors.brand, opacity: pressed ? 0.82 : 1 },
          hovered && !pressed && styles.newTaskButtonHovered,
        ]}
      >
        <FontAwesome name="plus" size={13} color="#fff" />
        <Text style={styles.newTaskText}>New task</Text>
        <Text style={styles.shortcut}>⇧⌘A</Text>
      </Pressable>

      <Pressable
        accessibilityRole="search"
        onPress={() => router.push('/search' as any)}
        style={({ pressed, hovered }: any) => [
          styles.searchButton,
          {
            backgroundColor: colors.paper,
            borderColor: hovered ? colors.brand100 : colors.line,
            opacity: pressed ? 0.72 : 1,
          },
        ]}
      >
        <FontAwesome name="search" size={13} color={colors.ink3} />
        <Text style={[styles.searchText, { color: colors.ink3 }]}>Search everything</Text>
        <Text style={[styles.searchShortcut, { color: colors.ink3 }]}>⌘K</Text>
      </Pressable>

      <ScrollView
        style={styles.navScroll}
        contentContainerStyle={styles.navScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.navGroup}>
          {PRIMARY_ITEMS.map((item) => (
            <SidebarItem
              key={item.path}
              item={item}
              active={isActive(pathname, item)}
              onPress={() => navigate(item.path)}
            />
          ))}
        </View>

        <Text style={[styles.groupLabel, { color: colors.ink3 }]}>STUDY TOOLS</Text>
        <View style={styles.navGroup}>
          {TOOL_ITEMS.map((item) => (
            <SidebarItem
              key={item.path}
              item={item}
              active={isActive(pathname, item)}
              onPress={() => navigate(item.path)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.accountArea, { borderTopColor: colors.line }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/me' as any)}
          style={({ pressed, hovered }: any) => [
            styles.accountButton,
            hovered && !pressed && { backgroundColor: colors.paper },
            pressed && { opacity: 0.68 },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.brand50 }]}>
            <Text style={[styles.avatarText, { color: colors.brand }]}>
              {(name[0] ?? 'S').toUpperCase()}
            </Text>
          </View>
          <View style={styles.accountCopy}>
            <Text style={[styles.accountName, { color: colors.ink }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.accountEmail, { color: colors.ink3 }]} numberOfLines={1}>
              {email}
            </Text>
          </View>
          <FontAwesome name="chevron-right" size={10} color={colors.ink3} />
        </Pressable>
      </View>
    </View>
  );
}

export function WebAppFrame({
  session,
  children,
}: {
  session: Session | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { isDesktop } = useResponsive();
  const immersive = IMMERSIVE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const showSidebar = Platform.OS === 'web' && isDesktop && !!session && !immersive;

  if (!showSidebar || !session) return <>{children}</>;

  return (
    <View style={styles.shell}>
      <DesktopSidebar session={session} />
      <View style={styles.main}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: '100vh',
    flexDirection: 'row',
  } as any,
  main: {
    flex: 1,
    minWidth: 0,
  },
  sidebar: {
    width: WEB_SIDEBAR_WIDTH,
    flexShrink: 0,
    borderRightWidth: 1,
    paddingTop: 26,
    paddingHorizontal: 16,
    paddingBottom: 16,
    boxShadow: '1px 0 0 rgba(0,0,0,0.02), 4px 0 24px rgba(17,17,17,0.03)',
  } as any,
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 8,
    marginBottom: 24,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 22px rgba(107, 70, 193, 0.24)',
  } as any,
  brandMarkText: {
    color: '#fff',
    fontFamily: FONTS.display,
    fontSize: 20,
  },
  brandName: {
    fontFamily: FONTS.displaySemibold,
    fontSize: 19,
    lineHeight: 21,
  },
  brandTag: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  newTaskButton: {
    minHeight: 44,
    borderRadius: 13,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    cursor: 'pointer',
    boxShadow: '0 9px 24px rgba(107, 70, 193, 0.18)',
    transitionProperty: 'box-shadow, transform',
    transitionDuration: '160ms',
    transitionTimingFunction: 'ease-out',
  } as any,
  newTaskButtonHovered: {
    transform: [{ translateY: -1 }],
    boxShadow: '0 12px 28px rgba(107, 70, 193, 0.28)',
  } as any,
  newTaskText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  shortcut: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 10,
    fontWeight: '700',
  },
  searchButton: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    transitionProperty: 'border-color',
    transitionDuration: '160ms',
  } as any,
  searchText: {
    flex: 1,
    fontSize: 12.5,
  },
  searchShortcut: {
    fontSize: 10,
    fontWeight: '700',
  },
  navScroll: {
    flex: 1,
    marginHorizontal: -4,
  },
  navScrollContent: {
    paddingHorizontal: 4,
    paddingTop: 18,
    paddingBottom: 12,
  },
  navGroup: {
    gap: 3,
  },
  groupLabel: {
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: 10,
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 1.25,
  },
  navItem: {
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '120ms',
  } as any,
  navIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  accountArea: {
    borderTopWidth: 1,
    paddingTop: 14,
  },
  accountButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 5,
    borderRadius: 11,
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '120ms',
  } as any,
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
  },
  accountCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '700',
  },
  accountEmail: {
    fontSize: 10.5,
    lineHeight: 14,
  },
});
