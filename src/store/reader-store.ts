import { create } from 'zustand';

export type ReaderPosition = {
  bookId: string;
  bookName: string;
  chapter: number;
};

type ReaderState = ReaderPosition & {
  setPosition: (position: ReaderPosition) => void;
};

export const useReaderStore = create<ReaderState>((set) => ({
  bookId: 'JHN',
  bookName: 'John',
  chapter: 1,
  setPosition: (position) => set(position),
}));
