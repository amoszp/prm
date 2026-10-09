// First-run data. Every item here is ordinary data: the user can rename,
// recolour, reorder or delete it afterwards.

import type { AlertPreset, Category, LeadTime, ProviderType, Reminder, RepeatPreset, Template } from '@/types';
import { addDays, addMonths, toISODate } from '@/lib/dates';
import { createId } from '@/lib/id';

const d = (value: number): LeadTime => ({ value, unit: 'day' });
const w = (value: number): LeadTime => ({ value, unit: 'week' });
const m = (value: number): LeadTime => ({ value, unit: 'month' });

function stamp<T>(items: T[], ts: string): (T & { order: number; createdAt: string; updatedAt: string })[] {
  return items.map((item, order) => ({ ...item, order, createdAt: ts, updatedAt: ts }));
}

export function seedCategories(ts: string): Category[] {
  return stamp(
    [
      { id: 'cat_insurance', name: 'Insurance', color: 'cobalt', icon: 'shield', defaultAlerts: [m(1), w(1)] },
      { id: 'cat_cards', name: 'Bank cards', color: 'indigo', icon: 'credit-card', defaultAlerts: [m(1), w(1)], holdsCards: true },
      { id: 'cat_documents', name: 'ID & documents', color: 'terracotta', icon: 'id-card', defaultAlerts: [m(3), m(1)] },
      { id: 'cat_subscriptions', name: 'Subscriptions', color: 'plum', icon: 'tv', defaultAlerts: [d(3), d(1)] },
      { id: 'cat_bills', name: 'Bills & utilities', color: 'amber', icon: 'receipt', defaultAlerts: [d(3), d(0)] },
      { id: 'cat_taxes', name: 'Taxes', color: 'olive', icon: 'landmark', defaultAlerts: [m(1), w(1)] },
      { id: 'cat_vehicle', name: 'Vehicle', color: 'teal', icon: 'car', defaultAlerts: [m(1), w(1)] },
      { id: 'cat_home', name: 'Home maintenance', color: 'bottle', icon: 'wrench', defaultAlerts: [w(1)] },
      { id: 'cat_health', name: 'Health', color: 'rose', icon: 'heart-pulse', defaultAlerts: [w(1), d(1)] },
      { id: 'cat_other', name: 'Other', color: 'graphite', icon: 'bell', defaultAlerts: [d(1)] },
    ],
    ts,
  );
}

export function seedRepeatPresets(ts: string): RepeatPreset[] {
  return stamp(
    [
      { id: 'rep_1w', label: 'Weekly', interval: { every: 1, unit: 'week' as const } },
      { id: 'rep_1m', label: 'Monthly', interval: { every: 1, unit: 'month' as const } },
      { id: 'rep_2m', label: 'Every 2 months', interval: { every: 2, unit: 'month' as const } },
      { id: 'rep_3m', label: 'Quarterly', interval: { every: 3, unit: 'month' as const } },
      { id: 'rep_6m', label: 'Every 6 months', interval: { every: 6, unit: 'month' as const } },
      { id: 'rep_1y', label: 'Yearly', interval: { every: 1, unit: 'year' as const } },
      { id: 'rep_2y', label: 'Every 2 years', interval: { every: 2, unit: 'year' as const } },
      { id: 'rep_3y', label: 'Every 3 years', interval: { every: 3, unit: 'year' as const } },
      { id: 'rep_5y', label: 'Every 5 years', interval: { every: 5, unit: 'year' as const } },
      { id: 'rep_10y', label: 'Every 10 years', interval: { every: 10, unit: 'year' as const } },
    ],
    ts,
  );
}

export function seedAlertPresets(ts: string): AlertPreset[] {
  return stamp(
    [
      { id: 'alr_0d', label: 'On the day', lead: d(0) },
      { id: 'alr_1h', label: '1 hour before', lead: { value: 1, unit: 'hour' as const } },
      { id: 'alr_1d', label: '1 day before', lead: d(1) },
      { id: 'alr_2d', label: '2 days before', lead: d(2) },
      { id: 'alr_3d', label: '3 days before', lead: d(3) },
      { id: 'alr_1w', label: '1 week before', lead: w(1) },
      { id: 'alr_2w', label: '2 weeks before', lead: w(2) },
      { id: 'alr_1m', label: '1 month before', lead: m(1) },
      { id: 'alr_2m', label: '2 months before', lead: m(2) },
      { id: 'alr_3m', label: '3 months before', lead: m(3) },
    ],
    ts,
  );
}

export function seedProviderTypes(ts: string): ProviderType[] {
  return stamp(
    [
      'Insurer',
      'Bank',
      'Utility company',
      'Telecom',
      'Streaming & software',
      'Government office',
      'Mechanic',
      'Cleaner',
      'Plumber',
      'Electrician',
      'Handyman',
      'Appliance repair',
      'HVAC',
      'Gardener',
      'Other',
    ].map((name) => ({ id: `ptype_${name.toLowerCase().replace(/[^a-z]+/g, '-')}`, name })),
    ts,
  );
}

const yearly = { every: 1, unit: 'year' as const };
const tenYears = { every: 10, unit: 'year' as const };

/** One-tap starting points for new reminders. Editable and deletable like every other list. */
export function seedTemplates(ts: string): Template[] {
  return stamp<Omit<Template, 'order' | 'createdAt' | 'updatedAt'>>(
    [
      { id: 'tpl_dni', name: 'DNI renewal', categoryId: 'cat_documents', repeat: tenYears, alerts: [m(3), m(2), m(1), w(2), w(1)], nagDaily: true, notes: 'Book the cita previa early — slots fill up.' },
      { id: 'tpl_passport', name: 'Passport renewal', categoryId: 'cat_documents', repeat: tenYears, alerts: [m(3), m(1)], nagDaily: true },
      { id: 'tpl_licence', name: 'Driving licence renewal', categoryId: 'cat_documents', repeat: tenYears, alerts: [m(3), m(1)], nagDaily: true },
      { id: 'tpl_card', name: 'Bank card expires', categoryId: 'cat_cards', repeat: { every: 4, unit: 'year' }, alerts: [m(1), w(1)], nagDaily: true },
      { id: 'tpl_car_insurance', name: 'Car insurance renewal', categoryId: 'cat_insurance', repeat: yearly, alerts: [m(1), w(1)], nagDaily: true, notice: { period: m(1), alerts: [w(1), d(0)] } },
      { id: 'tpl_itv', name: 'ITV inspection', categoryId: 'cat_vehicle', repeat: yearly, alerts: [m(1), w(1)], nagDaily: true },
      { id: 'tpl_streaming', name: 'Streaming subscription', categoryId: 'cat_subscriptions', repeat: { every: 1, unit: 'month' }, alerts: [d(1)], autoPay: true },
      { id: 'tpl_ibi', name: 'IBI property tax', categoryId: 'cat_taxes', repeat: yearly, alerts: [m(1), w(1)], nagDaily: true },
      { id: 'tpl_renta', name: 'Income tax return (Renta)', categoryId: 'cat_taxes', repeat: yearly, alerts: [m(1), w(2), w(1)], nagDaily: true },
      { id: 'tpl_boiler', name: 'Boiler service', categoryId: 'cat_home', repeat: yearly, alerts: [w(2)], nagDaily: true },
    ],
    ts,
  );
}

/** Optional demo reminders (Settings → Data → Load examples). Dates are relative to today. */
export function sampleReminders(ts: string, now: Date = new Date()): Reminder[] {
  const on = (days: number) => toISODate(addDays(now, days));
  const inMonths = (months: number) => toISODate(addMonths(now, months));
  const visaId = createId('rem');
  const items: (Omit<Reminder, 'id' | 'status' | 'history' | 'createdAt' | 'updatedAt'> & { id?: string })[] = [
    { title: 'Car insurance renewal', categoryId: 'cat_insurance', dueDate: on(24), repeat: { every: 1, unit: 'year' }, amount: 412, currency: 'EUR', alerts: [m(1), w(1)], reference: 'Policy ···4821', notice: { period: m(1), alerts: [w(1), d(0)] } },
    { id: visaId, title: 'Visa card expires', categoryId: 'cat_cards', dueDate: inMonths(5), repeat: { every: 4, unit: 'year' }, alerts: [m(1), w(1)], reference: 'Ends ···3390' },
    { title: 'DNI renewal', categoryId: 'cat_documents', dueDate: inMonths(14), repeat: { every: 10, unit: 'year' }, alerts: [m(3), m(1)], notes: 'Book the cita previa early — slots fill up.' },
    { title: 'YouTube Premium', autoPay: true, paidWithId: visaId, categoryId: 'cat_subscriptions', dueDate: on(3), repeat: { every: 1, unit: 'month' }, amount: 13.99, currency: 'EUR', alerts: [d(1)] },
    { title: 'iCloud+ storage', autoPay: true, paidWithId: visaId, categoryId: 'cat_subscriptions', dueDate: on(11), repeat: { every: 1, unit: 'month' }, amount: 2.99, currency: 'EUR', alerts: [d(1)] },
    { title: 'Electricity bill', categoryId: 'cat_bills', dueDate: on(-2), repeat: { every: 1, unit: 'month' }, amount: 64.2, currency: 'EUR', alerts: [d(3), d(0)] },
    { title: 'Mobile & fibre', autoPay: true, categoryId: 'cat_bills', dueDate: on(0), repeat: { every: 1, unit: 'month' }, amount: 45, currency: 'EUR', alerts: [d(0)] },
    { title: 'IBI property tax', categoryId: 'cat_taxes', dueDate: inMonths(2), repeat: { every: 1, unit: 'year' }, amount: 380, currency: 'EUR', alerts: [m(1), w(1)] },
    { title: 'ITV inspection', categoryId: 'cat_vehicle', dueDate: inMonths(7), repeat: { every: 1, unit: 'year' }, alerts: [m(1), w(1)] },
    { title: 'Boiler service', categoryId: 'cat_home', dueDate: on(40), repeat: { every: 1, unit: 'year' }, amount: 90, currency: 'EUR', alerts: [w(2)] },
  ];
  return items.map((item) => ({
    ...item,
    id: item.id ?? createId('rem'),
    anchorDay: Number(item.dueDate.slice(8)),
    nagDaily: item.autoPay ? undefined : true,
    status: 'active',
    history: [],
    createdAt: ts,
    updatedAt: ts,
  }));
}
