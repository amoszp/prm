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

test.before(async () => {
  db = await import('./db');
});

test('put/get/list round-trip a record', () => {
  db.putRecord('categories', { id: 'cat_1', name: 'Insurance' });
  assert.deepEqual(db.getRecord('categories', 'cat_1'), { id: 'cat_1', name: 'Insurance' });
  assert.deepEqual(db.listRecords('categories'), [{ id: 'cat_1', name: 'Insurance' }]);
});

test('put overwrites an existing record with the same id', () => {
  db.putRecord('categories', { id: 'cat_1', name: 'Insurance v2' });
  assert.deepEqual(db.getRecord('categories', 'cat_1'), { id: 'cat_1', name: 'Insurance v2' });
  assert.equal(db.listRecords('categories').length, 1);
});

test('putMany upserts a batch', () => {
  db.putManyRecords('people', [
    { id: 'per_1', name: 'Mum' },
    { id: 'per_2', name: 'Nana' },
  ]);
  assert.equal(db.listRecords('people').length, 2);
});

test('remove deletes a single record', () => {
  db.removeRecord('people', 'per_1');
  assert.deepEqual(
    db.listRecords<{ id: string }>('people').map((p) => p.id),
    ['per_2'],
  );
});

test('clear wipes a whole store, leaving others untouched', () => {
  db.clearStore('people');
  assert.equal(db.listRecords('people').length, 0);
  assert.equal(db.listRecords('categories').length, 1); // unaffected
});

test('stores stay independent — same id, different store', () => {
  db.putRecord('categories', { id: 'shared_id', name: 'A' });
  db.putRecord('providers', { id: 'shared_id', name: 'B' });
  assert.equal((db.getRecord('categories', 'shared_id') as { name: string }).name, 'A');
  assert.equal((db.getRecord('providers', 'shared_id') as { name: string }).name, 'B');
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
