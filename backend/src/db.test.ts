// Basic coverage for the generic records store and sent_alerts dedup table.
// Uses a throwaway on-disk DB file (node:sqlite has no real in-memory mode
// shared across statements the way better-sqlite3 does for ':memory:' here,
// and we want to exercise the same code path as production).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as Db from './db';

const dir = mkdtempSync(join(tmpdir(), 'prm-db-test-'));
process.env.DB_PATH = join(dir, 'test.db');

// db.ts reads DB_PATH at module-load time, so it's imported lazily in a
// `before` hook (after the env var above is set) rather than with a
// top-level `import`, which would be hoisted ahead of it.
let db: typeof Db;
const ME = 1;
const OTHER = 2;

test.before(async () => {
  db = await import('./db');
});

test('put/get/list round-trip a record', () => {
  db.putRecord(ME, 'categories', { id: 'cat_1', name: 'Insurance' });
  assert.deepEqual(db.getRecord(ME, 'categories', 'cat_1'), { id: 'cat_1', name: 'Insurance' });
  assert.deepEqual(db.listRecords(ME, 'categories'), [{ id: 'cat_1', name: 'Insurance' }]);
});

test('put overwrites an existing record with the same id', () => {
  db.putRecord(ME, 'categories', { id: 'cat_1', name: 'Insurance v2' });
  assert.deepEqual(db.getRecord(ME, 'categories', 'cat_1'), { id: 'cat_1', name: 'Insurance v2' });
  assert.equal(db.listRecords(ME, 'categories').length, 1);
});

test('putMany upserts a batch', () => {
  db.putManyRecords(ME, 'people', [
    { id: 'per_1', name: 'Mum' },
    { id: 'per_2', name: 'Nana' },
  ]);
  assert.equal(db.listRecords(ME, 'people').length, 2);
});

test('remove deletes a single record', () => {
  db.removeRecord(ME, 'people', 'per_1');
  assert.deepEqual(
    db.listRecords<{ id: string }>(ME, 'people').map((p) => p.id),
    ['per_2'],
  );
});

test('clear wipes a whole store, leaving others untouched', () => {
  db.clearStore(ME, 'people');
  assert.equal(db.listRecords(ME, 'people').length, 0);
  assert.equal(db.listRecords(ME, 'categories').length, 1); // unaffected
});

test('stores stay independent — same id, different store', () => {
  db.putRecord(ME, 'categories', { id: 'shared_id', name: 'A' });
  db.putRecord(ME, 'providers', { id: 'shared_id', name: 'B' });
  assert.equal((db.getRecord(ME, 'categories', 'shared_id') as { name: string }).name, 'A');
  assert.equal((db.getRecord(ME, 'providers', 'shared_id') as { name: string }).name, 'B');
});

test('sent_alerts dedup: an unsent key reports false, then true once marked', () => {
  assert.equal(db.wasAlertSent('rem_1', '2026-10-10T09:00:00.000Z'), false);
  db.markAlertSent('rem_1', '2026-10-10T09:00:00.000Z');
  assert.equal(db.wasAlertSent('rem_1', '2026-10-10T09:00:00.000Z'), true);
});

test('sent_alerts keys are scoped per reminder', () => {
  db.markAlertSent('rem_2', '2026-10-10T09:00:00.000Z');
  assert.equal(db.wasAlertSent('rem_3', '2026-10-10T09:00:00.000Z'), false);
});

test('accounts never see each other’s records', () => {
  db.putRecord(OTHER, 'categories', { id: 'cat_1', name: 'Someone else' });
  assert.equal((db.getRecord(ME, 'categories', 'cat_1') as { name: string }).name, 'Insurance v2');
  assert.equal(db.listRecords(OTHER, 'categories').length, 1);
  db.clearStore(OTHER, 'categories');
  assert.ok(db.getRecord(ME, 'categories', 'cat_1'));
  assert.deepEqual(db.listUserIds(), [ME]);
});

test('an account is empty until it has a record', () => {
  assert.equal(db.isAccountEmpty(3), true);
  assert.equal(db.isAccountEmpty(ME), false);
});

test('records from before accounts move to the account that claims them', () => {
  db.db.prepare("INSERT INTO records (store, id, data, updated_at) VALUES ('reminders', 'old_1', '{\"id\":\"old_1\"}', 'x')").run();
  assert.equal(db.legacyRecordCount(), 1);
  assert.equal(db.claimLegacyRecords(4), 1);
  assert.equal(db.legacyRecordCount(), 0);
  assert.deepEqual(db.listRecords(4, 'reminders'), [{ id: 'old_1' }]);
  assert.equal(db.claimLegacyRecords(5), 0);
});

test.after(() => {
  // Best-effort: node:sqlite (WAL mode) keeps the file handle open for the
  // life of the process, which Windows won't let us delete out from under.
  // Harmless — it's a throwaway temp dir the OS reclaims on its own.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
