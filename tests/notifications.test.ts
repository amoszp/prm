import { describe, expect, it } from 'vitest';
import type { Reminder } from '../src/types';
import { alertKey, dueAlerts, loadFired, saveFired } from '../src/lib/notifications';

function rem(extra: Partial<Reminder> = {}): Reminder {
  return {
    id: 'ins',
    title: 'Car insurance',
    categoryId: 'cat_insurance',
    dueDate: '2026-11-30',
    repeat: { every: 1, unit: 'year' },
    alerts: [
      { value: 1, unit: 'month' },
      { value: 1, unit: 'week' },
    ],
    status: 'active',
    history: [],
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

describe('dueAlerts', () => {
  it('is quiet before the first alert', () => {
    expect(dueAlerts([rem()], new Set(), new Date(2026, 9, 20))).toHaveLength(0);
  });

  it('fires once the first alert moment passes', () => {
    const due = dueAlerts([rem()], new Set(), new Date(2026, 9, 30, 10));
    expect(due).toHaveLength(1);
    expect(due[0].lead).toEqual({ value: 1, unit: 'month' });
  });

  it('shows only the latest passed alert and silences older ones', () => {
    const due = dueAlerts([rem()], new Set(), new Date(2026, 10, 25, 10));
    expect(due).toHaveLength(1);
    expect(due[0].lead).toEqual({ value: 1, unit: 'week' });
    expect(due[0].keys).toHaveLength(2);
  });

  it('does not repeat an alert that already fired', () => {
    const r = rem();
    const fired = new Set([alertKey(r, { value: 1, unit: 'month' })]);
    expect(dueAlerts([r], fired, new Date(2026, 10, 1))).toHaveLength(0);
  });

  it('fires again for the next cycle (key includes the due date)', () => {
    const r = rem();
    const fired = new Set([alertKey(r, { value: 1, unit: 'month' })]);
    const nextCycle = { ...r, dueDate: '2027-11-30' };
    expect(dueAlerts([nextCycle], fired, new Date(2027, 9, 31))).toHaveLength(1);
  });

  it('skips paused, snoozed, done and long-overdue reminders', () => {
    const at = new Date(2026, 10, 1);
    expect(dueAlerts([rem({ status: 'paused' })], new Set(), at)).toHaveLength(0);
    expect(dueAlerts([rem({ status: 'snoozed', snoozedUntil: '2026-11-05T00:00:00.000Z' })], new Set(), at)).toHaveLength(0);
    expect(dueAlerts([rem({ status: 'done' })], new Set(), at)).toHaveLength(0);
    expect(dueAlerts([rem()], new Set(), new Date(2026, 11, 3))).toHaveLength(0);
  });

  it('persists fired keys', () => {
    saveFired(new Set(['a', 'b']));
    expect([...loadFired()]).toEqual(['a', 'b']);
  });

  it('nags once a day while overdue, only when enabled and from 09:00', () => {
    const r = rem({ nagDaily: true });
    expect(dueAlerts([rem()], new Set(), new Date(2026, 11, 3, 10))).toHaveLength(0);
    expect(dueAlerts([r], new Set(), new Date(2026, 11, 3, 8))).toHaveLength(0);
    const due = dueAlerts([r], new Set(), new Date(2026, 11, 3, 10));
    expect(due).toHaveLength(1);
    expect(due[0].nag).toBe(true);
    const fired = new Set(due[0].keys);
    expect(dueAlerts([r], fired, new Date(2026, 11, 3, 18))).toHaveLength(0);
    expect(dueAlerts([r], fired, new Date(2026, 11, 4, 10))).toHaveLength(1);
    expect(dueAlerts([{ ...r, autoPay: true }], new Set(), new Date(2026, 11, 3, 10))).toHaveLength(0);
  });

  it('alerts before the cancel / decide-by deadline', () => {
    const r = rem({ alerts: [], notice: { period: { value: 1, unit: 'month' }, alerts: [{ value: 1, unit: 'week' }] } });
    // Due 30 Nov → deadline 30 Oct → alert from 23 Oct 09:00.
    expect(dueAlerts([r], new Set(), new Date(2026, 9, 22, 12))).toHaveLength(0);
    const due = dueAlerts([r], new Set(), new Date(2026, 9, 23, 12));
    expect(due).toHaveLength(1);
    expect(due[0].notice).toBe('2026-10-30');
    expect(dueAlerts([r], new Set(), new Date(2026, 9, 31, 12))).toHaveLength(0);
  });
});
