import { useEffect, useMemo, useState } from 'react';
import { Plus, Tag } from 'lucide-react';
import type { ProviderType } from '@/types';
import { useData } from '@/stores/DataStore';
import { ReassignDialog } from '@/components/ConfirmDialog';
import { ManageList } from '@/components/ManageList';
import { PageHeader } from '@/components/PageHeader';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Button, Field, Input, LoadingPage } from '@/components/ui';
import { t, tn } from '@/i18n';

function TypeSheet({ open, type, onClose }: { open: boolean; type?: ProviderType; onClose: () => void }) {
  const { providerTypes, saveProviderType } = useData();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(type?.name ?? '');
    setError('');
  }, [open, type]);

  const submit = async () => {
    const clean = name.trim();
    if (!clean) return setError(t('Give it a name.'));
    if (providerTypes.some((t) => t.id !== type?.id && t.name.toLowerCase() === clean.toLowerCase())) {
      return setError(t('That type already exists.'));
    }
    const res = await saveProviderType({ name: clean }, type?.id);
    if (!res.ok) return toast(res.error.message, { tone: 'error' });
    toast(type ? t('Saved') : t('Added “{name}”', { name: clean }), { tone: 'success' });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={type ? t('Rename type') : t('New provider type')}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {type ? t('Save') : t('Add type')}
          </Button>
        </>
      }
    >
      <Field label={t('Name')} htmlFor="ptype-name" error={error}>
        <Input
          id="ptype-name"
          data-autofocus
          value={name}
          invalid={Boolean(error)}
          placeholder={t('e.g. Vet, Accountant')}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
        />
      </Field>
    </Sheet>
  );
}

export function ManageProviderTypesPage() {
  const { providerTypes, providers, loading, move, deleteProviderType } = useData();
  const { toast } = useToast();
  const [editing, setEditing] = useState<ProviderType | undefined>();
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ProviderType | null>(null);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of providers) m.set(p.typeId, (m.get(p.typeId) ?? 0) + 1);
    return m;
  }, [providers]);
  const targets = useMemo(
    () => providerTypes.filter((t) => t.id !== toDelete?.id).map((t) => ({ id: t.id, name: t.name })),
    [providerTypes, toDelete],
  );

  if (loading) return <LoadingPage />;

  return (
    <div className="page page-narrow">
      <PageHeader
        back={{ to: '/settings', label: t('Settings') }}
        title={t('Provider types')}
        sub={t('How you group your providers.')}
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => {
              setEditing(undefined);
              setOpen(true);
            }}
          >
            {t('New type')}
          </Button>
        }
      />
      <ManageList
        items={providerTypes}
        itemLabel={(t) => t.name}
        lead={() => (
          <span className="lead-mark" aria-hidden="true">
            <Tag size={16} />
          </span>
        )}
        name={(t) => t.name}
        sub={(t) => {
          const n = usage.get(t.id) ?? 0;
          return tn(n, '{n} provider', '{n} providers');
        }}
        canDelete={() => providerTypes.length > 1}
        onEdit={(t) => {
          setEditing(t);
          setOpen(true);
        }}
        onDelete={setToDelete}
        onMove={(t, dir) => void move('providerTypes', t.id, dir)}
      />
      <TypeSheet open={open} type={editing} onClose={() => setOpen(false)} />
      <ReassignDialog
        open={Boolean(toDelete)}
        title={t('Delete “{name}”?', { name: toDelete?.name ?? '' })}
        usedBy={usage.get(toDelete?.id ?? '') ?? 0}
        noun="provider"
        options={targets}
        onClose={() => setToDelete(null)}
        onConfirm={async (target) => {
          if (!toDelete) return;
          const res = await deleteProviderType(toDelete.id, target);
          setToDelete(null);
          toast(res.ok ? t('Type deleted') : res.error.message, { tone: res.ok ? 'info' : 'error' });
        }}
      />
    </div>
  );
}
