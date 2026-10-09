import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BellOff, BookmarkPlus, CalendarPlus, Check, CreditCard, ChevronLeft, Copy, Moon, Pause, Pencil, Play, RotateCcw, SearchX, SkipForward, Trash2, TrendingDown, TrendingUp, Undo2, X } from 'lucide-react';
import type { HistoryEntry } from '@/types';
import { useData, useLookups } from '@/stores/DataStore';
import { useSettings } from '@/stores/SettingsStore';
import { useReminderActions } from '@/stores/useReminderActions';
import { useCalendarExport } from '@/stores/useCalendarExport';
import { daysFromToday, formatCurrency, formatDate, formatDateTime, intervalLabel, leadLabel, relativeLabel } from '@/lib/dates';
import { effectiveStatus, nextAlert, noticeDeadline, priceChange, urgency } from '@/lib/reminders';
import { CategoryBadge } from '@/components/CategoryIcon';
import { AttachmentsSection } from '@/components/Attachments';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DateTile } from '@/components/DateTile';
import { EmptyState } from '@/components/EmptyState';
import { PaymentSheet } from '@/components/PaymentSheet';
import { PersonBadge } from '@/components/PersonBadge';
import { ReminderRow } from '@/components/ReminderRow';
import { SnoozeSheet } from '@/components/SnoozeSheet';
import { useToast } from '@/components/Toast';
import { sortLeads } from '@/components/editors';
import { Button, IconButton, LoadingPage } from '@/components/ui';
import { m, t, tn } from '@/i18n';

export function ReminderDetailPage() {
  const { id = '' } = useParams();
  const { reminders, loading, now, undoComplete, deleteHistoryEntry, updateHistoryEntry, saveTemplate } = useData();
  const { settings } = useSettings();
  const lookup = useLookups();
  const { complete, skip, remove, snooze, setStatus } = useReminderActions();
  const exportCalendar = useCalendarExport();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [snoozing, setSnoozing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [paying, setPaying] = useState(false);
  const [editingEntry, setEditingEntry] = useState<HistoryEntry | null>(null);

  if (loading) return <LoadingPage />;
  const r = reminders.find((x) => x.id === id);
  if (!r) {
    return (
      <div className="page page-narrow">
        <EmptyState icon={<SearchX size={22} />} title={t('Reminder not found')} actions={<Button onClick={() => navigate('/reminders')}>{t('Back to reminders')}</Button>}>
          {t('It may have been deleted.')}
        </EmptyState>
      </div>
    );
  }

  const category = lookup.category(r.categoryId);
  const provider = lookup.provider(r.providerId);
  const person = lookup.person(r.personId);
  const status = effectiveStatus(r, now);
  const u = urgency(r, settings.upcomingDays, now);
  const alertAt = nextAlert(r, now);
  const deadline = noticeDeadline(r);
  const currency = r.currency ?? settings.currency;
  const change = priceChange(r);
  const card = r.paidWithId ? reminders.find((x) => x.id === r.paidWithId) : undefined;
  const charged = reminders.filter((x) => x.paidWithId === r.id && x.status !== 'done');
  const cardExpiresSoon = charged.length > 0 && status !== 'done' && daysFromToday(r.dueDate, now) <= 90;

  const whenLine =
    u === 'done'
      ? t('Completed')
      : `${relativeLabel(r.dueDate, now)} · ${formatDate(r.dueDate)}${r.dueTime ? ` · ${r.dueTime}` : ''}`;

  return (
    <div className="page page-narrow">
      <button type="button" className="back-link" onClick={() => navigate('/reminders')}>
        <ChevronLeft size={16} /> {t('Reminders')}
      </button>
      <div className="detail-hero">
        <DateTile date={r.dueDate} color={category?.color} large showYear />
        <div style={{ minWidth: 0 }}>
          <CategoryBadge category={category} pill />
          <h1 className="detail-title" style={{ marginTop: 'var(--s-2)' }}>
            {r.title}
          </h1>
          <p
            className="detail-when num"
            style={{ color: u === 'overdue' ? 'var(--danger)' : u === 'today' ? 'var(--warn)' : 'var(--ink-2)' }}
          >
            {whenLine}
          </p>
        </div>
      </div>

      <div className="action-bar">
        {status === 'active' ? (
          <Button variant="primary" icon={<Check size={16} />} onClick={() => setPaying(true)}>
            {r.repeat ? t('Done — schedule next') : t('Mark done')}
          </Button>
        ) : null}
        {status === 'active' && r.repeat ? (
          <Button icon={<SkipForward size={16} />} onClick={() => skip(r)}>
            {t('Skip this time')}
          </Button>
        ) : null}
        {status === 'done' ? (
          <Button variant="primary" icon={<RotateCcw size={16} />} onClick={() => void undoComplete(r.id)}>
            {t('Reopen')}
          </Button>
        ) : null}
        {status === 'active' ? (
          <Button icon={<Moon size={16} />} onClick={() => setSnoozing(true)}>
            {t('Snooze')}
          </Button>
        ) : null}
        {status === 'snoozed' ? (
          <Button icon={<X size={16} />} onClick={() => setStatus(r, 'active')}>
            {t('Cancel snooze')}
          </Button>
        ) : null}
        {status === 'active' || status === 'snoozed' ? (
          <Button variant="ghost" icon={<Pause size={16} />} onClick={() => setStatus(r, 'paused')}>
            {t('Pause')}
          </Button>
        ) : null}
        {status === 'paused' ? (
          <Button icon={<Play size={16} />} onClick={() => setStatus(r, 'active')}>
            {t('Resume')}
          </Button>
        ) : null}
        <Button variant="ghost" icon={<Pencil size={16} />} onClick={() => navigate(`/reminders/${r.id}/edit`)}>
          {t('Edit')}
        </Button>
        <Button variant="ghost" icon={<Copy size={16} />} onClick={() => navigate(`/reminders/new?from=${r.id}`)}>
          {t('Duplicate')}
        </Button>
        <Button
          variant="ghost"
          icon={<BookmarkPlus size={16} />}
          onClick={async () => {
            const res = await saveTemplate({
              name: r.title,
              categoryId: r.categoryId,
              repeat: r.repeat,
              alerts: r.alerts,
              amount: r.amount,
              currency: r.currency,
              autoPay: r.autoPay,
              nagDaily: r.nagDaily,
              notice: r.notice,
              notes: r.notes,
            });
            if (!res.ok) return toast(res.error.message, { tone: 'error' });
            toast(t('Saved “{title}” as a template', { title: r.title }), {
              tone: 'success',
              action: { label: t('Edit'), onClick: () => navigate(`/settings/templates/${res.value.id}`) },
            });
          }}
        >
          {t('Save as template')}
        </Button>
        {status !== 'done' && status !== 'paused' ? (
          <Button variant="ghost" icon={<CalendarPlus size={16} />} onClick={() => exportCalendar([r], 'prm-reminder')}>
            {t('Add to calendar')}
          </Button>
        ) : null}
        <Button variant="danger-quiet" icon={<Trash2 size={16} />} onClick={() => setConfirmDelete(true)}>
          {t('Delete')}
        </Button>
      </div>

      {cardExpiresSoon ? (
        <div className="notice warn" style={{ marginTop: 'var(--s-5)' }}>
          <CreditCard size={16} />
          <span>
            {tn(
              charged.length,
              '{n} thing is charged to this card. Update it with the new card before {date}.',
              '{n} things are charged to this card. Update them with the new card before {date}.',
              { date: formatDate(r.dueDate) },
            )}
          </span>
        </div>
      ) : null}
      {change ? (
        <div className={`notice ${change.to > change.from ? 'warn' : ''}`} style={{ marginTop: 'var(--s-5)' }}>
          {change.to > change.from ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          <span className="num">
            {t(change.to > change.from ? m('Price went up from {from} to {to} ({pct}) on {date}.') : m('Price went down from {from} to {to} ({pct}) on {date}.'), {
              from: formatCurrency(change.from, currency),
              to: formatCurrency(change.to, currency),
              pct: `${change.pct > 0 ? '+' : ''}${(change.pct * 100).toFixed(1)}%`,
              date: formatDate(change.since),
            })}
          </span>
        </div>
      ) : null}
      {status === 'snoozed' && r.snoozedUntil ? (
        <div className="notice" style={{ marginTop: 'var(--s-5)' }}>
          <Moon size={16} />
          <span>{t('Snoozed until {when}. It comes back on its own.', { when: formatDateTime(new Date(r.snoozedUntil)) })}</span>
        </div>
      ) : null}
      {status === 'paused' ? (
        <div className="notice warn" style={{ marginTop: 'var(--s-5)' }}>
          <BellOff size={16} />
          <span>{t('Paused: no alerts and hidden from Overview until you resume it.')}</span>
        </div>
      ) : null}

      <section className="section" aria-label={t('Details')}>
        <div className="section-head">
          <h2 className="section-title">{t('Details')}</h2>
        </div>
        <dl className="card facts">
          <div className="fact">
            <dt>{t('Type')}</dt>
            <dd>{r.autoPay ? t('Charged automatically — completes itself on the due date') : t('Needs action')}</dd>
          </div>
          <div className="fact">
            <dt>{t('For')}</dt>
            <dd>{person ? <PersonBadge person={person} /> : t('Me')}</dd>
          </div>
          <div className="fact">
            <dt>{t('Repeats')}</dt>
            <dd>{intervalLabel(r.repeat)}</dd>
          </div>
          {deadline && r.notice ? (
            <div className="fact">
              <dt>{t('Cancel / decide by')}</dt>
              <dd>
                <span className="num" style={{ fontWeight: 'var(--fw-semibold)' }}>
                  {formatDate(deadline)}
                </span>{' '}
                <span className="hint">
                  {t('({when} · {period} the due date)', { when: relativeLabel(deadline, now).toLocaleLowerCase(), period: leadLabel(r.notice.period) })}
                </span>
                {r.notice.alerts.length ? (
                  <div className="hint">{t('Alerts before the deadline: {list}', { list: sortLeads(r.notice.alerts).map(leadLabel).join(' · ') })}</div>
                ) : null}
              </dd>
            </div>
          ) : null}
          <div className="fact">
            <dt>{t('Alerts')}</dt>
            <dd>
              {r.alerts.length ? sortLeads(r.alerts).map(leadLabel).join(' · ') : t('None')}
              {r.nagDaily && !r.autoPay ? ` · ${t('then daily while overdue')}` : ''}
              {alertAt ? <div className="hint num">{t('Next alert {when}', { when: formatDateTime(alertAt) })}</div> : null}
            </dd>
          </div>
          {r.amount ? (
            <div className="fact">
              <dt>{t('Amount')}</dt>
              <dd className="num">{formatCurrency(r.amount, currency)}</dd>
            </div>
          ) : null}
          {card ? (
            <div className="fact">
              <dt>{t('Paid with')}</dt>
              <dd>
                <Link to={`/reminders/${card.id}`} className="section-link">
                  {card.title}
                  {card.reference ? ` (${card.reference})` : ''}
                </Link>
                <span className="hint num"> · {t('expires {date}', { date: formatDate(card.dueDate) })}</span>
              </dd>
            </div>
          ) : null}
          {r.reference ? (
            <div className="fact">
              <dt>{t('Reference')}</dt>
              <dd className="num">{r.reference}</dd>
            </div>
          ) : null}
          {provider ? (
            <div className="fact">
              <dt>{t('Provider')}</dt>
              <dd>
                <Link to="/providers" className="section-link">
                  {provider.name}
                </Link>
                {provider.phone ? <span className="hint num"> · {provider.phone}</span> : null}
              </dd>
            </div>
          ) : null}
          {r.notes ? (
            <div className="fact">
              <dt>{t('Notes')}</dt>
              <dd style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</dd>
            </div>
          ) : null}
          <div className="fact">
            <dt>{t('Added')}</dt>
            <dd className="hint num">{formatDate(r.createdAt.slice(0, 10))}</dd>
          </div>
        </dl>
      </section>

      <AttachmentsSection reminderId={r.id} />

      {charged.length > 0 ? (
        <section className="section" aria-label={t('Charged to this card')}>
          <div className="section-head">
            <h2 className="section-title">
              {t('Charged to this card')} <span className="count">{charged.length}</span>
            </h2>
          </div>
          <div className="list">
            {charged.map((x, i) => (
              <ReminderRow key={x.id} reminder={x} index={i} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="section" aria-label={t('History')}>
        <div className="section-head">
          <h2 className="section-title">
            {t('History')} <span className="count">{r.history.length}</span>
          </h2>
          {r.history.length > 0 ? (
            <Button variant="ghost" size="sm" icon={<Undo2 size={14} />} onClick={() => void undoComplete(r.id)}>
              {t('Undo last')}
            </Button>
          ) : null}
        </div>
        {r.history.length === 0 ? (
          <div className="quiet-card">{t('Each time you mark it done, the date and what you paid are logged here.')}</div>
        ) : (
          <div className="list">
            {r.history.map((h) => (
              <div key={h.id} className="history-item">
                <span className={`history-dot ${h.skipped ? 'skipped' : ''}`} aria-hidden="true" />
                <div>
                  <div className="num" style={{ fontWeight: 'var(--fw-semibold)' }}>
                    {formatDate(h.dueDate)}
                    {h.skipped ? ` · ${t('skipped')}` : h.amount != null ? ` · ${formatCurrency(h.amount, currency)}` : ''}
                  </div>
                  <div className="hint num">
                    {h.skipped
                      ? t('Skipped {when}', { when: formatDateTime(new Date(h.completedAt)) })
                      : h.auto
                        ? t('Charged automatically')
                        : t('Paid / done {when}', { when: h.paidOn ? formatDate(h.paidOn) : formatDateTime(new Date(h.completedAt)) })}
                  </div>
                </div>
                <div className="manage-actions">
                {!h.skipped ? (
                  <IconButton label={t('Edit amount or date')} onClick={() => setEditingEntry(h)}>
                    <Pencil size={15} />
                  </IconButton>
                ) : null}
                <IconButton
                  label={t('Remove from history')}
                  tone="danger"
                  onClick={async () => {
                    const res = await deleteHistoryEntry(r.id, h.id);
                    if (!res.ok) toast(res.error.message, { tone: 'error' });
                  }}
                >
                  <Trash2 size={15} />
                </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <PaymentSheet
        open={paying}
        mode="complete"
        title={t('Done: {title}', { title: r.title })}
        expected={r.amount}
        currency={currency}
        onClose={() => setPaying(false)}
        onSave={(v) => {
          setPaying(false);
          void complete(r, { amount: v.amount, paidOn: v.paidOn, updateExpected: v.updateExpected });
        }}
      />
      <PaymentSheet
        open={Boolean(editingEntry)}
        mode="edit"
        title={t('Edit payment')}
        initial={editingEntry ? { amount: editingEntry.amount, paidOn: editingEntry.paidOn ?? editingEntry.completedAt.slice(0, 10) } : undefined}
        currency={currency}
        onClose={() => setEditingEntry(null)}
        onSave={async (v) => {
          if (!editingEntry) return;
          const res = await updateHistoryEntry(r.id, editingEntry.id, { amount: v.amount, paidOn: v.paidOn });
          setEditingEntry(null);
          toast(res.ok ? t('Payment updated') : res.error.message, { tone: res.ok ? 'success' : 'error' });
        }}
      />
      <SnoozeSheet
        open={snoozing}
        title={r.title}
        onClose={() => setSnoozing(false)}
        onSnooze={(until, label) => {
          setSnoozing(false);
          void snooze(r, until, label);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={t('Delete this reminder?')}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          if (await remove(r)) navigate('/reminders');
        }}
      >
        {t('“{title}” and its history will be removed. You can undo straight after.', { title: r.title })}
      </ConfirmDialog>
    </div>
  );
}
