import { describe, expect, it } from 'vitest';
import { _resetDb, idbCollection } from '../src/data/indexeddb';

/** Create the database exactly as the first release did (version 1, original stores). */
function createV1(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('prm-db-v2', 1);
    req.onupgradeneeded = () => {
      for (const name of ['reminders', 'categories', 'repeatPresets', 'alertPresets', 'providerTypes', 'providers', 'meta']) {
        req.result.createObjectStore(name, { keyPath: 'id' });
      }
      req.transaction?.objectStore('reminders').put({ id: 'rem_old', title: 'Made before the upgrade' });
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

describe('IndexedDB upgrade', () => {
  it('upgrades a version-1 database without losing data, and supports get()', async () => {
    await createV1();
    _resetDb();
    const reminders = idbCollection<{ id: string; title: string }>('reminders');
    expect(await reminders.get('rem_old')).toEqual({ id: 'rem_old', title: 'Made before the upgrade' });
    expect(await reminders.get('missing')).toBeUndefined();

    const templates = idbCollection<{ id: string }>('templates');
    expect(await templates.list()).toEqual([]);
    const files = idbCollection<{ id: string; blob: Blob }>('attachmentFiles');
    await files.put({ id: 'att_1', blob: new Blob(['scan'], { type: 'image/png' }) });
    expect((await files.get('att_1'))?.id).toBe('att_1');
  });
});
