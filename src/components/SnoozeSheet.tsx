import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { addDays, formatDateTime, toISODate } from '@/lib/dates';
import { Sheet } from './Sheet';
import { Button, Input } from './ui';
import { t } from '@/i18n';

interface SnoozeSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSnooze: (untilIso: string, label: string) => void;
}

function at(date: Date, hours: number, minutes = 0): Date {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

export function SnoozeSheet({ open, title, onClose, onSnooze }: SnoozeSheetProps) {
  const now = new Date();
  const [custom, setCustom] = useState(() => `${toISODate(addDays(now, 1))}T09:00`);
  const options = [
    { label: t('In 1 hour'), until: new Date(now.getTime() + 3_600_000) },
    { label: t('In 4 hours'), until: new Date(now.getTime() + 4 * 3_600_000) },
    { label: t('Tomorrow morning'), until: at(addDays(now, 1), 9) },
    { label: t('In 3 days'), until: at(addDays(now, 3), 9) },
    { label: t('Next week'), until: at(addDays(now, 7), 9) },
  ];

  return (
    <Sheet open={open} onClose={onClose} title={t('Snooze “{title}”', { title })}>
      <p className="hint">{t('It disappears from your lists and alerts until then, then comes back on its own.')}</p>
      <div className="option-list">
        {options.map((o) => (
          <button key={o.label} type="button" className="option" onClick={() => onSnooze(o.until.toISOString(), formatDateTime(o.until))}>
            <span>
              {o.label}
              <br />
              <small className="num">{formatDateTime(o.until)}</small>
            </span>
            <ChevronRight size={16} color="var(--ink-3)" />
          </button>
        ))}
      </div>
      <div className="inline">
        <Input type="datetime-local" value={custom} aria-label={t('Snooze until')} onChange={(e) => setCustom(e.target.value)} />
        <Button
          variant="primary"
          disabled={!custom || new Date(custom) <= new Date()}
          onClick={() => onSnooze(new Date(custom).toISOString(), formatDateTime(new Date(custom)))}
        >
          {t('Snooze')}
        </Button>
      </div>
    </Sheet>
  );
}
