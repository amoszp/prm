import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { AlertPreset, LeadTime, TimeUnit } from '@/types';
import { useData } from '@/stores/DataStore';
import { leadLabel, sameLead } from '@/lib/dates';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { LeadInput } from '@/components/editors';
import { ManageList } from '@/components/ManageList';
import { PageHeader } from '@/components/PageHeader';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Button, Field, Input, LoadingPage } from '@/components/ui';
import { t, tn } from '@/i18n';

const SHORT: Record<TimeUnit, string> = { hour: 'h', day: 'd', week: 'w', month: 'mo', year: 'y' };

function AlertSheet({ open, preset, onClose }: { open: boolean; preset?: AlertPreset; onClose: () => void }) {
  const { alertPresets, saveAlertPreset } = useData();
  const { toast } = useToast();
  const [lead, setLead] = useState<LeadTime>({ value: 10, unit: 'day' });
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLead(preset?.lead ?? { value: 10, unit: 'day' });
    setLabel(preset?.label ?? '');
    setError('');
  }, [open, preset]);

  const submit = async () => {
    const clash = alertPresets.find((p) => p.id !== preset?.id && sameLead(p.lead, lead));
    if (clash) return setError(t('“{name}” already covers that.', { name: clash.label }));
    const res = await saveAlertPreset({ lead, label: label.trim() || leadLabel(lead) }, preset?.id);
    if (!res.ok) return toast(res.error.message, { tone: 'error' });
    toast(preset ? t('Saved') : t('Added “{name}”', { name: res.value.label }), { tone: 'success' });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={preset ? t('Edit alert option') : t('New alert option')}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {preset ? t('Save') : t('Add option')}
          </Button>
        </>
      }
    >
      <Field label={t('Warn me')} error={error}>
        <LeadInput
          value={lead}
          onChange={(v) => {
            setLead(v);
            setError('');
          }}
        />
      </Field>
      <Field label={t('Label')} htmlFor="alr-label" optional hint={t('Leave empty to use “{name}”.', { name: leadLabel(lead) })}>
        <Input id="alr-label" value={label} placeholder={leadLabel(lead)} onChange={(e) => setLabel(e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function ManageAlertsPage() {
  const { alertPresets, reminders, categories, loading, move, deleteAlertPreset } = useData();
  const { toast } = useToast();
  const [editing, setEditing] = useState<AlertPreset | undefined>();
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AlertPreset | null>(null);

  if (loading) return <LoadingPage />;
  const usedBy = (p: AlertPreset) => reminders.filter((r) => r.alerts.some((a) => sameLead(a, p.lead))).length;

  return (
    <div className="page page-narrow">
      <PageHeader
        back={{ to: '/settings', label: t('Settings') }}
        title={t('Alert options')}
        sub={t('How far ahead you can be warned. They show up as quick picks on every reminder; you can still add a custom one.')}
        actions={
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => {
              setEditing(undefined);
              setOpen(true);
            }}
          >
            {t('New option')}
          </Button>
        }
      />
      {alertPresets.length === 0 ? (
        <div className="quiet-card">{t('No saved options — add custom alerts per reminder, or create options here.')}</div>
      ) : (
        <ManageList
          items={alertPresets}
          itemLabel={(p) => p.label}
          lead={(p) => (
            <span className="lead-mark" aria-hidden="true">
              {p.lead.value}
              <small style={{ fontSize: 'var(--fs-12)', fontFamily: 'var(--font-ui)', marginLeft: 1 }}>{SHORT[p.lead.unit]}</small>
            </span>
          )}
          name={(p) => p.label}
          sub={(p) => {
            const n = usedBy(p);
            return `${leadLabel(p.lead)} · ${tn(n, 'on {n} reminder', 'on {n} reminders')}`;
          }}
          onEdit={(p) => {
            setEditing(p);
            setOpen(true);
          }}
          onDelete={setToDelete}
          onMove={(p, dir) => void move('alertPresets', p.id, dir)}
        />
      )}
      <AlertSheet open={open} preset={editing} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title={t('Delete “{name}”?', { name: toDelete?.label ?? '' })}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteAlertPreset(toDelete.id);
          setToDelete(null);
          toast(res.ok ? t('Option deleted') : res.error.message, { tone: res.ok ? 'info' : 'error' });
        }}
      >
        {toDelete && categories.some((c) => c.defaultAlerts.some((a) => sameLead(a, toDelete.lead)))
          ? t('It disappears from the quick picks. Reminders and category defaults that already use it keep the alert.')
          : t('It disappears from the quick picks. Reminders that already use it keep the alert.')}
      </ConfirmDialog>
    </div>
  );
}
