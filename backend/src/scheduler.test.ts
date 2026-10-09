// Scheduler-only logic: enumerating due alert instants via the frontend's own
// nextAlert() (not re-derived here), and the nagDaily policy that has no
// equivalent in the shared lib by design.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectDueAlerts, nagKey, shouldNag } from './scheduler';
import type { Reminder } from '../../src/types';

function rem(extra: Partial<Reminder> = {}): Reminder {
  return {
    id: 'rem_1',
    title: 'DNI',
    categoryId: 'cat_1',
    dueDate: '2026-10-20',
    repeat: null,
    alerts: [{ value: 1, unit: 'day' }, { value: 2, unit: 'day' }],
    status: 'active',
    history: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...extra,
  };
}

test('collectDueAlerts returns nothing before the earliest alert', () => {
  const now = new Date('2026-10-01T00:00:00.000Z');
  assert.deepEqual(collectDueAlerts(rem(), now), []);
});

test('collectDueAlerts returns both due-date alerts once past them, oldest first', () => {
  // Due 2026-10-20 at 09:00 local; alerts at 2 days and 1 day before.
  const now = new Date('2026-10-20T12:00:00.000Z');
  const due = collectDueAlerts(rem(), now);
  assert.equal(due.length, 2);
  assert.ok(due[0] < due[1]);
});

test('collectDueAlerts never returns a moment after `now`', () => {
  const now = new Date('2026-10-19T00:00:00.000Z'); // after the 2-day alert, before the 1-day alert
  const due = collectDueAlerts(rem(), now);
  assert.equal(due.length, 1);
});

test('collectDueAlerts returns nothing for a done reminder (nextAlert returns null)', () => {
  const now = new Date('2026-10-20T12:00:00.000Z');
  assert.deepEqual(collectDueAlerts(rem({ status: 'done' }), now), []);
});

test('shouldNag is false without nagDaily even when overdue', () => {
  const now = new Date('2026-10-21T10:00:00.000Z');
  assert.equal(shouldNag(rem(), now), false);
});

test('shouldNag is false before 09:00 local on an overdue nagDaily reminder', () => {
  const now = new Date('2026-10-21T00:00:00.000Z'); // local midnight-ish
  now.setHours(7, 0, 0, 0);
  assert.equal(shouldNag(rem({ nagDaily: true }), now), false);
});

test('shouldNag is true once overdue, nagDaily is set, and it is past 09:00 local', () => {
  const now = new Date('2026-10-21T00:00:00.000Z');
  now.setHours(10, 0, 0, 0);
  assert.equal(shouldNag(rem({ nagDaily: true }), now), true);
});

test('shouldNag is false when not yet due', () => {
  const now = new Date('2026-10-20T00:00:00.000Z');
  now.setHours(10, 0, 0, 0);
  assert.equal(shouldNag(rem({ nagDaily: true, dueDate: '2026-10-25' }), now), false);
});

test('nagKey is namespaced per day and cannot collide with a real alert ISO instant', () => {
  const key = nagKey(new Date('2026-10-21T10:00:00.000Z'));
  assert.equal(key, 'nag:2026-10-21');
});
