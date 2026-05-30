import { create } from 'zustand';

import { generate, responseToText, type StructuredResponse } from '@/lib/api';
import { createConversation, listConversations, loadConversation, updateConversation } from '@/lib/conversations';
import { formatReference } from '@/features/selection/actions';
import { useReaderStore } from '@/store/reader-store';
import { useSelectionStore } from '@/store/selection-store';

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text?: string; // user: display label
  prompt?: string; // user: AI-facing text
  response?: StructuredResponse; // assistant: structured reply
  pending?: boolean; // assistant: awaiting reply
};

let nextId = 0;
// Timestamped so freshly-sent ids never collide with ids loaded from a saved conversation.
const makeId = () => `m${Date.now()}_${++nextId}`;

const currentReference = (): string | null => {
  const { bookName, chapter } = useReaderStore.getState();
  return bookName ? `${bookName} ${chapter}` : null;
};

/** Snapshot what the user is reading right now so the AI gets passage context without them spelling it out. */
const currentContext = () => {
  const reference = currentReference() ?? undefined;
  const sel = useSelectionStore.getState().selection;
  const selection = sel ? formatReference(sel) : undefined;
  return reference || selection ? { reference, selection } : undefined;
};

const deriveTitle = (messages: ChatMessage[]): string => {
  const firstUser = messages.find((m) => m.role === 'user');
  const t = (firstUser?.text ?? '').trim();
  return t ? t.slice(0, 80) : 'New conversation';
};

type ChatState = {
  messages: ChatMessage[];
  isGenerating: boolean;
  conversationId: string | null;
  /** Adds the user message, shows a pending reply, fills it from the AI seam, then saves (if signed in). */
  send: (display: string, prompt?: string) => void;
  /** Clear the chat without touching saved data (used on sign-out). */
  reset: () => void;
  /** Start a brand-new conversation. */
  newChat: () => void;
  /** Load a saved conversation into the chat. */
  openConversation: (id: string) => Promise<void>;
  /** On launch/sign-in, resume the most recent conversation — but never clobber an in-progress chat. */
  resumeLatest: () => Promise<void>;
  /** History drawer visibility. */
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
};

export const useChatStore = create<ChatState>((set, get) => {
  // Save the current conversation to Supabase. No-op when signed out (createConversation returns null).
  const persist = async () => {
    const { messages, conversationId } = get();
    const toSave = messages.filter((m) => !m.pending);
    if (toSave.length === 0) return;
    const title = deriveTitle(toSave);
    const reference = currentReference();
    if (conversationId) {
      await updateConversation(conversationId, toSave, title, reference);
    } else {
      const id = await createConversation(title, reference, toSave);
      if (id) set({ conversationId: id });
    }
  };

  return {
    messages: [],
    isGenerating: false,
    conversationId: null,

    send: (display, prompt) => {
      const text = display.trim();
      if (!text || get().isGenerating) return;

      const userMessage: ChatMessage = { id: makeId(), role: 'user', text, prompt: (prompt ?? text).trim() };
      const pendingId = makeId();

      set((s) => ({
        messages: [...s.messages, userMessage, { id: pendingId, role: 'assistant', pending: true }],
        isGenerating: true,
      }));

      const apiMessages = get()
        .messages.filter((m) => !m.pending)
        .map((m) =>
          m.role === 'user'
            ? { role: 'user' as const, content: m.prompt ?? m.text ?? '' }
            : { role: 'assistant' as const, content: m.response ? responseToText(m.response) : '' },
        );

      generate(apiMessages, currentContext())
        .then((response) => {
          set((s) => ({
            messages: s.messages.map((m) => (m.id === pendingId ? { id: m.id, role: 'assistant', response } : m)),
            isGenerating: false,
          }));
          void persist();
        })
        .catch(() =>
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === pendingId
                ? { id: m.id, role: 'assistant', response: { summary: 'Sorry — something went wrong. Please try again.', insights: [] } }
                : m,
            ),
            isGenerating: false,
          })),
        );
    },

    reset: () => set({ messages: [], isGenerating: false, conversationId: null }),

    newChat: () => set({ messages: [], isGenerating: false, conversationId: null }),

    openConversation: async (id) => {
      const convo = await loadConversation(id);
      if (convo) set({ messages: convo.messages, conversationId: convo.id, isGenerating: false });
    },

    resumeLatest: async () => {
      if (get().messages.length > 0 || get().conversationId) return; // don't clobber an active chat
      const list = await listConversations();
      if (list.length > 0) await get().openConversation(list[0].id);
    },

    historyOpen: false,
    setHistoryOpen: (open) => set({ historyOpen: open }),
  };
});
