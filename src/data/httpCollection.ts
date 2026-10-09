// HTTP implementation of the storage contract (phase 2: talks to the backend
// API — see backend/src/router.ts for the matching generic REST routes).
// Swapped in through the same seam as idbCollection; see DataStore.tsx's
// defaultCollections(), gated by VITE_STORAGE_MODE.

import { STORE_NAMES, type Collection, type Entity, type StoreName } from './collection';
import { t } from '@/i18n';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function request<R>(path: string, init?: RequestInit): Promise<R> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(t('Server request failed ({status}).', { status: res.status }));
  }
  if (res.status === 204) return undefined as R;
  return (await res.json()) as R;
}

export function httpCollection<T extends Entity>(store: StoreName): Collection<T> {
  if (!STORE_NAMES.includes(store)) {
    throw new Error(t('Unknown store "{store}".', { store }));
  }
  return {
    list: () => request<T[]>(`/${store}`),
    get: async (id) => {
      const res = await fetch(`${API_BASE}/${store}/${encodeURIComponent(id)}`);
      if (res.status === 404) return undefined;
      if (!res.ok) throw new Error(t('Server request failed ({status}).', { status: res.status }));
      return (await res.json()) as T;
    },
    put: (item) => request<T>(`/${store}/${encodeURIComponent(item.id)}`, { method: 'PUT', body: JSON.stringify(item) }),
    putMany: async (items) => {
      if (items.length === 0) return;
      await request<void>(`/${store}/bulk`, { method: 'POST', body: JSON.stringify(items) });
    },
    remove: async (id) => {
      await request<void>(`/${store}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    clear: async () => {
      await request<void>(`/${store}`, { method: 'DELETE' });
    },
  };
}
