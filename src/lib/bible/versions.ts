// Multi-version support. WEB is bundled (instant, offline); every other version is fetched on demand
// from getbible.net (free, no key, ~117 public-domain translations across many languages) and cached
// in memory. Navigation uses the bundled canonical structure (66 books); a version only swaps the text,
// and any fetch failure falls back to the bundled WEB text so the reader never breaks.

import { getBook, getBooks } from './index';
import type { Verse } from './types';

const GETBIBLE = 'https://api.getbible.net/v2';

export type VersionMeta = {
  code: string;
  name: string;
  language: string; // BCP-47-ish code, e.g. "en"
  languageName: string; // display, e.g. "English"
  direction: 'ltr' | 'rtl';
};

// bookId -> getbible book number (1..66), derived lazily from the canonical bundled order.
let bookNumbers: Record<string, number> | null = null;
function bookNumber(bookId: string): number | undefined {
  if (!bookNumbers) {
    bookNumbers = {};
    getBooks().forEach((b, i) => {
      bookNumbers![b.id] = i + 1;
    });
  }
  return bookNumbers[bookId];
}

let catalog: VersionMeta[] | null = null;

/** The list of available versions (cached after first load), sorted by language then name. */
export async function fetchVersions(): Promise<VersionMeta[]> {
  if (catalog) return catalog;
  const res = await fetch(`${GETBIBLE}/translations.json`);
  if (!res.ok) throw new Error(`Versions catalog ${res.status}`);
  const raw = (await res.json()) as Record<string, Record<string, string>>;
  const list = Object.values(raw)
    .filter((t) => t.abbreviation && t.translation)
    .map<VersionMeta>((t) => ({
      code: t.abbreviation,
      name: t.translation,
      language: t.lang ?? 'en',
      languageName: t.language ?? 'Other',
      direction: String(t.direction).toUpperCase() === 'RTL' ? 'rtl' : 'ltr',
    }));
  list.sort((a, b) => a.languageName.localeCompare(b.languageName) || a.name.localeCompare(b.name));
  catalog = list;
  return list;
}

type CachedChapter = { chapter: number; verses: Verse[] };
const bookCache = new Map<string, CachedChapter[]>(); // `${code}:${bookId}` -> chapters

/** Verses for one chapter in the given version. WEB is read from the bundle; others are fetched + cached. */
export async function loadChapterVerses(code: string, bookId: string, chapterNum: number): Promise<Verse[]> {
  if (code === 'web') {
    const ch = getBook('web', bookId)?.chapters.find((c) => c.chapter === chapterNum);
    return ch?.verses ?? [];
  }

  const key = `${code}:${bookId}`;
  let chapters = bookCache.get(key);
  if (!chapters) {
    const nr = bookNumber(bookId);
    if (!nr) throw new Error(`Unknown book ${bookId}`);
    const res = await fetch(`${GETBIBLE}/${code}/${nr}.json`);
    if (!res.ok) throw new Error(`${code} ${bookId} ${res.status}`);
    const raw = await res.json();
    chapters = (raw.chapters ?? []).map((c: { chapter: number; verses?: { verse: number; text: string }[] }) => ({
      chapter: c.chapter,
      verses: (c.verses ?? []).map((v) => ({ verse: v.verse, text: String(v.text).trim() })),
    }));
    bookCache.set(key, chapters as CachedChapter[]);
  }
  return chapters!.find((c) => c.chapter === chapterNum)?.verses ?? [];
}
