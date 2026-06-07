import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { buildQuestionPrompt } from '@/features/selection/actions';
import { useChatStore } from '@/store/chat-store';
import { useSelectionStore } from '@/store/selection-store';
import { useSubscriptionStore } from '@/store/subscription-store';

/**
 * Wraps the paywall gate + prompt construction that every chat send goes through, so the wide
 * and narrow layouts can share it without duplicating the freemium check.
 *
 * Returns `true` when the question was queued, `false` when the user was redirected to paywall.
 */
export function useSendQuestion(): (text: string, prompt?: string) => boolean {
  const router = useRouter();
  const send = useChatStore((s) => s.send);
  return useCallback(
    (text, prompt) => {
      const sub = useSubscriptionStore.getState();
      if (!sub.canAsk()) {
        router.push('/paywall');
        return false;
      }
      sub.recordAsk();
      if (prompt) {
        send(text, prompt);
        return true;
      }
      const sel = useSelectionStore.getState().selection;
      send(text, sel ? buildQuestionPrompt(sel, text) : undefined);
      return true;
    },
    [router, send],
  );
}
