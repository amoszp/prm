import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Category } from '@/types';
import { useData, type CategoryDraft } from '@/stores/DataStore';
import { leadLabel } from '@/lib/dates';
import { CategoryGlyph, CategoryTile, catStyle } from '@/components/CategoryIcon';
import { ReassignDialog } from '@/components/ConfirmDialog';
import { AlertsEditor, ColorPicker, IconPicker, sortLeads } from '@/components/editors';
import { ManageList } from '@/components/ManageList';
import { PageHeader } from '@/components/PageHeader';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Button, Field, Input, LoadingPage, Switch } from '@/components/ui';
import { t, tn } from '@/i18n';

interface CategorySheetProps {
  open: boolean;
  category?: Category;
  onClose: () => void;
  onSaved?: (c: Category) => void;
}

/** Create / edit a category. Also used inline from the reminder form. */
export function CategorySheet({ open, category, onClose, onSaved }: CategorySheetProps) {
  const { categories, alertPresets, saveCategory } = useData();
  const { toast } = useToast();
  const empty: CategoryDraft = { name: '', color: 'cobalt', icon: 'bell', defaultAlerts: [{ value: 1, unit: 'week' }] };
  const [form, setForm] = useState<CategoryDraft>(empty);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(
      category
        ? { name: category.name, color: category.color, icon: category.icon, defaultAlerts: category.defaultAlerts, holdsCards: category.holdsCards }
        : empty,
    );
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category]);

  const submit = async () => {
    const name = form.name.trim();
    if (!name) return setError(t('Give it a name.'));
    if (categories.some((c) => c.id !== category?.id && c.name.toLowerCase() === name.toLowerCase())) {
      return setError(t('You already have a category with that name.'));
    }
    const res = await saveCategory({ ...form, name }, category?.id);
    if (!res.ok) return toast(res.error.message, { tone: 'error' });
    toast(category ? t('Category saved') : t('Added “{name}”', { name }), { tone: 'success' });
    onSaved?.(res.value);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title={category ? t('Edit category') : t('New category')}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {category ? t('Save') : t('Add category')}
          </Button>
        </>
      }
    >
      <div className="inline" style={{ alignItems: 'flex-end', gap: 'var(--s-3)' }}>
        <CategoryTile color={form.color} icon={form.icon} />
        <div style={{ flex: 1 }}>
          <Field label={t('Name')} htmlFor="cat-name" error={error}>
            <Input
              id="cat-name"
              data-autofocus
              value={form.name}
              invalid={Boolean(error)}
              placeholder={t('e.g. Pets, Gym, Domains')}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }));
                setError('');
              }}
            />
          </Field>
        </div>
      </div>
      <Field label={t('Colour')}>
        <ColorPicker value={form.color} onChange={(color) => setForm((f) => ({ ...f, color }))} />
      </Field>
      <Field label={t('Icon')}>
        <IconPicker value={form.icon} color={form.color} onChange={(icon) => setForm((f) => ({ ...f, icon }))} />
      </Field>
      <div className="toggle-row">
        <div>
          <div className="settings-label">{t('These are payment cards')}</div>
          <div className="settings-desc">{t('Reminders here can be picked as “Paid with” on bills and subscriptions, so a card’s expiry shows what it pays.')}</div>
        </div>
        <Switch
          label={t('These are payment cards')}
          checked={Boolean(form.holdsCards)}
          onChange={(holdsCards) => setForm((f) => ({ ...f, holdsCards: holdsCards || undefined }))}
        />
      </div>
      <Field label={t('Default alerts')} hint={t('Pre-selected on new reminders in this category. You can still change them per reminder.')}>
        <AlertsEditor value={form.defaultAlerts} presets={alertPresets} onChange={(defaultAlerts) => setForm((f) => ({ ...f, defaultAlerts }))} />
      </Field>
    </Sheet>
  );
}

export function ManageCategoriesPage() {
  const { categories, reminders, loading, move, deleteCategory } = useData();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Category | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reminders) m.set(r.categoryId, (m.get(r.categoryId) ?? 0) + 1);
    return m;
  }, [reminders]);

  const targets = useMemo(
    () => categories.filter((c) => c.id !== toDelete?.id).map((c) => ({ id: c.id, name: c.name })),
    [categories, toDelete],
  );

  if (loading) return <LoadingPage />;

  return (
    <div className="page page-narrow">
      <PageHeader
        back={{ to: '/settings', label: t('Settings') }}
        title={t('Categories')}
        sub={t('Group your reminders your way. Each one has its own colour, icon and default alerts.')}
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => {
              setEditing(undefined);
              setSheetOpen(true);
            }}
          >
            {t('New category')}
          </Button>
        }
      />

      <ManageList
        items={categories}
        itemLabel={(c) => c.name}
        lead={(c) => <CategoryTile color={c.color} icon={c.icon} />}
        name={(c) => c.name}
        sub={(c) => {
          const n = usage.get(c.id) ?? 0;
          const alerts = c.defaultAlerts.length ? sortLeads(c.defaultAlerts).map(leadLabel).join(', ') : t('no default alerts');
          return `${tn(n, '{n} reminder', '{n} reminders')} · ${alerts}`;
        }}
        canDelete={() => categories.length > 1}
        onEdit={(c) => {
          setEditing(c);
          setSheetOpen(true);
        }}
        onDelete={setToDelete}
        onMove={(c, dir) => void move('categories', c.id, dir)}
      />
      {categories.length === 1 ? <p className="hint" style={{ marginTop: 'var(--s-3)' }}>{t('You need at least one category.')}</p> : null}

      <div className="section">
        <div className="section-head">
          <h2 className="section-title">{t('Preview')}</h2>
        </div>
        <div className="chips">
          {categories.map((c) => (
            <span key={c.id} className="chip chip-static is-on" style={catStyle(c.color)}>
              <CategoryGlyph icon={c.icon} size={14} />
              {c.name}
            </span>
          ))}
        </div>
      </div>

      <CategorySheet open={sheetOpen} category={editing} onClose={() => setSheetOpen(false)} />
      <ReassignDialog
        open={Boolean(toDelete)}
        title={t('Delete “{name}”?', { name: toDelete?.name ?? '' })}
        usedBy={usage.get(toDelete?.id ?? '') ?? 0}
        noun="reminder"
        options={targets}
        onClose={() => setToDelete(null)}
        onConfirm={async (target) => {
          if (!toDelete) return;
          const res = await deleteCategory(toDelete.id, target);
          setToDelete(null);
          toast(res.ok ? t('Category deleted') : res.error.message, { tone: res.ok ? 'info' : 'error' });
        }}
      />
    </div>
  );
}
