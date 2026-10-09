# AGENTS.md — PRM (Please Remind Me)

Read this first. Persistent project rules; see README.md for features.

## What this is

A reminder app for dated obligations (bills, renewals, expiries,
subscriptions). **Phase 1** is an on-device PWA (IndexedDB, local
notifications). **Phase 2** adds a backend on Chiquitojaco and Telegram
delivery — design every change so that swap stays cheap.

## Stack

React 18 + TypeScript (strict), Vite 5, React Router 6, vite-plugin-pwa,
IndexedDB via `src/data/indexeddb.ts`, React Context stores, Vitest +
Testing Library + fake-indexeddb, ESLint 9, lucide-react icons, fonts via
@fontsource (Plus Jakarta Sans, Fraunces), hand-written CSS on design tokens.

## Rules

1. **Everything the user picks from is data.** Categories, repeat options,
   alert options and provider types are CRUD lists — never hard-code a new one
   in UI code; add it to `src/data/seed.ts` if it should exist by default.
2. **Reminders store their schedule inline** (`repeat`, `alerts`), so deleting
   a preset never changes an existing reminder. Deleting a category or
   provider type must reassign its users (see `DataStore`).
3. **Storage only through `Collection<T>`** (`src/data/collection.ts`). No
   direct IndexedDB calls outside `src/data/`. Phase 2 = new adapter.
4. **`src/lib` is pure** (no React, no storage) and is where scheduling logic
   lives — `dueAlerts()` is meant to be reused by the Telegram job.
5. **Store operations return `Result<T>`**; pages surface errors with toasts.
   State-changing actions offer Undo (`useReminderActions`).
6. **Dates** are local `YYYY-MM-DD` strings; use `src/lib/dates.ts` helpers.
   All formatting goes through `LOCALE` (en-GB) in that file.
7. **Design tokens only** (`src/styles/tokens.css`): no hard-coded colours,
   spacing or radii; both themes must be checked. Icons from lucide-react.
8. **No secrets in data.** The "Reference" field is for policy numbers or
   last-4 digits — never passwords or PINs.
9. Tests must pass (`npm test`), and `npx tsc -b --noEmit` + `npm run lint`
   must be clean before a task is done.
10. **Every user-visible string is translated.** Write English wrapped in
    `t('…')` (or `tn(n, one, other)` for plurals, `m('…')` in lookup tables)
    from `src/i18n`, with `{name}` placeholders — never template literals inside
    `t()`. Add the Spanish to `src/i18n/es.ts`. `tests/i18n.test.ts` fails on any
    missing translation or hard-coded English in JSX / labels. Built-in list
    names are translated for display by `seedText` (see `DataStore.localise`).
11. **Attachments are device-only.** They live in the `attachments` and
    `attachmentFiles` stores, outside `DataState`: never in backups, never in
    the calendar export, and the phase-2 server adapter must not sync them
    (DNI scans are sensitive) unless they are encrypted first.

## Commands

| Command | What |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Tests once |
| `npm run lint` | ESLint |
| `npm run build` | Icons (sharp, from `public/favicon.svg`) + type-check + bundle |
| `docker compose up -d --build` | Phase 2: one container, API + built PWA, port 4478 |
| `cd backend && npm run dev` | Backend dev server (tsx watch) |
| `cd backend && npm test` | Backend tests (Node's built-in test runner) |

## Phase 2 — built (see `backend/`)

Express + `node:sqlite` API, same eight entities as `src/types`, in one
generic `records(store, id, data, updated_at)` table behind one generic
router (`backend/src/router.ts`) — not a bespoke table/route per entity.

- `src/data/httpCollection.ts` implements `Collection<T>` over the API;
  `VITE_STORAGE_MODE=http` swaps it in via `DataStore.tsx`'s
  `defaultCollections()` — stores and pages are unchanged. Attachments stay
  IndexedDB-only either way (device-only, per the `Attachment` comment).
- `backend/src/scheduler.ts` imports `nextAlert()` and `settleAutoCharges()`
  straight from `src/lib/reminders.ts` at runtime (via `tsx`, resolving the
  frontend's own `@/*` alias — no build step, no re-derived due-date math).
  `nagDaily` re-notification is scheduler-only logic, same as the design
  called for; a `sent_alerts` table stops it re-sending a fired alert.
  `settleAutoCharges` also runs there periodically.
- `POST /api/import` accepts the existing `BackupFile` export (v2 or v3) —
  the phase-1-to-phase-2 migration, no new format.
- Telegram: a direct `sendMessage` call (no library), `TELEGRAM_BOT_TOKEN` /
  `TELEGRAM_CHAT_ID` in `backend/.env` (never committed — see `.env.example`).
  **Its own bot, not shared with Kage.**
- Deployment: single container (root `Dockerfile` + `docker-compose.yml`),
  mirroring Kage — Node alpine, multi-stage frontend build, backend runs
  straight from TypeScript (`tsx`) in prod too, SQLite file volume-mounted.
  NAS-agnostic; no access-control layer is wired in yet (see note below).

**Not yet decided / not done:**
- Auth / access control in front of the API — the PWA must not be reachable
  on the open internet unprotected (LAN/Tailscale or Cloudflare Access is
  Moe's call, not made yet).
- Whether the IndexedDB adapter gets removed once the backend is trusted, or
  stays as a permanent fallback — currently both are kept, selected by
  `VITE_STORAGE_MODE`.
