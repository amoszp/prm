/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'http' swaps every synced Collection<T> to the phase-2 backend; anything
   * else (including unset) keeps phase 1's on-device IndexedDB. See
   * src/stores/DataStore.tsx's defaultCollections(). */
  readonly VITE_STORAGE_MODE?: 'indexeddb' | 'http';
  /** Base URL for the backend API when VITE_STORAGE_MODE is 'http'. Defaults
   * to '/api' (same-origin — the backend serves the built PWA itself, see
   * backend/src/index.ts). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
