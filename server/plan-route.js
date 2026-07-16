import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadPolars } from '../src/core/polar.js';
import { mergeComfortParams } from '../src/core/comfort-params.js';
import { planPassage } from '../src/core/passage-planner.js';
import { CoastlineNode } from './coastline-node.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const basePolars = loadPolars(JSON.parse(readFileSync(join(REPO_ROOT, 'src/data/polars/oceanis393.json'), 'utf-8')));
const coarseCoastlineData = JSON.parse(readFileSync(join(REPO_ROOT, 'src/data/coastline/sw-england-coarse.json'), 'utf-8'));

function isValidLatLon(point) {
  return point && typeof point.lat === 'number' && typeof point.lon === 'number' &&
    point.lat >= -90 && point.lat <= 90 && point.lon >= -180 && point.lon <= 180;
}

function validateRequest(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return ['Request body must be a JSON object'];

  if (!isValidLatLon(body.start)) errors.push('start.lat and start.lon are required numbers in valid range');
  if (!isValidLatLon(body.end)) errors.push('end.lat and end.lon are required numbers in valid range');
  if (!body.departureTime || isNaN(new Date(body.departureTime).getTime())) {
    errors.push('departureTime must be a valid ISO-8601 string');
  }
  if (body.boat !== undefined && body.boat !== 'oceanis393') {
    errors.push(`boat "${body.boat}" is not supported — only "oceanis393" is available`);
  }

  return errors;
}

function windArea(start, end) {
  return {
    north: Math.max(start.lat, end.lat) + 0.5,
    south: Math.min(start.lat, end.lat) - 0.5,
    east: Math.max(start.lon, end.lon) + 0.5,
    west: Math.min(start.lon, end.lon) - 0.5
  };
}

export function createPlanRouteHandler(fetchWindGridFn) {
  return async (req, res) => {
    const errors = validateRequest(req.body);
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; ') });
      return;
    }

    const { start, end, departureTime, comfort, tidal, debug } = req.body;

    let comfortParams;
    try {
      comfortParams = mergeComfortParams(comfort || {});
    } catch (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    try {
      const area = windArea(start, end);
      const endTime = new Date(new Date(departureTime).getTime() + 48 * 3600000).toISOString();
      const windGrid = await fetchWindGridFn(area, departureTime, endTime);

      const coastlineNode = new CoastlineNode();
      await coastlineNode.init(coarseCoastlineData);

      const result = await planPassage({
        start, end, departureTime, basePolars, windGrid,
        tidalData: tidal || null,
        comfortParams,
        coastlineCoarse: coastlineNode.getCoarseCoastline(),
        getFineCoastline: async (waypoints) => {
          await coastlineNode.prepareFineTiles(waypoints, 5);
          return coastlineNode.getSmartCoastline() || coastlineNode.getCoarseCoastline();
        }
      });

      if (!debug) delete result.debug;
      res.status(200).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}
