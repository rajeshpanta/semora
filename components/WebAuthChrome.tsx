import { useEffect, useRef, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

// Shared visual language for every pre-auth web surface (the marketing
// homepage in app/welcome.tsx, and the (auth) screens) — dark cinematic
// backdrop, glow orbs, film grain, cursor spotlight. Kept in one place so
// "make it consistent" actually stays consistent as these surfaces evolve,
// rather than three copies of the same colors/effects drifting apart.
export const AUTH_INK_DEEP = '#0F0B1A';
export const AUTH_GLOW_LIGHT = '#C9B8FF';
export const AUTH_GLOW_MID = '#9B7AE8';

const GRAIN_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">' +
    '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/></filter>' +
    '<rect width="100%" height="100%" filter="url(#n)"/></svg>',
)}`;

export function GrainOverlay() {
  if (Platform.OS !== 'web') return null;
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundImage: `url("${GRAIN_SVG}")`,
          backgroundRepeat: 'repeat',
          opacity: 0.05,
          mixBlendMode: 'overlay',
        } as any,
      ]}
    />
  );
}

// Cursor-reactive spotlight — updates a CSS custom property imperatively on
// its parent node (no React re-render per mouse move, which would thrash).
export function CursorSpotlight() {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current as unknown as HTMLElement | null;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const onMove = (e: MouseEvent) => {
      const rect = parent.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      parent.style.setProperty('--spot-x', `${x}%`);
      parent.style.setProperty('--spot-y', `${y}%`);
    };
    parent.addEventListener('mousemove', onMove);
    return () => parent.removeEventListener('mousemove', onMove);
  }, []);

  if (Platform.OS !== 'web') return null;
  return (
    <View
      ref={ref}
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundImage:
            'radial-gradient(560px circle at var(--spot-x, 60%) var(--spot-y, 20%), rgba(155,122,232,0.18), transparent 45%)',
          transitionProperty: 'background-image',
          transitionDuration: '120ms',
        } as any,
      ]}
    />
  );
}

const glowPulse = Platform.select({
  web: { animationName: 'semoraGlowPulse', animationDuration: '6s', animationIterationCount: 'infinite', animationTimingFunction: 'ease-in-out' },
  default: {},
}) as any;

/**
 * Full-viewport dark backdrop (fixed — doesn't scroll away on a tall form)
 * with glow orbs, grain, and a cursor spotlight, plus a centered slot for
 * page content. Web-only: renders `children` untouched on native, so the
 * existing native auth screens are completely unaffected.
 */
export function WebAuthBackdrop({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={styles.backdrop}>
      <View style={[styles.orb, styles.orbA, glowPulse]} pointerEvents="none" />
      <View style={[styles.orb, styles.orbB, glowPulse, { animationDelay: '-3s' } as any]} pointerEvents="none" />
      <CursorSpotlight />
      <GrainOverlay />
      <View style={styles.contentLayer}>{children}</View>
    </View>
  );
}

// Web-only "floating glass card" treatment for the existing header+form
// container on each auth screen — additive styles merged onto the screen's
// own `inner` style, not a structural change, so native stays untouched.
export const webAuthCard = Platform.select({
  web: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingTop: 36,
    paddingBottom: 36,
    boxShadow: '0 1px 2px rgba(17,17,17,0.04), 0 40px 80px rgba(0,0,0,0.45)',
  },
  default: {},
}) as any;

const styles = StyleSheet.create({
  backdrop: {
    position: 'fixed' as any,
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: AUTH_INK_DEEP,
    overflow: 'hidden',
  },
  contentLayer: {
    flex: 1,
    // Layered above the backdrop's own children (orbs/grain/spotlight),
    // which all use pointerEvents="none" so this remains fully interactive.
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    ...Platform.select({ web: { filter: 'blur(80px)' }, default: {} }),
  } as any,
  orbA: { width: 420, height: 420, top: -160, right: -100, opacity: 0.55, backgroundColor: AUTH_GLOW_MID },
  orbB: { width: 300, height: 300, bottom: -120, left: -100, opacity: 0.4, backgroundColor: AUTH_GLOW_LIGHT },
});
