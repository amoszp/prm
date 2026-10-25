// Telegram alert text, buttons and taps. Bot API and accounts calls are
// faked through fetch; the records live in a throwaway DB file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Reminder } from '../../src/types';

process.env.TZ = 'Atlantic/Canary';
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'prm-tg-test-')), 'test.db');
process.env.TELEGRAM_BOT_TOKEN = 'test-token';

const ME = 1;
const MY_CHAT = 111;
const calls: { method: string; body: any }[] = [];
globalThis.fetch = (async (url: string, init: { body?: string }) => {
  if (String(url).includes('/v1/users/')) {
    return new Response(JSON.stringify({ id: ME, username: 'moe', disabled: false, telegramChatId: String(MY_CHAT) }));
  }
  calls.push({ method: String(url).split('/').pop()!, body: JSON.parse(init.body ?? '{}') });
  return new Response(JSON.stringify({ ok: true, result: true }));
}) as typeof fetch;

// Imported after the env above is set (db.ts reads DB_PATH at load time).
const { buildDueMessage, buildNagMessage, dueButtons, nagButtons, handleTap } = require('./scheduler');
const db = require('./db');

function rem(extra: Partial<Reminder> = {}): Reminder {
  return {
    id: 'rem_abc123def456',
    title: 'Renovar DNI',
    categoryId: 'cat_1',
    dueDate: '2026-11-12',
    dueTime: '10:00',
    repeat: null,
    alerts: [],
    status: 'active',
    history: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...extra,
  };
}

const SENT_AT = new Date(2026, 10, 12, 10, 0, 20);
function tap(data: string, text: string, chatId = MY_CHAT) {
  calls.length = 0;
  return handleTap({ id: 'cb1', data, message: { message_id: 9, date: SENT_AT.getTime() / 1000, text, chat: { id: chatId } } });
}
const edited = () => calls.find((c) => c.method === 'editMessageText')?.body.text;

test('due alert: title, date and time; amount only when set', () => {
  assert.equal(buildDueMessage(rem()), '✨Renovar DNI\n📅12 November\n🕰️10:00');
  assert.equal(buildDueMessage(rem({ amount: 12 })), '✨Renovar DNI\n📅12 November\n🕰️10:00\n💶12.00 €');
  assert.equal(buildDueMessage(rem({ amount: 5, currency: 'USD', dueTime: undefined })), '✨Renovar DNI\n📅12 November\n💶5.00 USD');
});

test('overdue alert counts the days', () => {
  assert.equal(buildNagMessage(rem(), new Date(2026, 10, 15, 10)), '✨Renovar DNI\n📅12 November\n⏳Overdue by 3 days');
  assert.equal(buildNagMessage(rem(), new Date(2026, 10, 13, 10)), '✨Renovar DNI\n📅12 November\n⏳Overdue by 1 day');
});

test('buttons fit in Telegram callback data', () => {
  const due = dueButtons(ME, rem());
  assert.deepEqual(due.map((b: any) => b.text), ['✅ Completed', '🔁 Remind me tomorrow']);
  assert.deepEqual(nagButtons(ME, rem()).map((b: any) => b.text), ['✅ Completed']);
  for (const b of due) assert.ok(Buffer.byteLength(b.callback_data) <= 64);
});

test('✅ on a one-off reminder marks it done', async () => {
  db.putRecord(ME, 'reminders', rem());
  const text = buildDueMessage(rem());
  await tap(`done:${ME}:rem_abc123def456`, text);
  assert.equal(db.getRecord(ME, 'reminders', 'rem_abc123def456').status, 'done');
  assert.equal(edited(), `${text}\n\n✅ Completed`);
});

test('✅ on a yearly reminder moves it to next year and says so', async () => {
  db.putRecord(ME, 'reminders', rem({ id: 'rem_yearly', repeat: { every: 1, unit: 'year' } }));
  await tap(`done:${ME}:rem_yearly`, 'x');
  const r = db.getRecord(ME, 'reminders', 'rem_yearly');
  assert.equal(r.dueDate, '2027-11-12');
  assert.equal(r.history.length, 1);
  assert.equal(edited(), 'x\n\n✅ Completed · next: 12 November 2027');
});

test('🔁 queues one alert for the same time tomorrow', async () => {
  db.putRecord(ME, 'reminders', rem({ id: 'rem_snooze' }));
  await tap(`tomorrow:${ME}:rem_snooze`, 'x');
  assert.equal(edited(), "x\n\n🔁 I'll remind you tomorrow at 10:00");
  const tomorrow = new Date(2026, 10, 13, 10, 0);
  assert.deepEqual(db.dueExtraAlerts(ME, new Date(tomorrow.getTime() - 1000).toISOString()), []);
  assert.deepEqual(db.dueExtraAlerts(ME, tomorrow.toISOString()), [{ reminderId: 'rem_snooze', fireAt: tomorrow.toISOString() }]);
});

test('a tap from another chat changes nothing', async () => {
  db.putRecord(ME, 'reminders', rem({ id: 'rem_other' }));
  await tap(`done:${ME}:rem_other`, 'x', 999);
  assert.equal(db.getRecord(ME, 'reminders', 'rem_other').status, 'active');
  assert.equal(edited(), undefined);
  assert.ok(calls.some((c) => c.method === 'answerCallbackQuery'));
});
