import { Platform, useWindowDimensions } from 'react-native';
import { useAppStore } from '@/store/appStore';

// Adaptive-layout breakpoints. Driven by useWindowDimensions so layouts
// reflow LIVE on rotation AND on iPad Split View resize — the window can be
// any width from ~320pt (a 1/3 split) up to ~1366pt (full landscape on a
// 12.9"). Never read Dimensions.get() at module load for layout; it's stale
// the moment the window resizes.

// Enough horizontal room to show two card columns comfortably.
export const WIDE_BREAKPOINT = 720;
// Big iPad landscape — room for three columns / very wide content.
export const XWIDE_BREAKPOINT = 1080;
export const DESKTOP_SHELL_BREAKPOINT = 980;
export const WEB_SIDEBAR_WIDTH = 256;
/** Points that hold ~68 characters at the default text size. */
export const PROSE_BASE = 540;

export interface Responsive {
  width: number;
  height: number;
  isLandscape: boolean;
  /** width >= WIDE_BREAKPOINT — switch single columns to grids. */
  isWide: boolean;
  isXWide: boolean;
  /** Desktop browser layout with persistent left navigation. */
  isDesktop: boolean;
  /** Suggested column count for card grids. */
  columns: number;
  /** Max width for a centered content column (wider when there's room). */
  contentMaxWidth: number;
  /**
   * Max width for DATA-DENSE screens — the dashboard and the course grid.
   *
   * contentMaxWidth exists to stop prose from running to unreadable line
   * lengths, and 114 call sites depend on it doing exactly that. But the same
   * ceiling was also capping the two-column dashboard, which contains no
   * prose: task rows with right-aligned metadata, a rail of short labels and
   * numbers. On a 2560px monitor that pinned the layout to 1120 and left
   * roughly 590px of empty paper down each side — the narrow-strip problem the
   * two columns were built to solve, returning one breakpoint up.
   *
   * These screens get the window instead. The upper bound is generous rather
   * than absent so an ultrawide does not stretch a task list to 3000px.
   */
  deckMaxWidth: number;
  /**
   * Max width for a column of CONTINUOUS PROSE — a tutor answer, and nothing
   * else so far.
   *
   * contentMaxWidth was supposed to be this. Its own comment says it "exists
   * to stop prose from running to unreadable line lengths", and for a form or
   * a settings list it still does. But its isXWide branch was widened to 1120
   * for the two-column dashboard, and every prose caller was carried along:
   * on a 13" iPad in landscape a tutor answer was setting at roughly 123
   * characters per line, against a comfortable measure of 45–75.
   *
   * 540 puts a 15pt body at about 68 characters — the middle of that range —
   * and is below every phone width, so nothing on iPhone changes. This is a
   * separate field rather than a narrower contentMaxWidth because the 114
   * call sites that depend on the current value are not all prose.
   */
  proseMaxWidth: number;
  /**
   * fontScale clamped to 2 — the factor proseMaxWidth was grown by. Anything
   * else that has to hold text at a readable size (the thread rail) sizes off
   * this so the whole Tutor stays one rule rather than two that drift apart.
   */
  measureScale: number;
  /** Raw OS text scale, unclamped — for things that should track the text exactly. */
  fontScale: number;
}

export function useResponsive(): Responsive {
  const { width, height, fontScale } = useWindowDimensions();
  // Hiding the sidebar is only worth doing if the screen actually claims the
  // space it gave back, so the width every layout measures against has to
  // know about it. Native never sets this flag.
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_SHELL_BREAKPOINT;
  const availableWidth = isDesktop && !sidebarCollapsed ? width - WEB_SIDEBAR_WIDTH : width;
  const isWide = availableWidth >= WIDE_BREAKPOINT;
  const isXWide = availableWidth >= XWIDE_BREAKPOINT;
  // Data-heavy browser screens can use a wider canvas, while phone/tablet
  // layouts and forms retain their established readable measure.
  /**
   * A measure is a count of CHARACTERS, not a count of points. 540pt holds
   * ~68 characters at the default text size, but a student on Larger Text has
   * tripled the size of every glyph — at 540pt the same column falls to ~20
   * characters, which is far worse to read than the 126 it started at. So the
   * measure travels with the text: the character count stays put while the
   * column grows. Capped at 2x because past that no iPad is wide enough to
   * honour it and Math.min(availableWidth, ...) would be doing all the work
   * anyway. Not floored at 1 on purpose — a student on Smaller Text wants a
   * narrower column for the same reason.
   */
  const measureScale = Math.min(fontScale, 2);

  const contentMaxWidth = isXWide
    ? Math.min(availableWidth - 64, 1120)
    : isWide
      ? Math.min(availableWidth - 48, 900)
      : Math.min(availableWidth, 600);
  return {
    width,
    height,
    isLandscape: width > height,
    isWide,
    isXWide,
    isDesktop,
    columns: isXWide ? 3 : isWide ? 2 : 1,
    contentMaxWidth,
    proseMaxWidth: Math.min(availableWidth, Math.round(PROSE_BASE * measureScale)),
    measureScale,
    fontScale,
    // Only the desktop shell has the second column worth widening for; below
    // it, a dense screen is still a single column and keeps the reading
    // measure so a phone browser is unaffected.
    deckMaxWidth: isDesktop ? Math.min(availableWidth - 64, 1760) : contentMaxWidth,
  };
}

/**
 * Flex-basis for a grid item given the column count, so every grid uses
 * identical math. Slightly under 1/N to leave room for the inter-item gap.
 */
export function gridItemBasis(columns: number): '100%' | '47%' | '31%' {
  if (columns >= 3) return '31%';
  if (columns === 2) return '47%';
  return '100%';
}
