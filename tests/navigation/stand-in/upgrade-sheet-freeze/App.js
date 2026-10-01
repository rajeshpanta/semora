// Scratch probe. Mirrors the SHAPE of the Semora root layout with the same library versions:
//   <Host>            one RN <Modal> mounted once, after {children}, above the navigator  (ProUpsellHost)
//     <Stack>         @react-navigation/native-stack on react-native-screens
//       Home          headerShown:false                         ((tabs))
//       Detail        card with native header, Back title "Back" (task/[id], course/[id] ...)
//       NewCourse     presentation:'modal' with a title          (course/new, task/new ...)
//       Paywall       presentation:'fullScreenModal', no header  (paywall)
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { TouchableOpacity } from 'react-native';

const navRef = createNavigationContainerRef();
const Stack = createNativeStackNavigator();
const HostCtx = createContext({ show: () => {}, log: () => {} });

const log = (...a) => console.log('[probe]', ...a);

function Btn({ id, onPress, label }) {
  return (
    <Pressable
      testID={id}
      accessibilityLabel={id}
      accessibilityRole="button"
      onPress={() => { log('press', id); onPress(); }}
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.5 }]}
    >
      <Text style={styles.btnText}>{label ?? id}</Text>
    </Pressable>
  );
}

function Counter({ id }) {
  const [n, setN] = useState(0);
  return (
    <Pressable
      testID={id}
      accessibilityLabel={`${id}:${n}`}
      accessibilityRole="button"
      onPress={() => { log('press', id, n + 1); setN(n + 1); }}
      style={styles.btn}
    >
      <Text style={styles.btnText}>{`${id}:${n}`}</Text>
    </Pressable>
  );
}

function Home({ navigation }) {
  const { show } = useContext(HostCtx);
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState(false);
  const [sibling, setSibling] = useState(false);
  const [late, setLate] = useState(false);
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 60 }]}>
      <Text style={styles.h}>HOME</Text>
      <Counter id="count" />
      <Btn id="go-detail" onPress={() => navigation.push('Detail')} />
      <Btn id="go-modal" onPress={() => navigation.push('NewCourse')} />
      <Btn id="root-sheet" onPress={() => show('card')} />
      <Btn id="menu" onPress={() => setMenu(true)} />
      <Btn id="go-pills" onPress={() => navigation.push('Pills')} />
      <Btn id="late-then-modal" onPress={() => { setLate(true); setTimeout(() => { log('timer pushes modal screen'); navigation.push('NewCourse'); }, 2000); }} />
      <Btn id="root-then-modal" onPress={() => { show('card'); setTimeout(() => { log('timer pushes modal screen'); navigation.push('NewCourse'); }, 2000); }} />
      <Btn id="menu-then-late" onPress={() => { setMenu(true); setTimeout(() => { log('late timer fires'); setLate(true); }, 1200); }} />

      {/* PlusMenu shape: the upsell sheet is a SIBLING rendered BEFORE the menu modal */}
      <Modal visible={sibling} transparent animationType="fade" onRequestClose={() => setSibling(false)} onShow={() => log('sibling onShow')} onDismiss={() => log('sibling onDismiss')}>
        <View style={styles.sheetHost}><View style={styles.sheet}>
          <Text style={styles.h}>SIBLING SHEET</Text>
          <Btn id="sibling-close" onPress={() => setSibling(false)} />
        </View></View>
      </Modal>
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)} onShow={() => log('menu onShow')} onDismiss={() => log('menu onDismiss')}>
        <View style={styles.sheetHost}><View style={styles.sheet}>
          <Text style={styles.h}>MENU</Text>
          <Btn id="menu-handoff" onPress={() => { setMenu(false); setSibling(true); }} />
          <Btn id="menu-go-modal" onPress={() => { setMenu(false); navigation.push('NewCourse'); }} />
          <Btn id="menu-go-detail" onPress={() => { setMenu(false); navigation.push('Detail'); }} />
          <Btn id="menu-close" onPress={() => setMenu(false)} />
        </View></View>
      </Modal>
      {/* ProCanvasEducationSheet shape: LAST child of the screen, opened by a timer */}
      <Modal visible={late} transparent animationType="fade" onRequestClose={() => setLate(false)} onShow={() => log('late onShow')} onDismiss={() => log('late onDismiss')}>
        <View style={styles.sheetHost}><View style={styles.sheet}>
          <Text style={styles.h}>LATE SHEET</Text>
          <Btn id="late-close" onPress={() => setLate(false)} />
        </View></View>
      </Modal>
    </View>
  );
}

function Detail({ navigation }) {
  const { show } = useContext(HostCtx);
  return (
    <View style={styles.screen}>
      <Text style={styles.h}>DETAIL</Text>
      <Counter id="count2" />
      <Btn id="d-go-modal" onPress={() => navigation.push('NewCourse')} />
      <Btn id="d-root-sheet" onPress={() => show('card')} />
      <Btn id="d-back" onPress={() => navigation.goBack()} />
    </View>
  );
}

function NewCourse({ navigation }) {
  const { show } = useContext(HostCtx);
  const [own, setOwn] = useState(false);
  return (
    <View style={styles.screen}>
      <Text style={styles.h}>NEW COURSE FORM</Text>
      <Counter id="count3" />
      <Btn id="wall" onPress={() => show('course')} />
      <Btn id="close-modal" onPress={() => navigation.goBack()} />
      <Btn id="push-card" onPress={() => navigation.push('Detail')} />
      <Btn id="own-sheet" onPress={() => setOwn(true)} />
      <Btn id="alert-back" onPress={() => Alert.alert('Not the right page', 'msg', [{ text: 'Pick Another', onPress: () => { log('alert: goBack'); navigation.goBack(); } }, { text: 'Try Again', style: 'cancel' }])} />
      <Btn id="alert-open" onPress={() => Alert.alert('A lecture is still processing', 'msg', [{ text: 'OK', style: 'cancel' }, { text: 'Open it', onPress: () => { log('alert: push'); navigation.push('Detail'); } }])} />
      <Modal visible={own} transparent animationType="fade" onRequestClose={() => setOwn(false)} onShow={() => log('own onShow')} onDismiss={() => log('own onDismiss')}>
        <View style={styles.sheetHost}><View style={styles.sheet}>
          <Text style={styles.h}>OWN SHEET</Text>
          <Btn id="own-close" onPress={() => setOwn(false)} />
          <Btn id="own-close-pop" onPress={() => { setOwn(false); navigation.goBack(); }} />
          <Btn id="own-close-pop-paywall" onPress={() => { setOwn(false); navigation.goBack(); navigation.push('Paywall'); }} />
        </View></View>
      </Modal>
    </View>
  );
}

function Paywall({ navigation }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 60 }]}>
      <Text style={styles.h}>PAYWALL</Text>
      <Btn id="paywall-close" onPress={() => navigation.goBack()} />
    </View>
  );
}


// ---- The LectureRecordingBar pill, JSX and styles copied from components/LectureRecordingBar.tsx:136-205 ----
const barStyles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
  returnArea: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  divider: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.35)' },
  markBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  text: { color: '#fff', fontSize: 14, fontWeight: '600' },
  label: { flexShrink: 1 },
  time: { color: '#fff', fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
function Pill({ capturing, paused, micStopped, label, time, tail, marks, flashing, onLayout }) {
  return (
    <View onLayout={onLayout} style={[barStyles.bar, { backgroundColor: micStopped ? '#b45309' : paused ? '#52525b' : '#dc2626' }]}>
      <TouchableOpacity style={barStyles.returnArea} activeOpacity={0.85}>
        {capturing ? <View style={barStyles.dot} /> : <FontAwesome name={micStopped ? 'microphone-slash' : paused ? 'pause' : 'microphone'} size={12} color="#fff" />}
        <Text style={[barStyles.text, barStyles.label]} numberOfLines={1}>{flashing ? `Marked ${time}` : label}</Text>
        {flashing ? null : <Text style={barStyles.time} numberOfLines={1} adjustsFontSizeToFit>{time}</Text>}
        <Text style={barStyles.text} numberOfLines={1}>{tail}</Text>
      </TouchableOpacity>
      {capturing ? (<>
        <View style={barStyles.divider} />
        <TouchableOpacity hitSlop={8} style={barStyles.markBtn} activeOpacity={0.7}>
          <FontAwesome name="star" size={13} color="#fff" />
          {marks > 0 ? <Text style={barStyles.text}>{String(marks)}</Text> : null}
        </TouchableOpacity>
      </>) : null}
    </View>
  );
}
const PILLS = [
  ['en_rec_0:07', { capturing: true, label: 'Recording', time: '0:07', tail: '· Return', marks: 0 }],
  ['en_rec_23:14', { capturing: true, label: 'Recording', time: '23:14', tail: '· Return', marks: 0 }],
  ['en_rec_23:14_3marks', { capturing: true, label: 'Recording', time: '23:14', tail: '· Return', marks: 3 }],
  ['en_rec_1:02:33_12marks', { capturing: true, label: 'Recording', time: '1:02:33', tail: '· Return', marks: 12 }],
  ['en_flash_marked', { capturing: true, flashing: true, label: 'Recording', time: '23:14', tail: '· Return', marks: 3 }],
  ['en_paused_23:14', { paused: true, label: 'Recording paused', time: '23:14', tail: '· Return' }],
  ['en_paused_1:02:33', { paused: true, label: 'Recording paused', time: '1:02:33', tail: '· Return' }],
  ['en_micstopped_23:14', { micStopped: true, label: 'Mic stopped', time: '23:14', tail: '· Tap to fix' }],
  ['en_micstopped_1:02:33', { micStopped: true, label: 'Mic stopped', time: '1:02:33', tail: '· Tap to fix' }],
  ['es_rec_23:14', { capturing: true, label: 'Grabando', time: '23:14', tail: '· Volver', marks: 0 }],
  ['es_paused_23:14', { paused: true, label: 'Grabación en pausa', time: '23:14', tail: '· Volver' }],
  ['es_micstopped_23:14', { micStopped: true, label: 'Micrófono detenido', time: '23:14', tail: '· Toca para arreglarlo' }],
];
function Pills() {
  const [m, setM] = useState({});
  const json = JSON.stringify(m);
  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: 8 }}>
      {/* 1000pt-wide rows so maxWidth:'100%' never clamps: this is the NATURAL width of each pill */}
      <View style={{ width: 1000, gap: 6, alignItems: 'flex-start' }}>
        {PILLS.map(([k, p]) => (
          <Pill key={k} {...p} onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setM((o) => ({ ...o, [k]: [Math.round(width * 10) / 10, Math.round(height * 10) / 10] })); }} />
        ))}
      </View>
      <Text testID="pills" accessibilityLabel={`pills ${json}`} style={{ fontSize: 9, margin: 8 }}>{json}</Text>
    </View>
  );
}

function Host({ children }) {
  const [reason, setReason] = useState(null);
  const hostRef = useRef(null);
  const [rect, setRect] = useState('');
  useEffect(() => {
    if (reason === null) { setRect(''); return; }
    const t = setTimeout(() => {
      const node = hostRef.current;
      if (node && node.measureInWindow) {
        node.measureInWindow((x, y, w, h) => { const s = `${x},${y},${w},${h}`; log('root host measureInWindow', s); setRect(s); });
      } else { log('no host ref'); }
    }, 800);
    return () => clearTimeout(t);
  }, [reason]);
  const ctx = React.useMemo(() => ({ show: (r) => { log('show root sheet', r); setReason(r); } }), []);
  return (
    <HostCtx.Provider value={ctx}>
      {children}
      <Text testID="status" accessibilityLabel={`status reason=${reason} rect=${rect}`} style={styles.status} pointerEvents="none">
        {`reason=${reason} rect=${rect}`}
      </Text>
      <Modal ref={hostRef} visible={reason !== null} transparent animationType="fade" onRequestClose={() => setReason(null)} onShow={() => log('root onShow')} onDismiss={() => log('root onDismiss')}>
        <View style={styles.sheetHost}><View style={styles.sheet}>
          <Text style={styles.h}>ROOT SHEET</Text>
          <Btn id="sheet-close" onPress={() => setReason(null)} />
          <Btn id="sheet-continue" onPress={() => { setReason(null); navRef.navigate('Paywall'); }} />
          <Btn id="sheet-canvas" onPress={() => { setReason(null); navRef.dispatch({ type: 'PUSH', payload: { name: 'Detail' } }); }} />
        </View></View>
      </Modal>
    </HostCtx.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Host>
        <NavigationContainer ref={navRef} onStateChange={(s) => log('nav', s.routes.map((r) => r.name).join('>'))}>
          <Stack.Navigator screenOptions={{ headerBackTitle: 'Back' }}>
            <Stack.Screen name="Home" component={Home} options={{ headerShown: false }} />
            <Stack.Screen name="Detail" component={Detail} options={{ title: 'Detail' }} />
            <Stack.Screen name="Pills" component={Pills} options={{ title: 'Pills' }} />
            <Stack.Screen name="NewCourse" component={NewCourse} options={{ presentation: 'modal', title: 'New Course' }} />
            <Stack.Screen name="Paywall" component={Paywall} options={{ presentation: 'fullScreenModal', headerShown: false }} />
          </Stack.Navigator>
        </NavigationContainer>
      </Host>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 8, backgroundColor: '#fff' },
  h: { fontSize: 18, fontWeight: '700' },
  btn: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  sheetHost: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', padding: 16, paddingBottom: 40, gap: 8, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  status: { position: 'absolute', bottom: 2, left: 4, fontSize: 9, color: '#555' },
});
