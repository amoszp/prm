import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Person } from '@/types';
import { useData, type PersonDraft } from '@/stores/DataStore';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ColorPicker } from '@/components/editors';
import { ManageList } from '@/components/ManageList';
import { PageHeader } from '@/components/PageHeader';
import { PersonDot } from '@/components/PersonBadge';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Button, Field, Input, LoadingPage } from '@/components/ui';
import { t, tn } from '@/i18n';

interface PersonSheetProps {
  open: boolean;
  person?: Person;
  onClose: () => void;
  onSaved?: (p: Person) => void;
}

/** Create / edit a person. Also used inline from the reminder form. */
export function PersonSheet({ open, person, onClose, onSaved }: PersonSheetProps) {
  const { people, savePerson } = useData();
  const { toast } = useToast();
  const [form, setForm] = useState<PersonDraft>({ name: '', color: 'rose' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(person ? { name: person.name, color: person.color } : { name: '', color: 'rose' });
    setError('');
  }, [open, person]);

  const submit = async () => {
    const name = form.name.trim();
    if (!name) return setError(t('Give them a name.'));
    if (people.some((p) => p.id !== person?.id && p.name.toLowerCase() === name.toLowerCase())) {
      return setError(t('Someone with that name is already on the list.'));
    }
    const res = await savePerson({ ...form, name }, person?.id);
    if (!res.ok) return toast(res.error.message, { tone: 'error' });
    toast(person ? t('Saved') : t('Added {name}', { name }), { tone: 'success' });
    onSaved?.(res.value);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={person ? t('Edit person') : t('New person')}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {person ? t('Save') : t('Add person')}
          </Button>
        </>
      }
    >
      <div className="inline" style={{ alignItems: 'flex-end', gap: 'var(--s-3)' }}>
        <PersonDot person={{ name: form.name || '?', color: form.color }} large />
        <div style={{ flex: 1 }}>
          <Field label={t('Name')} htmlFor="person-name" error={error}>
            <Input
              id="person-name"
              data-autofocus
              value={form.name}
              invalid={Boolean(error)}
              placeholder={t('e.g. Mum, Nana')}
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
    </Sheet>
  );
}

export function ManagePeoplePage() {
  const { people, reminders, loading, move, deletePerson } = useData();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Person | undefined>();
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Person | null>(null);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reminders) if (r.personId) m.set(r.personId, (m.get(r.personId) ?? 0) + 1);
    return m;
  }, [reminders]);

  if (loading) return <LoadingPage />;
  const used = usage.get(toDelete?.id ?? '') ?? 0;

  return (
    <div className="page page-narrow">
      <PageHeader
        back={{ to: '/settings', label: t('Settings') }}
        title={t('People')}
        sub={t('Family and friends whose dates you keep track of — Mum’s DNI, Nana’s insurance. Reminders with nobody picked are yours.')}
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => {
              setEditing(undefined);
              setOpen(true);
            }}
          >
            {t('New person')}
          </Button>
        }
      />
      {people.length === 0 ? (
        <div className="quiet-card">{t('Nobody yet. Add someone here, or straight from a reminder’s “For” field.')}</div>
      ) : (
        <ManageList
          items={people}
          itemLabel={(p) => p.name}
          lead={(p) => <PersonDot person={p} large />}
          name={(p) => p.name}
          sub={(p) => {
            const n = usage.get(p.id) ?? 0;
            return tn(n, '{n} reminder', '{n} reminders');
          }}
          onEdit={(p) => {
            setEditing(p);
            setOpen(true);
          }}
          onDelete={setToDelete}
          onMove={(p, dir) => void move('people', p.id, dir)}
        />
      )}
      <PersonSheet open={open} person={editing} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title={t('Remove {name}?', { name: toDelete?.name ?? '' })}
        confirmLabel={t('Remove')}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deletePerson(toDelete.id);
          setToDelete(null);
          toast(res.ok ? t('Removed') : res.error.message, { tone: res.ok ? 'info' : 'error' });
        }}
      >
        {used > 0
          ? tn(used, '{n} reminder is for {name}. It stays and becomes yours.', '{n} reminders are for {name}. They stay and become yours.', {
              name: toDelete?.name ?? '',
            })
          : t('No reminders are for them, so nothing else changes.')}
      </ConfirmDialog>
    </div>
  );
}
