// Server mode (builds with VITE_STORAGE_MODE=http): sign-in through the
// shared accounts service, and the one-time move of a device's phase-1 data
// (IndexedDB) into the signed-in account.

import { idbCollection } from '@/data/indexeddb';
import type { Entity, StoreName } from '@/data/collection';
import type { BackupFile } from '@/types';
import { nowISO } from './id';

export const SERVER_MODE = import.meta.env.VITE_STORAGE_MODE === 'http';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

/** Error from the server, with its HTTP status (0 = no connection). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<R>(method: string, path: string, body?: unknown): Promise<R> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'No connection');
  }
  const text = await res.text();
  let data: { error?: string } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (res.status === 401 && !path.startsWith('/auth/')) signalSignedOut();
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as R;
}

export interface AccountUser {
  id: number;
  username: string;
  displayName: string;
}

/** Fired when the server says the session is gone; the sign-in screen listens. */
export const SIGNED_OUT_EVENT = 'prm:signed-out';
export function signalSignedOut(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
}

const SYNCED: Exclude<StoreName, 'meta' | 'attachments' | 'attachmentFiles'>[] = [
  'reminders',
  'categories',
  'repeatPresets',
  'alertPresets',
  'providerTypes',
  'providers',
  'templates',
  'people',
];
/** Set once this device's phase-1 data has been offered to the server. */
const LS_IMPORTED = 'prm-imported';

/**
 * The first time anyone signs in on this device, its phase-1 data (kept in
 * IndexedDB) is sent to the server in PRM's backup format. The server only
 * takes it into an account that is still empty, so a second device can't
 * overwrite anything. The IndexedDB copy is left in place as a backup.
 * Attachments stay on the device either way.
 */
export async function importDeviceDataOnce(settings: BackupFile['settings']): Promise<boolean> {
  if (localStorage.getItem(LS_IMPORTED)) return false;
  const lists = await Promise.all(SYNCED.map((store) => idbCollection<Entity>(store).list()));
  // The app has been used on this device (it seeds its lists on first run).
  const meta = await idbCollection<Entity>('meta').list();
  const used = meta.some((m) => m.id === 'seeded') || lists.some((items) => items.length > 0);
  let imported = false;
  if (used) {
    const file = {
      app: 'prm',
      version: 3,
      exportedAt: nowISO(),
      settings,
      ...Object.fromEntries(SYNCED.map((store, i) => [store, lists[i]])),
    } as unknown as BackupFile;
    imported = (await apiRequest<{ imported: boolean }>('POST', '/import-device', file)).imported;
  }
  localStorage.setItem(LS_IMPORTED, '1');
  return imported;
}
