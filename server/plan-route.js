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

function isValidRoughRoute(route) {
  return Array.isArray(route) && route.length >= 2 && route.every(isValidLatLon);
}

function validateRequest(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return ['Request body must be a JSON object'];

  // A skipper-drawn rough route stands in for start/end: its endpoints are the
  // passage endpoints. Require one or the other.
  const hasRough = body.roughRoute !== undefined;
  if (hasRough && !isValidRoughRoute(body.roughRoute)) {
    errors.push('roughRoute must be an array of >= 2 {lat, lon} points in valid range');
  }
  if (!hasRough) {
    if (!isValidLatLon(body.start)) errors.push('start.lat and start.lon are required numbers in valid range');
    if (!isValidLatLon(body.end)) errors.push('end.lat and end.lon are required numbers in valid range');
  }
  if (!body.departureTime || isNaN(new Date(body.departureTime).getTime())) {
    errors.push('departureTime must be a valid ISO-8601 string');
  }
  if (body.boat !== undefined && body.boat !== 'oceanis393') {
    errors.push(`boat "${body.boat}" is not supported — only "oceanis393" is available`);
  }

  return errors;
}

function windArea(points) {
  return {
    north: Math.max(...points.map(p => p.lat)) + 0.5,
    south: Math.min(...points.map(p => p.lat)) - 0.5,
    east: Math.max(...points.map(p => p.lon)) + 0.5,
    west: Math.min(...points.map(p => p.lon)) - 0.5
  };
}

export function createPlanRouteHandler(fetchWindGridFn) {
  return async (req, res) => {
    const errors = validateRequest(req.body);
    if (errors.length > 0) {
      res.status(400).json({ error: errors.join('; ') });
      return;
    }

    const { departureTime, comfort, tidal, debug, roughRoute } = req.body;

    // Endpoints come from the drawn route when given, else from start/end.
    const useRough = isValidRoughRoute(roughRoute);
    const start = useRough ? roughRoute[0] : req.body.start;
    const end = useRough ? roughRoute[roughRoute.length - 1] : req.body.end;

    let comfortParams;
    try {
      comfortParams = mergeComfortParams(comfort || {});
    } catch (err) {
      res.status(400).json({ error: err.message });
      return;
    }

    try {
      const area = windArea(useRough ? roughRoute : [start, end]);
      const endTime = new Date(new Date(departureTime).getTime() + 48 * 3600000).toISOString();
      const windGrid = await fetchWindGridFn(area, departureTime, endTime);

      const coastlineNode = new CoastlineNode();
      await coastlineNode.init(coarseCoastlineData);

      const result = await planPassage({
        start, end, departureTime, basePolars, windGrid,
        tidalData: tidal || null,
        comfortParams, roughRoute: useRough ? roughRoute : undefined,
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
