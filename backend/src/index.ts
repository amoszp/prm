import 'dotenv/config';
import express from 'express';
import { join } from 'node:path';
import { router } from './router';
import { importBackup } from './importRoute';
import { startScheduler } from './scheduler';

const app = express();
const PORT = Number(process.env.PORT ?? 4478);
// Built frontend PWA (vite build's default outDir, at the project root).
const FRONTEND_DIR = process.env.FRONTEND_DIR ?? join(__dirname, '../../dist');

app.use(express.json({ limit: '5mb' })); // a full JSON backup/import can be sizable

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/import', importBackup);
app.use('/api', router);
// Anything else under /api is a genuine 404, not a frontend route.
app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

app.use(express.static(FRONTEND_DIR));
// SPA fallback: PRM uses client-side routing (react-router-dom), so any
// unmatched GET route is a deep link into the app, not a missing page.
app.get('*', (_req, res) => {
  res.sendFile(join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[prm] listening on port ${PORT}`);
  startScheduler();
});
