import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Spacing } from '@/constants/theme';
import { buildQuestionPrompt, formatReference, selectedText } from '@/features/selection/actions';
import { useTheme } from '@/hooks/use-theme';
import { useReaderStore } from '@/store/reader-store';
import { useSelectionStore } from '@/store/selection-store';
import { useSuggestionsStore } from '@/store/suggestions-store';

type Props = {
  onSelect: (text: string, prompt: string) => void;
};

export function SuggestionCards({ onSelect }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const cardMaxWidth = Math.min(280, width * 0.72);

  const bookName = useReaderStore((s) => s.bookName);
  const chapter = useReaderStore((s) => s.chapter);
  const selection = useSelectionStore((s) => s.selection);

  // Follow the selection when there is one, else the current chapter.
  // When verses are selected, also pass the actual selected text so the suggestions tailor to
  // the specific wording, not just what the model remembers about the reference.
  const reference = selection ? formatReference(selection) : `${bookName} ${chapter}`;
  const passageText = selection ? selectedText(selection) : '';

  const items = useSuggestionsStore((s) => s.items);
  const loading = useSuggestionsStore((s) => s.loading);
  const load = useSuggestionsStore((s) => s.load);

  useEffect(() => {
    load(reference, passageText);
  }, [reference, passageText, load]);

  const makePrompt = (q: string) =>
    selection ? buildQuestionPrompt(selection, q) : `${q}\n\nRegarding ${reference}.`;

  const handlePress = (q: string) => {
    onSelect(q, makePrompt(q));
    useSuggestionsStore.getState().refresh(); // consume + refresh
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.carousel}
      contentContainerStyle={styles.carouselContent}
    >
      {items.map((q, i) => (
        <Pressable
          key={`${i}-${q}`}
          onPress={() => handlePress(q)}
          style={[styles.card, { maxWidth: cardMaxWidth, backgroundColor: theme.background }]}
        >
          <Text style={[styles.cardText, { color: theme.text }]}>{q}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { height: 64, alignItems: 'center', justifyContent: 'center' },
  carousel: { marginHorizontal: -Spacing.four }, // bleed past the panel's horizontal padding
  carouselContent: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    alignItems: 'flex-start', // each card hugs its own text height (no stretching to the tallest)
  },
  card: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  cardText: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
});
