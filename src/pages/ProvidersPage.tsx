import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Mail, MapPin, Pencil, Phone, Plus, Search, Tags, Trash2, Users } from 'lucide-react';
import type { Provider } from '@/types';
import { useData, type ProviderDraft } from '@/stores/DataStore';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Button, Field, IconButton, Input, LoadingPage, Select, TextArea } from '@/components/ui';
import { seedText, t, tn } from '@/i18n';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function webHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

interface ProviderSheetProps {
  open: boolean;
  provider?: Provider;
  onClose: () => void;
  onSaved?: (p: Provider) => void;
}

/** Create / edit a provider. Also used inline from the reminder form. */
export function ProviderSheet({ open, provider, onClose, onSaved }: ProviderSheetProps) {
  const { providerTypes, saveProvider } = useData();
  const { toast } = useToast();
  const empty = (): ProviderDraft => ({ name: '', typeId: providerTypes[0]?.id ?? '' });
  const [form, setForm] = useState<ProviderDraft>(empty);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(provider ? { ...provider } : empty());
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider]);

  const set = (key: keyof ProviderDraft, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (!form.name.trim()) return setError(t('Give the provider a name.'));
    const clean = (v?: string) => v?.trim() || undefined;
    const res = await saveProvider(
      {
        name: form.name.trim(),
        typeId: form.typeId,
        phone: clean(form.phone),
        email: clean(form.email),
        website: clean(form.website),
        address: clean(form.address),
        notes: clean(form.notes),
      },
      provider?.id,
    );
    if (!res.ok) return toast(res.error.message, { tone: 'error' });
    toast(provider ? t('Provider saved') : t('Provider added'), { tone: 'success' });
    onSaved?.(res.value);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={provider ? t('Edit provider') : t('New provider')}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {provider ? t('Save') : t('Add provider')}
          </Button>
        </>
      }
    >
      <Field label={t('Name')} htmlFor="pv-name" error={error}>
        <Input id="pv-name" data-autofocus value={form.name} invalid={Boolean(error)} placeholder={t('e.g. Línea Directa')} onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label={t('Type')} htmlFor="pv-type" hint={<Link to="/settings/provider-types">{t('Edit provider types')}</Link>}>
        <Select id="pv-type" value={form.typeId} onChange={(e) => set('typeId', e.target.value)}>
          {providerTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid-2">
        <Field label={t('Phone')} htmlFor="pv-phone" optional>
          <Input id="pv-phone" type="tel" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label={t('Email')} htmlFor="pv-email" optional>
          <Input id="pv-email" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </Field>
      </div>
      <Field label={t('Website')} htmlFor="pv-web" optional>
        <Input id="pv-web" type="url" inputMode="url" placeholder="example.com" value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} />
      </Field>
      <Field label={t('Address')} htmlFor="pv-addr" optional>
        <Input id="pv-addr" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
      </Field>
      <Field label={t('Notes')} htmlFor="pv-notes" optional>
        <TextArea id="pv-notes" value={form.notes ?? ''} placeholder={t('Customer number, opening hours…')} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function ProvidersPage() {
  const { providers, providerTypes, reminders, loading, deleteProvider } = useData();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Provider | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Provider | null>(null);
  const [text, setText] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const typeName = useMemo(() => new Map(providerTypes.map((t) => [t.id, t.name])), [providerTypes]);
  const linked = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of reminders) if (r.providerId) m.set(r.providerId, (m.get(r.providerId) ?? 0) + 1);
    return m;
  }, [reminders]);

  const visible = useMemo(() => {
    const q = text.trim().toLowerCase();
    return [...providers]
      .filter((p) => !typeFilter || p.typeId === typeFilter)
      .filter((p) => !q || [p.name, p.notes, p.email, p.phone, typeName.get(p.typeId)].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [providers, text, typeFilter, typeName]);

  if (loading) return <LoadingPage />;

  const open = (p?: Provider) => {
    setEditing(p);
    setSheetOpen(true);
  };

  return (
    <div className="page">
      <PageHeader
        back={{ to: '/settings', label: t('Settings') }}
        eyebrow={t('{n} saved', { n: providers.length })}
        title={t('Providers')}
        sub={t('Insurers, banks, utilities and the people who fix things — linked to the reminders they belong to.')}
        actions={
          <>
            <Link to="/settings/provider-types" className="btn btn-ghost">
              <Tags size={16} /> {t('Types')}
            </Link>
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => open()}>
              {t('New provider')}
            </Button>
          </>
        }
      />

      {providers.length > 0 ? (
        <div className="toolbar">
          <div className="inline" style={{ flexWrap: 'wrap' }}>
            <div className="search" style={{ flex: '1 1 260px' }}>
              <Search size={16} />
              <Input type="search" placeholder={t('Search providers…')} value={text} aria-label={t('Search providers')} onChange={(e) => setText(e.target.value)} />
            </div>
            <Select value={typeFilter} aria-label={t('Filter by type')} style={{ flex: '0 1 220px' }} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">{t('All types')}</option>
              {providerTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}

      {providers.length === 0 ? (
        <EmptyState
          icon={<Users size={22} />}
          title={t('No providers yet')}
          actions={
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => open()}>
              {t('Add a provider')}
            </Button>
          }
        >
          {t('Keep the insurer’s phone number or the plumber’s email next to the reminder that needs them.')}
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon={<Search size={22} />} title={t('No matches')}>
          {t('Try another name or type.')}
        </EmptyState>
      ) : (
        <div className="provider-grid">
          {visible.map((p) => {
            const count = linked.get(p.id) ?? 0;
            return (
              <article key={p.id} className="card provider">
                <div className="avatar" aria-hidden="true">
                  {initials(p.name)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="provider-name">{p.name}</div>
                  <div className="provider-type">
                    {typeName.get(p.typeId) ?? seedText('Other')}
                    {count ? ` · ${tn(count, '{n} reminder', '{n} reminders')}` : ''}
                  </div>
                  <div className="provider-links">
                    {p.phone ? (
                      <a href={`tel:${p.phone}`} className="num">
                        <Phone size={13} /> {p.phone}
                      </a>
                    ) : null}
                    {p.email ? (
                      <a href={`mailto:${p.email}`}>
                        <Mail size={13} /> {p.email}
                      </a>
                    ) : null}
                    {p.website ? (
                      <a href={webHref(p.website)} target="_blank" rel="noreferrer noopener">
                        <Globe size={13} /> {p.website.replace(/^https?:\/\//, '')}
                      </a>
                    ) : null}
                    {p.address ? (
                      <span>
                        <MapPin size={13} /> {p.address}
                      </span>
                    ) : null}
                  </div>
                  {p.notes ? (
                    <p className="hint" style={{ marginTop: 'var(--s-2)', whiteSpace: 'pre-wrap' }}>
                      {p.notes}
                    </p>
                  ) : null}
                </div>
                <div className="manage-actions">
                  <IconButton label={t('Edit {name}', { name: p.name })} onClick={() => open(p)}>
                    <Pencil size={15} />
                  </IconButton>
                  <IconButton label={t('Delete {name}', { name: p.name })} tone="danger" onClick={() => setToDelete(p)}>
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ProviderSheet open={sheetOpen} provider={editing} onClose={() => setSheetOpen(false)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title={t('Delete {name}?', { name: toDelete?.name ?? '' })}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteProvider(toDelete.id);
          setToDelete(null);
          toast(res.ok ? t('Provider deleted') : res.error.message, { tone: res.ok ? 'info' : 'error' });
        }}
      >
        {(linked.get(toDelete?.id ?? '') ?? 0) > 0
          ? tn(
              linked.get(toDelete?.id ?? '') ?? 0,
              '{n} reminder links to it. It stays, just without a provider.',
              '{n} reminders link to it. They stay, just without a provider.',
            )
          : t('Nothing links to it.')}
      </ConfirmDialog>
    </div>
  );
}
