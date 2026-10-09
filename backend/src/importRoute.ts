// POST /api/import — the phase-1-to-phase-2 migration in one shot. Accepts
// PRM's existing BackupFile export format (see src/data/backup.ts's
// parseBackup, which the frontend already uses for JSON import), so there is
// no new format to design: export on-device, import here.

import type { Request, Response } from 'express';
import { clearStore, putManyRecords } from './db';
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

export function importBackup(req: Request, res: Response): void {
  const body = req.body as Partial<BackupFile> | undefined;
  if (!body || body.app !== 'prm' || (body.version !== 2 && body.version !== 3)) {
    res.status(400).json({ error: 'not a recognised PRM backup file' });
    return;
  }
  for (const key of REQUIRED_LISTS) {
    if (!Array.isArray(body[key])) {
      res.status(400).json({ error: `backup is missing "${key}"` });
      return;
    }
  }

  for (const key of [...REQUIRED_LISTS, ...OPTIONAL_LISTS]) {
    const items = body[key as keyof BackupFile];
    if (!Array.isArray(items)) continue; // optional list absent on this backup version
    const store = key as StoreName;
    clearStore(store);
    putManyRecords(store, items as { id: string }[]);
  }

  res.status(204).send();
}
