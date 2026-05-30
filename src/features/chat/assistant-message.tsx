import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ChatMessage } from '@/store/chat-store';

type Props = {
  message: ChatMessage;
  /** Fires when the user taps a suggested follow-up question chip. */
  onAskQuestion?: (text: string) => void;
};

export function AssistantMessage({ message, onAskQuestion }: Props) {
  const theme = useTheme();

  if (message.pending || !message.response) {
    return (
      <View style={styles.wrap}>
        <TypingDots />
      </View>
    );
  }

  const r = message.response;

  // New free-form shape: markdown body + sources + suggested follow-up chips.
  if (r.content) {
    return (
      <View style={styles.wrap}>
        <MarkdownBody content={r.content} />

        {r.sources && r.sources.length > 0 && (
          <View style={styles.sources}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>SOURCES</Text>
            {r.sources.map((s, i) => (
              <Text key={i} style={[styles.sourceItem, { color: theme.textSecondary }]}>
                {s}
              </Text>
            ))}
          </View>
        )}

        {r.suggestedQuestions && r.suggestedQuestions.length > 0 && onAskQuestion && (
          <View style={styles.chips}>
            {r.suggestedQuestions.map((q, i) => (
              <Pressable
                key={i}
                onPress={() => onAskQuestion(q)}
                style={[styles.chip, { borderColor: theme.textSecondary }]}
              >
                <Text style={[styles.chipText, { color: theme.text }]}>{q}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  }

  // Legacy shape (already-saved conversations from before the free-form refactor).
  return (
    <View style={styles.wrap}>
      {r.summary ? <Text style={[styles.legacySummary, { color: theme.text }]}>{r.summary}</Text> : null}

      {r.insights && r.insights.length > 0 ? (
        <View style={styles.legacySection}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>KEY INSIGHTS</Text>
          {r.insights.map((item, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bullet, { color: theme.textSecondary }]}>•</Text>
              <Text style={[styles.bulletText, { color: theme.text }]}>{item}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {r.reflection ? (
        <View style={[styles.reflection, { borderLeftColor: theme.backgroundSelected }]}>
          <Text style={[styles.reflectionText, { color: theme.text }]}>{r.reflection}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Markdown renderer styled to match the app's theme. */
function MarkdownBody({ content }: { content: string }) {
  const theme = useTheme();
  // useMemo so style objects don't churn on every render (Markdown perf).
  const mdStyles = useMemo(
    () => ({
      body: { color: theme.text, fontSize: 16, lineHeight: 24 },
      paragraph: { marginTop: 0, marginBottom: 12 },
      heading1: { fontSize: 20, fontWeight: '700' as const, color: theme.text, marginTop: 16, marginBottom: 8 },
      heading2: { fontSize: 18, fontWeight: '700' as const, color: theme.text, marginTop: 16, marginBottom: 8 },
      heading3: { fontSize: 16, fontWeight: '700' as const, color: theme.text, marginTop: 12, marginBottom: 6 },
      strong: { fontWeight: '700' as const, color: theme.text },
      em: { fontStyle: 'italic' as const, color: theme.text },
      blockquote: {
        borderLeftColor: theme.textSecondary,
        borderLeftWidth: 3,
        paddingLeft: 12,
        paddingVertical: 4,
        marginVertical: 8,
        backgroundColor: 'transparent',
      },
      bullet_list: { marginBottom: 8 },
      ordered_list: { marginBottom: 8 },
      list_item: { color: theme.text, marginBottom: 4 },
      link: { color: theme.text, textDecorationLine: 'underline' as const },
      code_inline: { backgroundColor: 'transparent', fontFamily: 'Menlo' },
      hr: { backgroundColor: theme.textSecondary, height: StyleSheet.hairlineWidth, marginVertical: 12 },
    }),
    [theme],
  );
  return <Markdown style={mdStyles}>{content}</Markdown>;
}

function TypingDots() {
  const theme = useTheme();
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[styles.dots, style]}>
      <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
      <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
      <View style={[styles.dot, { backgroundColor: theme.textSecondary }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: Spacing.one, gap: Spacing.two, maxWidth: '92%' },

  // Sources
  sources: { marginTop: Spacing.three, gap: 3 },
  sourceItem: { fontSize: 13, lineHeight: 18 },

  // Suggested-question chips
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.three },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  chipText: { fontSize: 14, lineHeight: 18 },

  // Section labels
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },

  // Legacy shape rendering (kept for already-saved conversations)
  legacySummary: { fontSize: 16, lineHeight: 23 },
  legacySection: { gap: Spacing.one },
  bulletRow: { flexDirection: 'row', gap: Spacing.two },
  bullet: { fontSize: 15, lineHeight: 22 },
  bulletText: { flex: 1, fontSize: 15, lineHeight: 22 },
  reflection: { borderLeftWidth: 3, paddingLeft: Spacing.three, paddingVertical: Spacing.one },
  reflectionText: { fontSize: 15, lineHeight: 22, fontStyle: 'italic' },

  // Typing indicator
  dots: { flexDirection: 'row', gap: 6, paddingVertical: Spacing.two },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
