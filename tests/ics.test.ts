import { describe, expect, it } from 'vitest';
import type { Reminder } from '../src/types';
import { buildCalendar, escapeText, foldLine, recurrenceRule, triggerDuration, wallClockGap } from '../src/lib/ics';

const NOW = new Date(2026, 9, 6, 12);
const TEXT = { deadlineTitle: (t: string) => `Deadline: ${t}`, autoCharged: 'Auto', amount: 'Amount', reference: 'Ref' };

function rem(id: string, dueDate: string, extra: Partial<Reminder> = {}): Reminder {
  return {
    id,
    title: id,
    categoryId: 'cat_bills',
    dueDate,
    repeat: null,
    alerts: [],
    status: 'active',
    history: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

/** Unfold continuation lines so assertions can match whole properties. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('ics helpers', () => {
  it('escapes text and folds long lines at 75 octets', () => {
    expect(escapeText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    const folded = foldLine(`SUMMARY:${'é'.repeat(60)}`);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'é'.repeat(60)}`);
  });

  it('formats trigger durations', () => {
    expect(triggerDuration(-7 * 86_400_000)).toBe('-P7D');
    expect(triggerDuration(-(86_400_000 + 15 * 3_600_000))).toBe('-P1DT15H');
    expect(triggerDuration(9 * 3_600_000)).toBe('PT9H');
    expect(triggerDuration(0)).toBe('PT0M');
  });

  it('builds repeat rules, keeping month-end anchors on the last day', () => {
    expect(recurrenceRule({ every: 1, unit: 'month' }, '2026-10-15')).toBe('RRULE:FREQ=MONTHLY;INTERVAL=1');
    expect(recurrenceRule({ every: 10, unit: 'year' }, '2027-12-05')).toBe('RRULE:FREQ=YEARLY;INTERVAL=10');
    expect(recurrenceRule({ every: 1, unit: 'month' }, '2026-10-31', 31)).toBe(
      'RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28,29,30,31;BYSETPOS=-1',
    );
    expect(recurrenceRule({ every: 1, unit: 'year' }, '2028-02-29', 29)).toBe(
      'RRULE:FREQ=YEARLY;INTERVAL=1;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1',
    );
  });
});

describe('buildCalendar', () => {
  it('exports open reminders with alerts that match PRM’s own alert moments', () => {
    const ics = unfold(
      buildCalendar(
        [
          rem('dni', '2027-12-05', {
            title: 'DNI renewal',
            repeat: { every: 10, unit: 'year' },
            alerts: [
              { value: 1, unit: 'week' },
              { value: 0, unit: 'day' },
            ],
          }),
          rem('done', '2026-10-01', { status: 'done' }),
          rem('paused', '2026-10-01', { status: 'paused' }),
        ],
        TEXT,
        NOW,
      ),
    );
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('UID:dni@prm');
    expect(ics).toContain('SUMMARY:DNI renewal');
    expect(ics).toContain('DTSTART;VALUE=DATE:20271205');
    expect(ics).toContain('DTEND;VALUE=DATE:20271206');
    expect(ics).toContain('RRULE:FREQ=YEARLY;INTERVAL=10');
    // All-day events start at midnight; PRM alerts at 09:00 → 1 week before = -P6DT15H.
    expect(ics).toContain('TRIGGER:-P6DT15H');
    expect(ics).toContain('TRIGGER:PT9H');
  });

  it('uses the due time when set and adds a deadline event for a notice period', () => {
    const ics = unfold(
      buildCalendar(
        [
          rem('ins', '2026-11-30', {
            title: 'Car insurance',
            dueTime: '18:30',
            amount: 412,
            currency: 'EUR',
            reference: 'Policy 4821',
            alerts: [{ value: 2, unit: 'hour' }],
            notice: { period: { value: 1, unit: 'month' }, alerts: [{ value: 0, unit: 'day' }] },
          }),
        ],
        TEXT,
        NOW,
      ),
    );
    expect(ics).toContain('DTSTART:20261130T183000');
    expect(ics).toContain('DTEND:20261130T190000');
    expect(ics).toContain('TRIGGER:-PT2H');
    expect(ics).toContain('DESCRIPTION:Amount: 412.00 EUR\\nRef: Policy 4821');
    expect(ics).toContain('UID:ins-notice@prm');
    expect(ics).toContain('SUMMARY:Deadline: Car insurance');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261030');
  });
});

describe('daylight saving', () => {
  it('measures alarm gaps in calendar days + clock time, so a DST change never shifts them by an hour', () => {
    // 7 Dec (winter time) back to 7 Sep 09:00 (summer time) is 91 days minus 9 hours, whatever the time zone does.
    const gap = wallClockGap(new Date(2027, 11, 7), new Date(2027, 8, 7, 9, 0));
    expect(triggerDuration(gap)).toBe('-P90DT15H');
  });
});
