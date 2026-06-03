// Maps the device's primary locale to an English language name we hand to the AI prompt.
// The model handles "Spanish" more reliably than BCP-47 tags like "es-MX".
//
// Used only for idle suggestion cards (no user input exists yet to language-detect from). The chat
// reply path lets the model detect language from the user's most recent message — no helper needed.

import { getLocales } from 'expo-localization';

// ISO 639-1 codes → English language names. Covers the languages GPT-4o-mini handles best.
// Anything outside this map falls back to English so a stray "??" locale never confuses the model.
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  ru: 'Russian',
  uk: 'Ukrainian',
  tr: 'Turkish',
  ar: 'Arabic',
  he: 'Hebrew',
  fa: 'Persian',
  hi: 'Hindi',
  id: 'Indonesian',
  vi: 'Vietnamese',
  th: 'Thai',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  sw: 'Swahili',
  tl: 'Tagalog',
};

/** Device's primary language as an English name (e.g. "Spanish"). Falls back to "English". */
export function getDeviceLanguageName(): string {
  try {
    const code = getLocales()[0]?.languageCode?.toLowerCase();
    if (code && LANGUAGE_NAMES[code]) return LANGUAGE_NAMES[code];
  } catch {
    // expo-localization can throw if the native module isn't linked yet (e.g. mid-rebuild).
  }
  return 'English';
}
