import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useData, useLookups } from '@/stores/DataStore';
import { useSettings } from '@/stores/SettingsStore';
import { formatCurrency, formatDate, formatDateShort, formatMonthShort, formatMonthYear } from '@/lib/dates';
import { categoryTotals, forecast, priceChanges } from '@/lib/money';
import { costSummary } from '@/lib/reminders';
import { CategoryTile } from '@/components/CategoryIcon';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { LoadingPage } from '@/components/ui';
import { t, tn } from '@/i18n';

export function MoneyPage() {
  const { reminders, loading, now } = useData();
  const { settings } = useSettings();
  const lookup = useLookups();
  const currency = settings.currency;

  const fc = useMemo(() => forecast(reminders, currency, now), [reminders, currency, now]);
  const cats = useMemo(() => categoryTotals(reminders, currency), [reminders, currency]);
  const changes = useMemo(() => priceChanges(reminders), [reminders]);
  const cost = useMemo(() => costSummary(reminders, currency), [reminders, currency]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  if (loading) return <LoadingPage />;

  const money = (n: number) => formatCurrency(n, currency);
  const max = Math.max(...fc.buckets.map((b) => b.total), 1);
  const selected = fc.buckets.find((b) => b.key === (selectedKey ?? fc.heaviest?.key ?? fc.buckets[0].key)) ?? fc.buckets[0];
  const catMax = Math.max(...cats.map((c) => c.perMonth), 1);

  if (fc.total === 0 && cats.length === 0) {
    return (
      <div className="page page-narrow">
        <PageHeader title={t('Money')} />
        <EmptyState icon={<Wallet size={22} />} title={t('No amounts yet')}>
          {t('Add an amount to your bills and subscriptions and this page forecasts the next 12 months, totals each category and spots price changes.')}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader eyebrow={t('Next 12 months · {currency}', { currency })} title={t('Money')} />

      <div className="stat-strip" role="list" aria-label={t('Totals')}>
        <div role="listitem" className="stat-cell">
          <span className="stat-cell-value num">{money(cost.perMonth)}</span>
          <span className="stat-cell-label">{t('Recurring, per month')}</span>
        </div>
        <div role="listitem" className="stat-cell">
          <span className="stat-cell-value num">{money(cost.perYear)}</span>
          <span className="stat-cell-label">{t('Recurring, per year')}</span>
        </div>
        <div role="listitem" className="stat-cell">
          <span className="stat-cell-value num">{money(fc.total)}</span>
          <span className="stat-cell-label">{t('All charges, 12 months')}</span>
        </div>
        <div role="listitem" className="stat-cell">
          <span className="stat-cell-value num">{fc.heaviest ? formatMonthShort(fc.heaviest.date) : '—'}</span>
          <span className="stat-cell-label">{t('Heaviest month')}</span>
        </div>
      </div>
      {fc.otherCurrency ? (
        <p className="hint" style={{ marginTop: 'var(--s-2)' }}>
          {tn(fc.otherCurrency, '{n} reminder in another currency not included.', '{n} reminders in other currencies not included.')}
        </p>
      ) : null}

      <section className="section" aria-label={t('Forecast')}>
        <div className="section-head">
          <h2 className="section-title">{t('Upcoming charges by month')}</h2>
        </div>
        <div className="card card-pad">
          <div className="bars" role="group" aria-label={t('Charges per month — select a month to see its items')}>
            {fc.buckets.map((b) => {
              const isHeaviest = fc.heaviest?.key === b.key;
              const isSel = selected.key === b.key;
              return (
                <button
                  key={b.key}
                  type="button"
                  className={`bar ${isSel ? 'selected' : ''}`}
                  aria-pressed={isSel}
                  aria-label={`${formatMonthYear(b.date)}: ${money(b.total)}, ${tn(b.charges.length, '{n} charge', '{n} charges')}`}
                  onClick={() => setSelectedKey(b.key)}
                >
                  <span className="bar-tip num" role="tooltip">
                    {money(b.total)}
                  </span>
                  {isHeaviest && b.total > 0 ? <span className="bar-label num">{money(b.total)}</span> : null}
                  <span className="bar-track">
                    <span className="bar-fill" style={{ height: `${b.total > 0 ? Math.max((b.total / max) * 100, 2) : 0}%` }} />
                  </span>
                  <span className="bar-month">
                    {formatMonthShort(b.date)}
                    {b.date.getMonth() === 0 ? <small>{b.date.getFullYear()}</small> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="section-head" style={{ marginTop: 'var(--s-5)' }}>
          <h3 className="section-title">
            {formatMonthYear(selected.date)} <span className="count">{selected.charges.length}</span>
          </h3>
          <span className="section-aside num">{money(selected.total)}</span>
        </div>
        {selected.charges.length === 0 ? (
          <div className="quiet-card">{t('No charges with an amount this month.')}</div>
        ) : (
          <div className="list">
            {selected.charges.map((c) => {
              const cat = lookup.category(c.reminder.categoryId);
              return (
                <Link key={`${c.reminder.id}-${c.date}`} to={`/reminders/${c.reminder.id}`} className="money-row">
                  {cat ? <CategoryTile color={cat.color} icon={cat.icon} /> : null}
                  <span style={{ minWidth: 0 }}>
                    <span className="manage-name">{c.reminder.title}</span>
                    <span className="manage-sub num">
                      {formatDateShort(c.date)}
                      {c.reminder.autoPay ? ` · ${t('charged automatically')}` : ''}
                    </span>
                  </span>
                  <span className="money-amount num">{money(c.amount)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {cats.length > 0 ? (
        <section className="section" aria-label={t('By category')}>
          <div className="section-head">
            <h2 className="section-title">{t('Recurring cost by category')}</h2>
            <span className="section-aside">{t('per month')}</span>
          </div>
          <div className="card card-pad cat-bars">
            {cats.map((c) => {
              const cat = lookup.category(c.categoryId);
              return (
                <div key={c.categoryId} className="cat-bar">
                  {cat ? <CategoryTile color={cat.color} icon={cat.icon} /> : null}
                  <div style={{ minWidth: 0 }}>
                    <div className="cat-bar-head">
                      <span className="manage-name">{cat?.name ?? t('Uncategorised')}</span>
                      <span className="num money-amount">{money(c.perMonth)}</span>
                    </div>
                    <div className="hbar-track" aria-hidden="true">
                      <span className="hbar-fill" style={{ width: `${Math.max((c.perMonth / catMax) * 100, 1.5)}%` }} />
                    </div>
                    <div className="manage-sub">
                      {tn(c.count, '{n} reminder', '{n} reminders')} · {t('{amount} a year', { amount: money(c.perMonth * 12) })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="section" aria-label={t('Price changes')}>
        <div className="section-head">
          <h2 className="section-title">
            {t('Price changes')} <span className="count">{changes.length}</span>
          </h2>
        </div>
        {changes.length === 0 ? (
          <div className="quiet-card">
            {t('None spotted. When you mark something done with a different amount than last time, it shows up here.')}
          </div>
        ) : (
          <div className="list">
            {changes.map(({ reminder: r, change }) => {
              const up = change.to > change.from;
              const cur = r.currency ?? currency;
              return (
                <Link key={r.id} to={`/reminders/${r.id}`} className="money-row">
                  <span className={`trend ${up ? 'up' : 'down'}`} aria-hidden="true">
                    {up ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="manage-name">{r.title}</span>
                    <span className="manage-sub num">
                      {formatCurrency(change.from, cur)} → {formatCurrency(change.to, cur)} · {t('since {date}', { date: formatDate(change.since) })}
                    </span>
                  </span>
                  <span className={`money-amount num ${up ? 'up' : 'down'}`}>
                    {up ? '+' : ''}
                    {(change.pct * 100).toFixed(1)}%
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
