import express from 'express';
import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { fetchWindGrid } from '../src/services/wind.js';
import { createPlanRouteHandler } from './plan-route.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOG_DIR = join(ROOT, 'logs');

// A dev-log endpoint: takes { markdown, record }, writes a readable Markdown file
// per entry under logs/<subdir>/ AND appends the record to a JSONL dataset, so
// the entries accrete into a corpus for hardening the planner. Shared by the
// rough-route corrections and the plan-over-land review flags.
function devLogHandler(subdir, jsonlName) {
  return (req, res) => {
    try {
      const { markdown, record } = req.body || {};
      if (typeof markdown !== 'string' || !record) {
        return res.status(400).json({ ok: false, error: 'expected { markdown, record }' });
      }
      const dir = join(LOG_DIR, subdir);
      mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      writeFileSync(join(dir, `${stamp}.md`), markdown);
      appendFileSync(join(LOG_DIR, jsonlName), JSON.stringify(record) + '\n');
      res.json({ ok: true, file: `logs/${subdir}/${stamp}.md` });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  };
}

export function createServer({ fetchWindGridFn = fetchWindGrid } = {}) {
  const app = express();
  app.use(express.json({ limit: '8mb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.post('/plan-route', createPlanRouteHandler(fetchWindGridFn));

  // Dev tools: the rough-route generator got it wrong (I corrected the course),
  // or the sailing plan sailed over land (I flagged the combo for review).
  app.post('/rough-route-log', devLogHandler('rough-route', 'rough-route-corrections.jsonl'));
  app.post('/review-log', devLogHandler('review', 'review-flags.jsonl'));

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
