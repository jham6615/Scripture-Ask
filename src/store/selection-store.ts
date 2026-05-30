import { create } from 'zustand';

export type Selection = {
  bookId: string;
  bookName: string;
  chapter: number;
  verses: number[]; // sorted verse numbers within the chapter
};

type ToggleArgs = { bookId: string; bookName: string; chapter: number; verse: number };

type SelectionState = {
  selection: Selection | null;
  toggleVerse: (args: ToggleArgs) => void;
  clear: () => void;
};

export const useSelectionStore = create<SelectionState>((set) => ({
  selection: null,
  toggleVerse: ({ bookId, bookName, chapter, verse }) =>
    set((state) => {
      const cur = state.selection;
      // Selecting in a different book/chapter starts a fresh selection.
      if (!cur || cur.bookId !== bookId || cur.chapter !== chapter) {
        return { selection: { bookId, bookName, chapter, verses: [verse] } };
      }
      const has = cur.verses.includes(verse);
      const verses = has
        ? cur.verses.filter((v) => v !== verse)
        : [...cur.verses, verse].sort((a, b) => a - b);
      return { selection: verses.length ? { ...cur, verses } : null };
    }),
  clear: () => set({ selection: null }),
}));
