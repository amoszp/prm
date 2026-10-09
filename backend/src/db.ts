// Generic document store: one SQLite table backs all eight entity stores
// (store, id) -> JSON blob, instead of a bespoke table per entity. Means
// zero backend changes when an entity's shape evolves — same promise the
// frontend's Collection<T> already makes over IndexedDB.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { StoreName } from './types';

const DB_PATH = process.env.DB_PATH ?? './data/prm.db';
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

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
db.exec(`
  CREATE TABLE IF NOT EXISTS sent_alerts (
    reminder_id TEXT NOT NULL,
    alert_moment_iso TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    PRIMARY KEY (reminder_id, alert_moment_iso)
  );
`);

interface RecordRow {
  data: string;
}

export function listRecords<T>(store: StoreName): T[] {
  const rows = db.prepare('SELECT data FROM records WHERE store = ? ORDER BY id ASC').all(store) as unknown as RecordRow[];
  return rows.map((r) => JSON.parse(r.data) as T);
}

export function getRecord<T>(store: StoreName, id: string): T | undefined {
  const row = db.prepare('SELECT data FROM records WHERE store = ? AND id = ?').get(store, id) as unknown as
    | RecordRow
    | undefined;
  return row ? (JSON.parse(row.data) as T) : undefined;
}

export function putRecord<T extends { id: string }>(store: StoreName, item: T): T {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO records (store, id, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(store, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(store, item.id, JSON.stringify(item), now);
  return item;
}

export function putManyRecords<T extends { id: string }>(store: StoreName, items: T[]): void {
  for (const item of items) putRecord(store, item);
}

export function removeRecord(store: StoreName, id: string): void {
  db.prepare('DELETE FROM records WHERE store = ? AND id = ?').run(store, id);
}

export function clearStore(store: StoreName): void {
  db.prepare('DELETE FROM records WHERE store = ?').run(store);
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

/** Drops sent_alerts rows for reminders that no longer exist, so the table
 * doesn't grow forever once reminders are deleted. Safe to call periodically. */
export function pruneSentAlerts(): void {
  db.exec(`
    DELETE FROM sent_alerts
    WHERE reminder_id NOT IN (SELECT id FROM records WHERE store = 'reminders')
  `);
}
