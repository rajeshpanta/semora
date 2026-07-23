import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { COLORS, FONTS } from '@/lib/constants';
import { subscribeToTaskCelebration } from '@/lib/taskCelebration';

const PARTICLES = [
  { x: -132, y: -105, r: -70, c: '#6B46C1' },
  { x: -82, y: -145, r: 48, c: '#D85A30' },
  { x: -28, y: -125, r: -25, c: '#BA7517' },
  { x: 34, y: -150, r: 72, c: '#0F6E56' },
  { x: 93, y: -118, r: -55, c: '#185FA5' },
  { x: 137, y: -72, r: 42, c: '#D85A30' },
  { x: -142, y: -36, r: 65, c: '#0F6E56' },
  { x: 146, y: 5, r: -78, c: '#6B46C1' },
  { x: -116, y: 52, r: -38, c: '#185FA5' },
  { x: 108, y: 70, r: 82, c: '#BA7517' },
  { x: -55, y: 100, r: 58, c: '#D85A30' },
  { x: 57, y: 112, r: -62, c: '#0F6E56' },
] as const;

export function TaskCompletionCelebration() {
  const [title, setTitle] = useState<string | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => subscribeToTaskCelebration((taskTitle) => {
    animationRef.current?.stop();
    setTitle(taskTitle);
    progress.setValue(0);
    opacity.setValue(1);
    animationRef.current = Animated.parallel([
      Animated.timing(progress, {
        toValue: 1,
        duration: 1250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(1550),
        Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    ]);
    animationRef.current.start(({ finished }) => {
      if (finished) setTitle(null);
    });
  }), [opacity, progress]);

  const particleViews = useMemo(() => PARTICLES.map((particle, index) => (
    <Animated.View
      key={index}
      style={[
        styles.particle,
        {
          backgroundColor: particle.c,
          opacity: progress.interpolate({ inputRange: [0, 0.08, 0.82, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, particle.x] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, particle.y] }) },
            { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${particle.r}deg`] }) },
            { scale: progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.2, 1, 0.75] }) },
          ],
        },
      ]}
    />
  )), [progress]);

  if (!title) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.overlay, { opacity }]}> 
      <View style={styles.burst}>{particleViews}</View>
      <Animated.View
        style={[
          styles.card,
          {
            transform: [{ scale: progress.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0.72, 1.04, 1] }) }],
          },
        ]}
        accessibilityLiveRegion="polite"
      >
        <View style={styles.check}><FontAwesome name="check" size={25} color="#fff" /></View>
        <Text style={styles.title}>Nice work!</Text>
        <Text style={styles.task} numberOfLines={2}>{title}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 9999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,11,36,0.12)' },
  burst: { position: 'absolute', width: 1, height: 1, alignItems: 'center', justifyContent: 'center' },
  particle: { position: 'absolute', width: 11, height: 22, borderRadius: 3 },
  card: { width: 250, borderRadius: 24, backgroundColor: '#fff', paddingVertical: 24, paddingHorizontal: 22, alignItems: 'center', shadowColor: '#0c0b24', shadowOpacity: 0.2, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 12 },
  check: { width: 54, height: 54, borderRadius: 27, backgroundColor: COLORS.teal, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontFamily: FONTS.display, fontSize: 26, color: COLORS.ink },
  task: { marginTop: 5, fontSize: 14, lineHeight: 19, color: COLORS.ink2, textAlign: 'center', fontWeight: '600' },
});
