import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { BottomSheet, SHEET_COLLAPSED_RATIO, type SheetSnap } from '@/components/bottom-sheet';
import { ChatHistory } from '@/features/chat/chat-history';
import { ChatPanel } from '@/features/chat/chat-panel';
import { SheetHeader } from '@/features/chat/sheet-header';
import { ReaderScreen } from '@/features/reader/reader-screen';
import { buildQuestionPrompt, formatReference } from '@/features/selection/actions';
import { useChatStore } from '@/store/chat-store';
import { useSelectionStore } from '@/store/selection-store';
import { useSubscriptionStore } from '@/store/subscription-store';

export default function ReaderRoute() {
  const { height } = useWindowDimensions();
  const peek = height * SHEET_COLLAPSED_RATIO;
  const router = useRouter();

  const selection = useSelectionStore((s) => s.selection);
  const send = useChatStore((s) => s.send);
  const hasMessages = useChatStore((s) => s.messages.length > 0);
  const hasSelection = !!selection && selection.verses.length > 0;
  const hydrateSubscription = useSubscriptionStore((s) => s.hydrate);

  // Restore premium status + today's usage on launch.
  useEffect(() => {
    hydrateSubscription();
  }, [hydrateSubscription]);

  // Default to "reveal" so whole-chapter suggestions are always available, even with nothing selected.
  const [snap, setSnap] = useState<SheetSnap>('reveal');
  const [convoH, setConvoH] = useState(0);
  const prevHasSelection = useRef(false);

  useEffect(() => {
    if (hasSelection === prevHasSelection.current) return;
    prevHasSelection.current = hasSelection;
    // Selecting, or clearing with no conversation, rests at reveal (suggestions visible).
    if (hasSelection || !hasMessages) setSnap('reveal');
  }, [hasSelection, hasMessages]);

  const handleSend = (text: string, prompt?: string) => {
    // Freemium gate: free users get a daily quota; over it, send them to the paywall instead.
    const sub = useSubscriptionStore.getState();
    if (!sub.canAsk()) {
      router.push('/paywall');
      return;
    }
    sub.recordAsk();

    if (prompt) {
      send(text, prompt); // suggestion: prompt is already passage-aware
    } else {
      const sel = useSelectionStore.getState().selection;
      send(text, sel ? buildQuestionPrompt(sel, text) : undefined); // typed: tie to selection if active
    }
    setSnap('expanded');
  };

  return (
    <View style={{ flex: 1 }}>
      <ReaderScreen peekInset={peek} />
      <BottomSheet openSnap={snap} onSnapChange={setSnap} header={<SheetHeader />} expandedContentH={convoH}>
        <ChatPanel
          expanded={snap === 'expanded' || snap === 'half'}
          onSend={handleSend}
          onConvoHeight={setConvoH}
          contextLabel={selection ? formatReference(selection) : undefined}
        />
      </BottomSheet>
      <ChatHistory onOpened={() => setSnap('expanded')} />
    </View>
  );
}
