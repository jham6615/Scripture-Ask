// Core Bible data model — translation-agnostic.
// Adding a new version later = add its id to TranslationId, register it in TRANSLATIONS, and bundle
// (or, eventually, fetch) its book data. Versions carry their `language` so a picker can group them,
// and `direction` anticipates right-to-left scripts (Arabic, Hebrew, …).

// Extend this union per available version, e.g. 'web' | 'kjv' | 'rvr60'.
export type TranslationId = 'web';

export type TranslationMeta = {
  id: TranslationId;
  name: string;
  abbreviation: string;
  /** BCP-47 language tag, e.g. "en", "es", "ar". Lets a picker group versions by language. */
  language: string;
  /** Human-readable language label for that picker, e.g. "English", "Español". */
  languageName: string;
  /** Script direction; drives RTL layout when those languages are added. */
  direction: 'ltr' | 'rtl';
};

export type Verse = {
  verse: number;
  text: string;
};

export type Chapter = {
  chapter: number;
  verses: Verse[];
};

export type Book = {
  /** Canonical book id, e.g. "JHN". */
  id: string;
  /** Display name, e.g. "John". */
  name: string;
  translationId: TranslationId;
  chapters: Chapter[];
};
