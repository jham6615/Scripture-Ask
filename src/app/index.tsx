import { useLayoutMode } from '@/hooks/use-layout-mode';
import { NarrowLayout } from '@/features/layout/narrow-layout';
import { WideLayout } from '@/features/layout/wide-layout';

/**
 * Picks the layout based on viewport width: wide (≥768) gets the desktop split-pane (reader + chat
 * side-by-side); narrow gets the mobile draggable bottom sheet. Each layout owns its own state.
 */
export default function ReaderRoute() {
  const mode = useLayoutMode();
  return mode === 'wide' ? <WideLayout /> : <NarrowLayout />;
}
