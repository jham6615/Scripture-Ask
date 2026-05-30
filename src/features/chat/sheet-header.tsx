import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatReference } from '@/features/selection/actions';
import { useTheme } from '@/hooks/use-theme';
import { useSelectionStore } from '@/store/selection-store';
import { useSuggestionsStore } from '@/store/suggestions-store';

/** Sheet handle header: the selected reference (if any) on the left, refresh on the right. */
export function SheetHeader() {
  const theme = useTheme();
  const selection = useSelectionStore((s) => s.selection);
  const refresh = useSuggestionsStore((s) => s.refresh);
  const loading = useSuggestionsStore((s) => s.loading);

  return (
    <View style={styles.row}>
      {selection ? (
        <Text style={[styles.ref, { color: theme.text }]} numberOfLines={1}>
          {formatReference(selection)}
        </Text>
      ) : (
        <View style={styles.spacer} />
      )}
      <Pressable onPress={refresh} hitSlop={8} disabled={loading}>
        <Text style={[styles.new, { color: theme.textSecondary, opacity: loading ? 0.4 : 1 }]}>↻ New</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  spacer: { flex: 1 },
  ref: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  new: { fontSize: 13, fontWeight: '600' },
});
