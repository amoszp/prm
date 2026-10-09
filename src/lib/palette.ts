// Curated category colours. Each key maps to CSS tokens --cat-<key> and
// --cat-<key>-soft (light + dark values live in styles/tokens.css), so a
// user-picked colour always stays legible in both themes.

import { m } from '@/i18n';

export const CATEGORY_COLORS = [
  { key: 'graphite', label: m('Graphite') },
  { key: 'terracotta', label: m('Terracotta') },
  { key: 'amber', label: m('Amber') },
  { key: 'olive', label: m('Olive') },
  { key: 'bottle', label: m('Bottle green') },
  { key: 'teal', label: m('Teal') },
  { key: 'cobalt', label: m('Cobalt') },
  { key: 'indigo', label: m('Indigo') },
  { key: 'plum', label: m('Plum') },
  { key: 'rose', label: m('Rose') },
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number]['key'];

const KEYS = new Set<string>(CATEGORY_COLORS.map((c) => c.key));

export function colorVar(key: string): string {
  return `var(--cat-${KEYS.has(key) ? key : 'graphite'})`;
}

export function colorSoftVar(key: string): string {
  return `var(--cat-${KEYS.has(key) ? key : 'graphite'}-soft)`;
}
