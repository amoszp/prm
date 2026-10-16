# PRM — Please Remind Me

Bills, renewals, subscriptions and expiry dates in one place, with alerts
before they hit: car insurance, bank-card expiry, DNI renewal, YouTube / iCloud
charges, utilities, taxes, ITV, home maintenance — and anything else you add.

## Status

| Phase | What | State |
|------|------|------|
| 1 | Installable PWA, all data in the browser (IndexedDB), local notifications while the app is open | Done — still what a build without a server runs |
| 2 | Self-hosted API (Express + SQLite) replacing IndexedDB, one account per person | Done — the Docker image runs it |
| 2 | Scheduler that sends due alerts through a Telegram bot (works with the phone locked, no App Store) | Done — each account's alerts go to its own chat |

## Accounts and the server (Docker image)

The image is built with `VITE_STORAGE_MODE=http`, so the app talks to the
backend in the same container instead of IndexedDB:

- A sign-in screen sits in front of the app (sign in, or create an account).
  Accounts live in a separate shared accounts service reached over a private
  Docker network (`ACCOUNTS_URL`, `ACCOUNTS_SERVICE_TOKEN`); PRM stores no
  passwords. The session is an HttpOnly cookie; API keys work as
  `Authorization: Bearer <key>`.
- Every record belongs to one account; nobody sees anyone else's data. The
  scheduler sends each account's alerts to the Telegram chat set for that
  account in the accounts service (`TELEGRAM_CHAT_ID` is used for
  `LEGACY_OWNER_USERNAME`).
- The first time anyone signs in on a device that already used PRM on-device,
  that device's data is sent to the server in the JSON backup format
  (`POST /api/import-device`) and lands only in an account that is still empty.
  The IndexedDB copy stays on the device as a backup.
- Attachments (photos, PDFs) stay on the device where they were added, as in
  phase 1.
- Records saved on the server before accounts existed move to
  `LEGACY_OWNER_USERNAME` (an admin) on that account's first sign-in.
- The app reads from the server, so it needs a connection; reopening it shows
  changes made on other devices.

Server settings go in `backend/.env` (see `backend/.env.example`). Backend
tests: `cd backend && npm test`.

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
The IndexedDB adapter and the HTTP adapter (`src/data/httpCollection.ts`,
selected by `VITE_STORAGE_MODE=http`) share that interface; stores and pages
don't change. The JSON backup format is the migration path to the server.

## Design

"Plum & peach": rose-tinted paper neutrals, plum-black ink, deep plum
(#542A52) for action in light mode and peach (#FFB39A) in dark mode, with
vermilion for overdue and ochre for today. Dates, numbers and titles use
Fraunces; the UI uses Plus Jakarta Sans. The app name is not shown in the UI. Every reminder carries a tear-off calendar tile
tinted with its category colour. Light and dark themes, WCAG-AA contrast,
keyboard and screen-reader support, reduced-motion respected, 44px touch
targets.
