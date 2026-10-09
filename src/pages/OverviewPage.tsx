import { useMemo, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, Check, Inbox, Plus, Sparkles } from 'lucide-react';
import type { Reminder } from '@/types';
import { useData, useLookups } from '@/stores/DataStore';
import { useSettings } from '@/stores/SettingsStore';
import { useReminderActions } from '@/stores/useReminderActions';
import { daysFromToday, formatCurrency, formatDate, formatToday, intervalLabel } from '@/lib/dates';
import { colorVar } from '@/lib/palette';
import { costSummary, groupForOverview, upcomingCharges } from '@/lib/reminders';
import { CategoryBadge } from '@/components/CategoryIcon';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { ReminderRow } from '@/components/ReminderRow';
import { useToast } from '@/components/Toast';
import { Button, LoadingPage } from '@/components/ui';
import { t, tn } from '@/i18n';

const CHARGE_WINDOW_DAYS = 30;

function headline(overdue: number, today: number): string {
  if (overdue > 0 && today > 0) return t('{overdue} overdue, {today} due today', { overdue, today });
  if (overdue > 0) return tn(overdue, '{n} thing is overdue', '{n} things are overdue');
  if (today > 0) return tn(today, '{n} thing needs you today', '{n} things need you today');
  return t('Nothing needs you today');
}

function Section({
  title,
  items,
  onComplete,
  limit,
  danger,
  moreHref,
  aside,
}: {
  title: string;
  items: Reminder[];
  onComplete: (r: Reminder) => void;
  limit?: number;
  danger?: boolean;
  moreHref?: string;
  aside?: string;
}) {
  if (items.length === 0) return null;
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <section className="section" aria-label={title}>
      <div className="section-head">
        <h2 className="section-title">
          {title} <span className={`count ${danger ? 'danger' : ''}`}>{items.length}</span>
        </h2>
        {aside ? <span className="section-aside num">{aside}</span> : null}
        {moreHref && limit && items.length > limit ? (
          <Link to={moreHref} className="section-link">
            {t('See all')}
          </Link>
        ) : null}
      </div>
      <div className="list">
        {shown.map((r, i) => (
          <ReminderRow key={r.id} reminder={r} onComplete={onComplete} index={i} />
        ))}
      </div>
    </section>
  );
}

export function OverviewPage() {
  const { reminders, loading, error, now, loadSamples } = useData();
  const { settings } = useSettings();
  const lookup = useLookups();
  const { complete } = useReminderActions();
  const { toast } = useToast();
  const navigate = useNavigate();

  const actionable = useMemo(() => reminders.filter((r) => !r.autoPay), [reminders]);
  const groups = useMemo(() => groupForOverview(actionable, now), [actionable, now]);
  const charges = useMemo(() => upcomingCharges(reminders, CHARGE_WINDOW_DAYS, now), [reminders, now]);
  const cost = useMemo(() => costSummary(reminders, settings.currency), [reminders, settings.currency]);

  const next = groups.overdue[0] ?? groups.today[0] ?? groups.week[0] ?? groups.month[0] ?? groups.later[0];
  // The "Next up" item is already on screen — don't list it twice.
  const without = (list: Reminder[]) => (next ? list.filter((r) => r.id !== next.id) : list);
  const chargesTotal = charges
    .filter((r) => (r.currency ?? settings.currency) === settings.currency)
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const week = groups.today.length + groups.week.length;

  if (loading) return <LoadingPage />;
  if (error) {
    return (
      <div className="page">
        <EmptyState icon={<Inbox size={22} />} title={t('Couldn’t open your data')} actions={<Button onClick={() => window.location.reload()}>{t('Try again')}</Button>}>
          {error}
        </EmptyState>
      </div>
    );
  }

  const today = formatToday(now);

  if (reminders.length === 0) {
    return (
      <div className="page page-narrow">
        <PageHeader eyebrow={today} title={t('Let’s get your dates in one place')} />
        <EmptyState
          icon={<CalendarClock size={22} />}
          title={t('No reminders yet')}
          actions={
            <>
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/reminders/new')}>
                {t('Add your first reminder')}
              </Button>
              <Button
                icon={<Sparkles size={16} />}
                onClick={async () => {
                  const res = await loadSamples();
                  toast(res.ok ? t('Loaded {n} example reminders', { n: res.value }) : res.error.message, { tone: res.ok ? 'success' : 'error' });
                }}
              >
                {t('Load examples')}
              </Button>
            </>
          }
        >
          {t('Car insurance, card expiry, your DNI, subscriptions — anything with a date you can’t afford to miss.')}
        </EmptyState>
      </div>
    );
  }

  const nextCat = next ? lookup.category(next.categoryId) : undefined;
  const nextDays = next ? daysFromToday(next.dueDate, now) : 0;

  return (
    <div className="page">
      <PageHeader eyebrow={today} title={headline(groups.overdue.length, groups.today.length)} />

      {next ? (
        <article
          className="card next-up"
          style={{ '--next-c': nextDays < 0 ? 'var(--danger)' : colorVar(nextCat?.color ?? 'bottle') } as CSSProperties}
          aria-label={t('Next up')}
        >
          <div className="countdown" aria-hidden="true">
            <span className="countdown-num">{nextDays === 0 ? t('Today') : Math.abs(nextDays)}</span>
            {nextDays !== 0 ? (
              <span className="countdown-unit">
                {nextDays < 0 ? tn(Math.abs(nextDays), 'day overdue', 'days overdue') : tn(nextDays, 'day to go', 'days to go')}
              </span>
            ) : null}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="next-up-kicker">{t('Next up')}</div>
            <Link to={`/reminders/${next.id}`} className="next-up-title">
              {next.title}
            </Link>
            <div className="next-up-meta">
              <CategoryBadge category={nextCat} pill />
              <span className="num">{formatDate(next.dueDate)}</span>
              <span>{intervalLabel(next.repeat)}</span>
              {next.amount ? <span className="num">{formatCurrency(next.amount, next.currency ?? settings.currency)}</span> : null}
            </div>
            <div className="next-up-actions">
              <Button variant="primary" size="sm" icon={<Check size={15} />} onClick={() => complete(next)}>
                {next.repeat ? t('Done — schedule next') : t('Mark done')}
              </Button>
              <Button size="sm" onClick={() => navigate(`/reminders/${next.id}`)}>
                {t('Details')}
              </Button>
            </div>
          </div>
        </article>
      ) : (
        <div className="quiet-card">{t('Nothing needs action right now. Auto-charges are listed below.')}</div>
      )}

      <div className="stat-strip" role="list" aria-label={t('Summary')}>
        <Link role="listitem" to="/reminders?status=overdue" className={`stat-cell ${groups.overdue.length ? 'danger' : ''}`}>
          <span className="stat-cell-value num">{groups.overdue.length}</span>
          <span className="stat-cell-label">{t('Overdue')}</span>
        </Link>
        <Link role="listitem" to="/reminders?status=upcoming" className="stat-cell">
          <span className="stat-cell-value num">{week}</span>
          <span className="stat-cell-label">{t('Next 7 days')}</span>
        </Link>
        <Link role="listitem" to="/reminders?kind=auto" className="stat-cell">
          <span className="stat-cell-value num">{formatCurrency(chargesTotal, settings.currency)}</span>
          <span className="stat-cell-label">{t('Charges, 30 days')}</span>
        </Link>
        <Link role="listitem" to="/money" className="stat-cell">
          <span className="stat-cell-value num">{formatCurrency(cost.perMonth, settings.currency)}</span>
          <span className="stat-cell-label">{t('Per month')}</span>
        </Link>
      </div>

      <Section title={t('Overdue')} items={without(groups.overdue)} onComplete={complete} danger />
      <Section title={t('Today')} items={without(groups.today)} onComplete={complete} />
      <Section title={t('This week')} items={without(groups.week)} onComplete={complete} />
      <Section title={t('This month')} items={without(groups.month)} onComplete={complete} limit={8} moreHref="/reminders" />
      <Section title={t('Later')} items={without(groups.later)} onComplete={complete} limit={5} moreHref="/reminders" />
      <Section
        title={t('Upcoming charges')}
        items={charges}
        onComplete={complete}
        aside={chargesTotal ? t('{amount} in {n} days', { amount: formatCurrency(chargesTotal, settings.currency), n: CHARGE_WINDOW_DAYS }) : undefined}
      />
    </div>
  );
}
