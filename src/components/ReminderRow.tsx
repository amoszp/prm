import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarX, Check, CreditCard, Link2, Moon, Paperclip, Pause, Repeat, Wrench } from 'lucide-react';
import type { Reminder } from '@/types';
import { useData, useLookups } from '@/stores/DataStore';
import { useSettings } from '@/stores/SettingsStore';
import { useReminderActions } from '@/stores/useReminderActions';
import { daysFromToday, formatCurrency, formatDateShort, formatDateTime, intervalLabel, relativeLabel, todayISO } from '@/lib/dates';
import { isHorizontal, prefersReducedMotion, swipeAction, swipeOffset } from '@/lib/gestures';
import { colorSoftVar, colorVar } from '@/lib/palette';
import { noticeDeadline, urgency } from '@/lib/reminders';
import { CategoryBadge } from './CategoryIcon';
import { DateTile } from './DateTile';
import { PersonBadge } from './PersonBadge';
import { SnoozeSheet } from './SnoozeSheet';
import { t, tn } from '@/i18n';

interface ReminderRowProps {
  reminder: Reminder;
  /** Lists that pass this get the done circle and swipe gestures. */
  onComplete?: (r: Reminder) => void;
  index?: number;
}

/** How long the done circle shows its fill before the row moves on. */
const FILL_MS = 260;

export function ReminderRow({ reminder: r, onComplete, index = 0 }: ReminderRowProps) {
  const { now, reminders, attachments } = useData();
  const { settings } = useSettings();
  const { snooze } = useReminderActions();
  const lookup = useLookups();
  const category = lookup.category(r.categoryId);
  const provider = lookup.provider(r.providerId);
  const person = lookup.person(r.personId);
  const files = attachments.filter((a) => a.reminderId === r.id).length;
  const u = urgency(r, settings.upcomingDays, now);
  const muted = u === 'snoozed' || u === 'paused' || u === 'done';
  const deadline = noticeDeadline(r);
  const linkedCharges = category?.holdsCards ? reminders.filter((x) => x.paidWithId === r.id && x.status !== 'done').length : 0;

  const canComplete = Boolean(onComplete) && !muted && !r.autoPay;
  const canSnooze = Boolean(onComplete) && !muted;
  const [offset, setOffset] = useState(0);
  const [dragWidth, setDragWidth] = useState(0); // > 0 while a swipe is in progress
  const [filling, setFilling] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const drag = useRef<{ x: number; y: number; width: number; active: boolean } | null>(null);
  const justSwiped = useRef(false);

  const finish = () => {
    if (!onComplete || filling) return;
    if (prefersReducedMotion()) return onComplete(r);
    setFilling(true);
    window.setTimeout(() => {
      setFilling(false);
      onComplete(r);
    }, FILL_MS);
  };

  // Touch only: a mouse drag would fight text selection, and desktop has the buttons.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || !(canComplete || canSnooze)) return;
    drag.current = { x: e.clientX, y: e.clientY, width: e.currentTarget.offsetWidth, active: false };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (isHorizontal(dx, dy)) {
        d.active = true;
        setDragWidth(d.width);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // pointer already gone; the swipe still works while the finger stays on the row
        }
      } else if (Math.abs(dy) > 10) {
        drag.current = null; // a scroll, not a swipe
        return;
      } else return;
    }
    setOffset(swipeOffset(dx, d.width, { complete: canComplete, snooze: canSnooze }));
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    justSwiped.current = true;
    const action = e.type === 'pointercancel' ? null : swipeAction(offset, d.width);
    setDragWidth(0);
    setOffset(0);
    if (action === 'complete') finish();
    if (action === 'snooze') setSnoozing(true);
  };

  const whenText =
    u === 'done' ? t('Done') : u === 'paused' ? t('Paused') : u === 'snoozed' ? t('Snoozed') : relativeLabel(r.dueDate, now);
  const whenClass = u === 'overdue' ? 'overdue' : u === 'today' ? 'today' : muted ? 'muted' : '';
  const armed = dragWidth ? swipeAction(offset, dragWidth) : null;
  const catVars = { '--c': colorVar(category?.color ?? 'bottle'), '--c-soft': colorSoftVar(category?.color ?? 'bottle') } as CSSProperties;

  return (
    <div className="row-swipe" style={catVars}>
      {offset !== 0 ? (
        <div className={`swipe-under ${offset > 0 ? 'to-done' : 'to-snooze'}`} aria-hidden="true">
          {offset > 0 ? (
            <span className={`swipe-hint ${armed === 'complete' ? 'armed' : ''}`}>
              <Check size={18} strokeWidth={2.6} /> {r.repeat ? t('Done · next') : t('Done')}
            </span>
          ) : (
            <span className={`swipe-hint ${armed === 'snooze' ? 'armed' : ''}`}>
              {t('Snooze')} <Moon size={18} />
            </span>
          )}
        </div>
      ) : null}
      <div
        className={`row ${muted ? 'is-muted' : ''} ${u === 'done' ? 'is-done' : ''} ${dragWidth ? 'is-dragging' : ''} ${canComplete || canSnooze ? 'swipeable' : ''}`}
        style={{ animationDelay: `${Math.min(index, 10) * 24}ms`, transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          // The release that ends a swipe must not also open the reminder.
          if (justSwiped.current) {
            justSwiped.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <Link to={`/reminders/${r.id}`} className="row-link" aria-label={`${r.title}, ${whenText}`} draggable={false} />
        <DateTile date={r.dueDate} color={category?.color} />
        <div style={{ minWidth: 0 }}>
          <div className="row-title">
            <span>{r.title}</span>
          </div>
          <div className="row-meta">
            <span className={`when when-inline ${whenClass}`}>{whenText}</span>
            <CategoryBadge category={category} />
            {person ? <PersonBadge person={person} /> : null}
            {deadline && !muted && deadline >= todayISO(now) && daysFromToday(deadline, now) <= settings.upcomingDays ? (
              <span className="meta-item notice-meta">
                <CalendarX size={13} /> {t('Decide by {date}', { date: formatDateShort(deadline) })}
              </span>
            ) : null}
            {linkedCharges ? (
              <span className="meta-item" title={t('Things charged to this card')}>
                <Link2 size={13} /> {t('{n} charged', { n: linkedCharges })}
              </span>
            ) : null}
            {r.autoPay ? (
              <span className="meta-item" title={t('Charged automatically')}>
                <CreditCard size={13} /> {t('Auto')}
              </span>
            ) : null}
            {r.repeat ? (
              <span className="meta-item">
                <Repeat size={13} /> {intervalLabel(r.repeat)}
              </span>
            ) : null}
            {r.amount ? (
              <span className="meta-item num">{formatCurrency(r.amount, r.currency ?? settings.currency)}</span>
            ) : null}
            {provider ? (
              <span className="meta-item">
                <Wrench size={13} /> {provider.name}
              </span>
            ) : null}
            {files ? (
              <span className="meta-item" title={tn(files, '{n} attachment', '{n} attachments')}>
                <Paperclip size={13} /> {files}
              </span>
            ) : null}
            {u === 'snoozed' ? (
              <span className="meta-item">
                <Moon size={13} /> {t('until {when}', { when: formatDateTime(new Date(r.snoozedUntil ?? '')) })}
              </span>
            ) : null}
            {u === 'paused' ? (
              <span className="meta-item">
                <Pause size={13} /> {t('no alerts')}
              </span>
            ) : null}
          </div>
        </div>
        <div className="row-side">
          <span className={`when ${whenClass}`}>{whenText}</span>
          {canComplete ? (
            <button
              type="button"
              className={`check ${filling || armed === 'complete' ? 'is-filled' : ''}`}
              aria-label={r.repeat ? t('Mark “{title}” done and move to the next date', { title: r.title }) : t('Mark “{title}” done', { title: r.title })}
              title={r.repeat ? t('Done — schedule next') : t('Done')}
              disabled={filling}
              onClick={finish}
            >
              <Check size={16} strokeWidth={2.5} />
            </button>
          ) : null}
        </div>
      </div>
      {canSnooze ? (
        <SnoozeSheet
          open={snoozing}
          title={r.title}
          onClose={() => setSnoozing(false)}
          onSnooze={(until, label) => {
            setSnoozing(false);
            void snooze(r, until, label);
          }}
        />
      ) : null}
    </div>
  );
}
