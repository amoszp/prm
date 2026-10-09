// JSON export/import. The same file is the migration path to the phase-2
// backend: export here, import there.

import type { BackupFile } from '@/types';
import { t } from '@/i18n';

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t('That file is not valid JSON.'));
  }
  const b = data as Partial<BackupFile>;
  if (!b || b.app !== 'prm' || (b.version !== 2 && b.version !== 3)) throw new Error(t('That file is not a backup from this app.'));
  const lists = ['categories', 'repeatPresets', 'alertPresets', 'providerTypes', 'providers', 'reminders'] as const;
  for (const key of lists) {
    if (!Array.isArray(b[key])) throw new Error(t('Backup is missing “{key}”.', { key }));
  }
  return b as BackupFile;
}

export function backupFileName(now: Date = new Date()): string {
  return `prm-backup-${now.toISOString().slice(0, 10)}.json`;
}

export function downloadJson(fileName: string, data: unknown): void {
  downloadFile(fileName, JSON.stringify(data, null, 2), 'application/json');
}

export function downloadFile(fileName: string, content: BlobPart, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
