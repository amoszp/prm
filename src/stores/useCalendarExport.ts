// Download reminders as an .ics file for the phone's calendar app.

import { useCallback } from 'react';
import type { Reminder } from '@/types';
import { downloadFile } from '@/data/backup';
import { buildCalendar, calendarFileName } from '@/lib/ics';
import { useToast } from '@/components/Toast';
import { useSettings } from './SettingsStore';
import { t, tn } from '@/i18n';

export function useCalendarExport() {
  const { settings } = useSettings();
  const { toast } = useToast();

  return useCallback(
    (reminders: Reminder[], slug?: string) => {
      const text = {
        deadlineTitle: (title: string) => t('Last day to cancel or decide: {title}', { title }),
        autoCharged: t('Charged automatically'),
        amount: t('Amount'),
        reference: t('Reference'),
      };
      const ics = buildCalendar(reminders, text, new Date(), settings.currency);
      const events = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
      if (events === 0) return toast(t('Nothing to export — done and paused reminders are left out.'), { tone: 'error' });
      downloadFile(calendarFileName(new Date(), slug), ics, 'text/calendar;charset=utf-8');
      toast(
        tn(events, 'Calendar file ready · {n} event. Open it to add it to your calendar.', 'Calendar file ready · {n} events. Open it to add them to your calendar.'),
        { tone: 'success', duration: 6000 },
      );
    },
    [settings.currency, toast],
  );
}
