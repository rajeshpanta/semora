import { Platform, useWindowDimensions } from 'react-native';

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
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_SHELL_BREAKPOINT;
  const availableWidth = isDesktop ? width - WEB_SIDEBAR_WIDTH : width;
  const isWide = availableWidth >= WIDE_BREAKPOINT;
  const isXWide = availableWidth >= XWIDE_BREAKPOINT;
  // Data-heavy browser screens can use a wider canvas, while phone/tablet
  // layouts and forms retain their established readable measure.
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
