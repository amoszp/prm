// Generic document store: one SQLite table backs all eight entity stores
// (user, store, id) -> JSON blob, instead of a bespoke table per entity. Means
// zero backend changes when an entity's shape evolves — same promise the
// frontend's Collection<T> already makes over IndexedDB. Every row belongs to
// one account (see auth.ts); nothing is shared between users.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StoreName } from './types';

const DB_PATH = process.env.DB_PATH ?? './data/prm.db';
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS user_records (
    user_id INTEGER NOT NULL,
    store TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, store, id)
  );
`);

// Rows from before accounts existed (no owner). Kept until the legacy owner
// signs in for the first time, then moved into their account (see claimLegacyRecords).
db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    store TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (store, id)
  );
`);

// Tracks which alert instants have already fired, so the scheduler never
// re-sends one once `now` has passed it. PRM's alerts are computed on the
// fly from LeadTime[] rules (not stored as discrete rows like Kage's alerts
// table), so nothing else in the data model remembers "already sent".
// alert_moment_iso also carries nagDaily's "nag:<YYYY-MM-DD>" keys (see
// scheduler.ts) — same table, namespaced key, no second table needed.
// Reminder ids are random, so they don't collide between users.
db.exec(`
  CREATE TABLE IF NOT EXISTS sent_alerts (
    reminder_id TEXT NOT NULL,
    alert_moment_iso TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    PRIMARY KEY (reminder_id, alert_moment_iso)
  );
`);

// One-off extra alerts from Telegram's "Remind me tomorrow" button. Kept out
// of the reminder record so a tap never changes what the app shows.
db.exec(`
  CREATE TABLE IF NOT EXISTS extra_alerts (
    user_id INTEGER NOT NULL,
    reminder_id TEXT NOT NULL,
    fire_at TEXT NOT NULL,
    sent_at TEXT,
    PRIMARY KEY (user_id, reminder_id, fire_at)
  );
`);

interface RecordRow {
  data: string;
}

export function listRecords<T>(userId: number, store: StoreName): T[] {
  const rows = db
    .prepare('SELECT data FROM user_records WHERE user_id = ? AND store = ? ORDER BY id ASC')
    .all(userId, store) as unknown as RecordRow[];
  return rows.map((r) => JSON.parse(r.data) as T);
}

export function getRecord<T>(userId: number, store: StoreName, id: string): T | undefined {
  const row = db
    .prepare('SELECT data FROM user_records WHERE user_id = ? AND store = ? AND id = ?')
    .get(userId, store, id) as unknown as RecordRow | undefined;
  return row ? (JSON.parse(row.data) as T) : undefined;
}

export function putRecord<T extends { id: string }>(userId: number, store: StoreName, item: T): T {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO user_records (user_id, store, id, data, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, store, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(userId, store, item.id, JSON.stringify(item), now);
  return item;
}

export function putManyRecords<T extends { id: string }>(userId: number, store: StoreName, items: T[]): void {
  db.exec('BEGIN');
  try {
    for (const item of items) putRecord(userId, store, item);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function removeRecord(userId: number, store: StoreName, id: string): void {
  db.prepare('DELETE FROM user_records WHERE user_id = ? AND store = ? AND id = ?').run(userId, store, id);
}

export function clearStore(userId: number, store: StoreName): void {
  db.prepare('DELETE FROM user_records WHERE user_id = ? AND store = ?').run(userId, store);
}

/** True when the account has no data at all (a fresh account). */
export function isAccountEmpty(userId: number): boolean {
  return db.prepare('SELECT 1 FROM user_records WHERE user_id = ? LIMIT 1').get(userId) === undefined;
}

/** Every account that has data, for the scheduler. */
export function listUserIds(): number[] {
  const rows = db.prepare('SELECT DISTINCT user_id FROM user_records').all() as unknown as { user_id: number }[];
  return rows.map((r) => r.user_id);
}

export function legacyRecordCount(): number {
  return Number((db.prepare('SELECT COUNT(*) AS n FROM records').get() as unknown as { n: number }).n);
}

/** Moves the rows from before accounts into this account. Returns how many moved. */
export function claimLegacyRecords(userId: number): number {
  const count = legacyRecordCount();
  if (count === 0) return 0;
  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT OR IGNORE INTO user_records (user_id, store, id, data, updated_at)
       SELECT ?, store, id, data, updated_at FROM records`,
    ).run(userId);
    db.exec('DELETE FROM records');
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return count;
}

export function wasAlertSent(reminderId: string, key: string): boolean {
  const row = db.prepare('SELECT 1 FROM sent_alerts WHERE reminder_id = ? AND alert_moment_iso = ?').get(reminderId, key);
  return row !== undefined;
}

export function markAlertSent(reminderId: string, key: string): void {
  db.prepare('INSERT OR IGNORE INTO sent_alerts (reminder_id, alert_moment_iso, sent_at) VALUES (?, ?, ?)').run(
    reminderId,
    key,
    new Date().toISOString(),
  );
}

export function addExtraAlert(userId: number, reminderId: string, fireAtIso: string): void {
  db.prepare('INSERT OR IGNORE INTO extra_alerts (user_id, reminder_id, fire_at, sent_at) VALUES (?, ?, ?, NULL)').run(
    userId,
    reminderId,
    fireAtIso,
  );
}

/** Extra alerts that are due and not sent yet, for one account. */
export function dueExtraAlerts(userId: number, nowIso: string): { reminderId: string; fireAt: string }[] {
  const rows = db
    .prepare('SELECT reminder_id, fire_at FROM extra_alerts WHERE user_id = ? AND sent_at IS NULL AND fire_at <= ? ORDER BY fire_at ASC')
    .all(userId, nowIso) as unknown as { reminder_id: string; fire_at: string }[];
  return rows.map((r) => ({ reminderId: r.reminder_id, fireAt: r.fire_at }));
}

export function markExtraAlertSent(userId: number, reminderId: string, fireAtIso: string): void {
  db.prepare('UPDATE extra_alerts SET sent_at = ? WHERE user_id = ? AND reminder_id = ? AND fire_at = ?').run(
    new Date().toISOString(),
    userId,
    reminderId,
    fireAtIso,
  );
}

/** Drops sent_alerts rows for reminders that no longer exist, so the table
 * doesn't grow forever once reminders are deleted. Safe to call periodically. */
export function pruneSentAlerts(): void {
  db.exec(`
    DELETE FROM sent_alerts
    WHERE reminder_id NOT IN (SELECT id FROM user_records WHERE store = 'reminders')
  `);
}
