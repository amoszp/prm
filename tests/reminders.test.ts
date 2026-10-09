import { describe, expect, it } from 'vitest';
import type { Reminder } from '../src/types';
import {
  badgeCount,
  completeCycle,
  costSummary,
  effectiveStatus,
  filterReminders,
  groupByMonth,
  groupForOverview,
  monthlyCost,
  nextAlert,
  noticeDeadline,
  priceChange,
  settleAutoCharges,
  upcomingCharges,
  undoLastCycle,
  urgency,
} from '../src/lib/reminders';
import { categoryTotals, forecast, occurrences, priceChanges } from '../src/lib/money';

const NOW = new Date(2026, 9, 6, 12); // 6 Oct 2026, noon

function rem(id: string, dueDate: string, extra: Partial<Reminder> = {}): Reminder {
  return {
    id,
    title: id,
    categoryId: 'cat_bills',
    dueDate,
    repeat: { every: 1, unit: 'month' },
    alerts: [],
    status: 'active',
    history: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

describe('status & urgency', () => {
  it('treats an expired snooze as active', () => {
    const r = rem('a', '2026-10-10', { status: 'snoozed', snoozedUntil: '2026-10-05T00:00:00.000Z' });
    expect(effectiveStatus(r, NOW)).toBe('active');
    const s = rem('b', '2026-10-10', { status: 'snoozed', snoozedUntil: '2026-10-08T00:00:00.000Z' });
    expect(effectiveStatus(s, NOW)).toBe('snoozed');
  });

  it('classifies urgency', () => {
    expect(urgency(rem('o', '2026-10-01'), 14, NOW)).toBe('overdue');
    expect(urgency(rem('t', '2026-10-06'), 14, NOW)).toBe('today');
    expect(urgency(rem('s', '2026-10-15'), 14, NOW)).toBe('soon');
    expect(urgency(rem('l', '2026-12-15'), 14, NOW)).toBe('later');
    expect(urgency(rem('p', '2026-10-01', { status: 'paused' }), 14, NOW)).toBe('paused');
  });
});

describe('filtering & grouping', () => {
  const list = [
    rem('overdue', '2026-10-01'),
    rem('today', '2026-10-06', { notes: 'fibre' }),
    rem('week', '2026-10-10', { categoryId: 'cat_cards' }),
    rem('far', '2027-03-01'),
    rem('done', '2026-10-02', { status: 'done' }),
    rem('paused', '2026-10-03', { status: 'paused' }),
  ];

  it('filters by status', () => {
    const ids = (status: Parameters<typeof filterReminders>[1]['status']) =>
      filterReminders(list, { status, upcomingDays: 14 }, NOW).map((r) => r.id);
    expect(ids('open')).toEqual(['overdue', 'today', 'week', 'far']);
    expect(ids('overdue')).toEqual(['overdue']);
    expect(ids('upcoming')).toEqual(['today', 'week']);
    expect(ids('done')).toEqual(['done']);
    expect(ids('paused')).toEqual(['paused']);
    expect(ids('all')).toHaveLength(6);
  });

  it('filters by category and text (incl. extra text)', () => {
    expect(filterReminders(list, { status: 'all', upcomingDays: 14, categoryIds: ['cat_cards'] }, NOW).map((r) => r.id)).toEqual(['week']);
    expect(filterReminders(list, { status: 'all', upcomingDays: 14, text: 'FIBRE' }, NOW).map((r) => r.id)).toEqual(['today']);
    expect(
      filterReminders(list, { status: 'all', upcomingDays: 14, text: 'iberdrola', extraText: (r) => (r.id === 'far' ? 'Iberdrola' : '') }, NOW).map(
        (r) => r.id,
      ),
    ).toEqual(['far']);
  });

  it('groups for the overview', () => {
    const g = groupForOverview(list, NOW);
    expect(g.overdue.map((r) => r.id)).toEqual(['overdue']);
    expect(g.today.map((r) => r.id)).toEqual(['today']);
    expect(g.week.map((r) => r.id)).toEqual(['week']);
    expect(g.later.map((r) => r.id)).toEqual(['far']);
  });

  it('groups by month in date order', () => {
    expect(groupByMonth(list).map((m) => m.key)).toEqual(['2026-10', '2027-03']);
  });
});

describe('completing cycles', () => {
  it('advances a repeating reminder and logs history', () => {
    const r = rem('ins', '2026-11-30', { repeat: { every: 1, unit: 'year' }, amount: 412, anchorDay: 30 });
    const next = completeCycle(r, 'h1', '2026-11-29T10:00:00.000Z');
    expect(next.dueDate).toBe('2027-11-30');
    expect(next.status).toBe('active');
    expect(next.history[0]).toMatchObject({ id: 'h1', dueDate: '2026-11-30', amount: 412 });
  });

  it('marks a one-off reminder done, and undo reopens it', () => {
    const r = rem('dni', '2026-12-01', { repeat: null });
    const done = completeCycle(r, 'h1', '2026-11-01T10:00:00.000Z');
    expect(done.status).toBe('done');
    expect(done.dueDate).toBe('2026-12-01');
    const reopened = undoLastCycle(done, '2026-11-02T10:00:00.000Z');
    expect(reopened.status).toBe('active');
    expect(reopened.history).toHaveLength(0);
  });

  it('undo restores the previous due date of a repeating reminder', () => {
    const r = rem('yt', '2026-10-06');
    const next = completeCycle(r, 'h1', '2026-10-06T10:00:00.000Z');
    expect(undoLastCycle(next, '2026-10-06T10:01:00.000Z').dueDate).toBe('2026-10-06');
  });
});

describe('alerts & cost', () => {
  it('finds the next future alert', () => {
    const r = rem('ins', '2026-11-30', { alerts: [{ value: 1, unit: 'month' }, { value: 1, unit: 'week' }] });
    expect(nextAlert(r, NOW)?.toDateString()).toBe(new Date(2026, 9, 30).toDateString());
    expect(nextAlert({ ...r, status: 'paused' }, NOW)).toBeNull();
  });

  it('normalises recurring cost per month, separating other currencies', () => {
    expect(monthlyCost(rem('a', '2026-10-06', { amount: 120, repeat: { every: 1, unit: 'year' } }))).toBeCloseTo(10);
    expect(monthlyCost(rem('b', '2026-10-06', { amount: 30, repeat: { every: 3, unit: 'month' } }))).toBeCloseTo(10);
    expect(monthlyCost(rem('c', '2026-10-06', { amount: 30, repeat: null }))).toBeNull();
    const sum = costSummary(
      [
        rem('m', '2026-10-06', { amount: 10, currency: 'EUR' }),
        rem('y', '2026-10-06', { amount: 120, currency: 'EUR', repeat: { every: 1, unit: 'year' } }),
        rem('usd', '2026-10-06', { amount: 5, currency: 'USD' }),
        rem('paused', '2026-10-06', { amount: 99, status: 'paused' }),
      ],
      'EUR',
    );
    expect(sum.perMonth).toBeCloseTo(20);
    expect(sum.perYear).toBeCloseTo(240);
    expect(sum.otherCurrencyCount).toBe(1);
  });
});

describe('auto-charged reminders', () => {
  it('settle every missed cycle on their own and log them as automatic', () => {
    let n = 0;
    const yt = rem('yt', '2026-08-06', { autoPay: true, amount: 13.99 });
    const [settled] = settleAutoCharges([yt], NOW, () => `h${++n}`, '2026-10-06T12:00:00.000Z');
    expect(settled.dueDate).toBe('2026-10-06');
    expect(settled.history).toHaveLength(2);
    expect(settled.history.every((h) => h.auto)).toBe(true);
  });

  it('leave manual, future and paused reminders alone; one-offs become done', () => {
    const list = [
      rem('manual', '2026-09-01'),
      rem('future', '2026-10-20', { autoPay: true }),
      rem('paused', '2026-09-01', { autoPay: true, status: 'paused' }),
      rem('once', '2026-09-01', { autoPay: true, repeat: null }),
    ];
    const settled = settleAutoCharges(list, NOW, () => 'h', 'now');
    expect(settled.map((r) => r.id)).toEqual(['once']);
    expect(settled[0].status).toBe('done');
  });

  it('lists upcoming charges and filters by kind', () => {
    const list = [rem('yt', '2026-10-09', { autoPay: true }), rem('dni', '2026-10-09'), rem('far', '2027-01-01', { autoPay: true })];
    expect(upcomingCharges(list, 30, NOW).map((r) => r.id)).toEqual(['yt']);
    expect(filterReminders(list, { status: 'all', upcomingDays: 14, kind: 'auto' }, NOW).map((r) => r.id)).toEqual(['yt', 'far']);
    expect(filterReminders(list, { status: 'all', upcomingDays: 14, kind: 'action' }, NOW).map((r) => r.id)).toEqual(['dni']);
  });
});

describe('notice period', () => {
  it('computes the cancel / decide-by deadline and includes its alerts in nextAlert', () => {
    const r = rem('ins', '2026-11-30', { alerts: [], notice: { period: { value: 1, unit: 'month' }, alerts: [{ value: 0, unit: 'day' }] } });
    expect(noticeDeadline(r)).toBe('2026-10-30');
    expect(noticeDeadline(rem('x', '2026-11-30'))).toBeNull();
    expect(nextAlert(r, NOW)?.toDateString()).toBe(new Date(2026, 9, 30).toDateString());
  });
});

describe('payments history', () => {
  it('records the real amount and paid-on date, or a skip', () => {
    const r = rem('yt', '2026-10-06', { amount: 11.99 });
    const paid = completeCycle(r, 'h1', '2026-10-07T08:00:00.000Z', { amount: 13.99, paidOn: '2026-10-05' });
    expect(paid.history[0]).toMatchObject({ amount: 13.99, paidOn: '2026-10-05' });
    const skipped = completeCycle(paid, 'h2', '2026-11-07T08:00:00.000Z', { skipped: true });
    expect(skipped.history[0].skipped).toBe(true);
    expect(skipped.history[0].amount).toBeUndefined();
    expect(skipped.dueDate).toBe('2026-12-06');
  });

  it('detects price changes between the last two payments, ignoring skips', () => {
    const r = rem('yt', '2026-12-06', {
      history: [
        { id: 'c', dueDate: '2026-11-06', completedAt: '', skipped: true },
        { id: 'b', dueDate: '2026-10-06', completedAt: '', amount: 13.99 },
        { id: 'a', dueDate: '2026-09-06', completedAt: '', amount: 11.99 },
      ],
    });
    expect(priceChange(r)).toMatchObject({ from: 11.99, to: 13.99, since: '2026-10-06' });
    expect(priceChange(r)?.pct).toBeCloseTo(0.1668, 3);
    expect(priceChange(rem('x', '2026-10-06'))).toBeNull();
  });
});

describe('money', () => {
  it('lists occurrences inside a range', () => {
    expect(occurrences(rem('m', '2026-10-15'), '2026-10-06', '2027-01-31')).toEqual(['2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15']);
    expect(occurrences(rem('o', '2026-12-01', { repeat: null }), '2026-10-06', '2027-10-06')).toEqual(['2026-12-01']);
    expect(occurrences(rem('p', '2026-10-15', { status: 'paused' }), '2026-10-06', '2027-10-06')).toEqual([]);
  });

  it('forecasts 12 months, finds the heaviest one and keeps other currencies out', () => {
    const list = [
      rem('yt', '2026-10-15', { amount: 10 }),
      rem('ins', '2026-12-01', { amount: 400, repeat: { every: 1, unit: 'year' } }),
      rem('usd', '2026-10-20', { amount: 5, currency: 'USD' }),
      rem('past', '2026-10-01', { amount: 99, repeat: null }),
    ];
    const fc = forecast(list, 'EUR', NOW);
    expect(fc.buckets).toHaveLength(12);
    expect(fc.buckets[0].key).toBe('2026-10');
    expect(fc.total).toBeCloseTo(12 * 10 + 400);
    expect(fc.heaviest?.key).toBe('2026-12');
    expect(fc.otherCurrency).toBe(1);
  });

  it('totals per category and lists price changes', () => {
    const list = [
      rem('a', '2026-10-15', { amount: 10, categoryId: 'cat_subs' }),
      rem('b', '2026-10-15', { amount: 120, categoryId: 'cat_ins', repeat: { every: 1, unit: 'year' } }),
      rem('c', '2026-10-15', { amount: 5, categoryId: 'cat_subs' }),
    ];
    expect(categoryTotals(list, 'EUR')).toEqual([
      { categoryId: 'cat_subs', perMonth: 15, count: 2 },
      { categoryId: 'cat_ins', perMonth: 10, count: 1 },
    ]);
    const changed = rem('yt', '2026-12-06', {
      history: [
        { id: '2', dueDate: '2026-11-06', completedAt: '', amount: 13.99 },
        { id: '1', dueDate: '2026-10-06', completedAt: '', amount: 11.99 },
      ],
    });
    expect(priceChanges([changed, ...list]).map((x) => x.reminder.id)).toEqual(['yt']);
  });
});

describe('app badge', () => {
  it('counts open needs-action reminders that are overdue or due today', () => {
    const list = [
      rem('overdue', '2026-10-01'),
      rem('today', '2026-10-06'),
      rem('tomorrow', '2026-10-07'),
      rem('auto', '2026-10-06', { autoPay: true }),
      rem('paused', '2026-10-01', { status: 'paused' }),
      rem('snoozed', '2026-10-01', { status: 'snoozed', snoozedUntil: '2026-10-09T09:00:00.000Z' }),
      rem('done', '2026-10-01', { status: 'done' }),
    ];
    expect(badgeCount(list, NOW)).toBe(2);
    expect(badgeCount([], NOW)).toBe(0);
  });
});

describe('for whom', () => {
  it('filters by person, with "me" meaning nobody else', () => {
    const list = [rem('mine', '2026-10-10'), rem('mum', '2026-10-11', { personId: 'per_mum' }), rem('nana', '2026-10-12', { personId: 'per_nana' })];
    const q = { status: 'all' as const, upcomingDays: 14 };
    expect(filterReminders(list, { ...q, person: 'me' }, NOW).map((r) => r.id)).toEqual(['mine']);
    expect(filterReminders(list, { ...q, person: 'per_mum' }, NOW).map((r) => r.id)).toEqual(['mum']);
    expect(filterReminders(list, q, NOW)).toHaveLength(3);
  });
});
