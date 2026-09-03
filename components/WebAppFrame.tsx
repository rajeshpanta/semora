import { Pressable } from '@/components/LocalizedReactNative';
import { Text } from '@/components/LocalizedReactNative';
import {
  useCallback,
  useEffect,
  type ComponentProps,
  useState,
  type ReactNode } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { usePathname, useRouter } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { useColors } from '@/lib/theme';
import { useQuery } from '@tanstack/react-query';
import { canvasFreePromoQuery, canvasOfferFor, lmsConnectionsQuery } from '@/lib/lms';
import { canvasOfferDestination, trackCanvasOfferTapped } from '@/lib/canvasFunnel';
import { CanvasOfferImpression } from '@/components/CanvasOfferImpression';
import CommandPalette from '@/components/CommandPalette';
import { useAppStore } from '@/store/appStore';
import { MARKETING_URL } from '@/lib/constants';
import { track } from '@/lib/analytics';
import { ProUpsellSheet } from '@/components/ProUpsellSheet';
import { useResponsive, WEB_SIDEBAR_WIDTH } from '@/lib/responsive';
import { displayName, accountSubtitle } from '@/lib/user';
import { FONTS } from '@/lib/constants';
import { useI18n } from '@/lib/i18n';

type IconName = ComponentProps<typeof FontAwesome>['name'];

type NavigationItem = {
  label: string;
  icon: IconName;
  path: string;
  exact?: boolean;
};

// Canvas sits between Calendar and Import syllabus, and only while it is
// worth offering. Above importing on purpose: a student who connects Canvas
// never has to import that syllabus at all. Once it is connected AND syncing,
// the item disappears — a permanent "Connect Canvas" in the sidebar of someone
// who already connected it is furniture, and furniture gets ignored.
// Not a route. The sidebar highlights by pathname and this opens an external
// page, so it must never match anything isActive() compares against.
const SUPPORT_PATH = '__support__';
// Same sentinel trick as SUPPORT_PATH: this leaves the app for the marketing
// site's /download page, so it must never match anything isActive() compares.
const GET_APP_PATH = '__get_app__';

const CANVAS_ITEM: NavigationItem = { label: 'Connect Canvas', icon: 'university', path: '/settings/lms' };
const CANVAS_FIX_ITEM: NavigationItem = { label: 'Finish Canvas setup', icon: 'refresh', path: '/settings/lms' };
// A connection that is syncing fine AND sitting on courses it has not imported.
// This is what a term change looks like: Canvas starts listing next semester's
// classes, none of them are linked, and their deadlines go nowhere. It gets a
// row of its own rather than hiding behind "healthy", because the whole point
// is that the student never has to work out on their own that Canvas needs
// attention again.
const CANVAS_NEW_ITEM: NavigationItem = { label: 'New Canvas courses', icon: 'plus-circle', path: '/settings/lms/new-courses' };
// Free accounts go straight to the paywall. lms-sync refuses them server-side,
// so routing to Settings first only adds a step before the same answer.
// The path is a sentinel, not a destination: SidebarItem's press handler
// intercepts it and opens the upgrade sheet in place. A free student should
// meet the price where they met the offer, not on another screen.
const CANVAS_UPSELL_PATH = '__canvas_upsell__';
/** Every Canvas sidebar row, named once so none can be added without attribution. */
const CANVAS_ITEM_LABELS = new Set([
  'Connect Canvas', 'Finish Canvas setup', 'New Canvas courses',
  'Connect Canvas · Pro', 'Connect Canvas · Free',
]);
function isCanvasItem(item: { label: string }) {
  return CANVAS_ITEM_LABELS.has(item.label);
}
const CANVAS_PRO_ITEM: NavigationItem = { label: 'Connect Canvas · Pro', icon: 'university', path: CANVAS_UPSELL_PATH };
// While the canvas_free offer is live the sidebar row says what it now costs.
// Same position, same icon, one word changed — the rail is glanced at, not
// read, and moving the row would cost more recognition than the word gains.
const CANVAS_FREE_ITEM: NavigationItem = { label: 'Connect Canvas · Free', icon: 'university', path: '/settings/lms' };

const PRIMARY_ITEMS: NavigationItem[] = [
  { label: 'Today', icon: 'sun-o', path: '/', exact: true },
  { label: 'Courses', icon: 'book', path: '/courses' },
  { label: 'Calendar', icon: 'calendar', path: '/calendar' },
  { label: 'Import syllabus', icon: 'magic', path: '/scan' },
];

// AI tutor leads. It was last of six, which put the one thing no competitor
// can copy — answers grounded in the student's own syllabus — below a focus
// timer, and then behind a fold once this group became collapsible.
const TOOL_ITEMS: NavigationItem[] = [
  { label: 'AI tutor', icon: 'comments-o', path: '/tutor' },
  { label: 'Smart Plan', icon: 'bolt', path: '/planner' },
  { label: 'Workload', icon: 'bar-chart', path: '/dashboard' },
  { label: 'Progress', icon: 'line-chart', path: '/insights' },
  { label: 'Flashcards', icon: 'clone', path: '/flashcards' },
  { label: 'Focus timer', icon: 'clock-o', path: '/pomodoro' },
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

/**
 * Chrome that belongs to the desktop shell rather than to the sidebar view:
 * the global shortcuts, the page title, and the drop guard.
 *
 * It lives here, not inside DesktopSidebar, because the sidebar can now be
 * hidden — and ⌘K, ⌘B and "don't let a stray file drop unload the SPA" have
 * to keep working for someone who hid it. Anything unmounted with the rail
 * would silently stop working exactly when the student has the fewest
 * on-screen controls left.
 */
function useShellChrome({ enabled, openSearch }: { enabled: boolean; openSearch: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, t } = useI18n();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed);

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // ⌘K is checked BEFORE the typing guard below. Every other shortcut here
      // has to stand down while a field has focus — ⇧⌘A inside a task title
      // would be a keystroke going somewhere the student did not aim it. Search
      // is the exception people actually expect: half of reaching for it is
      // abandoning whatever you were half-typing.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
        return;
      }

      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (editing) return;
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === 'a'
      ) {
        event.preventDefault();
        router.push('/task/new' as any);
      }
      // ⌘B / Ctrl+B — the shortcut every editor-shaped app uses for this, and
      // the only way back if the rail is hidden and the mouse is elsewhere.
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'b'
      ) {
        event.preventDefault();
        setCollapsed(!collapsed);
      }
    };
    // CAPTURE phase, not bubble. react-native-web's TextInput calls
    // stopPropagation() on every keydown it receives (its issue #612), so a
    // bubble-phase listener on window never hears a key pressed inside any
    // field in the app — which would silently kill ⌘K in exactly the moments
    // it is most useful. Capture runs window-inward, before the target can
    // stop anything. The `editing` guard above still reads event.target, so
    // the other shortcuts keep standing down while someone is typing.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [router, enabled, collapsed, setCollapsed, openSearch]);

  // Swallow file drops that land anywhere we don't handle.
  //
  // A browser's default action for a dropped file is to NAVIGATE THE TAB to it,
  // which unloads the whole SPA — so a student who dragged their syllabus at
  // the scan frame and missed watched Semora vanish and get replaced by a raw
  // PDF viewer. Nothing in the app wanted that behaviour; the scan screen's own
  // listeners stopPropagation for the region that does handle drops.
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const swallow = (e: DragEvent) => {
      if ((e as any).__semoraHandled) return;
      e.preventDefault();
      if (e.type === 'drop' && e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    document.addEventListener('dragover', swallow);
    document.addEventListener('drop', swallow);
    return () => {
      document.removeEventListener('dragover', swallow);
      document.removeEventListener('drop', swallow);
    };
  }, [enabled]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const current =
      [...PRIMARY_ITEMS, ...TOOL_ITEMS].find((item) => isActive(pathname, item))?.label ??
      (pathname.startsWith('/settings') ? 'Settings' : 'Semora');
    document.documentElement.lang = locale;
    document.title = `${t(current)} · Semora`;
  }, [pathname, locale, enabled]);
}

function DesktopSidebar({ session }: { session: Session }) {
  const colors = useColors();
  const pathname = usePathname();
  const storedToolsOpen = useAppStore((s) => s.sidebarToolsOpen);
  const setSidebarToolsOpen = useAppStore((s) => s.setSidebarToolsOpen);
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  // A tool that IS the current screen keeps the group open, so the active
  // highlight can never disappear underneath a collapsed header.
  const onAToolScreen = TOOL_ITEMS.some((item) => isActive(pathname, item));
  const toolsOpen = storedToolsOpen || onAToolScreen;
  // Canvas between Calendar and Import syllabus, only while it is worth
  // offering. Same rule the "+" menu and the add-course prompt use, so the
  // three cannot disagree about whether this student needs it.
  const isPro = useAppStore((st) => st.isPro);
  const [canvasUpsellOpen, setCanvasUpsellOpen] = useState(false);
  const { data: lmsConnections } = useQuery(lmsConnectionsQuery);
  const { data: canvasFreePromo } = useQuery(canvasFreePromoQuery);
  const { offer: canvasOffer, free: canvasFree } = canvasOfferFor(lmsConnections, isPro, canvasFreePromo);
  const primaryItems = (() => {
    if (canvasOffer === 'healthy') return PRIMARY_ITEMS;
    const item =
      canvasOffer === 'needs_attention' ? CANVAS_FIX_ITEM
      : canvasOffer === 'new_courses' ? CANVAS_NEW_ITEM
      : canvasOffer === 'locked' ? CANVAS_PRO_ITEM
      : canvasFree ? CANVAS_FREE_ITEM
      : CANVAS_ITEM;
    const at = PRIMARY_ITEMS.findIndex((i) => i.path === '/scan');
    return [...PRIMARY_ITEMS.slice(0, at), item, ...PRIMARY_ITEMS.slice(at)];
  })();
  const router = useRouter();
  const name = displayName(session.user, 'Student');
  // Same reason as Settings: an Apple user can have no email on record.
  const email = accountSubtitle(session.user);
  const { locale, t } = useI18n();

  const navigate = (path: string) => {
    if (path === '/' || PRIMARY_ITEMS.some((item) => item.path === path)) {
      router.replace(path as any);
    } else {
      router.push(path as any);
    }
  };

  return (
    <View
      style={[
        styles.sidebar,
        { backgroundColor: colors.card, borderRightColor: colors.line },
      ]}
    >
      {/* The upgrade sheet lives here so the sidebar can answer the
          Canvas offer in place instead of navigating away. */}
      <ProUpsellSheet
        visible={canvasUpsellOpen}
        reason="canvas"
        onClose={() => setCanvasUpsellOpen(false)}
      />
      <View style={styles.brandBlock}>
        {/* The app icon itself, not a letter standing in for it. A 128px copy
            of assets/images/icon.png rather than the 1MB 1024px original —
            this renders at 38pt and the full-size icon would be a megabyte of
            web bundle for a thumbnail. */}
        <Image
          source={require('../assets/images/logo-mark.png')}
          style={styles.brandMark}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <View style={styles.brandCopy}>
          <Text style={[styles.brandName, { color: colors.ink }]}>Semora</Text>
          {/* Which plan this account is on, where the tagline used to be. A
              static "STUDENT OS" said the same thing to everyone and so said
              nothing; the plan is the one fact about the account that changes
              what the app will let you do. Brand colour for Pro, muted for
              Free — a free account should read as a state, not as a warning. */}
          <Text
            style={[styles.brandPlan, { color: isPro ? colors.brand : colors.ink3 }]}
          >
            ({t(isPro ? 'Pro' : 'Free')})
          </Text>
        </View>
        {/* Hide the rail. It sits on the wordmark's line because that is the
            one row of the sidebar that is never a destination — putting it
            beside a nav item would make it look like one. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Hide sidebar')}
          onPress={() => setCollapsed(true)}
          style={({ pressed, hovered }: any) => [
            styles.railToggle,
            hovered && { backgroundColor: colors.paper },
            pressed && { opacity: 0.6 },
          ]}
        >
          <FontAwesome name="angle-double-left" size={20} color={colors.ink3} />
        </Pressable>
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

      {/* Search used to sit here, under New task. It moved to the top bar —
          see TopBar. One search, in the place a browser-shaped app puts it,
          rather than one field that appeared in the rail and a second that
          replaced it whenever the rail was hidden. */}

      <ScrollView
        style={styles.navScroll}
        contentContainerStyle={styles.navScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.navGroup}>
          {canvasOffer !== 'healthy' && (
            <CanvasOfferImpression screen="web_sidebar" offer={canvasOffer} free={canvasFree} source="web_sidebar" />
          )}
          {primaryItems.map((item) => (
            <SidebarItem
              key={item.path}
              item={item}
              active={isActive(pathname, item)}
              onPress={() => {
                // The sidebar is the longest-lived Canvas surface in the app —
                // it is on screen for the whole desktop session — and it fired
                // nothing at all, so every arrival from it was attributed to
                // 'settings' by default.
                if (isCanvasItem(item)) {
                  trackCanvasOfferTapped({
                    screen: 'web_sidebar', offer: canvasOffer, free: canvasFree, source: 'web_sidebar',
                  });
                  const to = canvasOfferDestination(canvasOffer, 'web_sidebar');
                  if (to.kind === 'upsell') { setCanvasUpsellOpen(true); return; }
                  const qs = new URLSearchParams(to.params).toString();
                  navigate(`${to.pathname}?${qs}`);
                  return;
                }
                navigate(item.path);
              }}
            />
          ))}
        </View>

        {/* Collapsible. Five primary links, six tools, support and the account
            row overflowed the rail on a 900px-tall window: the last tool was
            clipped mid-row at the fold, which reads as a rendering fault
            rather than as a list that scrolls. Most sessions use one or two of
            these, so the group folds and remembers the choice. */}
        <Pressable
          onPress={() => setSidebarToolsOpen(!toolsOpen)}
          style={styles.groupHeader}
          accessibilityRole="button"
          accessibilityState={{ expanded: toolsOpen }}
          accessibilityLabel={toolsOpen ? 'Collapse study tools' : 'Expand study tools'}
        >
          <Text style={[styles.groupLabel, { color: colors.ink3 }]}>STUDY TOOLS</Text>
          <FontAwesome
            name={toolsOpen ? 'angle-up' : 'angle-down'}
            size={14}
            color={colors.ink3}
          />
        </Pressable>
        {toolsOpen && (
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
        )}
      </ScrollView>

      <View style={[styles.accountArea, { borderTopColor: colors.line }]}>
        {/* Support sits ABOVE the account row: it is what someone looks for when
            something has gone wrong, and the account row is where the eye already is.

            Opens the marketing support FORM, not a `mailto:` — mirroring the app
            (openSupport in app/(tabs)/me.tsx). A mailto does nothing at all on a
            machine with no mail client configured, and the page cannot tell, so the
            click just appears dead. The form posts to Supabase, so the message is
            stored before any email is attempted and reaches us either way.

            New tab: someone mid-scan should not lose the page they were on in order
            to ask a question about it. */}
        {/* The browser is where students land, but the phone is where the app is
            actually used — a syllabus gets photographed, not uploaded from a
            laptop. The marketing site has carried a "Get the app" link in its
            nav all along; the signed-in app never did, so the people most
            likely to install it were the only ones never asked.

            Sits directly above Help & feedback because both leave the app for
            semoraai.com, and grouping the two exits keeps the rail's routes and
            its off-ramps visually separate. */}
        <SidebarItem
          item={{ label: 'Get the app', icon: 'mobile', path: GET_APP_PATH }}
          active={false}
          onPress={() => {
            track('get_app_opened', { screen: 'web_sidebar' });
            if (typeof window !== 'undefined') {
              // `from=app` for the same reason as support below: the site is a
              // different origin and cannot see that this visitor is signed in.
              const path = locale === 'es' ? '/es/descargar' : '/download';
              window.open(`${MARKETING_URL}${path}?from=app`, '_blank', 'noopener,noreferrer');
            }
          }}
        />
        <SidebarItem
          item={{ label: 'Help & feedback', icon: 'life-ring', path: SUPPORT_PATH }}
          active={false}
          onPress={() => {
            track('support_opened', { screen: 'web_sidebar', topic: 'general' });
            if (typeof window !== 'undefined') {
              // `from=app` tells the marketing site this visitor is signed in, which
              // it cannot work out for itself — different origin, and the session
              // lives in the app's storage. It uses it to offer a way back to the
              // dashboard instead of a "Sign in" button meant for strangers.
              const path = locale === 'es' ? '/es/ayuda' : '/support';
              window.open(`${MARKETING_URL}${path}?from=app`, '_blank', 'noopener,noreferrer');
            }
          }}
        />
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
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const [searchOpen, setSearchOpen] = useState(false);
  const immersive = IMMERSIVE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const showShell = Platform.OS === 'web' && isDesktop && !!session && !immersive;
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useShellChrome({ enabled: showShell, openSearch });

  if (!showShell || !session) return <>{children}</>;

  return (
    <View style={styles.shell}>
      {!collapsed && <DesktopSidebar session={session} />}
      <View style={styles.main}>
        <TopBar collapsed={collapsed} onSearch={openSearch} />
        <View style={styles.mainContent}>{children}</View>
      </View>
      {/* Mounted by the shell, not by the bar. It has to outlive the row that
          opened it — the palette navigates, and a panel owned by a component
          that re-renders underneath the navigation closes itself mid-jump. */}
      <CommandPalette visible={searchOpen} onClose={() => setSearchOpen(false)} />
    </View>
  );
}

/**
 * The bar across the top of the content area, and the only home search has.
 *
 * It began as a header that appeared ONLY while the rail was hidden, because
 * the rail carried its own search field. That meant search lived in two places
 * that were never both on screen, and moved sideways across the window
 * whenever the rail was toggled — a control you hunt for is a control you stop
 * using. Now the bar is always here and the rail carries no search at all.
 *
 * It also replaced a pair of buttons floating over the page. Floating meant
 * they shared coordinates with whatever the screen had drawn at its top-left —
 * on Today that was the title and the date line, and the buttons sat on top of
 * both. A row in the layout cannot overlap anything by construction: the screen
 * below simply starts under it.
 *
 * GlobalSearchButton still renders nothing on desktop; this is the one.
 */
function TopBar({ collapsed, onSearch }: { collapsed: boolean; onSearch: () => void }) {
  const colors = useColors();
  const { t } = useI18n();
  const setCollapsed = useAppStore((s) => s.setSidebarCollapsed);
  return (
    <View
      style={[
        styles.topBar,
        { backgroundColor: colors.card, borderBottomColor: colors.line },
      ]}
    >
      {/* Out of flow on purpose. As a flex sibling it would push the search
          field off-centre by half its own width, so the field would visibly
          shift every time the rail was toggled — which is the exact wobble
          this bar exists to remove. Absolute keeps the centre the centre. */}
      {collapsed && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Show sidebar')}
          onPress={() => setCollapsed(false)}
          style={({ pressed, hovered }: any) => [
            styles.topBarIcon,
            hovered && { backgroundColor: colors.paper },
            pressed && { opacity: 0.65 },
          ]}
        >
          <FontAwesome name="bars" size={17} color={colors.ink2} />
        </Pressable>
      )}

      <Pressable
        accessibilityRole="search"
        // Opens in place. This used to push /search, which unmounted whatever
        // you were reading to show you a filter screen you then had to navigate
        // back out of — the cost of a glance was losing your place.
        onPress={onSearch}
        style={({ pressed, hovered }: any) => [
          styles.topBarSearch,
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
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    // Centres the search field across the content area. The rail toggle is
    // absolutely positioned so it cannot participate here and pull the field
    // off-centre.
    justifyContent: 'center',
    height: 58,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    flexShrink: 0,
    position: 'relative',
  },
  topBarIcon: {
    position: 'absolute',
    left: 16,
    // (58 - 36) / 2. Stated rather than inherited: an absolutely positioned
    // child's static position comes from the parent's alignItems, which is a
    // corner of the flexbox spec worth not betting a misaligned icon on.
    top: 11,
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '120ms',
  } as any,
  topBarSearch: {
    // Grows into the free space, stops at 520, and the leftover space either
    // side is what justifyContent centres. A search field stretched across a
    // 2560px monitor reads as an empty page element rather than a control.
    flex: 1,
    maxWidth: 520,
    // Never narrower than the rail toggle it has to clear on a small window.
    minWidth: 0,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    transitionProperty: 'border-color',
    transitionDuration: '160ms',
  } as any,
  railToggle: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '120ms',
  } as any,
  brandCopy: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  brandPlan: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingRight: 9,
  },
  shell: {
    flex: 1,
    minHeight: '100vh',
    flexDirection: 'row',
  } as any,
  main: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
  },
  mainContent: {
    flex: 1,
    minHeight: 0,
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
    // No background and no glow: the icon ships its own dark plate and its
    // own corner radius. The old purple square and purple-tinted shadow were
    // scaffolding for the letter "S" that used to sit on them.
    borderRadius: 11,
  },
  brandName: {
    fontFamily: FONTS.displaySemibold,
    fontSize: 19,
    lineHeight: 21,
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
  // searchButton went with the rail's search field. searchText/searchShortcut
  // stay — the top bar still uses them.
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
