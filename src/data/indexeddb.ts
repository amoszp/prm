// IndexedDB implementation of the storage contract (phase 1: on-device only).

import { STORE_NAMES, type Collection, type Entity, type StoreName } from './collection';
import { t } from '@/i18n';

const DB_NAME = 'prm-db-v2';
// v2 added templates, people and attachments (new empty stores; old data untouched).
const DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error(t('This browser has no IndexedDB, so this app cannot store data.')));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // A newer version of the app (another tab, or after an update) needs to
      // upgrade: step aside instead of blocking it. The next call reopens.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error(t('Could not open the database.')));
  });
  return dbPromise;
}

function run<R>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<R> | void,
): Promise<R> {
  return openDB().then(
    (db) =>
      new Promise<R>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        let result: R;
        if (req) req.onsuccess = () => (result = req.result);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error(t('Database write failed.')));
        tx.onabort = () => reject(tx.error ?? new Error(t('Database write aborted.')));
      }),
  );
}

export function idbCollection<T extends Entity>(store: StoreName): Collection<T> {
  return {
    list: () => run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
    get: (id) => run<T | undefined>(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>),
    put: async (item) => {
      await run(store, 'readwrite', (s) => s.put(item));
      return item;
    },
    putMany: async (items) => {
      await run(store, 'readwrite', (s) => {
        for (const item of items) s.put(item);
      });
    },
    remove: async (id) => {
      await run(store, 'readwrite', (s) => s.delete(id));
    },
    clear: async () => {
      await run(store, 'readwrite', (s) => s.clear());
    },
  };
}

/** Tests only: drop the cached connection. */
export function _resetDb(): void {
  dbPromise = null;
}
