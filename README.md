# PRM — Please Remind Me

Bills, renewals, subscriptions and expiry dates in one place, with alerts
before they hit: car insurance, bank-card expiry, DNI renewal, YouTube / iCloud
charges, utilities, taxes, ITV, home maintenance — and anything else you add.

Remodelled from `AI-BUSINESS/prm` to match the vault note *Bill and Renewal
Reminder App*. The original project is untouched.

## Status: phase 1 (on-device)

| Phase | What | State |
|------|------|------|
| 1 | Installable PWA, all data in the browser (IndexedDB), local notifications while the app is open | **This build** |
| 2 | Small API on Chiquitojaco (SQLite) replacing IndexedDB | Planned |
| 2 | Daily job that sends due alerts through a Telegram bot (works with the phone locked, no App Store) | Planned |

Phase 1 is for testing the product. Its one real limit: a browser can only fire
alerts while PRM is open. Phase 2 removes that.

## Everything is editable (full CRUD)

| Thing | Where | Notes |
|------|------|------|
| Reminders | Reminders, `+` | Title, category, reference, provider, notes, due date + time, repeat, alerts, amount + currency. Duplicate, snooze, pause, mark done (logs history), undo. On a phone: swipe right = done, left = snooze. |
| Categories | Settings → Categories | Name, colour, icon, default alerts, order. Deleting moves its reminders to another category. |
| Repeat options | Settings → Repeat options | Any "every N days/weeks/months/years". "Once" and "Custom…" always available. |
| Alert options | Settings → Alert options | Any "N hours/days/weeks/months/years before". Each reminder can have several alerts plus custom ones. |
| Providers | Providers | Name, type, phone, email, website, address, notes; linked to reminders. |
| Provider types | Settings → Provider types | Deleting moves its providers to another type. |
| Templates | Settings → Templates, top of New reminder | One-tap presets (DNI with 5 alerts, ITV, bank card, car insurance…). "Save as template" on any reminder. |
| People | Settings → People, "For" on a reminder | Whose date it is (Mum's DNI…). Filter Reminders by person. |
| Attachments | Each reminder | Photos / PDFs, kept on this device only — not in backups or the calendar. |
| Settings | Settings | Language (English / Español), theme, default currency (EUR), "coming up" window, notifications, app-icon badge. |
| Calendar | Settings → Calendar, "Add to calendar" on a reminder | `.ics` export: reminders + alerts into the phone's calendar, so alerts fire with PRM closed. |
| Data | Settings → Data | Export / import JSON backup, load examples, restore default lists, erase everything. |

Built-in categories: Insurance, Bank cards, ID & documents, Subscriptions,
Bills & utilities, Taxes, Vehicle, Home maintenance, Health, Other — all of
them can be renamed, recoloured, reordered or deleted.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest (73 tests)
npm run lint
npm run build      # icons + type-check + production bundle in dist/
```

Docker (static build served by nginx on port 8000):

```bash
docker compose up -d --build
```

On iPhone: open it in Safari → Share → **Add to Home Screen**. Notifications
only work from the Home Screen app (iOS 16.4+).

## Architecture

```
src/
├── types/          Domain types (single source of truth)
├── data/           Storage contract (collection.ts), IndexedDB adapter, seed data, backup
├── i18n/           English → Spanish dictionary, t() / tn(), current language
├── lib/            Pure logic: dates, reminders, notifications, money, calendar (.ics), gestures
├── stores/         DataStore (all CRUD), SettingsStore, useReminderActions
├── components/     UI primitives, sheets, editors, rows, shell
├── pages/          Overview, Reminders, detail, form, Providers, Settings + manage pages
└── styles/         tokens.css (design tokens, light + dark) and app.css
```

The app only talks to the `Collection<T>` interface in `src/data/collection.ts`.
Phase 2 adds an HTTP adapter with the same interface; stores and pages don't
change. The JSON backup format is the migration path to the server.

## Design

"Plum & peach": rose-tinted paper neutrals, plum-black ink, deep plum
(#542A52) for action in light mode and peach (#FFB39A) in dark mode, with
vermilion for overdue and ochre for today. Dates, numbers and titles use
Fraunces; the UI uses Plus Jakarta Sans. The app name is not shown in the UI. Every reminder carries a tear-off calendar tile
tinted with its category colour. Light and dark themes, WCAG-AA contrast,
keyboard and screen-reader support, reduced-motion respected, 44px touch
targets.
