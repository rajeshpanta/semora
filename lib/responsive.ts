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
