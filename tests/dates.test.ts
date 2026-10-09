import { describe, expect, it } from 'vitest';
import {
  addMonths,
  advanceDue,
  alertMoment,
  dueMoment,
  intervalLabel,
  isValidISODate,
  leadLabel,
  parseISODate,
  relativeLabel,
  toISODate,
} from '../src/lib/dates';

describe('dates', () => {
  it('round-trips local ISO dates without UTC shift', () => {
    expect(toISODate(parseISODate('2026-03-15'))).toBe('2026-03-15');
  });

  it('validates ISO dates', () => {
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });

  it('clamps month-end instead of overflowing', () => {
    expect(toISODate(addMonths(parseISODate('2026-01-31'), 1))).toBe('2026-02-28');
  });

  it('anchors month-end so the 31st does not drift to the 28th', () => {
    const feb = advanceDue('2026-01-31', { every: 1, unit: 'month' }, 31);
    expect(feb).toBe('2026-02-28');
    expect(advanceDue(feb, { every: 1, unit: 'month' }, 31)).toBe('2026-03-31');
  });

  it('advances by any interval, including multi-year (DNI, cards)', () => {
    expect(advanceDue('2026-10-06', { every: 10, unit: 'year' })).toBe('2036-10-06');
    expect(advanceDue('2026-10-06', { every: 2, unit: 'week' })).toBe('2026-10-20');
    expect(advanceDue('2026-10-06', { every: 3, unit: 'day' })).toBe('2026-10-09');
    expect(advanceDue('2028-02-29', { every: 1, unit: 'year' }, 29)).toBe('2029-02-28');
  });

  it('computes alert moments by calendar unit', () => {
    const due = dueMoment('2026-11-30');
    expect(due.getHours()).toBe(9);
    expect(toISODate(alertMoment('2026-11-30', undefined, { value: 1, unit: 'month' }))).toBe('2026-10-30');
    expect(alertMoment('2026-11-30', '14:30', { value: 2, unit: 'hour' }).getHours()).toBe(12);
  });

  it('labels intervals and lead times', () => {
    expect(intervalLabel(null)).toBe('Once');
    expect(intervalLabel({ every: 1, unit: 'month' })).toBe('Monthly');
    expect(intervalLabel({ every: 3, unit: 'month' })).toBe('Quarterly');
    expect(intervalLabel({ every: 10, unit: 'year' })).toBe('Every 10 years');
    expect(leadLabel({ value: 0, unit: 'day' })).toBe('On the day');
    expect(leadLabel({ value: 1, unit: 'week' })).toBe('1 week before');
    expect(leadLabel({ value: 3, unit: 'month' })).toBe('3 months before');
  });

  it('describes relative dates', () => {
    const now = new Date(2026, 9, 6, 12);
    expect(relativeLabel('2026-10-06', now)).toBe('Today');
    expect(relativeLabel('2026-10-07', now)).toBe('Tomorrow');
    expect(relativeLabel('2026-10-03', now)).toBe('3 days ago');
    expect(relativeLabel('2026-10-16', now)).toBe('In 10 days');
    expect(relativeLabel('2027-10-06', now)).toBe('In 12 months');
    expect(relativeLabel('2036-10-06', now)).toBe('In 10 years');
  });
});
