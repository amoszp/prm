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
import {
  addExtraAlert,
  dueExtraAlerts,
  getRecord,
  listRecords,
  listUserIds,
  markAlertSent,
  markExtraAlertSent,
  putRecord,
  wasAlertSent,
} from './db';
import {
  answerCallback,
  editTelegramMessage,
  sendTelegramMessage,
  startTelegramPolling,
  type CallbackQuery,
  type InlineButton,
} from './telegram';
import { completeCycle, isOpen, nextAlert, settleAutoCharges } from '../../src/lib/reminders';
import { daysFromToday } from '../../src/lib/dates';
import type { Reminder } from '../../src/types';

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

// Same format as Kage's Telegram alerts: only the event (title, date, time),
// plus the amount when the reminder has one.
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(iso: string, withYear = false): string {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS_EN[month - 1]}${withYear ? ` ${year}` : ''}`;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function buildDueMessage(r: Reminder): string {
  const lines = [`✨${r.title}`, `📅${formatDate(r.dueDate)}`];
  if (r.dueTime) lines.push(`🕰️${r.dueTime}`);
  if (r.amount != null) {
    const currency = r.currency ?? 'EUR';
    lines.push(`💶${r.amount.toFixed(2)} ${currency === 'EUR' ? '€' : currency}`);
  }
  return lines.join('\n');
}

export function buildNagMessage(r: Reminder, now: Date): string {
  const days = Math.max(0, -daysFromToday(r.dueDate, now));
  return [`✨${r.title}`, `📅${formatDate(r.dueDate)}`, `⏳Overdue by ${days} day${days === 1 ? '' : 's'}`].join('\n');
}

const completeButton = (userId: number, r: Reminder): InlineButton => ({
  text: '✅ Completed',
  callback_data: `done:${userId}:${r.id}`,
});
export const dueButtons = (userId: number, r: Reminder): InlineButton[] => [
  completeButton(userId, r),
  { text: '🔁 Remind me tomorrow', callback_data: `tomorrow:${userId}:${r.id}` },
];
export const nagButtons = (userId: number, r: Reminder): InlineButton[] => [completeButton(userId, r)];

/**
 * A tap on an alert's button. ✅ completes the cycle exactly as the app does
 * (a repeating reminder moves to its next date); 🔁 queues one extra alert
 * for the same time tomorrow. Only the account's own chat can act on it.
 */
export async function handleTap(q: CallbackQuery): Promise<void> {
  const match = /^(done|tomorrow):(\d+):([\w-]+)$/.exec(q.data ?? '');
  const msg = q.message;
  if (!match || !msg) return answerCallback(q.id);
  const userId = Number(match[2]);
  const r = getRecord<Reminder>(userId, 'reminders', match[3]);
  if (!r || String(msg.chat.id) !== (await chatFor(userId))) {
    return answerCallback(q.id, 'This reminder no longer exists.');
  }
  const original = msg.text ?? buildDueMessage(r);
  if (match[1] === 'done') {
    let note = '✅ Completed';
    if (r.status !== 'done') {
      const now = new Date().toISOString();
      const next = completeCycle(r, `h_${randomUUID()}`, now);
      putRecord(userId, 'reminders', next);
      if (r.repeat) note += ` · next: ${formatDate(next.dueDate, true)}`;
    }
    await editTelegramMessage(msg.chat.id, msg.message_id, `${original}\n\n${note}`);
    return answerCallback(q.id, 'Completed');
  }
  // Same clock time as this alert went out, one day later.
  const fireAt = new Date(msg.date * 1000);
  fireAt.setSeconds(0, 0);
  fireAt.setDate(fireAt.getDate() + 1);
  addExtraAlert(userId, r.id, fireAt.toISOString());
  await editTelegramMessage(msg.chat.id, msg.message_id, `${original}\n\n🔁 I'll remind you tomorrow at ${hhmm(fireAt)}`);
  return answerCallback(q.id, `Tomorrow at ${hhmm(fireAt)}`);
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
  // Looked up once something is due; an account without a chat skips its alerts.
  let chat: string | null | undefined;
  const send = async (text: string, buttons?: InlineButton[]): Promise<boolean> => {
    if (chat === undefined) chat = await chatFor(userId);
    if (!chat) {
      console.warn(`[scheduler] no Telegram chat for user ${userId}, alert skipped`);
      return true; // marked as handled, so it isn't retried every minute
    }
    await sendTelegramMessage(text, chat, buttons);
    return true;
  };
  // Auto-charged reminders settle themselves, so there's nothing to tap.
  const buttonsFor = (r: Reminder, make: typeof dueButtons) => (r.autoPay ? undefined : make(userId, r));

  for (const r of reminders) {
    for (const moment of collectDueAlerts(r, now)) {
      const key = moment.toISOString();
      if (wasAlertSent(r.id, key)) continue;
      await send(buildDueMessage(r), buttonsFor(r, dueButtons));
      markAlertSent(r.id, key);
    }

    if (shouldNag(r, now)) {
      const key = nagKey(now);
      if (!wasAlertSent(r.id, key)) {
        await send(buildNagMessage(r, now), buttonsFor(r, nagButtons));
        markAlertSent(r.id, key);
      }
    }
  }

  const byId = new Map(reminders.map((r) => [r.id, r]));
  for (const extra of dueExtraAlerts(userId, now.toISOString())) {
    const r = byId.get(extra.reminderId);
    // Done or deleted since the tap: nothing left to remind about.
    if (r && isOpen(r, now)) await send(buildDueMessage(r), buttonsFor(r, dueButtons));
    markExtraAlertSent(userId, extra.reminderId, extra.fireAt);
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
  startTelegramPolling((q) => handleTap(q));
}
