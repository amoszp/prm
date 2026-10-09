// Storage contract. The app only talks to `Collection<T>`, never to IndexedDB
// directly, so phase 2 can swap in an HTTP adapter (Chiquitojaco API) without
// touching stores or pages.

export interface Entity {
  id: string;
}

export interface Collection<T extends Entity> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  put(item: T): Promise<T>;
  putMany(items: T[]): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export const STORE_NAMES = [
  'reminders',
  'categories',
  'repeatPresets',
  'alertPresets',
  'providerTypes',
  'providers',
  'templates',
  'people',
  'meta',
  // Device-only: attachments never go through the phase-2 server adapter.
  'attachments',
  'attachmentFiles',
] as const;

export type StoreName = (typeof STORE_NAMES)[number];
