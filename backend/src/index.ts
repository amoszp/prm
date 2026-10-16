import 'dotenv/config';
import express from 'express';
import { join } from 'node:path';
import { requireUser, type User } from './auth';
import { claimLegacyRecords, legacyRecordCount } from './db';
import { router } from './router';
import { sessionRouter } from './sessionRoutes';
import { importBackup, importDevice } from './importRoute';
import { startScheduler } from './scheduler';

const app = express();
const PORT = Number(process.env.PORT ?? 4478);
// Built frontend PWA (vite build's default outDir, at the project root).
const FRONTEND_DIR = process.env.FRONTEND_DIR ?? join(__dirname, '../../dist');

// Records saved before accounts existed belong to this user (an admin, so
// nobody can claim them by signing up with that name first).
const LEGACY_OWNER = (process.env.LEGACY_OWNER_USERNAME ?? '').trim().toLowerCase();
function claimLegacy(user: User): void {
  if (!LEGACY_OWNER || user.username !== LEGACY_OWNER || !user.isAdmin) return;
  const moved = claimLegacyRecords(user.id);
  if (moved) console.log(`[prm] ${moved} records from before accounts moved to ${user.username}`);
}

app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' })); // a full JSON backup/import can be sizable

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', sessionRouter);
app.use('/api', requireUser(claimLegacy));
app.get('/api/auth/me', (req, res) => res.json({ user: req.user }));
app.post('/api/import', importBackup);
app.post('/api/import-device', importDevice);
app.use('/api', router);
// Anything else under /api is a genuine 404, not a frontend route.
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

// The service worker and the page must always be fresh, or an update never lands.
app.use(
  express.static(FRONTEND_DIR, {
    setHeaders: (res, path) => {
      if (/(index\.html|sw\.js|manifest\.webmanifest)$/.test(path)) res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);
// SPA fallback: PRM uses client-side routing (react-router-dom), so any
// unmatched GET route is a deep link into the app, not a missing page.
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[prm] listening on port ${PORT}`);
  const legacy = legacyRecordCount();
  if (legacy) console.log(`[prm] ${legacy} records from before accounts wait for ${LEGACY_OWNER || '(LEGACY_OWNER_USERNAME not set)'}`);
  startScheduler();
});
