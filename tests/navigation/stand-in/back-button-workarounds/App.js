// Scratch probe (vmit). Structural twin of the Semora root layout, same JS library versions:
//   <NativeStack screenOptions={{ headerBackTitle:'Back', headerStyle, headerTintColor, contentStyle }}>
//     Tabs    headerShown:false, holds @react-navigation/bottom-tabs (JS tabs, headerShown:false)   == "(tabs)"
//     Detail  native header, native Back                                                       == course/[id], task/[id] ...
//     Deep    native header, pushed from Detail                                                == second level
//   Detail can navigation.replace('Tabs') to create the duplicate header-less route (router.replace('/(tabs)')).
// A MODE picked on a setup screen (before the navigator mounts) applies one candidate workaround.
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef, usePreventRemove } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const navRef = createNavigationContainerRef();
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const log = (...a) => console.log('[vmit]', ...a);

// ---- tiny store for the status line -------------------------------------------------------
const store = { mode: null, routes: 'Tabs', hl: 0, ev: 0, listeners: new Set(), snap: '' };
function recompute() { store.snap = `status m=${store.mode} r=${store.routes} hl=${store.hl} ev=${store.ev} end`; }
recompute();
function setStore(patch) { Object.assign(store, patch); recompute(); store.listeners.forEach((l) => l()); }
const subscribe = (l) => { store.listeners.add(l); return () => store.listeners.delete(l); };
const useStatus = () => useSyncExternalStore(subscribe, () => store.snap);

const MODES = ['base', 'A', 'A44', 'Ap', 'A44p', 'Ag', 'B', 'C1', 'C2', 'C3', 'D1', 'D2', 'D3', 'E1', 'E1f', 'E2', 'G1', 'G2', 'D1t', 'D3t', 'E1g', 'Efg'];
const isA = (m) => m === 'A' || m === 'A44' || m === 'Ap' || m === 'A44p' || m === 'Ag';

function Btn({ id, onPress, label, style }) {
  return (
    <Pressable testID={id} accessibilityLabel={id} accessibilityRole="button"
      onPress={() => { log('press', id); onPress(); }}
      style={({ pressed }) => [styles.btn, style, pressed && { opacity: 0.5 }]}>
      <Text style={styles.btnText}>{label ?? id}</Text>
    </Pressable>
  );
}
function Counter({ id, style }) {
  const [n, setN] = useState(0);
  return (
    <Pressable testID={id} accessibilityLabel={`${id}:${n}`} accessibilityRole="button"
      onPress={() => { log('press', id, n + 1); setN(n + 1); }} style={[styles.btn, style]}>
      <Text style={styles.btnText}>{`${id}:${n}`}</Text>
    </Pressable>
  );
}

// ---- candidate A: the JS back control ------------------------------------------------------
function JSBack({ navigation, mode }) {
  const min44 = mode === 'A44' || mode === 'A44p';
  const probe = mode === 'Ap' || mode === 'A44p';
  return (
    <Pressable testID="js-back" accessibilityLabel="js-back" accessibilityRole="button" hitSlop={12}
      onPress={() => {
        log('press js-back');
        if (probe) setStore({ hl: store.hl + 1 });
        else if (mode === 'Ag') { if (navRef.canGoBack()) navRef.goBack(); }   // global, like expo-router's router.back()
        else navigation.goBack();                                                // bound to this screen's route
      }}
      style={({ pressed }) => [styles.jsBack, min44 && { minWidth: 44, minHeight: 44 }, pressed && { opacity: 0.35 }]}>
      <View style={styles.chev} />
      <Text style={styles.jsBackText}>Back</Text>
    </Pressable>
  );
}

// ---- per-screen workarounds (E*, G1) --------------------------------------------------------
function PreventRemove({ navigation }) {
  usePreventRemove(true, ({ data }) => { log('preventRemove -> dispatch'); setStore({ ev: store.ev + 1 }); navigation.dispatch(data.action); });
  return null;
}
function usePushedWorkaround(navigation, name) {
  const mode = store.mode;
  const n = useRef(0);
  useEffect(() => {
    if (mode === 'E1' || mode === 'E2') {
      return navigation.addListener('transitionEnd', (e) => {
        if (e.data?.closing) return;
        n.current += 1; setStore({ ev: store.ev + 1 });
        if (mode === 'E1') {
          log(name, 'E1 toggle headerBackVisible false->undefined');
          navigation.setOptions({ headerBackVisible: false });
          setTimeout(() => navigation.setOptions({ headerBackVisible: undefined }), 80);
        } else {
          const t = n.current % 2 ? 'Back ' : 'Back';
          log(name, 'E2 headerBackTitle ->', JSON.stringify(t));
          navigation.setOptions({ headerBackTitle: t });
        }
      });
    }
    if (mode === 'E1f') {
      return navigation.addListener('focus', () => {
        setStore({ ev: store.ev + 1 });
        log(name, 'E1f toggle on focus');
        navigation.setOptions({ headerBackVisible: false });
        setTimeout(() => navigation.setOptions({ headerBackVisible: undefined }), 80);
      });
    }
    return undefined;
  }, [navigation, mode, name]);
}

// ---- screens -------------------------------------------------------------------------------
function TabScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const id = route.name.toLowerCase();
  const stack = navigation.getParent();
  return (
    <View style={{ flex: 1, backgroundColor: '#faf9f5' }}>
      <View style={{ paddingTop: insets.top + 56, paddingHorizontal: 16, gap: 8 }}>
        <Text style={styles.h} accessibilityLabel={`${id}-title insetTop=${insets.top}`}>{`TAB ${id}`}</Text>
        <Counter id={`${id}-count`} />
        <Btn id={`${id}-go-detail`} onPress={() => stack.push('Detail')} />
        <Btn id={`${id}-go-modal`} onPress={() => stack.push('NewCourse')} />
      </View>
      {/* fixed position inside the band a native navigation bar would occupy */}
      <Counter id={`${id}-top`} style={{ position: 'absolute', top: insets.top + 6, left: 16, width: 150 }} />
      {/* probes that follow the NATIVE safe area (they move if a native bar starts insetting the screen) */}
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, right: 8 }} pointerEvents="none">
        <Text accessibilityLabel={`${id}-sav`} style={styles.tiny}>sav</Text>
      </SafeAreaView>
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ position: 'absolute', top: 0, right: 48, width: 60, height: 220 }} pointerEvents="none">
        <Text accessibilityLabel={`${id}-scr`} style={styles.tiny}>scr</Text>
      </ScrollView>
    </View>
  );
}
function TabsRoute() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="T1" component={TabScreen} />
      <Tab.Screen name="T2" component={TabScreen} />
      <Tab.Screen name="T3" component={TabScreen} />
    </Tab.Navigator>
  );
}
function Detail({ navigation }) {
  usePushedWorkaround(navigation, 'Detail');
  return (
    <View style={styles.screen}>
      {store.mode === 'G1' ? <PreventRemove navigation={navigation} /> : null}
      <Text style={styles.h}>DETAIL</Text>
      <Counter id="d-count" />
      <Btn id="d-go-deep" onPress={() => navigation.push('Deep')} />
      <Btn id="d-replace-tabs" onPress={() => navigation.replace('Tabs')} />
      <Btn id="d-jsback" onPress={() => navigation.goBack()} />
      <Btn id="d-go-modal" onPress={() => navigation.push('NewCourse')} />
    </View>
  );
}
// Semora has ~9 routes like this: presentation:'modal' with a title (course/new, task/new, semester/new ...)
function NewCourse({ navigation }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.h}>NEW COURSE FORM</Text>
      <Counter id="m-count" />
      <Btn id="m-close" onPress={() => navigation.goBack()} />
    </View>
  );
}
function Deep({ navigation }) {
  usePushedWorkaround(navigation, 'Deep');
  return (
    <View style={styles.screen}>
      {store.mode === 'G1' ? <PreventRemove navigation={navigation} /> : null}
      <Text style={styles.h}>DEEP</Text>
      <Counter id="dd-count" />
      <Btn id="dd-jsback" onPress={() => navigation.goBack()} />
    </View>
  );
}

// ---- options per mode ----------------------------------------------------------------------
const SEMORA = { headerBackTitle: 'Back', headerStyle: { backgroundColor: '#ffffff' }, headerTintColor: '#1a1a1a', contentStyle: { backgroundColor: '#faf9f5' } };
function screenOptionsFor(mode) {
  if (isA(mode)) return ({ navigation }) => ({ ...SEMORA, headerBackVisible: false, headerLeft: (p) => (p.canGoBack ? <JSBack navigation={navigation} mode={mode} /> : null) });
  if (mode === 'B') return { ...SEMORA, headerBackButtonMenuEnabled: false };
  if (mode === 'C1') return { ...SEMORA, headerBackButtonDisplayMode: 'minimal' };
  if (mode === 'C2') { const { headerBackTitle, ...rest } = SEMORA; return rest; }
  if (mode === 'C3') { const { headerBackTitle, ...rest } = SEMORA; return { ...rest, headerBackButtonDisplayMode: 'minimal' }; }
  if (mode === 'G2') return { ...SEMORA, headerBackTitleStyle: { fontSize: 17 } };
  return SEMORA;
}
function tabsOptionsFor(mode) {
  const ghost = { headerTransparent: true, title: '', headerShadowVisible: false, headerBackVisible: false, headerLeft: undefined };
  if (mode === 'D1') return { headerShown: true, ...ghost };
  if (mode === 'D2') return { headerShown: true, title: '', headerShadowVisible: false, headerBackVisible: false };
  if (mode === 'D3') return ({ navigation }) => ({ headerShown: !navigation.isFocused(), ...ghost });   // bar exists only while Tabs is covered
  // same two, but with the global opaque headerStyle overridden so the bar really is see-through
  const clear = { ...ghost, headerStyle: { backgroundColor: 'transparent' } };
  if (mode === 'D1t') return { headerShown: true, ...clear };
  if (mode === 'D3t') return ({ navigation }) => ({ headerShown: !navigation.isFocused(), ...clear });
  return { headerShown: false };
}

// E as ONE global listener on the navigator (the form an app would ship): re-create the native back button on every pushed screen
function screenListenersFor(mode) {
  if (mode !== 'E1g' && mode !== 'Efg') return undefined;
  const toggle = (navigation, route, why) => {
    if (route.name === 'Tabs') return;
    setStore({ ev: store.ev + 1 });
    log(route.name, mode, 'toggle headerBackVisible on', why);
    navigation.setOptions({ headerBackVisible: false });
    setTimeout(() => navigation.setOptions({ headerBackVisible: undefined }), 50);
  };
  if (mode === 'E1g') return ({ navigation, route }) => ({ transitionEnd: (e) => { if (!e.data?.closing) toggle(navigation, route, 'transitionEnd'); } });
  return ({ navigation, route }) => ({ focus: () => toggle(navigation, route, 'focus') });
}

function Nav({ mode }) {
  return (
    <NavigationContainer ref={navRef} onStateChange={(s) => { const r = s.routes.map((x) => x.name).join('>'); log('nav', r); setStore({ routes: r }); }}>
      <Stack.Navigator screenOptions={screenOptionsFor(mode)} screenListeners={screenListenersFor(mode)}>
        <Stack.Screen name="Tabs" component={TabsRoute} options={tabsOptionsFor(mode)} />
        <Stack.Screen name="Detail" component={Detail} options={{ title: 'Detail' }} />
        <Stack.Screen name="Deep" component={Deep} options={{ title: 'Deep' }} />
        <Stack.Screen name="NewCourse" component={NewCourse} options={{ presentation: 'modal', title: 'New Course' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function Setup({ onPick }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 50, paddingHorizontal: 16, gap: 10, backgroundColor: '#fff' }}>
      <Text style={styles.h}>SETUP</Text>
      <Counter id="count" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {MODES.map((m) => (<Btn key={m} id={`mode-${m}`} label={m} style={{ width: 84, paddingVertical: 6 }} onPress={() => onPick(m)} />))}
      </View>
    </View>
  );
}
function Status() {
  const s = useStatus();
  return <Text testID="status" accessibilityLabel={s} style={styles.status} pointerEvents="none">{s}</Text>;
}

export default function App() {
  const [mode, setMode] = useState(null);
  return (
    <SafeAreaProvider>
      {mode === null ? <Setup onPick={(m) => { log('mode', m); setStore({ mode: m }); setMode(m); }} /> : <Nav mode={mode} />}
      <Status />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 8 },
  h: { fontSize: 18, fontWeight: '700' },
  btn: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  tiny: { fontSize: 10, color: '#888' },
  status: { position: 'absolute', bottom: 92, left: 6, fontSize: 9, color: '#555' },
  jsBack: { flexDirection: 'row', alignItems: 'center' },
  chev: { width: 11, height: 11, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: '#1a1a1a', transform: [{ rotate: '45deg' }], marginLeft: 4, marginRight: 5 },
  jsBackText: { fontSize: 17, color: '#1a1a1a' },
});
