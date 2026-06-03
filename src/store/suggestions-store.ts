import { create } from 'zustand';

import { generateSuggestions } from '@/lib/api';
import { getDeviceLanguageName } from '@/lib/locale';

type SuggestionsState = {
  items: string[];
  loading: boolean;
  reference: string;
  /** Selected verse text — empty string when the user has no verses selected (chapter-level cards). */
  passageText: string;
  /** Load suggestions. Pass `passageText` when the user has highlighted verses so cards tailor to that exact text. */
  load: (reference: string, passageText?: string) => void;
  /** Reload current reference + selected text (the "New" button). */
  refresh: () => void;
};

export const useSuggestionsStore = create<SuggestionsState>((set, get) => ({
  items: [],
  loading: false,
  reference: '',
  passageText: '',
  load: (reference, passageText = '') => {
    // Clear items immediately so the old cards (e.g. verse-specific ones after deselection)
    // don't linger while the new request is in flight. The user sees a clean spinner → new cards.
    set({ loading: true, reference, passageText, items: [] });
    generateSuggestions(reference, passageText || undefined, undefined, getDeviceLanguageName())
      .then((items) => {
        const s = get();
        if (s.reference === reference && s.passageText === passageText) set({ items, loading: false });
      })
      .catch(() => {
        const s = get();
        if (s.reference === reference && s.passageText === passageText) set({ loading: false });
      });
  },
  refresh: () => get().load(get().reference, get().passageText),
}));
