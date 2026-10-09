// Core domain types for PRM — Please Remind Me.
// Every list the user picks from (categories, repeat rules, alert presets,
// provider types) is itself data, so the user can create, edit and delete it.

/** Calendar unit used by repeat rules and alert lead times. */
export type TimeUnit = 'hour' | 'day' | 'week' | 'month' | 'year';

/** "Every N units". Stored inline on a reminder so deleting a preset never breaks it. */
export interface Interval {
  every: number;
  unit: Exclude<TimeUnit, 'hour'>;
}

/** "N units before the due moment". value 0 = on the due date itself. */
export interface LeadTime {
  value: number;
  unit: TimeUnit;
}

interface Timestamps {
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

/** User-defined grouping: Insurance, ID & documents, Subscriptions… */
export interface Category extends Timestamps {
  id: string;
  name: string;
  /** One of the curated palette keys in lib/palette.ts */
  color: string;
  /** One of the icon keys in components/CategoryIcon.tsx */
  icon: string;
  /** Alerts pre-filled on new reminders in this category */
  defaultAlerts: LeadTime[];
  /** Reminders here are payment cards that other reminders can be "paid with". */
  holdsCards?: boolean;
  order: number;
}

/** A reusable "how often it repeats" option. */
export interface RepeatPreset extends Timestamps {
  id: string;
  label: string;
  interval: Interval;
  order: number;
}

/** A reusable "how far ahead you're warned" option. */
export interface AlertPreset extends Timestamps {
  id: string;
  label: string;
  lead: LeadTime;
  order: number;
}

export interface ProviderType extends Timestamps {
  id: string;
  name: string;
  order: number;
}

export interface Provider extends Timestamps {
  id: string;
  name: string;
  typeId: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  notes?: string;
}

/** Someone a reminder is for (Mum's DNI, Nana's insurance). No person = it's yours. */
export interface Person extends Timestamps {
  id: string;
  name: string;
  /** One of the curated palette keys in lib/palette.ts */
  color: string;
  order: number;
}

/** One-tap starting point for a new reminder (DNI, ITV, streaming subscription…). */
export interface Template extends Timestamps {
  id: string;
  /** Used as the new reminder's title. */
  name: string;
  categoryId: string;
  repeat: Interval | null;
  alerts: LeadTime[];
  amount?: number;
  currency?: string;
  autoPay?: boolean;
  nagDaily?: boolean;
  notice?: { period: LeadTime; alerts: LeadTime[] };
  notes?: string;
  order: number;
}

/**
 * A photo or PDF kept with a reminder. Device-only: never in backups and not
 * synced in phase 2 without encryption (DNI scans are sensitive).
 */
export interface Attachment {
  id: string;
  reminderId: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
}

/** The file contents, stored apart so lists never load every file into memory. */
export interface AttachmentFile {
  id: string;
  blob: Blob;
}

export type ReminderStatus = 'active' | 'snoozed' | 'paused' | 'done';

/** One completed cycle — kept so a recurring bill has a payment history. */
export interface HistoryEntry {
  id: string;
  dueDate: string; // the due date that was completed (YYYY-MM-DD)
  completedAt: string; // ISO timestamp
  /** What was actually paid (defaults to the expected amount). */
  amount?: number;
  /** Day it was actually paid (YYYY-MM-DD); defaults to the completion day. */
  paidOn?: string;
  /** Completed by the app itself (auto-charged reminder whose date passed). */
  auto?: boolean;
  /** Cycle skipped — moved on without paying / doing it. */
  skipped?: boolean;
}

export interface Reminder extends Timestamps {
  id: string;
  title: string;
  categoryId: string;
  notes?: string;
  /** Free reference such as policy number or last 4 digits. Never a secret. */
  reference?: string;
  amount?: number;
  currency?: string; // ISO 4217
  /**
   * Charged automatically (direct debit, subscription). It needs no action:
   * alerts are a heads-up and the cycle completes itself once the date passes.
   */
  autoPay?: boolean;
  /** Card (a reminder in a card category) this is charged to. */
  paidWithId?: string;
  /** null = happens once */
  repeat: Interval | null;
  /** ISO date YYYY-MM-DD */
  dueDate: string;
  /** Day of month the schedule is anchored to, so the 31st doesn't drift to the 28th. */
  anchorDay?: number;
  /** Optional 'HH:mm' (24h). Enables hour-level alerts. */
  dueTime?: string;
  /** Every moment before the due date when an alert should fire. */
  alerts: LeadTime[];
  /** Once overdue, alert again every day (from 09:00) until it is done. */
  nagDaily?: boolean;
  /**
   * Notice period before the due date: the last day to cancel, switch or
   * decide (e.g. insurance must be cancelled 1 month before renewal).
   */
  notice?: { period: LeadTime; alerts: LeadTime[] };
  providerId?: string;
  /** Who it's for; undefined = you. */
  personId?: string;
  status: ReminderStatus;
  snoozedUntil?: string; // ISO timestamp
  history: HistoryEntry[];
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Settings {
  theme: ThemeMode;
  currency: string;
  /** Days ahead counted as "coming up" */
  upcomingDays: number;
  notificationsEnabled: boolean;
  /** Overdue + due-today count on the Home Screen icon. */
  badge?: boolean;
  /** Interface language; defaults to the device's. */
  language?: 'en' | 'es';
}

export interface AppError {
  message: string;
  code: string;
  timestamp: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

/** Shape of an export file — also the future payload for the backend import. */
export interface BackupFile {
  app: 'prm';
  /** 3 added templates and people; version 2 files still import. */
  version: 2 | 3;
  exportedAt: string;
  settings: Settings;
  categories: Category[];
  repeatPresets: RepeatPreset[];
  alertPresets: AlertPreset[];
  providerTypes: ProviderType[];
  providers: Provider[];
  reminders: Reminder[];
  templates?: Template[];
  people?: Person[];
}
