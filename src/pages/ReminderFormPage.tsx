import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';
import type { Interval, LeadTime, Reminder, Template } from '@/types';
import { useData, type ReminderDraft, type TemplateDraft } from '@/stores/DataStore';
import { useSettings } from '@/stores/SettingsStore';
import { formatDate, isValidISODate, parseISODate, shift, toISODate, todayISO } from '@/lib/dates';
import { CURRENCIES } from '@/lib/currencies';
import { CategoryGlyph, catStyle } from '@/components/CategoryIcon';
import { AlertsEditor, LeadInput, RepeatPicker } from '@/components/editors';
import { PageHeader } from '@/components/PageHeader';
import { PersonDot } from '@/components/PersonBadge';
import { ScrollStrip } from '@/components/ScrollStrip';
import { useToast } from '@/components/Toast';
import { Button, Field, Input, LoadingPage, Select, Switch, TextArea } from '@/components/ui';
import { CategorySheet } from './ManageCategoriesPage';
import { PersonSheet } from './ManagePeoplePage';
import { ProviderSheet } from './ProvidersPage';
import { t } from '@/i18n';

interface FormState {
  title: string;
  categoryId: string;
  personId: string;
  reference: string;
  notes: string;
  dueDate: string;
  dueTime: string;
  repeat: Interval | null;
  alerts: LeadTime[];
  amount: string;
  currency: string;
  autoPay: boolean;
  paidWithId: string;
  nagDaily: boolean;
  hasNotice: boolean;
  noticePeriod: LeadTime;
  noticeAlerts: LeadTime[];
  providerId: string;
}

const DEFAULT_NOTICE: { period: LeadTime; alerts: LeadTime[] } = {
  period: { value: 1, unit: 'month' },
  alerts: [
    { value: 1, unit: 'week' },
    { value: 0, unit: 'day' },
  ],
};

function fromReminder(r: Reminder, currency: string): FormState {
  return {
    title: r.title,
    categoryId: r.categoryId,
    personId: r.personId ?? '',
    reference: r.reference ?? '',
    notes: r.notes ?? '',
    dueDate: r.dueDate,
    dueTime: r.dueTime ?? '',
    repeat: r.repeat,
    alerts: r.alerts,
    amount: r.amount != null ? String(r.amount) : '',
    currency: r.currency ?? currency,
    autoPay: Boolean(r.autoPay),
    paidWithId: r.paidWithId ?? '',
    nagDaily: Boolean(r.nagDaily),
    hasNotice: Boolean(r.notice),
    noticePeriod: r.notice?.period ?? DEFAULT_NOTICE.period,
    noticeAlerts: r.notice?.alerts ?? DEFAULT_NOTICE.alerts,
    providerId: r.providerId ?? '',
  };
}

/** Lay a template over a form, keeping what a template doesn't carry (date, person, reference…). */
function applyTemplate(t: Template, base: FormState, categoryExists: (id: string) => boolean): FormState {
  return {
    ...base,
    title: t.name,
    categoryId: categoryExists(t.categoryId) ? t.categoryId : base.categoryId,
    repeat: t.repeat,
    alerts: t.alerts,
    amount: t.amount != null ? String(t.amount) : '',
    currency: t.currency ?? base.currency,
    autoPay: Boolean(t.autoPay),
    nagDaily: Boolean(t.nagDaily),
    hasNotice: Boolean(t.notice),
    noticePeriod: t.notice?.period ?? DEFAULT_NOTICE.period,
    noticeAlerts: t.notice?.alerts ?? DEFAULT_NOTICE.alerts,
    notes: t.notes ?? '',
  };
}

/** Add / edit a reminder, or — with mode="template" — add / edit a template using the same fields. */
export function ReminderFormPage({ mode = 'reminder' }: { mode?: 'reminder' | 'template' }) {
  const isTemplate = mode === 'template';
  const { id } = useParams();
  const [params] = useSearchParams();
  const { reminders, templates, people, categories, repeatPresets, alertPresets, providers, loading, saveReminder, saveTemplate } = useData();
  const { settings } = useSettings();
  const { toast } = useToast();
  const navigate = useNavigate();

  const existing = !isTemplate && id ? reminders.find((r) => r.id === id) : undefined;
  const existingTemplate = isTemplate && id ? templates.find((t) => t.id === id) : undefined;
  const copyFrom = !isTemplate && !id && params.get('from') ? reminders.find((r) => r.id === params.get('from')) : undefined;
  const startTemplate = !isTemplate && !id && params.get('template') ? templates.find((t) => t.id === params.get('template')) : undefined;
  const categoryExists = (cid: string) => categories.some((c) => c.id === cid);

  const blank = (): FormState => {
    const cat = categories[0];
    return {
      title: '',
      categoryId: cat?.id ?? '',
      personId: '',
      reference: '',
      notes: '',
      dueDate: todayISO(),
      dueTime: '',
      repeat: { every: 1, unit: 'month' },
      alerts: cat?.defaultAlerts ?? [],
      amount: '',
      currency: settings.currency,
      autoPay: false,
      paidWithId: '',
      nagDaily: true,
      hasNotice: false,
      noticePeriod: DEFAULT_NOTICE.period,
      noticeAlerts: DEFAULT_NOTICE.alerts,
      providerId: '',
    };
  };

  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [newCategory, setNewCategory] = useState(false);
  const [newProvider, setNewProvider] = useState(false);
  const [newPerson, setNewPerson] = useState(false);
  const [appliedTemplate, setAppliedTemplate] = useState('');
  const alertsTouched = useRef(Boolean(existing || copyFrom || existingTemplate));
  const titleRef = useRef<HTMLInputElement>(null);

  // Initialise once data has loaded.
  useEffect(() => {
    if (loading || form) return;
    if (existingTemplate) {
      setForm(applyTemplate(existingTemplate, blank(), categoryExists));
    } else if (existing) {
      setForm(fromReminder(existing, settings.currency));
    } else if (copyFrom) {
      const f = fromReminder(copyFrom, settings.currency);
      setForm({ ...f, title: t('{title} (copy)', { title: f.title }) });
    } else if (startTemplate) {
      alertsTouched.current = true;
      setAppliedTemplate(startTemplate.id);
      setForm(applyTemplate(startTemplate, blank(), categoryExists));
    } else {
      setForm(blank());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, form, existing, existingTemplate, copyFrom, startTemplate]);

  const cards = useMemo(() => {
    const cardCats = new Set(categories.filter((c) => c.holdsCards).map((c) => c.id));
    return reminders.filter((r) => cardCats.has(r.categoryId) && r.id !== id && r.status !== 'done');
  }, [categories, reminders, id]);

  const providerOptions = useMemo(() => [...providers].sort((a, b) => a.name.localeCompare(b.name)), [providers]);

  if (isTemplate && id && !existingTemplate && !loading) return <Navigate to="/settings/templates" replace />;
  if (!isTemplate && id && !existing && !loading) return <Navigate to="/reminders" replace />;
  if (loading || !form) return <LoadingPage />;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((e) => ({ ...e, [key]: '' }));
  };

  const pickCategory = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    setForm((f) =>
      f ? { ...f, categoryId, alerts: !alertsTouched.current && cat ? cat.defaultAlerts : f.alerts } : f,
    );
  };

  const pickTemplate = (t: Template) => {
    alertsTouched.current = true;
    setAppliedTemplate(t.id);
    setErrors({});
    setForm((f) => (f ? applyTemplate(t, f, categoryExists) : f));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = t('Give it a name.');
    if (!isTemplate && !isValidISODate(form.dueDate)) e.dueDate = t('Pick a valid date.');
    if (!categoryExists(form.categoryId)) e.categoryId = t('Pick a category.');
    if (form.amount && (!Number.isFinite(Number(form.amount)) || Number(form.amount) < 0)) e.amount = t('Use a positive number.');
    setErrors(e);
    if (e.title) titleRef.current?.focus();
    return Object.keys(e).length === 0;
  };

  const shared = () => ({
    categoryId: form.categoryId,
    notes: form.notes.trim() || undefined,
    repeat: form.repeat,
    alerts: form.alerts,
    amount: form.amount ? Number(form.amount) : undefined,
    currency: form.amount ? form.currency : undefined,
    autoPay: form.autoPay || undefined,
    nagDaily: (form.nagDaily && !form.autoPay) || undefined,
    notice: form.hasNotice ? { period: form.noticePeriod, alerts: form.noticeAlerts } : undefined,
  });

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    if (isTemplate) {
      const draft: TemplateDraft = { name: form.title.trim(), ...shared() };
      const res = await saveTemplate(draft, existingTemplate?.id);
      setSaving(false);
      if (!res.ok) return toast(res.error.message, { tone: 'error' });
      toast(existingTemplate ? t('Template saved') : t('Template added'), { tone: 'success' });
      return navigate('/settings/templates', { replace: true });
    }
    const draft: ReminderDraft = {
      ...shared(),
      title: form.title.trim(),
      personId: form.personId || undefined,
      reference: form.reference.trim() || undefined,
      dueDate: form.dueDate,
      dueTime: form.dueTime || undefined,
      paidWithId: form.paidWithId || undefined,
      providerId: form.providerId || undefined,
    };
    const res = await saveReminder(draft, existing?.id);
    setSaving(false);
    if (!res.ok) return toast(res.error.message, { tone: 'error' });
    toast(existing ? t('Saved') : t('Reminder added'), { tone: 'success' });
    navigate(`/reminders/${res.value.id}`, { replace: true });
  };

  const currencies = CURRENCIES.includes(form.currency) ? CURRENCIES : [form.currency, ...CURRENCIES];
  const back = isTemplate
    ? { to: '/settings/templates', label: t('Templates') }
    : existing
      ? { to: `/reminders/${existing.id}`, label: existing.title }
      : { to: '/reminders', label: t('Reminders') };
  const title = isTemplate
    ? existingTemplate
      ? t('Edit template')
      : t('New template')
    : existing
      ? t('Edit reminder')
      : t('New reminder');
  const showPicker = !isTemplate && !existing && templates.length > 0;

  return (
    <div className="page page-narrow">
      <PageHeader
        back={back}
        title={title}
        sub={isTemplate ? t('Everything except the date — that is set on each reminder made from it.') : undefined}
      />

      {showPicker ? (
        <section className="template-picker" aria-label={t('Start from a template')}>
          <div className="template-picker-head">
            <span className="fieldset-title" style={{ margin: 0 }}>
              {t('Start from a template')}
            </span>
            <Link to="/settings/templates" className="section-link">
              {t('Edit templates')}
            </Link>
          </div>
          <ScrollStrip>
            {templates.map((t) => {
              const cat = categories.find((c) => c.id === t.categoryId);
              return (
                <button
                  key={t.id}
                  type="button"
                  className="chip"
                  aria-pressed={appliedTemplate === t.id}
                  style={catStyle(cat?.color ?? 'graphite')}
                  onClick={() => pickTemplate(t)}
                >
                  <CategoryGlyph icon={cat?.icon ?? 'bell'} size={14} />
                  {t.name}
                </button>
              );
            })}
          </ScrollStrip>
        </section>
      ) : null}

      <form
        className="form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset className="fieldset">
          <legend className="sr-only">{t('What')}</legend>
          <div className="fieldset-title" aria-hidden="true">
            {t('What')}
          </div>
          <Field
            label={isTemplate ? t('Name') : t('Title')}
            htmlFor="title"
            error={errors.title}
            hint={isTemplate ? t('Also the title of reminders made from it.') : undefined}
          >
            <Input
              ref={titleRef}
              id="title"
              value={form.title}
              invalid={Boolean(errors.title)}
              placeholder={isTemplate ? t('e.g. Gym membership') : t('e.g. Car insurance renewal')}
              autoFocus={!existing && !existingTemplate && !showPicker}
              onChange={(e) => set('title', e.target.value)}
            />
          </Field>
          <div className="field">
            <span className="label" id="cat-label">
              {t('Category')}
            </span>
            <div className="chips" role="radiogroup" aria-labelledby="cat-label">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  className="chip"
                  aria-checked={form.categoryId === c.id}
                  style={catStyle(c.color)}
                  onClick={() => pickCategory(c.id)}
                >
                  <CategoryGlyph icon={c.icon} size={14} />
                  {c.name}
                </button>
              ))}
              <button type="button" className="chip" onClick={() => setNewCategory(true)}>
                <Plus size={14} /> {t('New category')}
              </button>
            </div>
            {errors.categoryId ? <span className="err">{errors.categoryId}</span> : null}
          </div>
          {!isTemplate ? (
            <div className="field">
              <span className="label" id="person-label">
                {t('For')}
              </span>
              <div className="chips" role="radiogroup" aria-labelledby="person-label">
                <button type="button" role="radio" className="chip" aria-checked={!form.personId} onClick={() => set('personId', '')}>
                  {t('Me')}
                </button>
                {people.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    className="chip"
                    aria-checked={form.personId === p.id}
                    style={catStyle(p.color)}
                    onClick={() => set('personId', p.id)}
                  >
                    <PersonDot person={p} />
                    {p.name}
                  </button>
                ))}
                <button type="button" className="chip" onClick={() => setNewPerson(true)}>
                  <Plus size={14} /> {t('Someone else')}
                </button>
              </div>
            </div>
          ) : null}
          {!isTemplate ? (
            <div className="grid-2">
              <Field label={t('Reference')} htmlFor="reference" optional hint={t('Policy number, last 4 digits… never a password or PIN.')}>
                <Input id="reference" value={form.reference} onChange={(e) => set('reference', e.target.value)} />
              </Field>
              <Field label={t('Provider')} htmlFor="provider" optional>
                <div className="inline">
                  <Select id="provider" value={form.providerId} onChange={(e) => set('providerId', e.target.value)}>
                    <option value="">{t('None')}</option>
                    {providerOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setNewProvider(true)}>
                    {t('New')}
                  </Button>
                </div>
              </Field>
            </div>
          ) : null}
          <Field label={t('Notes')} htmlFor="notes" optional>
            <TextArea id="notes" value={form.notes} placeholder={t('Anything you’ll want to know when it comes up')} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </fieldset>

        <fieldset className="fieldset">
          <legend className="sr-only">{t('When')}</legend>
          <div className="fieldset-title" aria-hidden="true">
            {t('When')}
          </div>
          {!isTemplate ? (
            <div className="grid-2">
              <Field label={form.repeat ? t('Next due date') : t('Due date')} htmlFor="dueDate" error={errors.dueDate}>
                <Input id="dueDate" type="date" value={form.dueDate} invalid={Boolean(errors.dueDate)} onChange={(e) => set('dueDate', e.target.value)} />
              </Field>
              <Field label={t('Time')} htmlFor="dueTime" optional hint={t('Without a time, alerts count from 09:00.')}>
                <Input id="dueTime" type="time" value={form.dueTime} onChange={(e) => set('dueTime', e.target.value)} />
              </Field>
            </div>
          ) : null}
          <Field label={t('Repeats')} htmlFor="repeat" hint={t('Edit the list of options in Settings → Repeat options.')}>
            <RepeatPicker key={appliedTemplate} id="repeat" value={form.repeat} presets={repeatPresets} onChange={(v) => set('repeat', v)} />
          </Field>
          <div className="toggle-row">
            <div>
              <div className="settings-label">{t('Cancel or decide by')}</div>
              <div className="settings-desc">{t('A notice period before the due date — e.g. insurance must be cancelled a month before it renews.')}</div>
            </div>
            <Switch label={t('Cancel or decide by')} checked={form.hasNotice} onChange={(v) => set('hasNotice', v)} />
          </div>
          {form.hasNotice ? (
            <>
              <Field
                label={t('Notice period')}
                hint={
                  !isTemplate && isValidISODate(form.dueDate)
                    ? t('Deadline: {date}', { date: formatDate(toISODate(shift(parseISODate(form.dueDate), -form.noticePeriod.value, form.noticePeriod.unit))) })
                    : undefined
                }
              >
                <LeadInput value={form.noticePeriod} onChange={(v) => set('noticePeriod', v)} />
              </Field>
              <Field label={t('Warn me before the deadline')}>
                <AlertsEditor value={form.noticeAlerts} presets={alertPresets} onChange={(v) => set('noticeAlerts', v)} />
              </Field>
            </>
          ) : null}
        </fieldset>

        <fieldset className="fieldset">
          <legend className="sr-only">{t('Alerts')}</legend>
          <div className="fieldset-title" aria-hidden="true">
            {t('Warn me')}
          </div>
          <AlertsEditor
            value={form.alerts}
            presets={alertPresets}
            hasTime={isTemplate || Boolean(form.dueTime)}
            onChange={(v) => {
              alertsTouched.current = true;
              set('alerts', v);
            }}
          />
          {!form.autoPay ? (
            <div className="toggle-row">
              <div>
                <div className="settings-label">{t('Keep reminding me once it’s overdue')}</div>
                <div className="settings-desc">{t('One alert every morning until you mark it done.')}</div>
              </div>
              <Switch label={t('Keep reminding me once it’s overdue')} checked={form.nagDaily} onChange={(v) => set('nagDaily', v)} />
            </div>
          ) : null}
        </fieldset>

        <fieldset className="fieldset">
          <legend className="sr-only">{t('Cost')}</legend>
          <div className="fieldset-title" aria-hidden="true">
            {t('Payment')}
          </div>
          <div className="toggle-row">
            <div>
              <div className="settings-label">{t('Charged automatically')}</div>
              <div className="settings-desc">
                {t('Direct debit or subscription — nothing to do. Alerts become a heads-up and it moves to the next date on its own.')}
              </div>
            </div>
            <Switch label={t('Charged automatically')} checked={form.autoPay} onChange={(v) => set('autoPay', v)} />
          </div>
          <div className="grid-2">
            <Field label={t('Amount')} htmlFor="amount" optional error={errors.amount}>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className="num"
                placeholder="0.00"
                value={form.amount}
                invalid={Boolean(errors.amount)}
                onChange={(e) => set('amount', e.target.value)}
              />
            </Field>
            <Field label={t('Currency')} htmlFor="currency">
              <Select id="currency" value={form.currency} disabled={!form.amount} onChange={(e) => set('currency', e.target.value)}>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {!isTemplate ? (
            <Field
              label={t('Paid with')}
              htmlFor="paidWith"
              optional
              hint={
                cards.length === 0
                  ? t('Add a reminder for a card (e.g. in “Bank cards”) to link it here.')
                  : t('When the card expires, you’ll see everything charged to it.')
              }
            >
              <Select id="paidWith" value={form.paidWithId} disabled={cards.length === 0} onChange={(e) => set('paidWithId', e.target.value)}>
                <option value="">{t('Not linked')}</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                    {c.reference ? ` (${c.reference})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </fieldset>

        <div className="form-foot">
          <Button variant="ghost" onClick={() => navigate(-1)} disabled={saving}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="primary" icon={<Check size={16} />} disabled={saving}>
            {isTemplate ? (existingTemplate ? t('Save template') : t('Add template')) : existing ? t('Save changes') : t('Add reminder')}
          </Button>
        </div>
      </form>

      <CategorySheet
        open={newCategory}
        onClose={() => setNewCategory(false)}
        onSaved={(c) => {
          setNewCategory(false);
          setForm((f) => (f ? { ...f, categoryId: c.id, alerts: alertsTouched.current ? f.alerts : c.defaultAlerts } : f));
        }}
      />
      <ProviderSheet
        open={newProvider}
        onClose={() => setNewProvider(false)}
        onSaved={(p) => {
          setNewProvider(false);
          set('providerId', p.id);
        }}
      />
      <PersonSheet
        open={newPerson}
        onClose={() => setNewPerson(false)}
        onSaved={(p) => {
          setNewPerson(false);
          set('personId', p.id);
        }}
      />
    </div>
  );
}
