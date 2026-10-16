// Single source of truth for everything the user creates. Every list is full
// CRUD; references between lists (reminder → category, provider → type) are
// repaired on delete so nothing is ever left pointing at a missing item.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AlertPreset,
  Attachment,
  AttachmentFile,
  BackupFile,
  Category,
  HistoryEntry,
  Person,
  Provider,
  ProviderType,
  Reminder,
  RepeatPreset,
  Result,
  Settings,
  Template,
} from '@/types';
import type { Collection, Entity, StoreName } from '@/data/collection';
import { idbCollection } from '@/data/indexeddb';
import { httpCollection } from '@/data/httpCollection';
import {
  sampleReminders,
  seedAlertPresets,
  seedCategories,
  seedProviderTypes,
  seedRepeatPresets,
  seedTemplates,
} from '@/data/seed';
import { attempt } from '@/lib/errors';
import { intervalLabel, intervalLabelIn, leadLabel, leadLabelIn } from '@/lib/dates';
import { seedText, t } from '@/i18n';
import { useSettings } from './SettingsStore';
import { createId, nowISO } from '@/lib/id';
import { anchorDayOf, completeCycle, effectiveStatus, settleAutoCharges, undoLastCycle } from '@/lib/reminders';

export interface DataState {
  reminders: Reminder[];
  categories: Category[];
  repeatPresets: RepeatPreset[];
  alertPresets: AlertPreset[];
  providerTypes: ProviderType[];
  providers: Provider[];
  templates: Template[];
  people: Person[];
}

type Kind = keyof DataState;
type ItemOf<K extends Kind> = DataState[K][number];
export type OrderedKind = 'categories' | 'repeatPresets' | 'alertPresets' | 'providerTypes' | 'templates' | 'people';
const ORDERED: OrderedKind[] = ['categories', 'repeatPresets', 'alertPresets', 'providerTypes', 'templates', 'people'];

/** Largest attachment accepted — a phone photo or a scanned PDF fits easily. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const EMPTY: DataState = {
  reminders: [],
  categories: [],
  repeatPresets: [],
  alertPresets: [],
  providerTypes: [],
  providers: [],
  templates: [],
  people: [],
};

const KINDS = Object.keys(EMPTY) as Kind[];

export type Collections = { [K in Kind]: Collection<ItemOf<K>> } & {
  meta: Collection<{ id: string; value: unknown }>;
  /** Device-only (see Attachment). Not part of DataState, so backups never include them. */
  attachments: Collection<Attachment>;
  attachmentFiles: Collection<AttachmentFile>;
};

// Phase 2: VITE_STORAGE_MODE=http swaps the eight synced stores to the
// backend API (see backend/src/router.ts) via the same Collection<T> seam,
// with zero changes to stores or pages. 'meta' (local seeding bookkeeping)
// and attachments/attachmentFiles (device-only, never synced — see
// src/types/index.ts's Attachment comment) always stay on IndexedDB
// regardless of mode.
const SYNCED_VIA_HTTP = import.meta.env.VITE_STORAGE_MODE === 'http';

function syncedCollection<T extends Entity>(store: StoreName): Collection<T> {
  return SYNCED_VIA_HTTP ? httpCollection<T>(store) : idbCollection<T>(store);
}

function defaultCollections(): Collections {
  return {
    reminders: syncedCollection<Reminder>('reminders'),
    categories: syncedCollection<Category>('categories'),
    repeatPresets: syncedCollection<RepeatPreset>('repeatPresets'),
    alertPresets: syncedCollection<AlertPreset>('alertPresets'),
    providerTypes: syncedCollection<ProviderType>('providerTypes'),
    providers: syncedCollection<Provider>('providers'),
    templates: syncedCollection<Template>('templates'),
    people: syncedCollection<Person>('people'),
    meta: idbCollection<{ id: string; value: unknown }>('meta'),
    attachments: idbCollection<Attachment>('attachments'),
    attachmentFiles: idbCollection<AttachmentFile>('attachmentFiles'),
  };
}

function byOrder<T extends { order: number }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.order - b.order);
}

/** Keep ordered lists sorted after any change. */
function normalise(state: DataState): DataState {
  return {
    ...state,
    categories: byOrder(state.categories),
    repeatPresets: byOrder(state.repeatPresets),
    alertPresets: byOrder(state.alertPresets),
    providerTypes: byOrder(state.providerTypes),
    templates: byOrder(state.templates),
    people: byOrder(state.people),
  };
}

function upsertIn<T extends Entity>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = [...list];
  next[i] = item;
  return next;
}

const nextOrder = (list: { order: number }[]) => list.reduce((max, x) => Math.max(max, x.order), -1) + 1;

function seedLists(ts: string): Pick<DataState, OrderedKind> {
  return {
    categories: seedCategories(ts),
    repeatPresets: seedRepeatPresets(ts),
    alertPresets: seedAlertPresets(ts),
    providerTypes: seedProviderTypes(ts),
    templates: seedTemplates(ts),
    people: [],
  };
}

// ---- Draft shapes accepted by the save functions ---------------------------

type Managed = 'id' | 'createdAt' | 'updatedAt';
export type ReminderDraft = Omit<Reminder, Managed | 'status' | 'history' | 'snoozedUntil' | 'anchorDay'>;
export type CategoryDraft = Omit<Category, Managed | 'order'>;
export type RepeatPresetDraft = Omit<RepeatPreset, Managed | 'order'>;
export type AlertPresetDraft = Omit<AlertPreset, Managed | 'order'>;
export type ProviderTypeDraft = Omit<ProviderType, Managed | 'order'>;
export type ProviderDraft = Omit<Provider, Managed>;
export type TemplateDraft = Omit<Template, Managed | 'order'>;
export type PersonDraft = Omit<Person, Managed | 'order'>;

export interface PaymentInput {
  amount?: number;
  paidOn?: string;
  /** Also make `amount` the new expected amount for future cycles. */
  updateExpected?: boolean;
}

export interface DataStore extends DataState {
  loading: boolean;
  error: string | null;
  /** Ticks every minute so time-based views (overdue, snooze expiry) stay fresh. */
  now: Date;

  saveReminder: (draft: ReminderDraft, id?: string) => Promise<Result<Reminder>>;
  deleteReminder: (id: string) => Promise<Result<Reminder>>;
  restoreReminder: (r: Reminder) => Promise<Result<Reminder>>;
  completeReminder: (id: string, opts?: PaymentInput) => Promise<Result<Reminder>>;
  skipReminder: (id: string) => Promise<Result<Reminder>>;
  updateHistoryEntry: (reminderId: string, entryId: string, patch: Pick<HistoryEntry, 'amount' | 'paidOn'>) => Promise<Result<Reminder>>;
  undoComplete: (id: string) => Promise<Result<Reminder>>;
  snoozeReminder: (id: string, untilIso: string) => Promise<Result<Reminder>>;
  setReminderStatus: (id: string, status: 'active' | 'paused') => Promise<Result<Reminder>>;
  deleteHistoryEntry: (reminderId: string, entryId: string) => Promise<Result<Reminder>>;

  saveCategory: (draft: CategoryDraft, id?: string) => Promise<Result<Category>>;
  deleteCategory: (id: string, reassignTo: string) => Promise<Result<void>>;
  saveRepeatPreset: (draft: RepeatPresetDraft, id?: string) => Promise<Result<RepeatPreset>>;
  deleteRepeatPreset: (id: string) => Promise<Result<void>>;
  saveAlertPreset: (draft: AlertPresetDraft, id?: string) => Promise<Result<AlertPreset>>;
  deleteAlertPreset: (id: string) => Promise<Result<void>>;
  saveProviderType: (draft: ProviderTypeDraft, id?: string) => Promise<Result<ProviderType>>;
  deleteProviderType: (id: string, reassignTo: string) => Promise<Result<void>>;
  saveProvider: (draft: ProviderDraft, id?: string) => Promise<Result<Provider>>;
  deleteProvider: (id: string) => Promise<Result<void>>;
  move: (kind: OrderedKind, id: string, direction: -1 | 1) => Promise<Result<void>>;
  saveTemplate: (draft: TemplateDraft, id?: string) => Promise<Result<Template>>;
  deleteTemplate: (id: string) => Promise<Result<void>>;
  savePerson: (draft: PersonDraft, id?: string) => Promise<Result<Person>>;
  deletePerson: (id: string) => Promise<Result<void>>;

  /** Metadata of every attachment on this device; file contents load on demand. */
  attachments: Attachment[];
  addAttachment: (reminderId: string, file: File) => Promise<Result<Attachment>>;
  deleteAttachment: (id: string) => Promise<Result<void>>;
  attachmentBlob: (id: string) => Promise<Blob | undefined>;

  buildBackup: (settings: Settings) => BackupFile;
  importBackup: (file: BackupFile) => Promise<Result<void>>;
  loadSamples: () => Promise<Result<number>>;
  resetEverything: () => Promise<Result<void>>;
  restoreDefaultLists: () => Promise<Result<void>>;
}

/** Stored label is still the automatic one (in either language)? Then show today's language. */
function autoLabel(stored: string, inEn: string, inEs: string, now: string): string {
  return stored === inEn || stored === inEs ? now : stored;
}

/**
 * What screens see: built-in names and automatic labels in the current
 * language. Storage keeps whatever was saved; anything the user renamed is
 * shown as they wrote it.
 */
function localise(d: DataState): DataState {
  return {
    ...d,
    categories: d.categories.map((c) => ({ ...c, name: seedText(c.name) })),
    providerTypes: d.providerTypes.map((p) => ({ ...p, name: seedText(p.name) })),
    templates: d.templates.map((x) => ({ ...x, name: seedText(x.name), notes: x.notes && seedText(x.notes) })),
    repeatPresets: d.repeatPresets.map((p) => ({
      ...p,
      label: autoLabel(p.label, intervalLabelIn('en', p.interval), intervalLabelIn('es', p.interval), intervalLabel(p.interval)),
    })),
    alertPresets: d.alertPresets.map((p) => ({
      ...p,
      label: autoLabel(p.label, leadLabelIn('en', p.lead), leadLabelIn('es', p.lead), leadLabel(p.lead)),
    })),
  };
}

const DataContext = createContext<DataStore | null>(null);

export function DataStoreProvider({ children, collections: injected }: { children: ReactNode; collections?: Collections }) {
  const collections = useMemo(() => injected ?? defaultCollections(), [injected]);
  const [data, setData] = useState<DataState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const language = useSettings().settings.language;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- labels depend on the module-level language
  const shown = useMemo(() => localise(data), [data, language]);
  const ref = useRef(data);
  ref.current = data;

  /**
   * Drop attachments whose reminder is gone. Run at load and after an import,
   * not on delete, so a deleted reminder's Undo brings its files back too.
   */
  const purgeOrphans = useCallback(
    async (reminders: Reminder[]): Promise<Attachment[]> => {
      const ids = new Set(reminders.map((r) => r.id));
      const all = await collections.attachments.list();
      const orphans = all.filter((a) => !ids.has(a.reminderId));
      for (const a of orphans) {
        await collections.attachmentFiles.remove(a.id);
        await collections.attachments.remove(a.id);
      }
      return all.filter((a) => ids.has(a.reminderId));
    },
    [collections],
  );

  // ---- load + first-run seed ------------------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const meta = new Set((await collections.meta.list()).map((m) => m.id));
        if (SYNCED_VIA_HTTP && !injected) {
          // The account decides, not the device: a fresh account gets the
          // default lists once, whichever device it first signs in on.
          if ((await collections.categories.list()).length === 0) {
            const lists = seedLists(nowISO());
            for (const k of ORDERED) await (collections[k] as Collection<Entity>).putMany(lists[k]);
          }
        } else if (!meta.has('seeded')) {
          const lists = seedLists(nowISO());
          for (const k of ORDERED) await (collections[k] as Collection<Entity>).putMany(lists[k]);
          await collections.meta.put({ id: 'seeded', value: nowISO() });
          await collections.meta.put({ id: 'seeded:templates', value: nowISO() });
        } else if (!meta.has('seeded:templates')) {
          // Installs from before templates existed get the defaults once.
          await collections.templates.putMany(seedTemplates(nowISO()));
          await collections.meta.put({ id: 'seeded:templates', value: nowISO() });
        }
        const loaded = await Promise.all(KINDS.map((k) => collections[k].list()));
        const next = Object.fromEntries(KINDS.map((k, i) => [k, loaded[i]])) as unknown as DataState;
        // With the server, this device's attachments may belong to reminders of
        // another account that signed in here before: never purge them then.
        const files = SYNCED_VIA_HTTP && !injected ? await collections.attachments.list() : await purgeOrphans(next.reminders);
        if (!alive) return;
        setData(normalise(next));
        setAttachments(files);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : t('Could not load your data.'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [collections, purgeOrphans, injected]);

  // With the server, reopening the app shows changes made on other devices.
  useEffect(() => {
    if (!SYNCED_VIA_HTTP || injected) return;
    const reload = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const loaded = await Promise.all(KINDS.map((k) => collections[k].list()));
        setData(normalise(Object.fromEntries(KINDS.map((k, i) => [k, loaded[i]])) as unknown as DataState));
      } catch {
        /* offline: keep what's on screen */
      }
    };
    document.addEventListener('visibilitychange', reload);
    return () => document.removeEventListener('visibilitychange', reload);
  }, [collections, injected]);

  // ---- minute tick + persist expired snoozes --------------------------------
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const expired = data.reminders.filter((r) => r.status === 'snoozed' && effectiveStatus(r, now) === 'active');
    if (expired.length === 0) return;
    const ts = nowISO();
    const woken = expired.map((r) => ({ ...r, status: 'active' as const, snoozedUntil: undefined, updatedAt: ts }));
    void collections.reminders
      .putMany(woken)
      .then(() => setData((prev) => ({ ...prev, reminders: woken.reduce((list, r) => upsertIn(list, r), prev.reminders) })))
      .catch(() => undefined); // display already treats them as active
  }, [data.reminders, now, collections]);

  // Auto-charged reminders whose date has passed complete themselves.
  useEffect(() => {
    if (loading) return;
    const settled = settleAutoCharges(data.reminders, now, () => createId('h'), nowISO());
    if (settled.length === 0) return;
    void collections.reminders
      .putMany(settled)
      .then(() => setData((prev) => ({ ...prev, reminders: settled.reduce((list, r) => upsertIn(list, r), prev.reminders) })))
      .catch(() => undefined);
  }, [data.reminders, now, loading, collections]);

  // ---- generic helpers --------------------------------------------------------
  const putMany = useCallback(
    async <K extends Kind>(kind: K, items: ItemOf<K>[]) => {
      if (items.length === 0) return;
      await (collections[kind] as Collection<ItemOf<K>>).putMany(items);
      setData((prev) =>
        normalise({ ...prev, [kind]: items.reduce((list, it) => upsertIn(list, it), prev[kind] as ItemOf<K>[]) }),
      );
    },
    [collections],
  );

  const put = useCallback(
    async <K extends Kind>(kind: K, item: ItemOf<K>): Promise<ItemOf<K>> => {
      await putMany(kind, [item]);
      return item;
    },
    [putMany],
  );

  const drop = useCallback(
    async (kind: Kind, id: string) => {
      await collections[kind].remove(id);
      setData((prev) => ({ ...prev, [kind]: (prev[kind] as Entity[]).filter((x) => x.id !== id) }));
    },
    [collections],
  );

  const saveOrdered = useCallback(
    <K extends OrderedKind>(kind: K, prefix: string, draft: Omit<ItemOf<K>, Managed | 'order'>, id?: string) =>
      attempt(async () => {
        const ts = nowISO();
        const list = ref.current[kind] as ItemOf<K>[];
        const existing = id ? list.find((x) => x.id === id) : undefined;
        if (id && !existing) throw new Error(t('That item no longer exists.'));
        const item = existing
          ? ({ ...existing, ...draft, updatedAt: ts } as ItemOf<K>)
          : ({ ...draft, id: createId(prefix), order: nextOrder(list), createdAt: ts, updatedAt: ts } as ItemOf<K>);
        return put(kind, item);
      }),
    [put],
  );

  const findReminder = (id: string): Reminder => {
    const r = ref.current.reminders.find((x) => x.id === id);
    if (!r) throw new Error(t('That reminder no longer exists.'));
    return r;
  };

  // ---- reminders ----------------------------------------------------------------
  const saveReminder = useCallback(
    (draft: ReminderDraft, id?: string) =>
      attempt(async () => {
        const ts = nowISO();
        const existing = id ? findReminder(id) : undefined;
        const base: Reminder = existing ?? {
          ...draft,
          id: createId('rem'),
          status: 'active',
          history: [],
          createdAt: ts,
          updatedAt: ts,
        };
        // Optional fields cleared in the form must be cleared here too.
        const merged: Reminder = {
          ...base,
          notes: undefined,
          reference: undefined,
          amount: undefined,
          currency: undefined,
          autoPay: undefined,
          paidWithId: undefined,
          nagDaily: undefined,
          notice: undefined,
          dueTime: undefined,
          providerId: undefined,
          personId: undefined,
          ...draft,
          anchorDay: anchorDayOf(draft.dueDate),
          updatedAt: ts,
        };
        return put('reminders', merged);
      }),
    [put],
  );

  const deleteReminder = useCallback(
    (id: string) =>
      attempt(async () => {
        const r = findReminder(id);
        // Anything charged to this card loses the link rather than dangling.
        const ts = nowISO();
        const unlinked = ref.current.reminders
          .filter((x) => x.paidWithId === id)
          .map((x) => ({ ...x, paidWithId: undefined, updatedAt: ts }));
        await putMany('reminders', unlinked);
        await drop('reminders', id);
        return r;
      }),
    [drop, putMany],
  );

  const restoreReminder = useCallback((r: Reminder) => attempt(() => put('reminders', r)), [put]);

  const completeReminder = useCallback(
    (id: string, opts: PaymentInput = {}) =>
      attempt(() => {
        const r = findReminder(id);
        const next = completeCycle(r, createId('h'), nowISO(), { amount: opts.amount, paidOn: opts.paidOn });
        const expected = opts.updateExpected && opts.amount != null ? { amount: opts.amount } : {};
        return put('reminders', { ...next, ...expected });
      }),
    [put],
  );

  const skipReminder = useCallback(
    (id: string) =>
      attempt(() => {
        const r = findReminder(id);
        if (!r.repeat) throw new Error(t('Only repeating reminders can skip a cycle.'));
        return put('reminders', completeCycle(r, createId('h'), nowISO(), { skipped: true }));
      }),
    [put],
  );

  const updateHistoryEntry = useCallback(
    (reminderId: string, entryId: string, patch: Pick<HistoryEntry, 'amount' | 'paidOn'>) =>
      attempt(() => {
        const r = findReminder(reminderId);
        const history = r.history.map((h) => (h.id === entryId ? { ...h, ...patch } : h));
        return put('reminders', { ...r, history, updatedAt: nowISO() });
      }),
    [put],
  );

  const undoComplete = useCallback(
    (id: string) => attempt(() => put('reminders', undoLastCycle(findReminder(id), nowISO()))),
    [put],
  );

  const snoozeReminder = useCallback(
    (id: string, untilIso: string) =>
      attempt(() =>
        put('reminders', { ...findReminder(id), status: 'snoozed', snoozedUntil: untilIso, updatedAt: nowISO() }),
      ),
    [put],
  );

  const setReminderStatus = useCallback(
    (id: string, status: 'active' | 'paused') =>
      attempt(() => put('reminders', { ...findReminder(id), status, snoozedUntil: undefined, updatedAt: nowISO() })),
    [put],
  );

  const deleteHistoryEntry = useCallback(
    (reminderId: string, entryId: string) =>
      attempt(() => {
        const r = findReminder(reminderId);
        return put('reminders', { ...r, history: r.history.filter((h) => h.id !== entryId), updatedAt: nowISO() });
      }),
    [put],
  );

  // ---- categories ---------------------------------------------------------------
  const saveCategory = useCallback(
    (draft: CategoryDraft, id?: string) => saveOrdered('categories', 'cat', draft, id),
    [saveOrdered],
  );

  const deleteCategory = useCallback(
    (id: string, reassignTo: string) =>
      attempt(async () => {
        if (id === reassignTo) throw new Error(t('Pick a different category to move reminders into.'));
        if (!ref.current.categories.some((c) => c.id === reassignTo)) throw new Error(t('Target category not found.'));
        const ts = nowISO();
        const moved = ref.current.reminders
          .filter((r) => r.categoryId === id)
          .map((r) => ({ ...r, categoryId: reassignTo, updatedAt: ts }));
        await putMany('reminders', moved);
        const movedTemplates = ref.current.templates
          .filter((t) => t.categoryId === id)
          .map((t) => ({ ...t, categoryId: reassignTo, updatedAt: ts }));
        await putMany('templates', movedTemplates);
        await drop('categories', id);
      }),
    [putMany, drop],
  );

  // ---- presets (reminders store intervals/alerts inline, so deletes are safe) --
  const saveRepeatPreset = useCallback(
    (draft: RepeatPresetDraft, id?: string) => saveOrdered('repeatPresets', 'rep', draft, id),
    [saveOrdered],
  );
  const deleteRepeatPreset = useCallback((id: string) => attempt(() => drop('repeatPresets', id)), [drop]);

  const saveAlertPreset = useCallback(
    (draft: AlertPresetDraft, id?: string) => saveOrdered('alertPresets', 'alr', draft, id),
    [saveOrdered],
  );
  const deleteAlertPreset = useCallback((id: string) => attempt(() => drop('alertPresets', id)), [drop]);

  // ---- providers ----------------------------------------------------------------
  const saveProviderType = useCallback(
    (draft: ProviderTypeDraft, id?: string) => saveOrdered('providerTypes', 'ptype', draft, id),
    [saveOrdered],
  );

  const deleteProviderType = useCallback(
    (id: string, reassignTo: string) =>
      attempt(async () => {
        if (id === reassignTo) throw new Error(t('Pick a different type to move providers into.'));
        if (!ref.current.providerTypes.some((x) => x.id === reassignTo)) throw new Error(t('Target type not found.'));
        const ts = nowISO();
        const moved = ref.current.providers
          .filter((p) => p.typeId === id)
          .map((p) => ({ ...p, typeId: reassignTo, updatedAt: ts }));
        await putMany('providers', moved);
        await drop('providerTypes', id);
      }),
    [putMany, drop],
  );

  const saveProvider = useCallback(
    (draft: ProviderDraft, id?: string) =>
      attempt(async () => {
        const ts = nowISO();
        const existing = id ? ref.current.providers.find((p) => p.id === id) : undefined;
        if (id && !existing) throw new Error(t('That provider no longer exists.'));
        const item: Provider = existing
          ? { ...existing, phone: undefined, email: undefined, website: undefined, address: undefined, notes: undefined, ...draft, updatedAt: ts }
          : { ...draft, id: createId('prov'), createdAt: ts, updatedAt: ts };
        return put('providers', item);
      }),
    [put],
  );

  const deleteProvider = useCallback(
    (id: string) =>
      attempt(async () => {
        const ts = nowISO();
        const unlinked = ref.current.reminders
          .filter((r) => r.providerId === id)
          .map((r) => ({ ...r, providerId: undefined, updatedAt: ts }));
        await putMany('reminders', unlinked);
        await drop('providers', id);
      }),
    [putMany, drop],
  );

  // ---- templates & people ------------------------------------------------------
  const saveTemplate = useCallback(
    (draft: TemplateDraft, id?: string) => saveOrdered('templates', 'tpl', draft, id),
    [saveOrdered],
  );
  const deleteTemplate = useCallback((id: string) => attempt(() => drop('templates', id)), [drop]);

  const savePerson = useCallback((draft: PersonDraft, id?: string) => saveOrdered('people', 'per', draft, id), [saveOrdered]);

  const deletePerson = useCallback(
    (id: string) =>
      attempt(async () => {
        // Their reminders stay; they just become yours.
        const ts = nowISO();
        const unlinked = ref.current.reminders
          .filter((r) => r.personId === id)
          .map((r) => ({ ...r, personId: undefined, updatedAt: ts }));
        await putMany('reminders', unlinked);
        await drop('people', id);
      }),
    [putMany, drop],
  );

  // ---- attachments (device-only) -------------------------------------------------
  const addAttachment = useCallback(
    (reminderId: string, file: File) =>
      attempt(async () => {
        if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(t('“{name}” is larger than 20 MB.', { name: file.name }));
        const item: Attachment = {
          id: createId('att'),
          reminderId,
          name: file.name || 'file',
          type: file.type || 'application/octet-stream',
          size: file.size,
          createdAt: nowISO(),
        };
        await collections.attachmentFiles.put({ id: item.id, blob: file });
        await collections.attachments.put(item);
        setAttachments((prev) => [...prev, item]);
        return item;
      }),
    [collections],
  );

  const deleteAttachment = useCallback(
    (id: string) =>
      attempt(async () => {
        await collections.attachmentFiles.remove(id);
        await collections.attachments.remove(id);
        setAttachments((prev) => prev.filter((a) => a.id !== id));
      }),
    [collections],
  );

  const attachmentBlob = useCallback(async (id: string) => (await collections.attachmentFiles.get(id))?.blob, [collections]);

  // ---- ordering -------------------------------------------------------------------
  const move = useCallback(
    (kind: OrderedKind, id: string, direction: -1 | 1) =>
      attempt(async () => {
        const list = byOrder(ref.current[kind] as ItemOf<OrderedKind>[]);
        const i = list.findIndex((x) => x.id === id);
        const j = i + direction;
        if (i === -1 || j < 0 || j >= list.length) return;
        const ts = nowISO();
        // Re-number the whole list so legacy duplicate orders can't stall a move.
        const reordered = [...list];
        [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
        const renumbered = reordered.map((x, order) => ({ ...x, order, updatedAt: x.order === order ? x.updatedAt : ts }));
        await putMany(kind, renumbered as ItemOf<typeof kind>[]);
      }),
    [putMany],
  );

  // ---- backup / reset ---------------------------------------------------------------
  const buildBackup = useCallback(
    (settings: Settings): BackupFile => ({ app: 'prm', version: 3, exportedAt: nowISO(), settings, ...ref.current }),
    [],
  );

  const replaceAll = useCallback(
    async (next: DataState) => {
      for (const k of KINDS) {
        await collections[k].clear();
        await (collections[k] as Collection<Entity>).putMany(next[k]);
      }
      setData(normalise(next));
    },
    [collections],
  );

  const importBackup = useCallback(
    (file: BackupFile) =>
      attempt(() =>
        replaceAll({
          reminders: file.reminders,
          categories: file.categories,
          repeatPresets: file.repeatPresets,
          alertPresets: file.alertPresets,
          providerTypes: file.providerTypes,
          providers: file.providers,
          // Version 2 backups predate templates and people.
          templates: file.templates ?? seedTemplates(nowISO()),
          people: file.people ?? [],
        }).then(async () => setAttachments(await purgeOrphans(file.reminders))),
      ),
    [replaceAll, purgeOrphans],
  );

  const loadSamples = useCallback(
    () =>
      attempt(async () => {
        const ts = nowISO();
        // Samples use the default category ids; recreate any the user removed.
        const missing = seedCategories(ts).filter((c) => !ref.current.categories.some((x) => x.id === c.id));
        const start = nextOrder(ref.current.categories);
        await putMany('categories', missing.map((c, i) => ({ ...c, order: start + i })));
        const samples = sampleReminders(ts);
        await putMany('reminders', samples);
        return samples.length;
      }),
    [putMany],
  );

  const resetEverything = useCallback(
    () =>
      attempt(async () => {
        await replaceAll({ ...seedLists(nowISO()), reminders: [], providers: [] });
        await collections.attachments.clear();
        await collections.attachmentFiles.clear();
        setAttachments([]);
      }),
    [replaceAll, collections],
  );

  const restoreDefaultLists = useCallback(
    () =>
      attempt(async () => {
        const seeds = seedLists(nowISO());
        for (const kind of ORDERED) {
          const current = ref.current[kind] as ItemOf<OrderedKind>[];
          const missing = (seeds[kind] as ItemOf<OrderedKind>[]).filter((s) => !current.some((c) => c.id === s.id));
          const start = nextOrder(current);
          await putMany(kind, missing.map((m, i) => ({ ...m, order: start + i })) as ItemOf<typeof kind>[]);
        }
      }),
    [putMany],
  );

  const value = useMemo<DataStore>(
    () => ({
      ...shown,
      loading,
      error,
      now,
      saveReminder,
      deleteReminder,
      restoreReminder,
      completeReminder,
      skipReminder,
      updateHistoryEntry,
      undoComplete,
      snoozeReminder,
      setReminderStatus,
      deleteHistoryEntry,
      saveCategory,
      deleteCategory,
      saveRepeatPreset,
      deleteRepeatPreset,
      saveAlertPreset,
      deleteAlertPreset,
      saveProviderType,
      deleteProviderType,
      saveProvider,
      deleteProvider,
      move,
      saveTemplate,
      deleteTemplate,
      savePerson,
      deletePerson,
      attachments,
      addAttachment,
      deleteAttachment,
      attachmentBlob,
      buildBackup,
      importBackup,
      loadSamples,
      resetEverything,
      restoreDefaultLists,
    }),
    [
      shown,
      loading,
      error,
      now,
      saveReminder,
      deleteReminder,
      restoreReminder,
      completeReminder,
      skipReminder,
      updateHistoryEntry,
      undoComplete,
      snoozeReminder,
      setReminderStatus,
      deleteHistoryEntry,
      saveCategory,
      deleteCategory,
      saveRepeatPreset,
      deleteRepeatPreset,
      saveAlertPreset,
      deleteAlertPreset,
      saveProviderType,
      deleteProviderType,
      saveProvider,
      deleteProvider,
      move,
      saveTemplate,
      deleteTemplate,
      savePerson,
      deletePerson,
      attachments,
      addAttachment,
      deleteAttachment,
      attachmentBlob,
      buildBackup,
      importBackup,
      loadSamples,
      resetEverything,
      restoreDefaultLists,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataStore {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataStoreProvider.');
  return ctx;
}

/** Id → item lookups derived from the store. */
export function useLookups() {
  const { categories, providers, providerTypes, people } = useData();
  return useMemo(() => {
    const cat = new Map(categories.map((c) => [c.id, c]));
    const per = new Map(people.map((p) => [p.id, p]));
    const prov = new Map(providers.map((p) => [p.id, p]));
    const ptype = new Map(providerTypes.map((t) => [t.id, t]));
    return {
      category: (id: string) => cat.get(id),
      provider: (id?: string) => (id ? prov.get(id) : undefined),
      providerType: (id: string) => ptype.get(id),
      person: (id?: string) => (id ? per.get(id) : undefined),
    };
  }, [categories, providers, providerTypes, people]);
}
