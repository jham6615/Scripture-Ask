import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Segment = 'book' | 'version' | null;

type Props = {
  /** e.g. "John 1" */
  bookLabel: string;
  /** e.g. "WEB" */
  versionLabel: string;
  /** Which segment's picker is currently open (flips its chevron + highlights it). */
  active: Segment;
  /** Hard cap from the header so the pill can never collide with the corner buttons. */
  maxWidth?: number;
  onPressBook: () => void;
  onPressVersion: () => void;
};

/**
 * The reader's reference control: a single segmented pill with the book+chapter on the left and the
 * version on the right, divided in the middle. Each segment opens its own picker. (YouVersion-style.)
 *
 * Width behavior: version codes run up to 16 chars (e.g. PYHARAAMATTU1933), so the version segment
 * is capped and ellipsizes first; the book name gets the remaining room and only truncates after.
 * Chevrons never shrink, so the tap affordance survives any squeeze.
 */
export function ReferenceButton({ bookLabel, versionLabel, active, maxWidth, onPressBook, onPressVersion }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: theme.backgroundElement }, maxWidth != null && { maxWidth }]}>
      <Pressable
        onPress={onPressBook}
        style={[styles.segment, styles.bookSegment, active === 'book' && { backgroundColor: theme.backgroundSelected }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: active === 'book' }}
        accessibilityLabel={`Choose book, currently ${bookLabel}`}
      >
        <Text style={[styles.bookText, { color: theme.text }]} numberOfLines={1}>
          {bookLabel}
        </Text>
        <Text style={[styles.chevron, { color: theme.textSecondary }]} accessibilityElementsHidden>
          {active === 'book' ? '▴' : '▾'}
        </Text>
      </Pressable>

      <View style={[styles.divider, { backgroundColor: theme.backgroundSelected }]} />

      <Pressable
        onPress={onPressVersion}
        style={[styles.segment, styles.versionSegment, active === 'version' && { backgroundColor: theme.backgroundSelected }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: active === 'version' }}
        accessibilityLabel={`Choose version, currently ${versionLabel}`}
      >
        <Text style={[styles.versionText, { color: theme.textSecondary }]} numberOfLines={1}>
          {versionLabel}
        </Text>
        <Text style={[styles.chevron, { color: theme.textSecondary }]} accessibilityElementsHidden>
          {active === 'version' ? '▴' : '▾'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 18,
    height: 36,
    overflow: 'hidden',
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: 10,
  },
  // Book keeps priority: its floor fits a short reference ("John 1") in full, so the squeeze
  // ellipsizes the version code long before it eats the book name.
  bookSegment: { flexShrink: 1, minWidth: 88 },
  // Version is capped (long codes ellipsize immediately) and absorbs squeeze first (higher factor).
  versionSegment: { flexShrink: 2, minWidth: 48, maxWidth: 104 },
  divider: { width: StyleSheet.hairlineWidth, marginVertical: 7 },
  bookText: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  versionText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, flexShrink: 1 },
  // flexShrink 0 so the dropdown affordance is never the thing that gets clipped.
  chevron: { fontSize: 11, flexShrink: 0 },
});
