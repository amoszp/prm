// Guards the Spanish translation: every string wrapped for translation must
// exist in es.ts, and no plain English may be left in JSX or in the
// attributes users read or hear (labels, titles, placeholders, aria-labels).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ES, ES_SEED } from '../src/i18n/es';
import { seedText, setLang, t, tn } from '../src/i18n';
import { formatCurrency, formatDate, intervalLabel, leadLabel, relativeLabel } from '../src/lib/dates';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !path.includes(`${join('src', 'i18n')}`) ? [path] : [];
  });
}

const FILES = sourceFiles(join(__dirname, '..', 'src'));
const LIT = String.raw`'((?:[^'\\]|\\.)*)'`;

function keysIn(code: string): string[] {
  const keys: string[] = [];
  for (const re of [
    new RegExp(String.raw`\b(?:t|m|tr)\(\s*${LIT}`, 'g'),
    new RegExp(String.raw`\btIn\(\s*\w+\s*,\s*${LIT}`, 'g'),
  ]) {
    for (const match of code.matchAll(re)) keys.push(match[1]);
  }
  const plural = new RegExp(String.raw`\btn\(\s*[^,]+?,\s*${LIT}\s*,\s*${LIT}`, 'gs');
  for (const match of code.matchAll(plural)) keys.push(match[1], match[2]);
  return keys;
}

afterEach(() => setLang('en'));

describe('Spanish translation', () => {
  it('has a translation for every wrapped string', () => {
    const missing = new Set<string>();
    let total = 0;
    for (const file of FILES) {
      for (const key of keysIn(readFileSync(file, 'utf8'))) {
        total++;
        if (!(key in ES)) missing.add(key);
      }
    }
    expect(total).toBeGreaterThan(300);
    expect([...missing]).toEqual([]);
  });

  it('never wraps template literals (they could not be looked up)', () => {
    const offenders = FILES.filter((f) => /\b(?:t|tn|m)\(\s*`/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('keeps every placeholder in the translation', () => {
    const bad = Object.entries(ES).filter(([en, es]) => {
      const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      return vars(en) !== vars(es);
    });
    expect(bad).toEqual([]);
  });

  it('leaves no hard-coded English in JSX text or readable attributes', () => {
    const ATTR = /\b(?:label|title|placeholder|aria-label|hint|desc|sub|eyebrow|confirmLabel|alt)="([^"]*[A-Za-z]{2}[^"]*)"/g;
    // Text sitting directly before a closing tag, e.g. <span>Done</span> (not `=> a < b` or generics).
    const JSX_TEXT = /(?<!=)>\s*([A-Za-z][^<>{}();=]*[A-Za-z.!?…])\s*<\//g;
    const ALLOWED = new Set(['EUR', 'example.com']);
    const found: string[] = [];
    for (const file of FILES.filter((f) => f.endsWith('.tsx'))) {
      const code = readFileSync(file, 'utf8');
      for (const m of code.matchAll(ATTR)) if (!ALLOWED.has(m[1])) found.push(`${file}: ${m[1]}`);
      for (const m of code.matchAll(JSX_TEXT)) {
        if (!ALLOWED.has(m[1].trim())) found.push(`${file}: ${m[1].trim()}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('switches words, plurals, dates and money', () => {
    setLang('es');
    expect(t('Overdue')).toBe(ES.Overdue);
    expect(tn(1, '{n} reminder', '{n} reminders')).toBe('1 recordatorio');
    expect(tn(3, '{n} reminder', '{n} reminders')).toBe('3 recordatorios');
    expect(intervalLabel({ every: 10, unit: 'year' })).toBe('Cada 10 años');
    expect(leadLabel({ value: 2, unit: 'week' })).toBe('2 semanas antes');
    expect(relativeLabel('2026-10-08', new Date(2026, 9, 6))).toBe('En 2 días');
    expect(formatDate('2027-03-14')).toMatch(/14 mar 2027/);
    expect(formatCurrency(13.99, 'EUR')).toMatch(/13,99\s€/);

    setLang('en');
    expect(intervalLabel({ every: 10, unit: 'year' })).toBe('Every 10 years');
    expect(formatCurrency(13.99, 'EUR')).toBe('€13.99');
  });

  it('shows built-in names in the current language but leaves renamed ones alone', () => {
    setLang('es');
    expect(seedText('Insurance')).toBe(ES_SEED.Insurance);
    expect(seedText('Gym')).toBe('Gym');
    setLang('en');
    expect(seedText(ES_SEED.Insurance)).toBe('Insurance'); // saved while in Spanish
  });
});
