import { DEFAULT_TRANSLATION, getBook } from '@/lib/bible';
import type { Selection } from '@/store/selection-store';

export function formatReference(selection: Selection): string {
  const sorted = [...selection.verses].sort((a, b) => a - b);
  const { bookName, chapter } = selection;
  if (sorted.length === 1) return `${bookName} ${chapter}:${sorted[0]}`;
  const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  if (contiguous) return `${bookName} ${chapter}:${sorted[0]}–${sorted[sorted.length - 1]}`;
  return `${bookName} ${chapter} · ${sorted.length} verses`;
}

export function selectedText(selection: Selection): string {
  const book = getBook(DEFAULT_TRANSLATION, selection.bookId);
  const chapter = book?.chapters.find((c) => c.chapter === selection.chapter);
  if (!chapter) return '';
  return chapter.verses
    .filter((v) => selection.verses.includes(v.verse))
    .map((v) => `${v.verse} ${v.text}`)
    .join(' ');
}

/** Ties a question to the selected passage (display stays the raw question). */
export function buildQuestionPrompt(selection: Selection, question: string): string {
  const ref = formatReference(selection);
  const passage = selectedText(selection);
  return `${question}\n\nIn reference to ${ref}:\n"${passage}"`;
}
