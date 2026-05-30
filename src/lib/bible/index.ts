import { WEB_BOOKS } from './data/web/_books';
import type { Book, Chapter, TranslationId, TranslationMeta } from './types';

/** Registry of available translations. Add an entry when bundling a new version. */
export const TRANSLATIONS: Record<TranslationId, TranslationMeta> = {
  web: {
    id: 'web',
    name: 'World English Bible',
    abbreviation: 'WEB',
    language: 'en',
    languageName: 'English',
    direction: 'ltr',
  },
};

/** Bundled books, keyed by `${translationId}:${bookId}`. */
const BUNDLED_BOOKS: Record<string, Book> = {};
for (const b of WEB_BOOKS) BUNDLED_BOOKS[`web:${b.id}`] = b;

export const DEFAULT_TRANSLATION: TranslationId = 'web';
export const DEFAULT_BOOK_ID = 'JHN';

/** Returns a bundled book, or undefined if it isn't available locally. */
export function getBook(translationId: TranslationId, bookId: string): Book | undefined {
  return BUNDLED_BOOKS[`${translationId}:${bookId}`];
}

export type BookSummary = { id: string; name: string; chapters: number };

/** Ordered list of books for a translation (id, name, chapter count) — drives the picker. */
export function getBooks(_translationId: TranslationId = DEFAULT_TRANSLATION): BookSummary[] {
  return WEB_BOOKS.map((b) => ({ id: b.id, name: b.name, chapters: b.chapters.length }));
}

/** One swipeable reader page = a single chapter, in canonical order across the whole Bible. */
export type ReadingPage = { bookId: string; bookName: string; chapter: number; data: Chapter };

export function getReadingPages(_translationId: TranslationId = DEFAULT_TRANSLATION): ReadingPage[] {
  const pages: ReadingPage[] = [];
  for (const b of WEB_BOOKS) {
    for (const c of b.chapters) pages.push({ bookId: b.id, bookName: b.name, chapter: c.chapter, data: c });
  }
  return pages;
}

/** Metadata (name, language, direction) for a translation. */
export function getTranslation(id: TranslationId): TranslationMeta {
  return TRANSLATIONS[id];
}

/** All registered translations, grouped by language code — ready for a version picker. */
export function translationsByLanguage(): Record<string, TranslationMeta[]> {
  return Object.values(TRANSLATIONS).reduce<Record<string, TranslationMeta[]>>((acc, t) => {
    (acc[t.language] ??= []).push(t);
    return acc;
  }, {});
}

export type { Book, Chapter, Verse, TranslationId, TranslationMeta } from './types';
