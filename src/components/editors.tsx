// Editors for the user-defined building blocks: repeat rules, alert lead
// times, category colours and icons.

import { useId, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { AlertPreset, Interval, LeadTime, RepeatPreset, TimeUnit } from '@/types';
import { leadLabel, leadSortKey, sameInterval, sameLead, unitBefore, unitWord } from '@/lib/dates';
import { CATEGORY_COLORS } from '@/lib/palette';
import { CategoryGlyph, catStyle, ICON_KEYS } from './CategoryIcon';
import { ICON_LABELS } from '@/lib/iconLabels';
import { Button, Input, Select } from './ui';
import { t, tn } from '@/i18n';

const INTERVAL_UNITS: Interval['unit'][] = ['day', 'week', 'month', 'year'];
const LEAD_UNITS: TimeUnit[] = ['hour', 'day', 'week', 'month', 'year'];

function clampInt(raw: string, min: number, max: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// ---- Interval ----------------------------------------------------------------

export function IntervalInput({ value, onChange, id }: { value: Interval; onChange: (v: Interval) => void; id?: string }) {
  return (
    <div className="inline">
      <span className="hint" style={{ flex: 'none' }}>
        {t('Every')}
      </span>
      <Input
        id={id}
        className="input-num num"
        type="number"
        inputMode="numeric"
        min={1}
        max={99}
        value={value.every}
        aria-label={t('Repeat every')}
        onChange={(e) => onChange({ ...value, every: clampInt(e.target.value, 1, 99) })}
      />
      <Select value={value.unit} aria-label={t('Repeat unit')} onChange={(e) => onChange({ ...value, unit: e.target.value as Interval['unit'] })}>
        {INTERVAL_UNITS.map((u) => (
          <option key={u} value={u}>
            {unitWord(u, value.every)}
          </option>
        ))}
      </Select>
    </div>
  );
}

const ONCE = '__once';
const CUSTOM = '__custom';

/** Pick "Once", any saved repeat preset, or a custom "every N units". */
export function RepeatPicker({
  value,
  onChange,
  presets,
  id,
}: {
  value: Interval | null;
  onChange: (v: Interval | null) => void;
  presets: RepeatPreset[];
  id?: string;
}) {
  const match = value ? presets.find((p) => sameInterval(p.interval, value)) : undefined;
  const [forceCustom, setForceCustom] = useState(Boolean(value && !match));
  const selected = !value ? ONCE : forceCustom || !match ? CUSTOM : match.id;

  return (
    <div className="field" style={{ gap: 'var(--s-2)' }}>
      <Select
        id={id}
        value={selected}
        onChange={(e) => {
          const v = e.target.value;
          if (v === ONCE) {
            setForceCustom(false);
            onChange(null);
          } else if (v === CUSTOM) {
            setForceCustom(true);
            onChange(value ?? { every: 1, unit: 'month' });
          } else {
            setForceCustom(false);
            const p = presets.find((x) => x.id === v);
            if (p) onChange(p.interval);
          }
        }}
      >
        <option value={ONCE}>{t('Once — doesn’t repeat')}</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
        <option value={CUSTOM}>{t('Custom…')}</option>
      </Select>
      {selected === CUSTOM && value ? <IntervalInput value={value} onChange={onChange} /> : null}
    </div>
  );
}

// ---- Lead times ----------------------------------------------------------------

export function LeadInput({ value, onChange }: { value: LeadTime; onChange: (v: LeadTime) => void }) {
  return (
    <div className="inline">
      <Input
        className="input-num num"
        type="number"
        inputMode="numeric"
        min={0}
        max={365}
        value={value.value}
        aria-label={t('Amount')}
        onChange={(e) => onChange({ ...value, value: clampInt(e.target.value, 0, 365) })}
      />
      <Select value={value.unit} aria-label={t('Unit')} onChange={(e) => onChange({ ...value, unit: e.target.value as TimeUnit })}>
        {LEAD_UNITS.map((u) => (
          <option key={u} value={u}>
            {unitBefore(u, value.value)}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function sortLeads(list: LeadTime[]): LeadTime[] {
  return [...list].sort((a, b) => leadSortKey(b) - leadSortKey(a));
}

/** Multi-select of alert moments: saved presets as chips plus any custom ones. */
export function AlertsEditor({
  value,
  onChange,
  presets,
  hasTime = true,
}: {
  value: LeadTime[];
  onChange: (v: LeadTime[]) => void;
  presets: AlertPreset[];
  hasTime?: boolean;
}) {
  const [draft, setDraft] = useState<LeadTime>({ value: 2, unit: 'week' });
  const [adding, setAdding] = useState(false);
  const labelId = useId();

  const has = (lead: LeadTime) => value.some((v) => sameLead(v, lead));
  const toggle = (lead: LeadTime) =>
    onChange(has(lead) ? value.filter((v) => !sameLead(v, lead)) : sortLeads([...value, lead]));
  const custom = value.filter((v) => !presets.some((p) => sameLead(p.lead, v)));
  const hourWithoutTime = !hasTime && value.some((v) => v.unit === 'hour');

  return (
    <div className="field" style={{ gap: 'var(--s-3)' }}>
      <div className="chips" role="group" aria-labelledby={labelId}>
        <span id={labelId} className="sr-only">
          {t('Alert moments')}
        </span>
        {presets.map((p) => (
          <button key={p.id} type="button" className="chip" aria-pressed={has(p.lead)} onClick={() => toggle(p.lead)}>
            {has(p.lead) ? <Check size={14} /> : null}
            {p.label}
          </button>
        ))}
        {custom.map((lead) => (
          <button
            key={`${lead.value}${lead.unit}`}
            type="button"
            className="chip"
            aria-pressed="true"
            aria-label={t('Remove {name}', { name: leadLabel(lead) })}
            onClick={() => toggle(lead)}
          >
            {leadLabel(lead)}
            <X size={13} />
          </button>
        ))}
        {!adding ? (
          <button type="button" className="chip" onClick={() => setAdding(true)}>
            <Plus size={14} /> {t('Custom')}
          </button>
        ) : null}
      </div>
      {adding ? (
        <div className="inline" style={{ flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <LeadInput value={draft} onChange={setDraft} />
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (!has(draft)) onChange(sortLeads([...value, draft]));
              setAdding(false);
            }}
          >
            {t('Add')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
            {t('Cancel')}
          </Button>
        </div>
      ) : null}
      <span className="hint">
        {value.length === 0
          ? t('No alerts — it will only show up in your lists.')
          : tn(value.length, '{n} alert: {list}.', '{n} alerts: {list}.', { list: sortLeads(value).map(leadLabel).join(', ') })}
        {hourWithoutTime ? ` ${t('Hour-based alerts count from 09:00 when no time is set.')}` : ''}
      </span>
    </div>
  );
}

// ---- Colour & icon ----------------------------------------------------------------

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={t('Colour')}>
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          role="radio"
          className="swatch"
          aria-checked={value === c.key}
          aria-label={t(c.label)}
          title={t(c.label)}
          style={catStyle(c.key)}
          onClick={() => onChange(c.key)}
        >
          {value === c.key ? <Check size={16} strokeWidth={3} /> : null}
        </button>
      ))}
    </div>
  );
}

export function IconPicker({ value, onChange, color }: { value: string; onChange: (v: string) => void; color: string }) {
  return (
    <div className="icon-grid" role="radiogroup" aria-label={t('Icon')} style={catStyle(color)}>
      {ICON_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          className="icon-cell"
          aria-checked={value === key}
          aria-label={t(ICON_LABELS[key] ?? key)}
          title={t(ICON_LABELS[key] ?? key)}
          onClick={() => onChange(key)}
        >
          <CategoryGlyph icon={key} size={18} />
        </button>
      ))}
    </div>
  );
}
