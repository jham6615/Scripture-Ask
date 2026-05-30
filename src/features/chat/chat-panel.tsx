import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { AssistantMessage } from '@/features/chat/assistant-message';
import { SuggestionCards } from '@/features/suggestions/suggestion-cards';
import { useTheme } from '@/hooks/use-theme';
import { type ChatMessage, useChatStore } from '@/store/chat-store';
import { FREE_DAILY_LIMIT, useSubscriptionStore } from '@/store/subscription-store';

type Props = {
  onSend: (text: string, prompt?: string) => void;
  contextLabel?: string;
  /** When false (reveal/collapsed), the conversation is hidden so the panel hugs its content. */
  expanded?: boolean;
  /** Reports the conversation's natural content height so the sheet can size itself to it. */
  onConvoHeight?: (h: number) => void;
  /** Max height for the conversation list (injected by the sheet) so it caps + scrolls instead of overflowing. */
  convoMaxH?: number;
};

export function ChatPanel({ onSend, contextLabel, expanded = false, onConvoHeight, convoMaxH }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const messages = useChatStore((s) => s.messages);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const isPremium = useSubscriptionStore((s) => s.isPremium);
  const used = useSubscriptionStore((s) => s.used);
  const usageDate = useSubscriptionStore((s) => s.date);
  const [draft, setDraft] = useState('');
  const listRef = useRef<ScrollView>(null);

  const scrollToEnd = () => requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

  // The sheet itself floats above the keyboard, so the panel only needs its resting safe-area pad.
  const bottomPad = insets.bottom + Spacing.two;
  const canSend = draft.trim().length > 0 && !isGenerating;
  const isToday = usageDate === new Date().toISOString().slice(0, 10);
  const freeLeft = Math.max(0, FREE_DAILY_LIMIT - (isToday ? used : 0));

  const onSendPress = () => {
    if (!canSend) return;
    onSend(draft);
    setDraft('');
  };

  return (
    <View style={[styles.container, { paddingBottom: bottomPad }]}>
      <SuggestionCards onSelect={onSend} />

      {expanded && (
        <ScrollView
          ref={listRef}
          style={{ maxHeight: convoMaxH }}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={(_w, h) => {
            scrollToEnd();
            onConvoHeight?.(h);
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {messages.map((item) =>
            item.role === 'user' ? (
              <UserBubble key={item.id} message={item} />
            ) : (
              <AssistantMessage key={item.id} message={item} onAskQuestion={onSend} />
            ),
          )}
        </ScrollView>
      )}

      {!isPremium && (
        <Text style={[styles.freeHint, { color: theme.textSecondary }]}>
          {freeLeft > 0
            ? `${freeLeft} free question${freeLeft === 1 ? '' : 's'} left today`
            : 'Out of free questions today — tap send to go unlimited'}
        </Text>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={onSendPress}
          onFocus={scrollToEnd}
          placeholder={contextLabel ? `Ask about ${contextLabel}…` : 'Ask anything about this passage…'}
          placeholderTextColor={theme.textSecondary}
          returnKeyType="send"
          submitBehavior="submit"
          multiline
        />
        <Pressable
          onPress={onSendPress}
          disabled={!canSend}
          style={[styles.sendButton, { backgroundColor: theme.text, opacity: canSend ? 1 : 0.3 }]}
        >
          <Text style={[styles.sendIcon, { color: theme.background }]}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
}

function UserBubble({ message }: { message: ChatMessage }) {
  const theme = useTheme();
  return (
    <View style={[styles.bubbleRow, { justifyContent: 'flex-end' }]}>
      <View style={[styles.bubble, { backgroundColor: theme.text }]}>
        <Text style={[styles.bubbleText, { color: theme.background }]}>{message.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: Spacing.four },
  // No flexGrow: the content reports its *natural* height (not stretched to fill) so the sheet can hug it,
  // and the list's maxHeight (set by the sheet) makes it scroll once the conversation outgrows the room.
  listContent: { paddingTop: Spacing.two, gap: Spacing.three },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '85%', borderRadius: 18, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  bubbleText: { fontSize: 16, lineHeight: 22 },
  freeHint: { fontSize: 12, textAlign: 'center', paddingTop: Spacing.two },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, paddingTop: Spacing.two },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  sendButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { fontSize: 20, fontWeight: '700' },
});
