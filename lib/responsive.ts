import { useWindowDimensions } from 'react-native';

// Adaptive-layout breakpoints. Driven by useWindowDimensions so layouts
// reflow LIVE on rotation AND on iPad Split View resize — the window can be
// any width from ~320pt (a 1/3 split) up to ~1366pt (full landscape on a
// 12.9"). Never read Dimensions.get() at module load for layout; it's stale
// the moment the window resizes.

// Enough horizontal room to show two card columns comfortably.
export const WIDE_BREAKPOINT = 720;
// Big iPad landscape — room for three columns / very wide content.
export const XWIDE_BREAKPOINT = 1080;

export interface Responsive {
  width: number;
  height: number;
  isLandscape: boolean;
  /** width >= WIDE_BREAKPOINT — switch single columns to grids. */
  isWide: boolean;
  isXWide: boolean;
  /** Suggested column count for card grids. */
  columns: number;
  /** Max width for a centered content column (wider when there's room). */
  contentMaxWidth: number;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const isXWide = width >= XWIDE_BREAKPOINT;
  return {
    width,
    height,
    isLandscape: width > height,
    isWide,
    isXWide,
    columns: isXWide ? 3 : isWide ? 2 : 1,
    // Narrow stays at the readable 600; wide widens to a still-readable 800
    // (longer lines hurt forms/text). List screens use `columns` for grids
    // instead of one very wide column.
    contentMaxWidth: isWide ? Math.min(width - 48, 800) : 600,
  };
}
