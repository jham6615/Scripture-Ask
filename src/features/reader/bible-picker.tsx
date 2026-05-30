import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { BookSummary } from '@/lib/bible';

type Props = {
  books: BookSummary[];
  currentBookId: string;
  onSelect: (bookId: string, chapter: number) => void;
};

/** Whole-Bible picker: tap a book to expand its chapters, tap a chapter to jump there. */
export function BiblePicker({ books, currentBookId, onSelect }: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(currentBookId);

  return (
    <ScrollView style={[styles.wrap, { backgroundColor: theme.background }]} bounces={false}>
      <View style={styles.inner}>
        {books.map((b) => {
          const open = b.id === expanded;
          return (
            <View key={b.id}>
              <Pressable onPress={() => setExpanded(open ? '' : b.id)} style={styles.bookRow}>
                <Text
                  style={[styles.bookName, { color: theme.text, fontWeight: b.id === currentBookId ? '700' : '500' }]}
                >
                  {b.name}
                </Text>
                <Text style={[styles.chev, { color: theme.textSecondary }]}>{open ? '▴' : '▾'}</Text>
              </Pressable>

              {open && (
                <View style={styles.grid}>
                  {Array.from({ length: b.chapters }, (_, i) => (
                    <Pressable
                      key={i}
                      onPress={() => onSelect(b.id, i + 1)}
                      style={[styles.cell, { backgroundColor: theme.backgroundElement }]}
                    >
                      <Text style={[styles.cellText, { color: theme.text, fontFamily: Fonts.serif }]}>{i + 1}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { maxHeight: 380, paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
  inner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
  },
  bookName: { fontSize: 16 },
  chev: { fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingBottom: Spacing.three },
  cell: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 16, fontWeight: '600' },
});
