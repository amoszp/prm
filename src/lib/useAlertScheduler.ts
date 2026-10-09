// Runs the local alert engine while the app is open: every minute, and
// whenever reminders change, fire anything that has come due.

import { useEffect, useRef } from 'react';
import type { Reminder } from '@/types';
import { alertMessage, dueAlerts, loadFired, saveFired, showNotification } from './notifications';

export function useAlertScheduler(
  reminders: Reminder[],
  enabled: boolean,
  onAlert: (title: string, body: string, reminderId: string) => void,
): void {
  const latest = useRef({ reminders, onAlert });
  latest.current = { reminders, onAlert };

  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const fired = loadFired();
      const due = dueAlerts(latest.current.reminders, fired);
      if (due.length === 0) return;
      for (const a of due) {
        const body = alertMessage(a.reminder, new Date(), a.notice);
        void showNotification(a.reminder.title, body, `prm-${a.reminder.id}${a.notice ? '-notice' : ''}`);
        latest.current.onAlert(a.reminder.title, body, a.reminder.id);
        a.keys.forEach((k) => fired.add(k));
      }
      saveFired(fired);
    };
    check();
    const id = window.setInterval(check, 60_000);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, reminders]);
}
