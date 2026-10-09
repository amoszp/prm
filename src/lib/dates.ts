// Calendar helpers. Stored dates are local ISO 'YYYY-MM-DD'; all math runs in
// the user's timezone so "today" matches their wall calendar.

import type { Interval, LeadTime, TimeUnit } from '@/types';
import { getLang, m, t, tIn, type Lang } from '@/i18n';

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

/** Parse 'YYYY-MM-DD' as a local date (never UTC, which shifts the day). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function isValidISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return toISODate(parseISODate(iso)) === iso;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Add months, clamping to the month's last day (Jan 31 + 1 month = Feb 28/29).
 * `anchorDay` keeps month-end reminders on their intended day: a reminder
 * anchored to the 31st goes 31 Jan → 28 Feb → 31 Mar instead of drifting to 28.
 */
export function addMonths(date: Date, months: number, anchorDay?: number): Date {
  const day = anchorDay ?? date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const clamped = Math.min(day, daysInMonth(target.getFullYear(), target.getMonth()));
  return new Date(target.getFullYear(), target.getMonth(), clamped, date.getHours(), date.getMinutes());
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Shift a moment by N calendar units (negative = backwards). */
export function shift(date: Date, amount: number, unit: TimeUnit, anchorDay?: number): Date {
  switch (unit) {
    case 'hour':
      return new Date(date.getTime() + amount * 3_600_000);
    case 'day':
      return addDays(date, amount);
    case 'week':
      return addDays(date, amount * 7);
    case 'month':
      return addMonths(date, amount, anchorDay);
    case 'year':
      return addMonths(date, amount * 12, anchorDay);
  }
}

/** Next due date after completing one cycle. */
export function advanceDue(dueISO: string, interval: Interval, anchorDay?: number): string {
  return toISODate(shift(parseISODate(dueISO), interval.every, interval.unit, anchorDay));
}

export function diffDays(fromISO: string, toISO: string): number {
  const ms = parseISODate(toISO).getTime() - parseISODate(fromISO).getTime();
  return Math.round(ms / 86_400_000);
}

export function daysFromToday(iso: string, now: Date = new Date()): number {
  return diffDays(todayISO(now), iso);
}

/** Exact moment something is due. Without a time it is due at 09:00 local. */
export function dueMoment(dateISO: string, dueTime?: string): Date {
  const d = parseISODate(dateISO);
  const [h, m] = (dueTime ?? '09:00').split(':').map(Number);
  if (Number.isFinite(h) && Number.isFinite(m)) d.setHours(h, m, 0, 0);
  else d.setHours(9, 0, 0, 0);
  return d;
}

/** Moment an alert fires: the due moment minus the lead time. */
export function alertMoment(dateISO: string, dueTime: string | undefined, lead: LeadTime): Date {
  return shift(dueMoment(dateISO, dueTime), -lead.value, lead.unit);
}

// ---------------------------------------------------------------------------
// Labels (translated — see src/i18n)
// ---------------------------------------------------------------------------

const UNIT_WORD: Record<TimeUnit, [string, string]> = {
  hour: [m('hour'), m('hours')],
  day: [m('day'), m('days')],
  week: [m('week'), m('weeks')],
  month: [m('month'), m('months')],
  year: [m('year'), m('years')],
};

export function unitWord(unit: TimeUnit, n: number): string {
  return t(UNIT_WORD[unit][n === 1 ? 0 : 1]);
}

/** Unit word as used in a lead time: "days before". */
const UNIT_BEFORE: Record<TimeUnit, [string, string]> = {
  hour: [m('hour before'), m('hours before')],
  day: [m('day before'), m('days before')],
  week: [m('week before'), m('weeks before')],
  month: [m('month before'), m('months before')],
  year: [m('year before'), m('years before')],
};

export function unitBefore(unit: TimeUnit, n: number): string {
  return t(UNIT_BEFORE[unit][n === 1 ? 0 : 1]);
}

const SIMPLE_REPEAT: Record<Interval['unit'], string> = {
  day: m('Daily'),
  week: m('Weekly'),
  month: m('Monthly'),
  year: m('Yearly'),
};

const EVERY: Record<Interval['unit'], string> = {
  day: m('Every {n} days'),
  week: m('Every {n} weeks'),
  month: m('Every {n} months'),
  year: m('Every {n} years'),
};

export function intervalLabel(interval: Interval | null): string {
  return intervalLabelIn(getLang(), interval);
}

export function intervalLabelIn(lang: Lang, interval: Interval | null): string {
  if (!interval) return tIn(lang, 'Once');
  if (interval.every === 1) return tIn(lang, SIMPLE_REPEAT[interval.unit]);
  if (interval.unit === 'month' && interval.every === 3) return tIn(lang, 'Quarterly');
  return tIn(lang, EVERY[interval.unit], { n: interval.every });
}

const LEAD: Record<TimeUnit, [string, string]> = {
  hour: [m('{n} hour before'), m('{n} hours before')],
  day: [m('{n} day before'), m('{n} days before')],
  week: [m('{n} week before'), m('{n} weeks before')],
  month: [m('{n} month before'), m('{n} months before')],
  year: [m('{n} year before'), m('{n} years before')],
};

export function leadLabel(lead: LeadTime): string {
  return leadLabelIn(getLang(), lead);
}

export function leadLabelIn(lang: Lang, lead: LeadTime): string {
  if (lead.value === 0) return tIn(lang, 'On the day');
  return tIn(lang, LEAD[lead.unit][lead.value === 1 ? 0 : 1], { n: lead.value });
}

export function sameLead(a: LeadTime, b: LeadTime): boolean {
  return a.value === b.value && a.unit === b.unit;
}

export function sameInterval(a: Interval | null, b: Interval | null): boolean {
  if (!a || !b) return a === b;
  return a.every === b.every && a.unit === b.unit;
}

/** Approximate length in minutes — only for sorting alert lists. */
export function leadSortKey(lead: LeadTime): number {
  const minutes: Record<TimeUnit, number> = { hour: 60, day: 1440, week: 10080, month: 43830, year: 525960 };
  return lead.value * minutes[lead.unit];
}

/** en-GB keeps day-month order and 24h time (as used in Spain); es-ES for Spanish. */
const LOCALES: Record<Lang, string> = { en: 'en-GB', es: 'es-ES' };

export function locale(): string {
  return LOCALES[getLang()];
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function dateFormat(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale()}|${JSON.stringify(opts)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale(), opts);
    formatters.set(key, f);
  }
  return f;
}

const capitalise = (s: string) => s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1);

export function formatDateTime(d: Date): string {
  return dateFormat({ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatDateShort(iso: string): string {
  return dateFormat({ day: 'numeric', month: 'short' }).format(parseISODate(iso));
}

export function formatDate(iso: string): string {
  return dateFormat({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(parseISODate(iso));
}

export function formatToday(now: Date = new Date()): string {
  return dateFormat({ weekday: 'long', day: 'numeric', month: 'long' }).format(now);
}

export function monthShort(iso: string): string {
  return formatMonthShort(parseISODate(iso));
}

export function formatMonthShort(d: Date): string {
  return dateFormat({ month: 'short' }).format(d).replace('.', '');
}

/** "March 2027" / "Marzo de 2027" — used as a heading. */
export function formatMonthYear(d: Date): string {
  return capitalise(dateFormat({ month: 'long', year: 'numeric' }).format(d));
}

export function monthYear(iso: string): string {
  return formatMonthYear(parseISODate(iso));
}

/** "Today", "Tomorrow", "In 5 days", "3 days ago", or months/years for far-off items. */
export function relativeLabel(iso: string, now: Date = new Date()): string {
  const delta = daysFromToday(iso, now);
  if (delta === 0) return t('Today');
  if (delta === 1) return t('Tomorrow');
  if (delta === -1) return t('Yesterday');
  if (delta < 0) return t('{n} days ago', { n: -delta });
  if (delta < 60) return t('In {n} days', { n: delta });
  if (delta < 730) return t('In {n} months', { n: Math.round(delta / 30.44) });
  return t('In {n} years', { n: Math.round(delta / 365.25) });
}

export function formatCurrency(amount: number, currency = 'EUR'): string {
  try {
    return new Intl.NumberFormat(locale(), { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
