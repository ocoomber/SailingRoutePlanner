// The rough-route engine. Verifies the two reported bugs and checks the computed
// course against the skipper's own GPX rough route (the verification oracle):
// St Mawes -> south -> below the Lizard -> Newlyn.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeRoughRoute } from '../src/core/rough-route.js';
import { loadCoastline, crossesLand } from '../src/core/coastline.js';
import { distanceNm } from '../src/core/geometry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const coarse = loadCoastline(JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'data', 'coastline', 'sw-england-coarse.json'), 'utf-8')
));

// The skipper GPX (Desktop/Issues/skipper rough route.gpx), inlined as the oracle.
const GPX = [
  { lat: 50.14699, lon: -5.02350 },
  { lat: 50.03289, lon: -5.03929 },
  { lat: 49.94062, lon: -5.19928 },
  { lat: 50.10517, lon: -5.53368 }
];

function report(name, description, pass, detail) {
  console.log(`\n=== ${name} ===`);
  console.log(`  ${description}`);
  console.log(pass ? `  PASS: ${detail}` : `  FAIL: ${detail}`);
  return pass;
}

// Nearest distance (NM) from a point to the GPX polyline, sampled.
function distToGpxNm(point) {
  let min = Infinity;
  for (let i = 0; i < GPX.length - 1; i++) {
    for (let t = 0; t <= 1; t += 0.05) {
      const p = { lat: GPX[i].lat + (GPX[i + 1].lat - GPX[i].lat) * t,
                  lon: GPX[i].lon + (GPX[i + 1].lon - GPX[i].lon) * t };
      min = Math.min(min, distanceNm(point, p));
    }
  }
  return min;
}

// ISSUE 2: open water, clear straight line -> exactly one leg.
function testOpenWaterIsOneLeg() {
  const a = { lat: 50.05, lon: -4.90 };
  const b = { lat: 49.95, lon: -4.70 };
  const r = computeRoughRoute(a, b, coarse, { clearanceNm: 0.25 });
  const pass = r.legCount === 1 && r.reachedCleanly;
  return report('Open water is one leg', 'a clear straight hop must not be split (Issue 2)',
    pass, `${r.legCount} leg(s), reachedCleanly=${r.reachedCleanly}`);
}

// The direct line crosses land; the rough route must not.
function testRoughRouteClearsLand() {
  const r = computeRoughRoute(GPX[0], GPX[GPX.length - 1], coarse, { clearanceNm: 0.25 });
  const directCrosses = crossesLand(coarse, GPX[0], GPX[3], GPX[0], GPX[3], 0.25);
  const pass = directCrosses && r.reachedCleanly;
  return report('Rough route clears the coast', 'direct crosses the Lizard; the route must not',
    pass, `direct crosses=${directCrosses}, route clean=${r.reachedCleanly}, legs=${r.legCount}`);
}

// Rounds the Lizard: a waypoint south of ~49.96 N.
function testRoundsTheLizard() {
  const r = computeRoughRoute(GPX[0], GPX[3], coarse, { clearanceNm: 0.25 });
  const south = r.waypoints.some(p => p.lat < 49.96);
  const pass = south && r.legCount <= 5;
  return report('Rounds the Lizard, stays simple', 'south of 49.96N, few legs like the GPX',
    pass, `southmost ${Math.min(...r.waypoints.map(p => p.lat)).toFixed(3)}N, legs=${r.legCount}`);
}

// Resembles the skipper's own route: every computed vertex near the GPX line.
function testMatchesSkipperGpx() {
  const r = computeRoughRoute(GPX[0], GPX[3], coarse, { clearanceNm: 0.25 });
  const offsets = r.waypoints.map(distToGpxNm);
  const worst = Math.max(...offsets);
  const pass = worst < 6; // within ~6NM of the hand-drawn route everywhere
  return report('Matches the skipper GPX', 'computed course tracks the hand-drawn one',
    pass, `worst vertex offset ${worst.toFixed(1)}NM from the GPX (waypoints=${r.waypoints.length})`);
}

// Does not enter the Helford: no waypoint up the river (~50.09..50.11, -5.13..-5.23).
function testAvoidsHelford() {
  const r = computeRoughRoute(GPX[0], GPX[3], coarse, { clearanceNm: 0.25 });
  const inHelford = r.waypoints.some(p =>
    p.lat > 50.08 && p.lat < 50.12 && p.lon > -5.24 && p.lon < -5.12);
  return report('Avoids the Helford dead-end', 'no waypoint up the river',
    !inHelford, inHelford ? 'a waypoint is up the Helford' : 'clear of the river');
}

const scenarios = [
  testOpenWaterIsOneLeg, testRoughRouteClearsLand, testRoundsTheLizard,
  testMatchesSkipperGpx, testAvoidsHelford
];

let passed = 0, failed = 0;
for (const s of scenarios) { if (s()) passed++; else failed++; }
console.log(`\n${passed} passed, ${failed} failed out of ${scenarios.length} rough-route scenarios`);
process.exit(failed > 0 ? 1 : 0);
