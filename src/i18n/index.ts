// Spanish / English. English text lives in the code, wrapped in t('…');
// es.ts maps each English string to Spanish. tests/i18n.test.ts scans the
// source and fails if any wrapped string has no translation.
//
// The current language is module state (set by SettingsStore before each
// render) so pure helpers in src/lib can translate without React.

import { ES, ES_SEED } from './es';

export type Lang = 'en' | 'es';
export const LANGS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];

let current: Lang = 'en';

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/** Language of the device, for first runs. */
export function deviceLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  return nav.toLowerCase().startsWith('es') ? 'es' : 'en';
}

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Translate in a given language (used to compare stored labels across languages). */
export function tIn(lang: Lang, text: string, vars?: Vars): string {
  return fill(lang === 'es' ? (ES[text] ?? text) : text, vars);
}

/** Translate into the current language. `{name}` placeholders are filled from vars. */
export function t(text: string, vars?: Vars): string {
  return tIn(current, text, vars);
}

/** Singular / plural; `{n}` is the count. Spanish and English share the 1-vs-other rule. */
export function tn(n: number, one: string, other: string, vars?: Vars): string {
  return t(n === 1 ? one : other, { n, ...vars });
}

const ES_TO_EN = new Map(Object.entries(ES_SEED).map(([en, es]) => [es, en]));

/**
 * Names of built-in items (categories, provider types, templates) are stored
 * in whichever language they were saved in. Show them in the current
 * language unless the user renamed them to something of their own.
 */
export function seedText(stored: string): string {
  const en = ES_SEED[stored] !== undefined ? stored : ES_TO_EN.get(stored);
  if (en === undefined) return stored;
  return current === 'es' ? ES_SEED[en] : en;
}

/** Marks a literal for translation without translating it yet (for lookup tables). */
export const m = (text: string): string => text;
