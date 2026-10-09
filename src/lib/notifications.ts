// Local alert engine. Decides which alerts are due and shows them through the
// service worker (the path that works on installed iOS/Android PWAs).
//
// Limitation of this phase: a browser can only run this while the app is
// open. Phase 2 moves `dueAlerts` to the server and delivers via Telegram,
// which works with the phone locked.

import type { LeadTime, Reminder } from '@/types';
import { alertMoment, addDays, daysFromToday, dueMoment, formatCurrency, formatDate, locale, parseISODate, relativeLabel, todayISO } from './dates';
import { isOpen, noticeDeadline } from './reminders';
import { t } from '@/i18n';

const FIRED_KEY = 'prm:fired';

export function alertKey(r: Reminder, lead: LeadTime): string {
  return `${r.id}:${r.dueDate}:${lead.value}${lead.unit}`;
}

export interface DueAlert {
  reminder: Reminder;
  lead: LeadTime;
  /** Keys for every alert that has passed, so stale ones are silenced too. */
  keys: string[];
  /** Daily "still overdue" reminder rather than a scheduled alert. */
  nag?: boolean;
  /** About the cancel / decide-by deadline rather than the due date. */
  notice?: string;
}

export const NAG_HOUR = 9;

/**
 * Alerts that should fire now. For each open reminder, every alert whose
 * moment has passed (until one day after the due moment) is considered; only
 * the one closest to the due date is shown, so opening the app late never
 * produces a burst of notifications for the same item.
 */
export function dueAlerts(reminders: Reminder[], fired: Set<string>, now: Date = new Date()): DueAlert[] {
  const out: DueAlert[] = [];
  for (const r of reminders) {
    // Cancel / decide-by deadline: its own alerts, until the end of that day.
    const deadline = noticeDeadline(r);
    if (deadline && r.notice && isOpen(r, now) && now < addDays(parseISODate(deadline), 1)) {
      const moment = (lead: LeadTime) => alertMoment(deadline, undefined, lead).getTime();
      const passed = r.notice.alerts.filter((l) => moment(l) <= now.getTime()).sort((a, b) => moment(b) - moment(a));
      const keys = passed.map((l) => `${r.id}:${r.dueDate}:notice:${l.value}${l.unit}`);
      if (passed.length && !keys.every((k) => fired.has(k))) out.push({ reminder: r, lead: passed[0], keys, notice: deadline });
    }
    if (!isOpen(r, now) || (r.alerts.length === 0 && !r.nagDaily)) continue;
    const graceEnd = addDays(dueMoment(r.dueDate, r.dueTime), 1);
    if (now >= graceEnd) {
      // Past the normal window: only the daily nag (if enabled) applies.
      if (r.nagDaily && !r.autoPay && now.getHours() >= NAG_HOUR) {
        const key = `${r.id}:${r.dueDate}:nag:${todayISO(now)}`;
        if (!fired.has(key)) out.push({ reminder: r, lead: { value: 0, unit: 'day' }, keys: [key], nag: true });
      }
      continue;
    }
    const moment = (lead: LeadTime) => alertMoment(r.dueDate, r.dueTime, lead).getTime();
    const passed = r.alerts.filter((lead) => moment(lead) <= now.getTime()).sort((a, b) => moment(b) - moment(a));
    if (passed.length === 0) continue;
    const keys = passed.map((lead) => alertKey(r, lead));
    if (keys.every((k) => fired.has(k))) continue;
    out.push({ reminder: r, lead: passed[0], keys });
  }
  return out;
}

export function alertMessage(r: Reminder, now: Date = new Date(), notice?: string): string {
  const lower = (iso: string) => relativeLabel(iso, now).toLocaleLowerCase(locale());
  if (notice) return t('Last day to cancel or decide: {when} · {date}', { when: lower(notice), date: formatDate(notice) });
  const date = formatDate(r.dueDate);
  if (r.autoPay) {
    return r.amount
      ? t('{amount} charged {when} · {date}', { amount: formatCurrency(r.amount, r.currency), when: lower(r.dueDate), date })
      : t('Charged {when} · {date}', { when: lower(r.dueDate), date });
  }
  if (daysFromToday(r.dueDate, now) === 0) return t('Due today · {date}', { date });
  return `${relativeLabel(r.dueDate, now)} · ${date}`;
}

export function loadFired(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function saveFired(fired: Set<string>): void {
  try {
    // Keep the most recent 500 keys; older ones belong to past cycles.
    localStorage.setItem(FIRED_KEY, JSON.stringify([...fired].slice(-500)));
  } catch {
    // storage full or blocked — worst case an alert repeats once
  }
}

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** App-icon badge (Badging API): installed PWAs, iOS 16.4+ once notifications are allowed. */
export function badgeSupported(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
}

export async function setAppBadge(count: number): Promise<void> {
  if (!badgeSupported()) return;
  const nav = navigator as BadgeNavigator;
  try {
    if (count > 0) await nav.setAppBadge?.(count);
    else await nav.clearAppBadge?.();
  } catch {
    // not allowed yet (no notification permission) — nothing to do
  }
}

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export async function showNotification(title: string, body: string, tag: string): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  try {
    const reg = sw ? await sw.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png' });
      return;
    }
  } catch {
    // fall back to the page-level API below
  }
  try {
    new Notification(title, { body, tag });
  } catch {
    // iOS outside an installed PWA has no page-level Notification
  }
}
