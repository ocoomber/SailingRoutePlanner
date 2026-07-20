import express from 'express';
import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { fetchWindGrid } from '../src/services/wind.js';
import { createPlanRouteHandler } from './plan-route.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOG_DIR = join(ROOT, 'logs');
const ROUGH_DIR = join(LOG_DIR, 'rough-route');

export function createServer({ fetchWindGridFn = fetchWindGrid } = {}) {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.post('/plan-route', createPlanRouteHandler(fetchWindGridFn));

  // The dev "rough-route correction" tool POSTs { markdown, record } here: the
  // app generated a rough route, the skipper corrected it and said why. We keep
  // a readable Markdown file per correction AND append the record to a JSONL
  // dataset, so the corrections become a corpus for hardening computeRoughRoute.
  app.post('/rough-route-log', (req, res) => {
    try {
      const { markdown, record } = req.body || {};
      if (typeof markdown !== 'string' || !record) {
        return res.status(400).json({ ok: false, error: 'expected { markdown, record }' });
      }
      mkdirSync(ROUGH_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      writeFileSync(join(ROUGH_DIR, `${stamp}.md`), markdown);
      appendFileSync(join(LOG_DIR, 'rough-route-corrections.jsonl'), JSON.stringify(record) + '\n');
      res.json({ ok: true, file: `logs/rough-route/${stamp}.md` });
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
