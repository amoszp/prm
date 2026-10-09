import { describe, expect, it } from 'vitest';
import { parseBackup } from '../src/data/backup';

const valid = {
  app: 'prm',
  version: 2,
  exportedAt: '2026-10-06T20:00:00.000Z',
  settings: { theme: 'system', currency: 'EUR', upcomingDays: 14, notificationsEnabled: false },
  categories: [],
  repeatPresets: [],
  alertPresets: [],
  providerTypes: [],
  providers: [],
  reminders: [],
};

describe('parseBackup', () => {
  it('accepts a valid backup', () => {
    expect(parseBackup(JSON.stringify(valid)).version).toBe(2);
  });

  it('rejects junk, other apps and missing lists', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/);
    expect(() => parseBackup(JSON.stringify({ ...valid, app: 'other' }))).toThrow(/not a backup from this app/);
    const { reminders: _omit, ...missing } = valid;
    expect(() => parseBackup(JSON.stringify(missing))).toThrow(/reminders/);
  });
});
