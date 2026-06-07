import { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { useChatStore } from '@/store/chat-store';
import { useLayoutStore } from '@/store/layout-store';
import { HistoryContent } from './history-content';

/**
 * Desktop chat history: an in-column panel that slides in from the right edge of the chat column
 * (right-to-left) and covers the chat view, rather than a vertical sheet. Mobile uses the Modal in
 * chat-history.tsx instead.
 *
 * Mounted permanently inside the chat column; it's translated off-screen (and non-interactive) when
 * closed so the chat panel beneath stays usable.
 */
export function ChatHistoryPanel() {
  const theme = useTheme();
  const open = useChatStore((s) => s.historyOpen);
  const setOpen = useChatStore((s) => s.setHistoryOpen);
  const chatWidth = useLayoutStore((s) => s.chatWidth);

  // Start off-screen to the right (one column-width over); slide to 0 when open.
  const tx = useSharedValue(chatWidth);
  useEffect(() => {
    tx.value = withTiming(open ? 0 : chatWidth, { duration: 260 });
  }, [open, chatWidth, tx]);

  // Web: Esc closes the panel (the Modal's onRequestClose equivalent).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  return (
    <Animated.View
      style={[styles.panel, { backgroundColor: theme.background }, style]}
      pointerEvents={open ? 'auto' : 'none'}
    >
      <HistoryContent onClose={() => setOpen(false)} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Fills the chat column; sits above the chat panel when open.
  panel: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 40 },
});
