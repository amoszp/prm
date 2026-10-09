// Money maths for the Money view: a 12-month forecast of upcoming charges,
// recurring cost per category, and price changes. Pure — reusable server-side.

import type { Reminder } from '@/types';
import { addMonths, advanceDue, toISODate, todayISO } from './dates';
import { monthlyCost, priceChange, type PriceChange } from './reminders';

export interface Charge {
  reminder: Reminder;
  date: string;
  amount: number;
}

export interface MonthBucket {
  key: string; // YYYY-MM
  date: Date; // first of the month
  total: number;
  charges: Charge[];
}

/** Due dates of a reminder between two ISO dates (inclusive). */
export function occurrences(r: Reminder, fromISO: string, toISO: string): string[] {
  if (r.status === 'done' || r.status === 'paused') return [];
  const out: string[] = [];
  let date = r.dueDate;
  for (let i = 0; i < 1000 && date <= toISO; i++) {
    if (date >= fromISO) out.push(date);
    if (!r.repeat) break;
    date = advanceDue(date, r.repeat, r.anchorDay);
  }
  return out;
}

/**
 * Upcoming charges grouped by calendar month, starting with the current one.
 * Only amounts in `currency` are summed; others are counted separately.
 */
export function forecast(list: Reminder[], currency: string, now: Date = new Date(), months = 12) {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const buckets: MonthBucket[] = Array.from({ length: months }, (_, i) => {
    const date = addMonths(first, i);
    return { key: toISODate(date).slice(0, 7), date, total: 0, charges: [] };
  });
  const from = todayISO(now);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + months, 0);
  const to = toISODate(lastDay);
  const index = new Map(buckets.map((b) => [b.key, b]));
  let otherCurrency = 0;

  for (const r of list) {
    if (!r.amount) continue;
    if ((r.currency ?? currency) !== currency) {
      if (occurrences(r, from, to).length) otherCurrency++;
      continue;
    }
    for (const date of occurrences(r, from, to)) {
      const bucket = index.get(date.slice(0, 7));
      if (!bucket) continue;
      bucket.total += r.amount;
      bucket.charges.push({ reminder: r, date, amount: r.amount });
    }
  }
  for (const b of buckets) b.charges.sort((a, b2) => a.date.localeCompare(b2.date));
  const total = buckets.reduce((s, b) => s + b.total, 0);
  const heaviest = buckets.reduce<MonthBucket | null>((max, b) => (b.total > (max?.total ?? 0) ? b : max), null);
  return { buckets, total, heaviest, otherCurrency };
}

/** Recurring cost per month, per category, biggest first. */
export function categoryTotals(list: Reminder[], currency: string): { categoryId: string; perMonth: number; count: number }[] {
  const map = new Map<string, { perMonth: number; count: number }>();
  for (const r of list) {
    if (r.status === 'done' || r.status === 'paused' || (r.currency ?? currency) !== currency) continue;
    const m = monthlyCost(r);
    if (m == null) continue;
    const cur = map.get(r.categoryId) ?? { perMonth: 0, count: 0 };
    map.set(r.categoryId, { perMonth: cur.perMonth + m, count: cur.count + 1 });
  }
  return [...map.entries()].map(([categoryId, v]) => ({ categoryId, ...v })).sort((a, b) => b.perMonth - a.perMonth);
}

/** Reminders whose last payment differs from the one before, most recent first. */
export function priceChanges(list: Reminder[]): { reminder: Reminder; change: PriceChange }[] {
  return list
    .map((reminder) => ({ reminder, change: priceChange(reminder) }))
    .filter((x): x is { reminder: Reminder; change: PriceChange } => x.change !== null)
    .sort((a, b) => b.change.since.localeCompare(a.change.since));
}

