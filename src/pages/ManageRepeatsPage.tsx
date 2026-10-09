import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Interval, RepeatPreset } from '@/types';
import { useData } from '@/stores/DataStore';
import { intervalLabel, sameInterval } from '@/lib/dates';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { IntervalInput } from '@/components/editors';
import { ManageList } from '@/components/ManageList';
import { PageHeader } from '@/components/PageHeader';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { Button, Field, Input, LoadingPage } from '@/components/ui';
import { t, tn } from '@/i18n';

const SHORT: Record<Interval['unit'], string> = { day: 'd', week: 'w', month: 'mo', year: 'y' };

function RepeatSheet({ open, preset, onClose }: { open: boolean; preset?: RepeatPreset; onClose: () => void }) {
  const { repeatPresets, saveRepeatPreset } = useData();
  const { toast } = useToast();
  const [interval, setIntervalValue] = useState<Interval>({ every: 1, unit: 'month' });
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setIntervalValue(preset?.interval ?? { every: 2, unit: 'year' });
    setLabel(preset?.label ?? '');
    setError('');
  }, [open, preset]);

  const submit = async () => {
    const clash = repeatPresets.find((p) => p.id !== preset?.id && sameInterval(p.interval, interval));
    if (clash) return setError(t('“{name}” already repeats on that schedule.', { name: clash.label }));
    const res = await saveRepeatPreset({ interval, label: label.trim() || intervalLabel(interval) }, preset?.id);
    if (!res.ok) return toast(res.error.message, { tone: 'error' });
    toast(preset ? t('Saved') : t('Added “{name}”', { name: res.value.label }), { tone: 'success' });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={preset ? t('Edit repeat option') : t('New repeat option')}
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
      <Field label={t('Repeats')} error={error}>
        <IntervalInput
          value={interval}
          onChange={(v) => {
            setIntervalValue(v);
            setError('');
          }}
        />
      </Field>
      <Field label={t('Label')} htmlFor="rep-label" optional hint={t('Leave empty to use “{name}”.', { name: intervalLabel(interval) })}>
        <Input id="rep-label" value={label} placeholder={intervalLabel(interval)} onChange={(e) => setLabel(e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function ManageRepeatsPage() {
  const { repeatPresets, reminders, loading, move, deleteRepeatPreset } = useData();
  const { toast } = useToast();
  const [editing, setEditing] = useState<RepeatPreset | undefined>();
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<RepeatPreset | null>(null);

  if (loading) return <LoadingPage />;
  const usedBy = (p: RepeatPreset) => reminders.filter((r) => sameInterval(r.repeat, p.interval)).length;

  return (
    <div className="page page-narrow">
      <PageHeader
        back={{ to: '/settings', label: t('Settings') }}
        title={t('Repeat options')}
        sub={t('The choices offered under “Repeats” when you add a reminder. “Once” and “Custom…” are always available.')}
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
      {repeatPresets.length === 0 ? (
        <div className="quiet-card">{t('No saved options — reminders can still use “Once” or a custom schedule.')}</div>
      ) : (
        <ManageList
          items={repeatPresets}
          itemLabel={(p) => p.label}
          lead={(p) => (
            <span className="lead-mark" aria-hidden="true">
              {p.interval.every}
              <small style={{ fontSize: 'var(--fs-12)', fontFamily: 'var(--font-ui)', marginLeft: 1 }}>{SHORT[p.interval.unit]}</small>
            </span>
          )}
          name={(p) => p.label}
          sub={(p) => {
            const n = usedBy(p);
            return `${intervalLabel(p.interval)} · ${tn(n, 'used by {n} reminder', 'used by {n} reminders')}`;
          }}
          onEdit={(p) => {
            setEditing(p);
            setOpen(true);
          }}
          onDelete={setToDelete}
          onMove={(p, dir) => void move('repeatPresets', p.id, dir)}
        />
      )}
      <RepeatSheet open={open} preset={editing} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title={t('Delete “{name}”?', { name: toDelete?.label ?? '' })}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          const res = await deleteRepeatPreset(toDelete.id);
          setToDelete(null);
          toast(res.ok ? t('Option deleted') : res.error.message, { tone: res.ok ? 'info' : 'error' });
        }}
      >
        {t('It disappears from the picker. Reminders already using this schedule keep repeating exactly as before.')}
      </ConfirmDialog>
    </div>
  );
}
