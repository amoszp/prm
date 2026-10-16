// Polls for due alerts and settles auto-charged reminders — the server-side
// equivalent of what the frontend does while the app happens to be open.
//
// Reuses the frontend's own pure logic instead of re-deriving due-date math:
// nextAlert() (src/lib/reminders.ts) already computes a reminder's alert
// moments from its due date, notice period and repeat rule, and has its own
// passing tests. This is a *literal* runtime import of that frontend file —
// not a copy — so the backend can never silently disagree with the app
// about when an alert should fire (the exact bug class found and fixed in
// Kage: an alert drifting from its event after a date edit).
import { randomUUID } from 'node:crypto';
import { AccountsUnavailable, getUserDetails } from './auth';
import { listRecords, listUserIds, markAlertSent, putRecord, wasAlertSent } from './db';
import { sendTelegramMessage } from './telegram';
import { isOpen, nextAlert, settleAutoCharges } from '../../src/lib/reminders';
import { daysFromToday } from '../../src/lib/dates';
import type { Category, Person, Reminder } from '../../src/types';

const POLL_SECONDS = Number(process.env.SCHEDULER_INTERVAL_SECONDS ?? 60);
const LEGACY_OWNER = (process.env.LEGACY_OWNER_USERNAME ?? '').trim().toLowerCase();
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID || null;

// Each account's alerts go to its own Telegram chat (set in the accounts
// service). The chat in the env file is kept for the original user.
async function chatFor(userId: number): Promise<string | null> {
  const user = await getUserDetails(userId);
  if (!user || user.disabled) return null;
  if (user.telegramChatId) return user.telegramChatId;
  return user.username === LEGACY_OWNER ? DEFAULT_CHAT_ID : null;
}

// Same visual language as Kage's Telegram notifications (see its vault note,
// "Telegram notification format"), extended with the extra fields PRM's
// richer data model has that Kage doesn't (category, amount, person).
const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatDateEs(iso: string): string {
  const [, month, day] = iso.split('-').map(Number);
  return `${day} de ${MONTHS_ES[month - 1]}`;
}

function formatMomentEs(d: Date): { date: string; time: string } {
  const date = `${d.getDate()} de ${MONTHS_ES[d.getMonth()]}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

function buildDueMessage(
  r: Reminder,
  category: Category | undefined,
  person: Person | undefined,
  next: Date | null
): string {
  const lines = ['💥Chacho espabila:', '', `✨${r.title}`, `📅${formatDateEs(r.dueDate)}`];
  if (r.dueTime) lines.push(`🕰️${r.dueTime}`);
  if (category) lines.push(`🏷️${category.name}`);
  if (r.amount != null) lines.push(`💶${r.amount.toFixed(2)} ${r.currency ?? 'EUR'}`);
  if (person) lines.push(`🙋${person.name}`);
  if (next) {
    const n = formatMomentEs(next);
    lines.push('', '🟩 Siguiente Aviso:', `📅${n.date}`, `🕰️${n.time}`);
  }
  return lines.join('\n');
}

function buildNagMessage(r: Reminder, now: Date): string {
  const days = Math.max(0, -daysFromToday(r.dueDate, now));
  const lines = [
    '🔁Chacho, esto sigue pendiente:',
    '',
    `✨${r.title}`,
    `📅${formatDateEs(r.dueDate)}`,
    `⏳Vencido hace ${days} día${days === 1 ? '' : 's'}`,
  ];
  return lines.join('\n');
}
// Bounded by the number of alerts a single reminder can carry (due-date
// alerts + notice-period alerts); a reminder realistically never exceeds
// this. Purely a safety net against a pathological/corrupt record.
const MAX_ALERTS_PER_SWEEP = 50;

/**
 * Every alert moment for `r` that has arrived by `now` and hasn't already
 * been recorded as sent, oldest first. Walks nextAlert() forward from just
 * before the reminder was created instead of re-deriving which moments
 * exist — nextAlert(r, ref) always returns the earliest moment strictly
 * after `ref`, so repeatedly advancing `ref` to the moment just found
 * enumerates the reminder's whole alert set without duplicating any of its
 * internal math.
 */
export function collectDueAlerts(r: Reminder, now: Date): Date[] {
  const due: Date[] = [];
  let ref = new Date(new Date(r.createdAt).getTime() - 1000);
  for (let i = 0; i < MAX_ALERTS_PER_SWEEP; i++) {
    const moment = nextAlert(r, ref);
    if (!moment || moment > now) break;
    due.push(moment);
    ref = moment;
  }
  return due;
}

/** "nag:<YYYY-MM-DD>" — namespaced so it can't collide with a real alert's
 * ISO instant in the shared sent_alerts table. */
export function nagKey(now: Date): string {
  return `nag:${now.toISOString().slice(0, 10)}`;
}

/**
 * nagDaily has no equivalent in nextAlert() by design (see src/lib/reminders.ts's
 * own comment) — "renotify every day from 09:00 while overdue" is a
 * scheduler-only policy, not part of the shared due-date math, so it lives
 * here rather than in the frontend lib.
 */
export function shouldNag(r: Reminder, now: Date): boolean {
  if (!r.nagDaily || !isOpen(r, now)) return false;
  if (daysFromToday(r.dueDate, now) >= 0) return false; // not overdue yet
  const today9am = new Date(now);
  today9am.setHours(9, 0, 0, 0);
  return now >= today9am;
}

async function runAlertSweep(userId: number): Promise<void> {
  const now = new Date();
  const reminders = listRecords<Reminder>(userId, 'reminders');
  const categories = new Map(listRecords<Category>(userId, 'categories').map((c) => [c.id, c]));
  const people = new Map(listRecords<Person>(userId, 'people').map((p) => [p.id, p]));
  // Looked up once something is due; an account without a chat skips its alerts.
  let chat: string | null | undefined;
  const send = async (text: string): Promise<boolean> => {
    if (chat === undefined) chat = await chatFor(userId);
    if (!chat) {
      console.warn(`[scheduler] no Telegram chat for user ${userId}, alert skipped`);
      return true; // marked as handled, so it isn't retried every minute
    }
    await sendTelegramMessage(text, chat);
    return true;
  };

  for (const r of reminders) {
    const category = categories.get(r.categoryId);
    const person = r.personId ? people.get(r.personId) : undefined;

    for (const moment of collectDueAlerts(r, now)) {
      const key = moment.toISOString();
      if (wasAlertSent(r.id, key)) continue;
      const next = nextAlert(r, moment);
      await send(buildDueMessage(r, category, person, next));
      markAlertSent(r.id, key);
    }

    if (shouldNag(r, now)) {
      const key = nagKey(now);
      if (!wasAlertSent(r.id, key)) {
        await send(buildNagMessage(r, now));
        markAlertSent(r.id, key);
      }
    }
  }
}

/** Mirrors the frontend's own effect (DataStore.tsx): auto-charged reminders
 * whose due date has passed complete themselves, so they keep rolling
 * forward even between app opens — same behavior, run server-side too. */
async function runSettlement(userId: number): Promise<void> {
  const now = new Date();
  const reminders = listRecords<Reminder>(userId, 'reminders');
  const changed = settleAutoCharges(reminders, now, () => randomUUID(), now.toISOString());
  for (const r of changed) putRecord(userId, 'reminders', r);
}

export function startScheduler(): void {
  const tick = async () => {
    for (const userId of listUserIds()) {
      try {
        await runSettlement(userId);
        await runAlertSweep(userId);
      } catch (err) {
        // Accounts service down: alerts stay unsent and go out on a later tick.
        if (err instanceof AccountsUnavailable) console.warn('[scheduler] accounts service unavailable, retrying later');
        else console.error(`[scheduler] tick failed for user ${userId}:`, err);
      }
    }
  };
  void tick();
  setInterval(tick, POLL_SECONDS * 1000);
  console.log(`[scheduler] polling every ${POLL_SECONDS}s`);
}
