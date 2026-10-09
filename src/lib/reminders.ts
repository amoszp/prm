// Pure reminder rules: status, urgency, filtering, grouping, completing,
// cost estimates. No React and no storage, so it is easy to test and the
// future backend can reuse the exact same logic.

import type { HistoryEntry, Interval, Reminder, ReminderStatus } from '@/types';
import { advanceDue, alertMoment, daysFromToday, monthYear, parseISODate, shift, toISODate, todayISO } from './dates';

/** A snoozed reminder whose snooze has run out behaves as active. */
export function effectiveStatus(r: Reminder, now: Date = new Date()): ReminderStatus {
  if (r.status === 'snoozed' && (!r.snoozedUntil || new Date(r.snoozedUntil) <= now)) return 'active';
  return r.status;
}

export function isOpen(r: Reminder, now: Date = new Date()): boolean {
  return effectiveStatus(r, now) === 'active';
}

export type Urgency = 'overdue' | 'today' | 'soon' | 'later' | 'snoozed' | 'paused' | 'done';

export function urgency(r: Reminder, upcomingDays: number, now: Date = new Date()): Urgency {
  const status = effectiveStatus(r, now);
  if (status !== 'active') return status;
  const delta = daysFromToday(r.dueDate, now);
  if (delta < 0) return 'overdue';
  if (delta === 0) return 'today';
  if (delta <= upcomingDays) return 'soon';
  return 'later';
}

export type StatusFilter = 'open' | 'overdue' | 'upcoming' | 'snoozed' | 'paused' | 'done' | 'all';

export interface ReminderQuery {
  status: StatusFilter;
  categoryIds?: string[];
  /** 'action' = needs you to do something, 'auto' = charged automatically. */
  kind?: 'all' | 'action' | 'auto';
  /** 'me' = reminders for no one else; otherwise a person id. Empty = everyone. */
  person?: string;
  text?: string;
  upcomingDays: number;
  /** Extra searchable text per reminder (category / provider names). */
  extraText?: (r: Reminder) => string;
}

export function filterReminders(list: Reminder[], q: ReminderQuery, now: Date = new Date()): Reminder[] {
  const text = q.text?.trim().toLowerCase() ?? '';
  return list.filter((r) => {
    const u = urgency(r, q.upcomingDays, now);
    switch (q.status) {
      case 'open':
        if (!['overdue', 'today', 'soon', 'later'].includes(u)) return false;
        break;
      case 'overdue':
        if (u !== 'overdue') return false;
        break;
      case 'upcoming':
        if (u !== 'today' && u !== 'soon') return false;
        break;
      case 'snoozed':
      case 'paused':
      case 'done':
        if (u !== q.status) return false;
        break;
      case 'all':
        break;
    }
    if (q.categoryIds && q.categoryIds.length > 0 && !q.categoryIds.includes(r.categoryId)) return false;
    if (q.kind === 'action' && r.autoPay) return false;
    if (q.kind === 'auto' && !r.autoPay) return false;
    if (q.person === 'me' && r.personId) return false;
    if (q.person && q.person !== 'me' && r.personId !== q.person) return false;
    if (text) {
      const hay = [r.title, r.notes, r.reference, q.extraText?.(r)].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(text)) return false;
    }
    return true;
  });
}

export function sortByDue(list: Reminder[]): Reminder[] {
  return [...list].sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      (a.dueTime ?? '').localeCompare(b.dueTime ?? '') ||
      a.title.localeCompare(b.title),
  );
}

export interface OverviewGroups {
  overdue: Reminder[];
  today: Reminder[];
  week: Reminder[];
  month: Reminder[];
  later: Reminder[];
}

/** Buckets open reminders by how soon they need attention. */
export function groupForOverview(list: Reminder[], now: Date = new Date()): OverviewGroups {
  const groups: OverviewGroups = { overdue: [], today: [], week: [], month: [], later: [] };
  for (const r of sortByDue(list)) {
    if (!isOpen(r, now)) continue;
    const d = daysFromToday(r.dueDate, now);
    if (d < 0) groups.overdue.push(r);
    else if (d === 0) groups.today.push(r);
    else if (d <= 7) groups.week.push(r);
    else if (d <= 31) groups.month.push(r);
    else groups.later.push(r);
  }
  return groups;
}

export interface MonthGroup {
  key: string; // YYYY-MM
  label: string;
  items: Reminder[];
}

export function groupByMonth(list: Reminder[]): MonthGroup[] {
  const map = new Map<string, Reminder[]>();
  for (const r of sortByDue(list)) {
    const key = r.dueDate.slice(0, 7);
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()].map(([key, items]) => ({ key, label: monthYear(`${key}-01`), items }));
}

/** Day of month a reminder is anchored to, so month-end dates don't drift. */
export function anchorDayOf(dueISO: string): number {
  return parseISODate(dueISO).getDate();
}

/**
 * Complete the current cycle. A repeating reminder logs the cycle in its
 * history and moves to the next due date; a one-off reminder becomes done.
 */
export interface CompleteOptions {
  auto?: boolean;
  skipped?: boolean;
  /** Actual amount paid; defaults to the expected amount. */
  amount?: number;
  /** YYYY-MM-DD the payment / action happened; defaults to the completion day. */
  paidOn?: string;
}

export function completeCycle(r: Reminder, historyId: string, nowIso: string, opts: CompleteOptions = {}): Reminder {
  const entry: HistoryEntry = {
    id: historyId,
    dueDate: r.dueDate,
    completedAt: nowIso,
    ...(opts.skipped ? { skipped: true } : { amount: opts.amount ?? r.amount, paidOn: opts.paidOn ?? nowIso.slice(0, 10) }),
    ...(opts.auto ? { auto: true, paidOn: r.dueDate } : {}),
  };
  const history = [entry, ...r.history];
  if (!r.repeat) {
    return { ...r, history, status: 'done', snoozedUntil: undefined, updatedAt: nowIso };
  }
  return {
    ...r,
    history,
    dueDate: advanceDue(r.dueDate, r.repeat, r.anchorDay ?? anchorDayOf(r.dueDate)),
    status: 'active',
    snoozedUntil: undefined,
    updatedAt: nowIso,
  };
}

/**
 * Auto-charged reminders settle themselves: once the due date is in the past
 * each missed cycle is logged and the reminder moves on (one-offs become
 * done). Returns only the reminders that changed.
 */
export function settleAutoCharges(list: Reminder[], now: Date, makeId: () => string, nowIso: string): Reminder[] {
  const today = todayISO(now);
  const changed: Reminder[] = [];
  for (const original of list) {
    if (!original.autoPay || effectiveStatus(original, now) !== 'active' || original.dueDate >= today) continue;
    let r = original;
    // Guard against pathological intervals; 500 cycles is decades of daily charges.
    for (let i = 0; i < 500 && r.status === 'active' && r.dueDate < today; i++) {
      r = completeCycle(r, makeId(), nowIso, { auto: true });
    }
    changed.push(r);
  }
  return changed;
}

/** Open auto-charged reminders due within `days` (soonest first). */
export function upcomingCharges(list: Reminder[], days: number, now: Date = new Date()): Reminder[] {
  return sortByDue(list).filter((r) => {
    if (!r.autoPay || !isOpen(r, now)) return false;
    const d = daysFromToday(r.dueDate, now);
    return d >= 0 && d <= days;
  });
}

/** Number for the app-icon badge: things that need you today or are overdue. */
export function badgeCount(list: Reminder[], now: Date = new Date()): number {
  return list.filter((r) => !r.autoPay && isOpen(r, now) && daysFromToday(r.dueDate, now) <= 0).length;
}

/** Undo the most recent completion (restores the previous due date and reopens). */
export function undoLastCycle(r: Reminder, nowIso: string): Reminder {
  const [last, ...rest] = r.history;
  if (!last) return r;
  return { ...r, history: rest, dueDate: last.dueDate, status: 'active', snoozedUntil: undefined, updatedAt: nowIso };
}

/** Last day to cancel / switch / decide, or null when there is no notice period. */
export function noticeDeadline(r: Reminder): string | null {
  if (!r.notice) return null;
  return toISODate(shift(parseISODate(r.dueDate), -r.notice.period.value, r.notice.period.unit));
}

/** Next alert moment still in the future (due-date or deadline alerts), or null. */
export function nextAlert(r: Reminder, now: Date = new Date()): Date | null {
  if (r.status === 'done' || r.status === 'paused') return null;
  const deadline = noticeDeadline(r);
  const upcoming = [
    ...r.alerts.map((lead) => alertMoment(r.dueDate, r.dueTime, lead)),
    ...(deadline && r.notice ? r.notice.alerts.map((lead) => alertMoment(deadline, undefined, lead)) : []),
  ]
    .filter((d) => d > now)
    .sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0] ?? null;
}

const PER_MONTH: Record<Interval['unit'], number> = { day: 30.44, week: 4.345, month: 1, year: 1 / 12 };

export interface PriceChange {
  from: number;
  to: number;
  /** Relative change, e.g. 0.167 = +16.7 % */
  pct: number;
  /** Due date of the cycle where the new price first appeared. */
  since: string;
}

/** Compares the two most recent payments that recorded an amount. */
export function priceChange(r: Reminder): PriceChange | null {
  const paid = r.history.filter((h) => !h.skipped && h.amount != null);
  if (paid.length < 2) return null;
  const [latest, previous] = paid;
  const to = latest.amount as number;
  const from = previous.amount as number;
  if (Math.abs(to - from) < 0.005 || from === 0) return null;
  return { from, to, pct: (to - from) / from, since: latest.dueDate };
}

/** Normalised monthly cost of a repeating reminder (null when not applicable). */
export function monthlyCost(r: Reminder): number | null {
  if (!r.repeat || !r.amount) return null;
  return (r.amount * PER_MONTH[r.repeat.unit]) / r.repeat.every;
}

export interface CostSummary {
  perMonth: number;
  perYear: number;
  /** Repeating reminders with amounts in a currency other than the default. */
  otherCurrencyCount: number;
  counted: number;
}

export function costSummary(list: Reminder[], currency: string): CostSummary {
  let perMonth = 0;
  let otherCurrencyCount = 0;
  let counted = 0;
  for (const r of list) {
    if (r.status === 'done' || r.status === 'paused') continue;
    const m = monthlyCost(r);
    if (m == null) continue;
    if ((r.currency ?? currency) !== currency) {
      otherCurrencyCount++;
      continue;
    }
    perMonth += m;
    counted++;
  }
  return { perMonth, perYear: perMonth * 12, otherCurrencyCount, counted };
}
