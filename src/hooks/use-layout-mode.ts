import { useWindowDimensions } from 'react-native';

/**
 * At/above this width (iPad portrait, tablets, laptops, desktop) the reader and chat sit side-by-side
 * in a split-pane layout. Below it we use the mobile draggable bottom sheet.
 *
 * 768 matches iPad portrait — large enough for two columns to read well.
 */
export const WIDE_BREAKPOINT = 768;

export type LayoutMode = 'wide' | 'narrow';

/** Returns the active layout mode, recomputed on viewport resize. */
export function useLayoutMode(): LayoutMode {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT ? 'wide' : 'narrow';
}
