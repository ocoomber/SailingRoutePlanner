// The skipper-drawn-route seam: assessProvidedRoute (pure crossing assessment)
// and planPassage taking a provided rough route instead of generating one.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { assessProvidedRoute } from '../src/core/rough-route.js';
import { planPassage } from '../src/core/passage-planner.js';
import { loadPolars } from '../src/core/polar.js';
import { loadCoastline } from '../src/core/coastline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const basePolars = loadPolars(JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'data', 'polars', 'oceanis393.json'), 'utf-8')));
const coarse = loadCoastline(JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'data', 'coastline', 'sw-england-coarse.json'), 'utf-8')));

const EMPTY_COASTLINE = { segments: [], outerRings: [], innerRings: [], grid: {} };
const DEPARTURE = '2026-07-16T12:00:00.000Z';

function makeWindGrid(totalHours, stepMinutes, wind) {
  const grid = [];
  const t0 = new Date(DEPARTURE).getTime();
  for (let m = 0; m <= totalHours * 60; m += stepMinutes) {
    grid.push({ time: new Date(t0 + m * 60000).toISOString(), points: [{ lat: 50.0, lon: -4.0, speed: wind.speed, direction: wind.direction }] });
  }
  return { grid, points: [{ lat: 50.0, lon: -4.0 }] };
}

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name} ${detail}`); }
}

// --- assessProvidedRoute: open water is clean, the direct Lizard cut crosses ---
(function () {
  const clean = assessProvidedRoute(
    [{ lat: 50.05, lon: -4.90 }, { lat: 49.95, lon: -4.70 }], coarse);
  check('open-water drawn route reads clean', clean.reachedCleanly && clean.provided);
  check('assess reports leg count and distance', clean.legCount === 1 && clean.totalDistanceNm > 0);

  // St Mawes straight across the Lizard peninsula to Newlyn — must read as crossing.
  const crossing = assessProvidedRoute(
    [{ lat: 50.147, lon: -5.023 }, { lat: 50.106, lon: -5.541 }], coarse);
  check('drawn route cutting across land is flagged', !crossing.reachedCleanly && crossing.crossingLegIndices.length > 0,
    `crossings=${crossing.crossingLegIndices.length}`);
})();

// --- planPassage follows a provided dogleg spine (open water, synthetic wind) ---
(async function () {
  // A three-point dogleg the "skipper drew": ESE then NE.
  const drawn = [
    { lat: 50.00, lon: -4.00 },
    { lat: 49.92, lon: -3.80 },
    { lat: 50.02, lon: -3.55 }
  ];
  const windGrid = makeWindGrid(12, 15, { speed: 14, direction: 200 });
  const result = await planPassage({
    start: drawn[0], end: drawn[drawn.length - 1],
    departureTime: DEPARTURE, basePolars, windGrid,
    roughRoute: drawn,
    coastlineCoarse: EMPTY_COASTLINE,
    getFineCoastline: async () => EMPTY_COASTLINE,
    routerOpts: { headingsPerStep: 18, maxSteps: 400, corridorWidthNm: 3 }
  });

  check('provided route flagged in debug', result.debug.roughRoute.provided === true);
  check('debug rough spine is the drawn one', result.debug.roughRoute.waypoints.length === 3 &&
    result.debug.roughRoute.waypoints[1].lat === 49.92);
  check('plan produced legs to the destination', result.legs.length > 0 && result.summary.reachedDestination,
    `reached=${result.summary.reachedDestination}, shortfall=${result.summary.shortfallNm?.toFixed(2)}`);

  // Confinement: every executed leg vertex stays within the corridor (drawn width
  // + the pruning slack), i.e. the plan did not wander off the drawn spine.
  const dogSouth = Math.min(...drawn.map(p => p.lat));
  const belowSpine = result.legs.filter(l => l.waypoint.lat < dogSouth - 3 / 60).length;
  check('execution stays near the drawn spine', belowSpine === 0, `${belowSpine} legs strayed south`);
})().then(() => {
  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} provided-route scenarios`);
  process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
  console.error('provided-route harness threw:', err);
  process.exit(1);
});
