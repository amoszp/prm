import { useEffect, useState, type ReactNode } from 'react';
import { Sheet } from './Sheet';
import { Button, Field, Select } from './ui';
import { t, tn } from '@/i18n';

interface ConfirmProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, children, confirmLabel, danger = true, onConfirm, onClose }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('Cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={busy}
            data-autofocus
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel ?? t('Delete')}
          </Button>
        </>
      }
    >
      <div style={{ color: 'var(--ink-2)' }}>{children}</div>
    </Sheet>
  );
}

interface ReassignProps {
  open: boolean;
  title: string;
  /** How many items currently point at the thing being deleted. */
  usedBy: number;
  noun: 'reminder' | 'provider';
  options: { id: string; name: string }[];
  onConfirm: (targetId: string) => void | Promise<void>;
  onClose: () => void;
}

/** Delete something that other items reference, moving those items first. */
export function ReassignDialog({ open, title, usedBy, noun, options, onConfirm, onClose }: ReassignProps) {
  const [target, setTarget] = useState(options[0]?.id ?? '');
  useEffect(() => {
    if (open) setTarget(options[0]?.id ?? '');
  }, [open, options]);

  return (
    <ConfirmDialog open={open} title={title} onClose={onClose} onConfirm={() => onConfirm(target)}>
      {usedBy > 0 ? (
        <div className="field" style={{ gap: 'var(--s-3)' }}>
          <p>
            {noun === 'reminder'
              ? tn(
                  usedBy,
                  '{n} reminder uses it. Choose where to move it — nothing gets deleted except this entry.',
                  '{n} reminders use it. Choose where to move them — nothing gets deleted except this entry.',
                )
              : tn(
                  usedBy,
                  '{n} provider uses it. Choose where to move it — nothing gets deleted except this entry.',
                  '{n} providers use it. Choose where to move them — nothing gets deleted except this entry.',
                )}
          </p>
          <Field label={noun === 'reminder' ? t('Move reminders to') : t('Move providers to')} htmlFor="reassign-target">
            <Select id="reassign-target" value={target} onChange={(e) => setTarget(e.target.value)}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      ) : (
        <p>{t('Nothing uses it, so it can go without affecting anything else.')}</p>
      )}
    </ConfirmDialog>
  );
}
