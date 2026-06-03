import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { AssistantMessage } from '@/features/chat/assistant-message';
import { SuggestionCards } from '@/features/suggestions/suggestion-cards';
import { useTheme } from '@/hooks/use-theme';
import { type ChatMessage, useChatStore } from '@/store/chat-store';
import { FREE_DAILY_LIMIT, useSubscriptionStore } from '@/store/subscription-store';

type Props =
  | {
      /** Mobile bottom-sheet layout. Conversation visibility + height are driven by the sheet snap. */
      mode: 'sheet';
      onSend: (text: string, prompt?: string) => void;
      contextLabel?: string;
      /** When false (reveal/collapsed), the conversation is hidden so the panel hugs its content. */
      expanded: boolean;
      /** Reports the conversation's natural content height so the sheet can size itself to it. */
      onConvoHeight: (h: number) => void;
      /** Max height for the conversation list (injected by the sheet via cloneElement). */
      convoMaxH?: number;
    }
  | {
      /** Desktop column layout. Panel fills its container; conversation always visible and scrolls within. */
      mode: 'column';
      onSend: (text: string, prompt?: string) => void;
      contextLabel?: string;
    };

export function ChatPanel(props: Props) {
  const { onSend, contextLabel } = props;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const messages = useChatStore((s) => s.messages);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const isPremium = useSubscriptionStore((s) => s.isPremium);
  const used = useSubscriptionStore((s) => s.used);
  const usageDate = useSubscriptionStore((s) => s.date);
  const [draft, setDraft] = useState('');
  const listRef = useRef<ScrollView>(null);
  // Desktop column: suggestions collapse once the conversation starts to give the messages more room.
  // Default open when no messages; auto-closes on the first send; user can re-open with the toggle.
  const [suggestOpen, setSuggestOpen] = useState(messages.length === 0);
  useEffect(() => {
    if (messages.length === 1) setSuggestOpen(false);
  }, [messages.length]);

  const scrollToEnd = () => requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

  // Sheet mode: the sheet itself floats above the keyboard, so the panel only needs its resting pad.
  // Column mode: there's no keyboard-avoiding container, but the input lives high enough on desktop
  // that the safe-area + a little breathing room is all we need.
  const bottomPad = insets.bottom + Spacing.two;
  const canSend = draft.trim().length > 0 && !isGenerating;
  const isToday = usageDate === new Date().toISOString().slice(0, 10);
  const freeLeft = Math.max(0, FREE_DAILY_LIMIT - (isToday ? used : 0));

  const onSendPress = () => {
    if (!canSend) return;
    onSend(draft);
    setDraft('');
  };

  const isColumn = props.mode === 'column';
  // Narrow once: pull the sheet-only callbacks out so the JSX stays free of mode discriminator checks.
  const convoMaxH = props.mode === 'sheet' ? props.convoMaxH : undefined;
  const reportConvoHeight = props.mode === 'sheet' ? props.onConvoHeight : undefined;
  const showConvo = isColumn || (props.mode === 'sheet' && props.expanded);
  return (
    <View style={[styles.container, isColumn && styles.containerFill, { paddingBottom: bottomPad }]}>

      {/* ── COLUMN EMPTY STATE ──────────────────────────────────────────────────────────────────
          No messages yet: show cards at the TOP of the panel so they're immediately visible.
          A flex:1 spacer below them pushes the input to the bottom.
          The ScrollView is not rendered — an empty flex:1 scroll view was what pushed the cards
          to the middle of the screen in all previous iterations. */}
      {isColumn && messages.length === 0 && (
        <>
          <SuggestionCards onSelect={onSend} />
          <View style={styles.emptySpacer} />
        </>
      )}

      {/* ── MESSAGES AREA ───────────────────────────────────────────────────────────────────────
          Only rendered when there are messages. Column: flex:1 with messages bottom-anchored.
          Sheet: bounded by convoMaxH and hidden until the sheet expands. */}
      {showConvo && messages.length > 0 && (
        <ScrollView
          ref={listRef}
          style={isColumn ? styles.listFill : { maxHeight: convoMaxH }}
          contentContainerStyle={isColumn ? styles.listContentColumn : styles.listContent}
          onContentSizeChange={(_w, h) => {
            scrollToEnd();
            reportConvoHeight?.(h);
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

      {/* ── SUGGESTION CHIPS (non-empty states) ─────────────────────────────────────────────────
          Column + messages: collapsed toggle above input; user can expand.
          Sheet: always shown full (needed for the "reveal" peek state).
          Column + no messages: handled in the empty state block above. */}
      {isColumn && messages.length > 0 ? (
        <>
          <Pressable
            onPress={() => setSuggestOpen((o) => !o)}
            style={styles.suggestToggle}
            hitSlop={8}
          >
            <Text style={[styles.suggestLabel, { color: theme.textSecondary }]}>
              {`Suggested questions ${suggestOpen ? '▴' : '▾'}`}
            </Text>
          </Pressable>
          {suggestOpen && <SuggestionCards onSelect={onSend} />}
        </>
      ) : !isColumn ? (
        <SuggestionCards onSelect={onSend} />
      ) : null}

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
  // Desktop column: fill the pane; the conversation list flex-grows and scrolls within it.
  containerFill: { flex: 1 },
  listFill: { flex: 1 },
  // Sheet mode: natural content height so the sheet can hug it with maxHeight.
  listContent: { paddingTop: Spacing.two, gap: Spacing.three },
  // Column (desktop) mode: grow to fill the messages ScrollView and anchor the conversation to the
  // bottom (just above the input), so empty space sits at the TOP — the standard chat feel.
  listContentColumn: { paddingTop: Spacing.two, gap: Spacing.three, flexGrow: 1, justifyContent: 'flex-end' },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '85%', borderRadius: 18, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  bubbleText: { fontSize: 16, lineHeight: 22 },
  freeHint: { fontSize: 12, textAlign: 'center', paddingTop: Spacing.two },
  // Fills the gap between the cards and the input in the empty-state layout so the input
  // stays pinned to the bottom of the column even when there are no messages.
  emptySpacer: { flex: 1 },
  suggestToggle: { paddingTop: Spacing.one, paddingBottom: Spacing.one, alignSelf: 'flex-start' },
  suggestLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
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
