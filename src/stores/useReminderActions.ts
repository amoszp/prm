// Reminder actions with consistent feedback: every destructive or
// state-changing action gets a toast with Undo.

import { useCallback } from 'react';
import type { Reminder } from '@/types';
import { formatDate } from '@/lib/dates';
import { useToast } from '@/components/Toast';
import { useData, type PaymentInput } from './DataStore';
import { t } from '@/i18n';

export function useReminderActions() {
  const { reminders, completeReminder, skipReminder, deleteReminder, restoreReminder, snoozeReminder, setReminderStatus } = useData();
  const { toast } = useToast();

  const complete = useCallback(
    async (r: Reminder, payment?: PaymentInput) => {
      const res = await completeReminder(r.id, payment);
      if (!res.ok) return toast(res.error.message, { tone: 'error' });
      const msg = r.repeat ? t('Done. Next one: {date}', { date: formatDate(res.value.dueDate) }) : t('“{title}” marked done', { title: r.title });
      // Undo restores the exact previous state (including an updated expected amount).
      toast(msg, { tone: 'success', action: { label: t('Undo'), onClick: () => void restoreReminder(r) } });
    },
    [completeReminder, restoreReminder, toast],
  );

  const skip = useCallback(
    async (r: Reminder) => {
      const res = await skipReminder(r.id);
      if (!res.ok) return toast(res.error.message, { tone: 'error' });
      toast(t('Skipped. Next one: {date}', { date: formatDate(res.value.dueDate) }), {
        action: { label: t('Undo'), onClick: () => void restoreReminder(r) },
      });
    },
    [skipReminder, restoreReminder, toast],
  );

  const remove = useCallback(
    async (r: Reminder) => {
      // Remember what was linked to it (e.g. subscriptions charged to a card) so Undo relinks them.
      const linked = reminders.filter((x) => x.paidWithId === r.id);
      const res = await deleteReminder(r.id);
      if (!res.ok) return toast(res.error.message, { tone: 'error' });
      toast(t('Deleted “{title}”', { title: r.title }), {
        action: {
          label: t('Undo'),
          onClick: () => {
            void restoreReminder(res.value).then(() => Promise.all(linked.map((x) => restoreReminder(x))));
          },
        },
      });
      return true;
    },
    [reminders, deleteReminder, restoreReminder, toast],
  );

  const snooze = useCallback(
    async (r: Reminder, untilIso: string, label: string) => {
      const res = await snoozeReminder(r.id, untilIso);
      if (!res.ok) return toast(res.error.message, { tone: 'error' });
      toast(t('Snoozed until {when}', { when: label }), { action: { label: t('Undo'), onClick: () => void restoreReminder(r) } });
    },
    [snoozeReminder, restoreReminder, toast],
  );

  const setStatus = useCallback(
    async (r: Reminder, status: 'active' | 'paused') => {
      const res = await setReminderStatus(r.id, status);
      if (!res.ok) return toast(res.error.message, { tone: 'error' });
      toast(status === 'paused' ? t('Paused — no alerts until you resume') : t('Resumed'), {
        action: { label: t('Undo'), onClick: () => void restoreReminder(r) },
      });
    },
    [setReminderStatus, restoreReminder, toast],
  );

  return { complete, skip, remove, snooze, setStatus };
}
