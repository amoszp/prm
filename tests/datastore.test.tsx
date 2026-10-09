import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DataStoreProvider, useData, type Collections } from '../src/stores/DataStore';
import { SettingsStoreProvider } from '../src/stores/SettingsStore';
import type { Entity } from '../src/data/collection';
import { idbCollection } from '../src/data/indexeddb';

describe('IndexedDB adapter', () => {
  it('puts, lists, removes and clears', async () => {
    const col = idbCollection<{ id: string; n: number }>('providers');
    await col.clear();
    await col.put({ id: 'a', n: 1 });
    await col.putMany([
      { id: 'b', n: 2 },
      { id: 'a', n: 3 },
    ]);
    expect((await col.list()).sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: 'a', n: 3 },
      { id: 'b', n: 2 },
    ]);
    await col.remove('a');
    expect(await col.list()).toEqual([{ id: 'b', n: 2 }]);
    await col.clear();
    expect(await col.list()).toEqual([]);
  });
});

// In-memory storage adapter — proves the store only depends on the contract.
function memoryCollections(): Collections {
  const make = <T extends Entity>() => {
    let rows = new Map<string, T>();
    return {
      list: async () => [...rows.values()],
      get: async (id: string) => rows.get(id),
      put: async (item: T) => {
        rows.set(item.id, item);
        return item;
      },
      putMany: async (items: T[]) => {
        items.forEach((i) => rows.set(i.id, i));
      },
      remove: async (id: string) => {
        rows.delete(id);
      },
      clear: async () => {
        rows = new Map();
      },
    };
  };
  return {
    reminders: make(),
    categories: make(),
    repeatPresets: make(),
    alertPresets: make(),
    providerTypes: make(),
    providers: make(),
    templates: make(),
    people: make(),
    meta: make(),
    attachments: make(),
    attachmentFiles: make(),
  } as Collections;
}

let collections: Collections;
const wrapper = ({ children }: { children: ReactNode }) => (
  <SettingsStoreProvider>
    <DataStoreProvider collections={collections}>{children}</DataStoreProvider>
  </SettingsStoreProvider>
);

async function setup() {
  const hook = renderHook(() => useData(), { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

const draft = {
  title: 'Car insurance',
  categoryId: 'cat_insurance',
  dueDate: '2026-11-30',
  repeat: { every: 1, unit: 'year' as const },
  alerts: [{ value: 1, unit: 'month' as const }],
};

beforeEach(() => {
  collections = memoryCollections();
});

describe('DataStore', () => {
  it('seeds every editable list on first run', async () => {
    const { result } = await setup();
    expect(result.current.categories.length).toBeGreaterThanOrEqual(10);
    expect(result.current.categories.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Insurance', 'Bank cards', 'ID & documents', 'Subscriptions']),
    );
    expect(result.current.repeatPresets.some((p) => p.interval.every === 10 && p.interval.unit === 'year')).toBe(true);
    expect(result.current.alertPresets.length).toBeGreaterThan(0);
    expect(result.current.providerTypes.length).toBeGreaterThan(0);
  });

  it('creates, edits, completes and deletes a reminder', async () => {
    const { result } = await setup();
    let id = '';
    await act(async () => {
      const res = await result.current.saveReminder(draft);
      expect(res.ok).toBe(true);
      if (res.ok) id = res.value.id;
    });
    await act(async () => {
      await result.current.saveReminder({ ...draft, title: 'Car insurance (Mapfre)', amount: 400, currency: 'EUR' }, id);
    });
    expect(result.current.reminders[0]).toMatchObject({ title: 'Car insurance (Mapfre)', amount: 400, anchorDay: 30 });

    // Clearing an optional field in the form must clear it in storage too.
    await act(async () => {
      await result.current.saveReminder({ ...draft, title: 'Car insurance (Mapfre)' }, id);
    });
    expect(result.current.reminders[0].amount).toBeUndefined();

    await act(async () => {
      await result.current.completeReminder(id);
    });
    expect(result.current.reminders[0].dueDate).toBe('2027-11-30');
    expect(result.current.reminders[0].history).toHaveLength(1);

    await act(async () => {
      await result.current.deleteReminder(id);
    });
    expect(result.current.reminders).toHaveLength(0);
    expect(await collections.reminders.list()).toHaveLength(0);
  });

  it('creates a custom category and moves reminders when one is deleted', async () => {
    const { result } = await setup();
    let petsId = '';
    await act(async () => {
      const res = await result.current.saveCategory({ name: 'Pets', color: 'rose', icon: 'cat', defaultAlerts: [] });
      if (res.ok) petsId = res.value.id;
    });
    expect(result.current.categories.at(-1)?.name).toBe('Pets');

    await act(async () => {
      await result.current.saveReminder({ ...draft, title: 'Vet check-up', categoryId: petsId });
    });
    await act(async () => {
      const res = await result.current.deleteCategory(petsId, 'cat_health');
      expect(res.ok).toBe(true);
    });
    expect(result.current.categories.some((c) => c.id === petsId)).toBe(false);
    expect(result.current.reminders[0].categoryId).toBe('cat_health');
  });

  it('reorders lists', async () => {
    const { result } = await setup();
    const [first, second] = result.current.categories;
    await act(async () => {
      await result.current.move('categories', second.id, -1);
    });
    expect(result.current.categories[0].id).toBe(second.id);
    expect(result.current.categories[1].id).toBe(first.id);
  });

  it('full CRUD on repeat & alert options and provider types', async () => {
    const { result } = await setup();
    let repId = '';
    let alrId = '';
    await act(async () => {
      const r = await result.current.saveRepeatPreset({ label: 'Every 4 years', interval: { every: 4, unit: 'year' } });
      const a = await result.current.saveAlertPreset({ label: '10 days before', lead: { value: 10, unit: 'day' } });
      if (r.ok) repId = r.value.id;
      if (a.ok) alrId = a.value.id;
    });
    await act(async () => {
      await result.current.saveRepeatPreset({ label: 'Card renewal', interval: { every: 4, unit: 'year' } }, repId);
    });
    expect(result.current.repeatPresets.find((p) => p.id === repId)?.label).toBe('Card renewal');
    await act(async () => {
      await result.current.deleteRepeatPreset(repId);
      await result.current.deleteAlertPreset(alrId);
    });
    expect(result.current.repeatPresets.some((p) => p.id === repId)).toBe(false);
    expect(result.current.alertPresets.some((p) => p.id === alrId)).toBe(false);

    let vetType = '';
    let provId = '';
    await act(async () => {
      const t = await result.current.saveProviderType({ name: 'Vet' });
      if (t.ok) vetType = t.value.id;
    });
    await act(async () => {
      const p = await result.current.saveProvider({ name: 'Clínica Huellas', typeId: vetType, phone: '600000000' });
      if (p.ok) provId = p.value.id;
    });
    await act(async () => {
      await result.current.saveReminder({ ...draft, providerId: provId });
    });
    await act(async () => {
      await result.current.deleteProviderType(vetType, 'ptype_other');
    });
    expect(result.current.providers[0].typeId).toBe('ptype_other');
    await act(async () => {
      await result.current.deleteProvider(provId);
    });
    expect(result.current.providers).toHaveLength(0);
    expect(result.current.reminders[0].providerId).toBeUndefined();
  });

  it('round-trips a backup', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.saveReminder(draft);
    });
    const backup = result.current.buildBackup({ theme: 'system', currency: 'EUR', upcomingDays: 14, notificationsEnabled: false });
    await act(async () => {
      await result.current.resetEverything();
    });
    expect(result.current.reminders).toHaveLength(0);
    await act(async () => {
      await result.current.importBackup(backup);
    });
    expect(result.current.reminders[0].title).toBe('Car insurance');
  });

  it('records actual payments, updates the expected amount, skips and edits history', async () => {
    const { result } = await setup();
    let id = '';
    await act(async () => {
      const res = await result.current.saveReminder({ ...draft, amount: 400, currency: 'EUR' });
      if (res.ok) id = res.value.id;
    });
    await act(async () => {
      await result.current.completeReminder(id, { amount: 432, paidOn: '2026-11-28', updateExpected: true });
    });
    let r = result.current.reminders[0];
    expect(r.amount).toBe(432);
    expect(r.history[0]).toMatchObject({ amount: 432, paidOn: '2026-11-28' });
    await act(async () => {
      await result.current.skipReminder(id);
    });
    r = result.current.reminders[0];
    expect(r.dueDate).toBe('2028-11-30');
    expect(r.history[0].skipped).toBe(true);
    const paidEntry = r.history[1].id;
    await act(async () => {
      await result.current.updateHistoryEntry(id, paidEntry, { amount: 430, paidOn: '2026-11-27' });
    });
    expect(result.current.reminders[0].history[1]).toMatchObject({ amount: 430, paidOn: '2026-11-27' });
  });

  it('links subscriptions to a card and unlinks them when the card is deleted', async () => {
    const { result } = await setup();
    expect(result.current.categories.find((c) => c.id === 'cat_cards')?.holdsCards).toBe(true);
    let cardId = '';
    await act(async () => {
      const res = await result.current.saveReminder({ ...draft, title: 'Visa expires', categoryId: 'cat_cards' });
      if (res.ok) cardId = res.value.id;
    });
    await act(async () => {
      await result.current.saveReminder({ ...draft, title: 'YouTube', categoryId: 'cat_subscriptions', autoPay: true, paidWithId: cardId });
    });
    expect(result.current.reminders.find((r) => r.title === 'YouTube')?.paidWithId).toBe(cardId);
    await act(async () => {
      await result.current.deleteReminder(cardId);
    });
    expect(result.current.reminders.find((r) => r.title === 'YouTube')?.paidWithId).toBeUndefined();
  });

  it('seeds templates, and adds them once to installs made before templates existed', async () => {
    const fresh = await setup();
    const dni = fresh.result.current.templates.find((t) => t.id === 'tpl_dni');
    expect(dni?.alerts).toHaveLength(5);
    fresh.unmount();

    collections = memoryCollections();
    await collections.meta.put({ id: 'seeded', value: 'old install' });
    const old = await setup();
    expect(old.result.current.templates.length).toBeGreaterThan(5);
    old.unmount();
    // A second start must not seed again (deleted templates stay deleted).
    await collections.templates.remove('tpl_dni');
    const again = await setup();
    expect(again.result.current.templates.some((t) => t.id === 'tpl_dni')).toBe(false);
  });

  it('full CRUD on templates; deleting a category moves its templates', async () => {
    const { result } = await setup();
    let id = '';
    await act(async () => {
      const res = await result.current.saveTemplate({ name: 'Gym membership', categoryId: 'cat_other', repeat: { every: 1, unit: 'month' }, alerts: [], autoPay: true, amount: 39 });
      if (res.ok) id = res.value.id;
    });
    await act(async () => {
      await result.current.saveTemplate({ name: 'Gym', categoryId: 'cat_health', repeat: { every: 1, unit: 'month' }, alerts: [], amount: undefined }, id);
    });
    expect(result.current.templates.find((t) => t.id === id)).toMatchObject({ name: 'Gym', categoryId: 'cat_health', amount: undefined });
    await act(async () => {
      await result.current.deleteCategory('cat_health', 'cat_other');
    });
    expect(result.current.templates.find((t) => t.id === id)?.categoryId).toBe('cat_other');
    await act(async () => {
      await result.current.deleteTemplate(id);
    });
    expect(result.current.templates.some((t) => t.id === id)).toBe(false);
  });

  it('people: reminders can be for someone; deleting the person makes them yours', async () => {
    const { result } = await setup();
    let mum = '';
    await act(async () => {
      const res = await result.current.savePerson({ name: 'Mum', color: 'rose' });
      if (res.ok) mum = res.value.id;
    });
    await act(async () => {
      await result.current.saveReminder({ ...draft, title: 'Mum’s DNI', personId: mum });
    });
    expect(result.current.reminders[0].personId).toBe(mum);
    await act(async () => {
      await result.current.deletePerson(mum);
    });
    expect(result.current.people).toHaveLength(0);
    expect(result.current.reminders[0].personId).toBeUndefined();
  });

  it('attachments stay on the device, out of backups, and go when their reminder does', async () => {
    const first = await setup();
    let id = '';
    let att = '';
    await act(async () => {
      const res = await first.result.current.saveReminder(draft);
      if (res.ok) id = res.value.id;
    });
    await act(async () => {
      const res = await first.result.current.addAttachment(id, new File(['policy'], 'policy.pdf', { type: 'application/pdf' }));
      expect(res.ok).toBe(true);
      if (res.ok) att = res.value.id;
    });
    expect(first.result.current.attachments).toMatchObject([{ reminderId: id, name: 'policy.pdf', type: 'application/pdf', size: 6 }]);
    expect(await first.result.current.attachmentBlob(att)).toBeInstanceOf(Blob);
    const backup = first.result.current.buildBackup({ theme: 'system', currency: 'EUR', upcomingDays: 14, notificationsEnabled: false });
    expect(JSON.stringify(backup)).not.toContain('policy.pdf');
    expect(backup.version).toBe(3);

    // Too big is refused.
    await act(async () => {
      const big = new File(['x'], 'huge.jpg');
      Object.defineProperty(big, 'size', { value: 25 * 1024 * 1024 });
      const res = await first.result.current.addAttachment(id, big);
      expect(res.ok).toBe(false);
    });

    // Deleting the reminder keeps the file until the next start (so Undo works), then it is purged.
    await act(async () => {
      await first.result.current.deleteReminder(id);
    });
    expect(await collections.attachments.list()).toHaveLength(1);
    first.unmount();
    const second = await setup();
    expect(second.result.current.attachments).toHaveLength(0);
    expect(await collections.attachmentFiles.list()).toHaveLength(0);
  });

  it('erasing everything removes attachments too', async () => {
    const { result } = await setup();
    let id = '';
    await act(async () => {
      const res = await result.current.saveReminder(draft);
      if (res.ok) id = res.value.id;
    });
    await act(async () => {
      await result.current.addAttachment(id, new File(['a'], 'a.png', { type: 'image/png' }));
    });
    await act(async () => {
      await result.current.resetEverything();
    });
    expect(result.current.attachments).toHaveLength(0);
    expect(await collections.attachmentFiles.list()).toHaveLength(0);
  });
});
