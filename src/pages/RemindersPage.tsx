import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ListChecks, Plus, Search, SearchX } from 'lucide-react';
import { useData, useLookups } from '@/stores/DataStore';
import { useSettings } from '@/stores/SettingsStore';
import { useReminderActions } from '@/stores/useReminderActions';
import { filterReminders, groupByMonth, type StatusFilter } from '@/lib/reminders';
import { CategoryGlyph, catStyle } from '@/components/CategoryIcon';
import { EmptyState } from '@/components/EmptyState';
import { PersonDot } from '@/components/PersonBadge';
import { PageHeader } from '@/components/PageHeader';
import { ReminderRow } from '@/components/ReminderRow';
import { ScrollStrip } from '@/components/ScrollStrip';
import { Button, Input, LoadingPage } from '@/components/ui';
import { m, t } from '@/i18n';

const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: m('Open') },
  { value: 'overdue', label: m('Overdue') },
  { value: 'upcoming', label: m('Coming up') },
  { value: 'snoozed', label: m('Snoozed') },
  { value: 'paused', label: m('Paused') },
  { value: 'done', label: m('Done') },
  { value: 'all', label: m('All') },
];

export function RemindersPage() {
  const { reminders, categories, people, loading, now } = useData();
  const { settings } = useSettings();
  const lookup = useLookups();
  const { complete } = useReminderActions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState('');

  const status = (STATUSES.some((s) => s.value === params.get('status')) ? params.get('status') : 'open') as StatusFilter;
  const catIds = params.get('cat')?.split(',').filter(Boolean) ?? [];
  const kind = (['action', 'auto'].includes(params.get('kind') ?? '') ? params.get('kind') : 'all') as 'all' | 'action' | 'auto';
  const whoParam = params.get('who') ?? '';
  const who = whoParam === 'me' || people.some((p) => p.id === whoParam) ? whoParam : '';

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const toggleCat = (id: string) => {
    const next = catIds.includes(id) ? catIds.filter((c) => c !== id) : [...catIds, id];
    update('cat', next.join(','));
  };

  const visible = useMemo(
    () =>
      filterReminders(
        reminders,
        {
          status,
          categoryIds: catIds,
          kind,
          person: who,
          text,
          upcomingDays: settings.upcomingDays,
          extraText: (r) =>
            `${lookup.category(r.categoryId)?.name ?? ''} ${lookup.provider(r.providerId)?.name ?? ''} ${lookup.person(r.personId)?.name ?? ''}`,
        },
        now,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reminders, status, params, text, settings.upcomingDays, lookup, now],
  );
  const months = useMemo(() => groupByMonth(visible), [visible]);

  if (loading) return <LoadingPage />;

  const filtered = text || catIds.length > 0 || status !== 'open' || kind !== 'all' || who !== '';

  return (
    <div className="page">
      <PageHeader
        eyebrow={t('{n} in total', { n: reminders.length })}
        title={t('Reminders')}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/reminders/new')}>
            {t('New reminder')}
          </Button>
        }
      />

      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <Input
            type="search"
            placeholder={t('Search titles, notes, references, providers, people…')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={t('Search reminders')}
          />
        </div>
        <ScrollStrip>
          <div className="segmented" role="radiogroup" aria-label={t('Status')}>
            {STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={status === s.value}
                onClick={() => update('status', s.value === 'open' ? null : s.value)}
              >
                {t(s.label)}
              </button>
            ))}
          </div>
        </ScrollStrip>
        <ScrollStrip>
          <div className="segmented" role="radiogroup" aria-label={t('Type')}>
            {(
              [
                ['all', m('Everything')],
                ['action', m('Needs action')],
                ['auto', m('Charged automatically')],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                onClick={() => update('kind', value === 'all' ? null : value)}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </ScrollStrip>
        {people.length > 0 ? (
          <ScrollStrip>
            <div className="segmented" role="radiogroup" aria-label={t('For whom')}>
              <button type="button" role="radio" aria-checked={who === ''} onClick={() => update('who', null)}>
                {t('Everyone')}
              </button>
              <button type="button" role="radio" aria-checked={who === 'me'} onClick={() => update('who', 'me')}>
                {t('Me')}
              </button>
              {people.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={who === p.id} onClick={() => update('who', p.id)}>
                  <PersonDot person={p} />
                  {p.name}
                </button>
              ))}
            </div>
          </ScrollStrip>
        ) : null}
        <ScrollStrip role="group" aria-label={t('Filter by category')}>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              aria-pressed={catIds.includes(c.id)}
              style={catStyle(c.color)}
              onClick={() => toggleCat(c.id)}
            >
              <CategoryGlyph icon={c.icon} size={14} />
              {c.name}
            </button>
          ))}
        </ScrollStrip>
      </div>

      {visible.length === 0 ? (
        reminders.length === 0 ? (
          <EmptyState
            icon={<ListChecks size={22} />}
            title={t('Nothing here yet')}
            actions={
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => navigate('/reminders/new')}>
                {t('New reminder')}
              </Button>
            }
          >
            {t('Add a bill, a renewal or an expiry date and it shows up here, sorted by when it’s due.')}
          </EmptyState>
        ) : (
          <EmptyState
            icon={<SearchX size={22} />}
            title={t('No matches')}
            actions={
              filtered ? (
                <Button
                  onClick={() => {
                    setText('');
                    setParams(new URLSearchParams(), { replace: true });
                  }}
                >
                  {t('Clear filters')}
                </Button>
              ) : null
            }
          >
            {t('Try another word, status or category.')}
          </EmptyState>
        )
      ) : (
        months.map((m) => (
          <section key={m.key} className="month-block" aria-label={m.label}>
            <h2 className="month-head">
              <span>{m.label}</span>
              <small>{m.items.length}</small>
            </h2>
            <div className="list">
              {m.items.map((r, i) => (
                <ReminderRow key={r.id} reminder={r} onComplete={complete} index={i} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
