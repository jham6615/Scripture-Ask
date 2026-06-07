import { type ReactNode, useEffect, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Spacing } from '@/constants/theme';
import { CHAT_MAX_WIDTH, CHAT_MIN_WIDTH } from '@/store/layout-store';

/** Visible width of the divider strip between the two panes. */
const DIVIDER_W = 14;
const SLIDE_MS = 260;

type Props = {
  /** Render-prop for the left pane — receives its exact pixel width so a pager can size pages to it. */
  left: (width: number) => ReactNode;
  /** The right pane (chat). Rendered at `chatWidth`; slides off-screen when collapsed. */
  right: ReactNode;
  /** Expanded width of the right column. */
  chatWidth: number;
  /** Whether the right column is collapsed (hidden, reader full-width). */
  collapsed: boolean;
  /** Commit a new chat width after a divider drag. */
  onResizeEnd: (px: number) => void;
  /** Toggle collapsed state — `true` to collapse, `false` to expand. */
  onToggleCollapse: (collapsed: boolean) => void;
  /** Total available width (the viewport / parent width). */
  totalWidth: number;
  dividerColor: string;
  /** Background shown in the gap behind the chat while it slides in (match the chat's surface). */
  surfaceColor: string;
  /** Pill/handle colors for the collapse + expand controls. */
  handleBg: string;
  handleColor: string;
};

/**
 * Two-column split with a draggable divider that doubles as a collapse button.
 *
 * Geometry note: the LEFT pane width is discrete (it only changes on collapse-toggle or drag-release),
 * so the reader's chapter pager never re-layouts mid-animation. The chat is an absolutely-positioned
 * overlay on the right that slides via translateX — collapsing slides it off the right edge and the
 * already-full-width reader is revealed beneath, with no per-frame reflow of the pager.
 */
export function SplitPane({
  left,
  right,
  chatWidth,
  collapsed,
  onResizeEnd,
  onToggleCollapse,
  totalWidth,
  dividerColor,
  surfaceColor,
  handleBg,
  handleColor,
}: Props) {
  // Cap the chat at half the viewport so it can't crowd the reader out on smaller screens.
  const maxWidth = Math.min(CHAT_MAX_WIDTH, Math.max(CHAT_MIN_WIDTH, Math.floor(totalWidth / 2)));

  // Live chat width during a drag (UI thread). Synced from the prop when not dragging.
  const widthSV = useSharedValue(chatWidth);
  const startWidth = useSharedValue(0);
  // 0 = expanded, 1 = collapsed. Drives the slide-out translateX + handle fades.
  const collapseP = useSharedValue(collapsed ? 1 : 0);

  useEffect(() => {
    widthSV.value = chatWidth;
  }, [chatWidth, widthSV]);

  useEffect(() => {
    collapseP.value = withTiming(collapsed ? 1 : 0, { duration: SLIDE_MS });
  }, [collapsed, collapseP]);

  // Discrete reader width: full when collapsed, else the remainder beside the settled chat + divider.
  const readerWidth = collapsed ? totalWidth : Math.max(0, totalWidth - chatWidth - DIVIDER_W);

  // Divider gesture: a drag resizes (Pan), a clean tap collapses (Tap). Race = whichever activates
  // first wins, so a stationary tap collapses and any real drag resizes. Robust on web + iPad native.
  const dividerGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetX([-6, 6])
      .onBegin(() => {
        'worklet';
        startWidth.value = widthSV.value;
      })
      .onUpdate((e) => {
        'worklet';
        const next = startWidth.value - e.translationX;
        widthSV.value = next < CHAT_MIN_WIDTH ? CHAT_MIN_WIDTH : next > maxWidth ? maxWidth : next;
      })
      .onEnd(() => {
        'worklet';
        runOnJS(onResizeEnd)(widthSV.value);
      });
    const tap = Gesture.Tap()
      .maxDistance(10)
      .maxDuration(300)
      .onEnd(() => {
        'worklet';
        runOnJS(onToggleCollapse)(true);
      });
    return Gesture.Race(pan, tap);
  }, [maxWidth, onResizeEnd, onToggleCollapse, startWidth, widthSV]);

  // Chat overlay: sized to the live width, slid right by its own width as it collapses.
  const chatStyle = useAnimatedStyle(() => ({
    width: widthSV.value,
    transform: [{ translateX: widthSV.value * collapseP.value }],
  }));
  // Divider sits at the chat's left edge and slides off with it, fading as it goes.
  const dividerStyle = useAnimatedStyle(() => ({
    right: widthSV.value,
    transform: [{ translateX: widthSV.value * collapseP.value }],
    opacity: 1 - collapseP.value,
  }));
  // Expand handle: pinned to the right edge, fades in only once collapsed.
  const expandStyle = useAnimatedStyle(() => ({ opacity: collapseP.value }));

  return (
    <View style={[styles.root, { backgroundColor: surfaceColor }]}>
      <View style={{ width: readerWidth, height: '100%' }}>{left(readerWidth)}</View>

      <Animated.View style={[styles.chat, chatStyle]}>{right}</Animated.View>

      <Animated.View
        style={[styles.divider, dividerStyle, webResizeCursor]}
        pointerEvents={collapsed ? 'none' : 'auto'}
      >
        <GestureDetector gesture={dividerGesture}>
          <View style={styles.dividerHit}>
            <View style={[styles.dividerLine, { backgroundColor: dividerColor }]} />
            <View style={[styles.pill, { backgroundColor: handleBg }, webPointerCursor]}>
              <Text style={[styles.pillIcon, { color: handleColor }]}>›</Text>
            </View>
          </View>
        </GestureDetector>
      </Animated.View>

      <Animated.View
        style={[styles.expandWrap, expandStyle]}
        pointerEvents={collapsed ? 'auto' : 'none'}
      >
        <Pressable
          onPress={() => onToggleCollapse(false)}
          accessibilityRole="button"
          accessibilityLabel="Show chat"
          style={[styles.expandHandle, { backgroundColor: handleBg }, webPointerCursor]}
        >
          <Text style={[styles.pillIcon, { color: handleColor }]}>‹</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// RN-web reads `cursor` from style; native's CursorValue type omits these, so cast.
const webResizeCursor =
  Platform.OS === 'web' ? ({ cursor: 'col-resize' } as unknown as ViewStyle) : null;
const webPointerCursor =
  Platform.OS === 'web' ? ({ cursor: 'pointer' } as unknown as ViewStyle) : null;

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative', overflow: 'hidden' },
  chat: { position: 'absolute', top: 0, right: 0, bottom: 0 },
  divider: { position: 'absolute', top: 0, bottom: 0, width: DIVIDER_W, zIndex: 15 },
  dividerHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dividerLine: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, opacity: 0.6 },
  // Centered grab/collapse pill — the obvious "boundary button".
  pill: {
    width: 22,
    height: 46,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
  pillIcon: { fontSize: 18, fontWeight: '700', lineHeight: 20 },
  // Expand handle hugs the right edge, vertically centered.
  expandWrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 15,
    paddingRight: Spacing.one,
  },
  expandHandle: {
    width: 26,
    height: 52,
    borderTopLeftRadius: 13,
    borderBottomLeftRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 3,
  },
});
