// Calendar export (RFC 5545 .ics). Puts reminders and their alerts into the
// phone's own calendar, so alerts fire natively with the phone locked — before
// any server exists. Pure: returns text, the caller downloads it.

import type { Interval, LeadTime, Reminder } from '@/types';
import { addDays, alertMoment, diffDays, dueMoment, parseISODate, toISODate } from './dates';
import { effectiveStatus, noticeDeadline } from './reminders';

export interface CalendarText {
  /** Summary of the deadline event, e.g. "Last day to cancel: Car insurance". */
  deadlineTitle: (title: string) => string;
  autoCharged: string;
  amount: string;
  reference: string;
}

const FREQ: Record<Interval['unit'], string> = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' };

/** Escape TEXT values (backslash, semicolon, comma, newline). */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold a content line to 75 octets; continuation lines start with a space. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > 75) {
      parts.push(current);
      current = ' ';
      size = 1;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n');
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateValue = (iso: string) => iso.replace(/-/g, '');
const localDateTime = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Signed duration from the event start, e.g. -P7D, -P1DT15H, PT9H. */
export function triggerDuration(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  let minutes = Math.round(Math.abs(ms) / 60_000);
  const days = Math.floor(minutes / 1440);
  minutes -= days * 1440;
  const hours = Math.floor(minutes / 60);
  minutes -= hours * 60;
  const time = hours || minutes ? `T${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}` : '';
  if (!days && !time) return 'PT0M';
  return `${sign}P${days ? `${days}D` : ''}${time}`;
}

/**
 * Repeat rule. Month-end anchors (29th–31st) use BYSETPOS so short months land
 * on their last day, matching how PRM itself schedules (31 Jan → 28 Feb → 31 Mar).
 */
export function recurrenceRule(repeat: Interval, dueISO: string, anchorDay?: number): string {
  const base = `RRULE:FREQ=${FREQ[repeat.unit]};INTERVAL=${repeat.every}`;
  const day = anchorDay ?? parseISODate(dueISO).getDate();
  if ((repeat.unit === 'month' || repeat.unit === 'year') && day > 28) {
    const days = Array.from({ length: day - 27 }, (_, i) => 28 + i).join(',');
    const month = repeat.unit === 'year' ? `;BYMONTH=${parseISODate(dueISO).getMonth() + 1}` : '';
    return `${base}${month};BYMONTHDAY=${days};BYSETPOS=-1`;
  }
  return base;
}

/**
 * Gap between two local moments as calendar days + clock time, in ms. Calendar
 * apps read "P90D" as 90 calendar days, so measuring in absolute time would
 * shift alarms by an hour whenever a daylight-saving change sits in between.
 */
export function wallClockGap(from: Date, to: Date): number {
  const days = diffDays(toISODate(from), toISODate(to));
  const minutes = to.getHours() * 60 + to.getMinutes() - (from.getHours() * 60 + from.getMinutes());
  return (days * 1440 + minutes) * 60_000;
}

interface EventSpec {
  uid: string;
  summary: string;
  description?: string;
  date: string;
  time?: string;
  repeat: Interval | null;
  anchorDay?: number;
  alerts: LeadTime[];
}

function eventLines(e: EventSpec, stamp: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, `SUMMARY:${escapeText(e.summary)}`];
  // All-day events start at midnight; PRM's alerts count from 09:00 (or the set time).
  let start: Date;
  if (e.time) {
    start = dueMoment(e.date, e.time);
    lines.push(`DTSTART:${localDateTime(start)}`, `DTEND:${localDateTime(new Date(start.getTime() + 30 * 60_000))}`);
  } else {
    start = parseISODate(e.date);
    lines.push(`DTSTART;VALUE=DATE:${dateValue(e.date)}`, `DTEND;VALUE=DATE:${dateValue(toISODate(addDays(start, 1)))}`);
    lines.push('TRANSP:TRANSPARENT');
  }
  if (e.repeat) lines.push(recurrenceRule(e.repeat, e.date, e.anchorDay));
  if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
  for (const lead of e.alerts) {
    const ms = wallClockGap(start, alertMoment(e.date, e.time, lead));
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(e.summary)}`, `TRIGGER:${triggerDuration(ms)}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

/** Open, snoozed and overdue reminders are exported; done and paused ones are not. */
export function buildCalendar(reminders: Reminder[], text: CalendarText, now: Date = new Date(), currencyFallback = 'EUR'): string {
  const stamp = utcStamp(now);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PRM//Please Remind Me//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:PRM'];
  for (const r of reminders) {
    const status = effectiveStatus(r, now);
    if (status === 'done' || status === 'paused') continue;
    const details = [
      r.autoPay ? text.autoCharged : '',
      r.amount ? `${text.amount}: ${r.amount.toFixed(2)} ${r.currency ?? currencyFallback}` : '',
      r.reference ? `${text.reference}: ${r.reference}` : '',
      r.notes ?? '',
    ].filter(Boolean);
    lines.push(
      ...eventLines(
        {
          uid: `${r.id}@prm`,
          summary: r.title,
          description: details.join('\n') || undefined,
          date: r.dueDate,
          time: r.dueTime,
          repeat: r.repeat,
          anchorDay: r.anchorDay,
          alerts: r.alerts,
        },
        stamp,
      ),
    );
    const deadline = noticeDeadline(r);
    if (deadline && r.notice) {
      lines.push(
        ...eventLines(
          { uid: `${r.id}-notice@prm`, summary: text.deadlineTitle(r.title), date: deadline, repeat: r.repeat, alerts: r.notice.alerts },
          stamp,
        ),
      );
    }
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

export function calendarFileName(now: Date = new Date(), slug = 'prm-reminders'): string {
  return `${slug}-${toISODate(now)}.ics`;
}
