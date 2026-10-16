// POST /api/import — a restore in one shot. Accepts PRM's existing
// BackupFile export format (see src/data/backup.ts's parseBackup, which the
// frontend already uses for JSON import), so there is no new format to design.
//
// POST /api/import-device — the same file, sent by the app the first time an
// account signs in on a device that already had data (phase 1 kept everything
// in IndexedDB). It only lands in an account that is still empty, so a second
// device can never overwrite an account's data.

import type { Request, Response } from 'express';
import { clearStore, db, isAccountEmpty, putRecord } from './db';
import type { StoreName } from './types';
// Type-only: erased at compile time, so no runtime dependency on the
// frontend's own module graph (unlike scheduler.ts, which needs the real
// due-date logic and does import it at runtime).
import type { BackupFile } from '../../src/types';

const REQUIRED_LISTS = ['reminders', 'categories', 'repeatPresets', 'alertPresets', 'providerTypes', 'providers'] as const;
// Version 2 backups predate templates and people; importing one leaves
// whatever templates/people already exist on the server untouched rather
// than reproducing the frontend's seed defaults here.
const OPTIONAL_LISTS = ['templates', 'people'] as const;

/** The backup's lists, or an error message. */
function readBackup(body: Partial<BackupFile> | undefined): { lists: [StoreName, { id: string }[]][] } | { error: string } {
  if (!body || body.app !== 'prm' || (body.version !== 2 && body.version !== 3)) {
    return { error: 'not a recognised PRM backup file' };
  }
  for (const key of REQUIRED_LISTS) {
    if (!Array.isArray(body[key])) return { error: `backup is missing "${key}"` };
  }
  const lists: [StoreName, { id: string }[]][] = [];
  for (const key of [...REQUIRED_LISTS, ...OPTIONAL_LISTS]) {
    const items = body[key as keyof BackupFile];
    if (!Array.isArray(items)) continue; // optional list absent on this backup version
    if (!items.every((i) => i && typeof i === 'object' && typeof (i as { id?: unknown }).id === 'string')) {
      return { error: `every item in "${key}" needs an "id"` };
    }
    lists.push([key as StoreName, items as { id: string }[]]);
  }
  return { lists };
}

function write(userId: number, lists: [StoreName, { id: string }[]][], replace: boolean): void {
  db.exec('BEGIN');
  try {
    for (const [store, items] of lists) {
      if (replace) clearStore(userId, store);
      for (const item of items) putRecord(userId, store, item);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function importBackup(req: Request, res: Response): void {
  const result = readBackup(req.body);
  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  write(req.user!.id, result.lists, true);
  res.status(204).send();
}

export function importDevice(req: Request, res: Response): void {
  const result = readBackup(req.body);
  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  if (!isAccountEmpty(req.user!.id)) {
    res.json({ imported: false });
    return;
  }
  write(req.user!.id, result.lists, false);
  res.json({ imported: true });
}
