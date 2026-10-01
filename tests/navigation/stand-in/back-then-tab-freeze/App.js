// Scratch probe for react-native-screens issue #4361 on 4.16.0.
// Mirrors the SHAPE of Semora's navigation with the repo's installed library versions:
//   <Stack screenOptions={{ headerBackTitle: 'Back' }}>      @react-navigation/native-stack 7.14.11
//     Tabs    headerShown:false  -> @react-navigation/bottom-tabs 7.15.9 (JS tab bar), options copied
//             from app/(tabs)/_layout.tsx (absolute tab bar, BlurView background, haptic on tabPress,
//             defaults for lazy / freezeOnBlur / detachInactiveScreens, expo-router's tabRouterOverride)
//     Detail  native header, native Back button
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CommonActions, NavigationContainer, StackActions, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { tabRouterOverride } from 'expo-router/build/layouts/TabRouter';

const navRef = createNavigationContainerRef();
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ---- event log: timestamps are Date.now() (same clock as the test runner on a simulator) ----
const EV = [];
let status = { routes: 'Tabs', tab: 'A' };
const subs = new Set();
let timer = null;
function publish() {
  // Debounced: the on-screen log is only re-rendered 600 ms after the LAST event, so the probe
  // itself adds no React commit inside the race window being measured.
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { subs.forEach((f) => f()); }, 600);
}
function log(name) {
  const t = Date.now();
  EV.push(`${t}:${name}`);
  if (EV.length > 70) EV.shift();
  console.log('[probe]', t, name);
  publish();
}

// ---- programmatic tab press -------------------------------------------------------------------
// XCUITest cannot deliver two separate touches less than ~270 ms apart on this Xcode, so for the
// short delays the SECOND action is fired by a JS timer. It runs the exact code the stock tab bar
// runs in its onPress (BottomTabBar.tsx:398-411): emit 'tabPress', then dispatch navigate with the
// tab navigator as target. `prog` = delay in ms after the pop action; -1 = off (real touches only).
const PROGS = [-1, 0, 50, 100, 200, 300, 500];
let prog = -1;
let popCount = 0;
let armsLeft = 0; // one programmatic press per trial: re-armed only when rowA pushes Detail
let tabBarApi = null; // { navigation, state } of the tab navigator, captured from the tabBar prop
function pressTabProgrammatically(name) {
  const api = tabBarApi;
  if (!api) { log('progTabPress:NO_API'); return; }
  const { navigation, state } = api;
  const index = state.routes.findIndex((r) => r.name === name);
  const route = state.routes[index];
  const focused = index === state.index;
  log(`progTabPress:${name}`);
  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
  if (!focused && !event.defaultPrevented) {
    navigation.dispatch({ ...CommonActions.navigate(route), target: state.key });
  }
}
function armAfterPop(msFromNow) {
  if (prog < 0 || armsLeft < 1) return;
  armsLeft = 0;
  popCount += 1;
  const name = popCount % 2 === 1 ? 'B' : 'C';
  if (armMode === 'goback') {
    // extra case: JS removes the screen (navigation.goBack / router.back) while the NATIVE pop is still animating
    log(`armedGoBack:in${msFromNow}`);
    setTimeout(() => {
      const n = navRef.getRootState().routes.length;
      log(`progGoBack:routes=${n}`);
      if (n > 1) navRef.dispatch(StackActions.pop());
    }, msFromNow);
    return;
  }
  log(`armed:${name}:in${msFromNow}`);
  setTimeout(() => pressTabProgrammatically(name), msFromNow);
}
// stress (a): programmatic tab press `prog` ms after a row press pushes Detail
function armAfterPush() {
  if (prog < 0 || armsLeft < 1) return;
  armsLeft = 0;
  popCount += 1;
  const name = popCount % 2 === 1 ? 'B' : 'C';
  log(`armedAfterPush:${name}:in${prog}`);
  setTimeout(() => pressTabProgrammatically(name), prog);
}
let armMode = 'pop'; // 'pop' | 'push'

function ProgControl() {
  const [, setN] = useState(0);
  return (
    <View style={styles.progWrap}>
      <Pressable
        testID="prog"
        accessibilityLabel={`prog:${prog}`}
        accessibilityRole="button"
        onPress={() => { prog = PROGS[(PROGS.indexOf(prog) + 1) % PROGS.length]; popCount = 0; log(`cfg:prog=${prog}`); setN((n) => n + 1); }}
        style={styles.progBtn}
      >
        <Text style={styles.progText}>{`prog:${prog}`}</Text>
      </Pressable>
      <Pressable
        testID="mode"
        accessibilityLabel={`mode:${armMode}`}
        accessibilityRole="button"
        onPress={() => { armMode = armMode === 'pop' ? 'push' : armMode === 'push' ? 'goback' : 'pop'; popCount = 0; log(`cfg:mode=${armMode}`); setN((n) => n + 1); }}
        style={styles.progBtn}
      >
        <Text style={styles.progText}>{`mode:${armMode}`}</Text>
      </Pressable>
      {/* lives OUTSIDE the navigator: pushes Detail without touching any tab content (recovery test) */}
      <Pressable
        testID="ctlpush"
        accessibilityLabel="ctlpush"
        accessibilityRole="button"
        onPress={() => { log('press:ctlpush'); armsLeft = 0; navRef.dispatch(StackActions.push('Detail', { from: 'ctl' })); }}
        style={styles.progBtn}
      >
        <Text style={styles.progText}>ctlpush</Text>
      </Pressable>
    </View>
  );
}

function EvLog() {
  const [, setN] = useState(0);
  useEffect(() => { const f = () => setN((n) => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  const st = `status|routes=${status.routes}|tab=${status.tab}|`;
  return (
    <View pointerEvents="none" style={styles.evWrap}>
      <Text testID="status" accessibilityLabel={st} style={styles.ev}>{st}</Text>
      <Text testID="evlog" accessibilityLabel={`evlog|${EV.join('|')}`} style={styles.ev} numberOfLines={1}>{`ev ${EV.length}`}</Text>
    </View>
  );
}

function Counter({ id }) {
  const [n, setN] = useState(0);
  return (
    <Pressable
      testID={id}
      accessibilityLabel={`${id}:${n}`}
      accessibilityRole="button"
      onPress={() => { log(`press:${id}:${n + 1}`); setN(n + 1); }}
      style={styles.btn}
    >
      <Text style={styles.btnText}>{`${id}:${n}`}</Text>
    </Pressable>
  );
}

function Btn({ id, onPress }) {
  return (
    <Pressable
      testID={id}
      accessibilityLabel={id}
      accessibilityRole="button"
      onPress={() => { log(`press:${id}`); onPress(); }}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.5 }]}
    >
      <Text style={styles.btnText}>{id}</Text>
    </Pressable>
  );
}

function makeTab(name) {
  return function TabScreen({ navigation }) {
    const insets = useSafeAreaInsets();
    useEffect(() => { log(`mount:Tab${name}`); return () => log(`unmount:Tab${name}`); }, []);
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 40 }]}>
        <Text style={styles.h}>{`TAB ${name}`}</Text>
        <Counter id={`c${name}`} />
        {/* a row that pushes a headered screen onto the ROOT stack, like a course/task row */}
        <Btn id={`row${name}`} onPress={() => { armsLeft = name === 'A' ? 1 : 0; navigation.getParent().push('Detail', { from: name }); if (armMode === 'push') armAfterPush(); }} />
      </View>
    );
  };
}
const TabA = makeTab('A');
const TabB = makeTab('B');
const TabC = makeTab('C');

function TabIcon({ name, color, focused }) {
  return (
    <View style={[styles.iconWrap, focused && { backgroundColor: '#ede9fe' }]}>
      <FontAwesome name={name} size={18} color={color} />
    </View>
  );
}

function TabsNav({ navigation }) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const a = navigation.addListener('transitionStart', (e) => log(`tStart:Tabs:${e.data.closing ? 'closing' : 'opening'}`));
    const b = navigation.addListener('transitionEnd', (e) => log(`tEnd:Tabs:${e.data.closing ? 'closing' : 'opening'}`));
    return () => { a(); b(); };
  }, [navigation]);
  return (
    <Tab.Navigator
      UNSTABLE_router={tabRouterOverride}
      tabBar={(props) => { tabBarApi = props; return <BottomTabBar {...props} />; }}
      screenOptions={{
        tabBarActiveTintColor: '#7c3aed',
        tabBarInactiveTintColor: '#888',
        headerShown: false,
        tabBarBackground: () => (
          <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
        ),
        tabBarStyle: {
          display: 'flex',
          position: 'absolute',
          backgroundColor: 'rgba(250,249,245,0.92)',
          borderTopWidth: 0.5,
          borderTopColor: '#ddd',
          paddingBottom: insets.bottom,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500', marginTop: 2 },
      }}
      screenListeners={({ route }) => ({
        tabPress: () => {
          log(`tabPress:${route.name}`);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
        focus: () => log(`tabFocus:${route.name}`),
      })}
    >
      <Tab.Screen name="A" component={TabA} options={{ title: 'A', tabBarAccessibilityLabel: 'tab-A', tabBarIcon: (p) => <TabIcon name="sun-o" {...p} /> }} />
      <Tab.Screen name="B" component={TabB} options={{ title: 'B', tabBarAccessibilityLabel: 'tab-B', tabBarIcon: (p) => <TabIcon name="book" {...p} /> }} />
      <Tab.Screen name="C" component={TabC} options={{ title: 'C', tabBarAccessibilityLabel: 'tab-C', tabBarIcon: (p) => <TabIcon name="user" {...p} /> }} />
    </Tab.Navigator>
  );
}

function Detail({ navigation, route }) {
  useEffect(() => {
    log('mount:Detail');
    const a = navigation.addListener('transitionStart', (e) => log(`tStart:Detail:${e.data.closing ? 'closing' : 'opening'}`));
    const b = navigation.addListener('transitionEnd', (e) => log(`tEnd:Detail:${e.data.closing ? 'closing' : 'opening'}`));
    return () => { a(); b(); log('unmount:Detail'); };
  }, [navigation]);
  return (
    <View style={styles.screen}>
      <Text style={styles.h}>{`DETAIL from ${route.params?.from}`}</Text>
      <Counter id="cD" />
      <Btn id="d-back" onPress={() => { navigation.goBack(); if (armMode === 'pop') armAfterPop(prog); }} />
    </View>
  );
}

function describe(s) {
  const routes = s.routes.map((r) => r.name).join('>');
  const tabs = s.routes[0]?.state;
  const tab = tabs ? tabs.routes[tabs.index ?? 0].name : status.tab;
  return { routes, tab };
}

export default function App() {
  return (
    <SafeAreaProvider>
      {/* same check the upstream reporter used: does ANY touch reach JS? */}
      <View
        style={{ flex: 1 }}
        onTouchStart={(e) => {
          const x = Math.round(e.nativeEvent.pageX), y = Math.round(e.nativeEvent.pageY);
          log(`touch@${x},${y}`);
          if ((armMode === 'pop' || armMode === 'goback') && status.routes === 'Tabs>Detail') {
            // the test's native Back tap lifts 40 ms after touch-down; its edge swipe lifts 320 ms after
            if (y < 110 && x < 120) armAfterPop(40 + prog);
            else if (x < 10) armAfterPop(320 + prog);
          }
        }}
      >
        <NavigationContainer
          ref={navRef}
          onStateChange={(s) => { status = describe(s); log(`nav:${status.routes}/${status.tab}`); }}
        >
          <Stack.Navigator screenOptions={{ headerBackTitle: 'Back' }}>
            <Stack.Screen name="Tabs" component={TabsNav} options={{ headerShown: false }} />
            <Stack.Screen name="Detail" component={Detail} options={{ title: 'Detail' }} />
          </Stack.Navigator>
        </NavigationContainer>
        <EvLog />
        <ProgControl />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 10, backgroundColor: '#fff' },
  h: { fontSize: 18, fontWeight: '700' },
  btn: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  iconWrap: { width: 36, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  evWrap: { position: 'absolute', left: 16, right: 16, bottom: 150 },
  progWrap: { position: 'absolute', left: 16, bottom: 100, flexDirection: 'row', gap: 12 },
  progBtn: { backgroundColor: '#444', borderRadius: 6, paddingVertical: 10, paddingHorizontal: 12, minWidth: 100 },
  progText: { color: '#fff', fontSize: 12 },
  ev: { fontSize: 8, color: '#777' },
});
