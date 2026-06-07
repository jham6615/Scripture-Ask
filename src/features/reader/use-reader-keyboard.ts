import { useEffect } from 'react';
import { Platform } from 'react-native';

import { DEFAULT_BOOK_ID, getReadingPages } from '@/lib/bible';
import { useReaderStore } from '@/store/reader-store';
import { useSelectionStore } from '@/store/selection-store';

const PAGES = getReadingPages();
const findIndex = (bookId: string, chapter: number) => {
  const i = PAGES.findIndex((p) => p.bookId === bookId && p.chapter === chapter);
  return i >= 0 ? i : Math.max(0, PAGES.findIndex((p) => p.bookId === DEFAULT_BOOK_ID && p.chapter === 1));
};

/**
 * Web-only keyboard shortcuts for the reader / chat:
 *  - ←  →  navigate chapters (when focus isn't in a text input)
 *  - Esc clear selection
 * No-op on native (where `document` doesn't exist and we have no physical-key contract).
 */
export function useReaderKeyboard() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // SSR guard for expo-router web builds.
    if (typeof document === 'undefined') return;

    const handler = (e: KeyboardEvent) => {
      // Don't hijack typing in inputs or contentEditable surfaces.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
        // The only typing-safe shortcut is Escape (clears selection).
        if (e.key === 'Escape') useSelectionStore.getState().clear();
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const { bookId, chapter, setPosition } = useReaderStore.getState();
        const i = findIndex(bookId, chapter);
        const target = e.key === 'ArrowLeft' ? i - 1 : i + 1;
        if (target < 0 || target >= PAGES.length) return;
        const p = PAGES[target];
        setPosition({ bookId: p.bookId, bookName: p.bookName, chapter: p.chapter });
        e.preventDefault();
        return;
      }

      if (e.key === 'Escape') {
        useSelectionStore.getState().clear();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
}
