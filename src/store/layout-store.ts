import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = 'bf:layout';

/** Sensible defaults — the chat starts visible at a comfortable column width. */
export const CHAT_MIN_WIDTH = 320;
export const CHAT_MAX_WIDTH = 720;
export const CHAT_DEFAULT_WIDTH = 420;

type LayoutState = {
  /** Pixel width of the chat column on wide screens. Clamped between CHAT_MIN_WIDTH and CHAT_MAX_WIDTH. */
  chatWidth: number;
  /** When true the chat column is hidden and the reader takes the full pane (wide layout only). */
  chatCollapsed: boolean;
  setChatWidth: (px: number) => void;
  setChatCollapsed: (collapsed: boolean) => void;
  /** Load saved preferences on app start. */
  hydrate: () => void;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const useLayoutStore = create<LayoutState>((set, get) => {
  const persist = () => {
    const { chatWidth, chatCollapsed } = get();
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ chatWidth, chatCollapsed })).catch(() => {});
  };

  return {
    chatWidth: CHAT_DEFAULT_WIDTH,
    chatCollapsed: false,
    setChatWidth: (px) => {
      set({ chatWidth: clamp(Math.round(px), CHAT_MIN_WIDTH, CHAT_MAX_WIDTH) });
      persist();
    },
    setChatCollapsed: (chatCollapsed) => {
      set({ chatCollapsed });
      persist();
    },
    hydrate: () => {
      AsyncStorage.getItem(STORAGE_KEY)
        .then((raw) => {
          if (!raw) return;
          const saved = JSON.parse(raw) as { chatWidth?: number; chatCollapsed?: boolean };
          set({
            chatWidth: clamp(saved.chatWidth ?? CHAT_DEFAULT_WIDTH, CHAT_MIN_WIDTH, CHAT_MAX_WIDTH),
            chatCollapsed: !!saved.chatCollapsed,
          });
        })
        .catch(() => {});
    },
  };
});
