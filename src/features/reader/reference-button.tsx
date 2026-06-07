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
  onPressBook: () => void;
  onPressVersion: () => void;
};

/**
 * The reader's reference control: a single segmented pill with the book+chapter on the left and the
 * version on the right, divided in the middle. Each segment opens its own picker. (YouVersion-style.)
 */
export function ReferenceButton({ bookLabel, versionLabel, active, onPressBook, onPressVersion }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        onPress={onPressBook}
        style={[styles.segment, active === 'book' && { backgroundColor: theme.backgroundSelected }]}
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
        style={[styles.segment, active === 'version' && { backgroundColor: theme.backgroundSelected }]}
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
    flexShrink: 1,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  divider: { width: StyleSheet.hairlineWidth, marginVertical: 7 },
  bookText: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  versionText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  chevron: { fontSize: 11 },
});
