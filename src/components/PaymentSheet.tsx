// Record what was actually paid (amount + date) when completing a cycle,
// or correct an existing history entry.

import { useEffect, useState } from 'react';
import { formatCurrency, isValidISODate, todayISO } from '@/lib/dates';
import { Sheet } from './Sheet';
import { Button, Field, Input } from './ui';
import { t } from '@/i18n';

export interface PaymentValues {
  amount?: number;
  paidOn: string;
  updateExpected: boolean;
}

interface PaymentSheetProps {
  open: boolean;
  title: string;
  /** 'complete' shows the "use as new expected amount" option. */
  mode: 'complete' | 'edit';
  expected?: number;
  initial?: { amount?: number; paidOn?: string };
  currency: string;
  onClose: () => void;
  onSave: (values: PaymentValues) => void;
}

export function PaymentSheet({ open, title, mode, expected, initial, currency, onClose, onSave }: PaymentSheetProps) {
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(todayISO());
  const [updateExpected, setUpdateExpected] = useState(true);
  const [error, setError] = useState<{ field: 'amount' | 'date'; message: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const a = initial?.amount ?? expected;
    setAmount(a != null ? String(a) : '');
    setPaidOn(initial?.paidOn ?? todayISO());
    setUpdateExpected(true);
    setError(null);
  }, [open, initial, expected]);

  const parsed = amount.trim() === '' ? undefined : Number(amount);
  const differs = mode === 'complete' && parsed != null && expected != null && Math.abs(parsed - expected) >= 0.005;

  const submit = () => {
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) return setError({ field: 'amount', message: t('Use a positive number.') });
    if (!isValidISODate(paidOn)) return setError({ field: 'date', message: t('Pick a valid date.') });
    onSave({ amount: parsed, paidOn, updateExpected: differs && updateExpected });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="primary">
            {mode === 'complete' ? t('Mark done') : t('Save')}
          </Button>
        </>
      }
    >
      <div className="grid-2">
        <Field label={t('Amount paid ({currency})', { currency })} htmlFor="pay-amount" optional error={error?.field === 'amount' ? error.message : undefined}>
          <Input
            id="pay-amount"
            data-autofocus
            className="num"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field label={t('Paid / done on')} htmlFor="pay-date" error={error?.field === 'date' ? error.message : undefined}>
          <Input id="pay-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
      {differs ? (
        <label className="toggle-row" style={{ cursor: 'pointer' }}>
          <span>
            <span className="settings-label">{t('Use {amount} from now on', { amount: formatCurrency(parsed ?? 0, currency) })}</span>
            <br />
            <span className="settings-desc">
              {t('Expected was {amount}. Update it for future cycles.', { amount: formatCurrency(expected ?? 0, currency) })}
            </span>
          </span>
          <input type="checkbox" checked={updateExpected} onChange={(e) => setUpdateExpected(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
        </label>
      ) : null}
    </Sheet>
  );
}
