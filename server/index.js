import express from 'express';
import { fetchWindGrid } from '../src/services/wind.js';
import { createPlanRouteHandler } from './plan-route.js';

export function createServer({ fetchWindGridFn = fetchWindGrid } = {}) {
  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.post('/plan-route', createPlanRouteHandler(fetchWindGridFn));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => {
    console.log(`Sailing Passage Planner API listening on :${port}`);
  });
}
