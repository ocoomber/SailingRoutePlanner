import express from 'express';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { fetchWindGrid } from '../src/services/wind.js';
import { createPlanRouteHandler } from './plan-route.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOG_DIR = join(ROOT, 'logs');

export function createServer({ fetchWindGridFn = fetchWindGrid } = {}) {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.post('/plan-route', createPlanRouteHandler(fetchWindGridFn));

  // Every route the browser computes POSTs its structured debug log here, so the
  // coding assistant can read logs/route-latest.json instead of the user pasting
  // anything. A timestamped copy keeps a short history.
  app.post('/debug-log', (req, res) => {
    try {
      mkdirSync(LOG_DIR, { recursive: true });
      const json = JSON.stringify(req.body, null, 2);
      writeFileSync(join(LOG_DIR, 'route-latest.json'), json);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      writeFileSync(join(LOG_DIR, `route-${stamp}.json`), json);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Serve the app itself, so one server hosts the page and receives its logs.
  app.use(express.static(ROOT));

  return app;
}

// pathToFileURL normalises Windows backslash paths so this entry check works
// cross-platform (the old `file://${argv[1]}` never matched on Windows).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = process.env.PORT || 8123;
  createServer().listen(port, () => {
    console.log(`Sailing Passage Planner running on http://localhost:${port}`);
  });
}
