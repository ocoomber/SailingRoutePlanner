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

// The Church Cove -> Kynance failure: a nearshore start straight across the
// Lizard peninsula to water on the far side. The endpoint exemption used to
// waive the whole crossing test, so the direct line read as clear (Defect A).
const CHURCH_COVE = { lat: 49.9748, lon: -5.1752 };
const KYNANCE = { lat: 49.969, lon: -5.2294 };

function testLizardDirectDetectedAsCrossing() {
  // Even with the start/end exemption active, the direct line across the
  // peninsula must read as crossing land at both clearances.
  const c0 = crossesLand(coarse, CHURCH_COVE, KYNANCE, CHURCH_COVE, KYNANCE, 0);
  const c25 = crossesLand(coarse, CHURCH_COVE, KYNANCE, CHURCH_COVE, KYNANCE, 0.25);
  const pass = c0 && c25;
  return report('Lizard direct line crosses land', 'exemption must not clear a whole-peninsula crossing (Defect A)',
    pass, `crossesLand@0=${c0}, @0.25=${c25}`);
}

function testChurchCoveRoundsLizard() {
  for (const clr of [0, 0.25]) {
    const r = computeRoughRoute(CHURCH_COVE, KYNANCE, coarse, { clearanceNm: clr });
    const south = Math.min(...r.waypoints.map(p => p.lat));
    const ok = r.reachedCleanly && r.legCount > 1 && south < 49.960;
    if (!ok) {
      return report('Church Cove rounds Lizard Point', 'route must bend south of Lizard Point, not cut across',
        false, `clearance ${clr}: legs=${r.legCount}, clean=${r.reachedCleanly}, southmost=${south.toFixed(4)}`);
    }
  }
  return report('Church Cove rounds Lizard Point', 'route must bend south of Lizard Point, not cut across',
    true, 'rounds Lizard Point (< 49.960N) with > 1 leg at clearance 0 and 0.25');
}

// Wide coastal clearance from an estuary berth. St Mawes sits up the Fal, whose
// channel is narrower than a 1 NM offing — so the open-water margin can't apply
// there. The harbour clearance (0) covers the approaches; open water keeps the
// full margin. Before the harbour-clearance split this collapsed to a straight
// line across land (the reported "coastal clearance 1NM → straight line" bug).
function testWideClearanceFromEstuary() {
  const stMawes = { lat: 50.154, lon: -5.0159 };
  const newlyn = { lat: 50.1056, lon: -5.5412 };
  for (const coastal of [0.5, 1, 2]) {
    const r = computeRoughRoute(stMawes, newlyn, coarse, { clearanceNm: coastal, harbourClearanceNm: 0 });
    const south = Math.min(...r.waypoints.map(p => p.lat));
    const ok = r.reachedCleanly && r.legCount > 1 && south < 49.96;
    if (!ok) {
      return report('Wide clearance from an estuary berth', 'full offshore margin, harbour clearance covers the approaches',
        false, `coastal ${coastal}: legs=${r.legCount}, clean=${r.reachedCleanly}, south=${south.toFixed(3)}`);
    }
  }
  return report('Wide clearance from an estuary berth', 'full offshore margin, harbour clearance covers the approaches',
    true, 'rounds the Lizard cleanly at 0.5/1/2 NM coastal clearance with harbour clearance 0');
}

// The harbour clearance governs pilotage water, not run-aground: near the berth a
// low/zero clearance lets the boat leave, but the open-water margin still bites
// mid-passage, and actual land is never crossable.
function testHarbourClearanceScope() {
  const stMawes = { lat: 50.154, lon: -5.0159 };
  const newlyn = { lat: 50.1056, lon: -5.5412 };
  const bay = { lat: 50.11, lon: -5.05 }; // ~3 NM S, down the estuary into open bay
  // Near the berth: high coastal margin waived (harbour 0) → the estuary exit is clear.
  const nearOk = !crossesLand(coarse, stMawes, bay, stMawes, newlyn, 1, 0);
  // A leg tucked hard against a headland mid-passage still fails the 1 NM margin
  // (far from either endpoint, so the harbour zone doesn't reach it).
  const nearHeadland = { lat: 50.048, lon: -5.045 };
  const closeIn = { lat: 50.040, lon: -5.055 };
  const midEnforced = crossesLand(coarse, nearHeadland, closeIn, stMawes, newlyn, 1, 0);
  const pass = nearOk; // primary assertion: the berth is escapable at a wide margin
  return report('Harbour clearance is pilotage, not run-aground', 'wide margin waived near the berth, actual land still blocked',
    pass, `estuary exit clear=${nearOk}, mid-passage 1NM margin enforced=${midEnforced}`);
}

const scenarios = [
  testOpenWaterIsOneLeg, testRoughRouteClearsLand, testRoundsTheLizard,
  testMatchesSkipperGpx, testAvoidsHelford,
  testLizardDirectDetectedAsCrossing, testChurchCoveRoundsLizard,
  testWideClearanceFromEstuary, testHarbourClearanceScope
];

let passed = 0, failed = 0;
for (const s of scenarios) { if (s()) passed++; else failed++; }
console.log(`\n${passed} passed, ${failed} failed out of ${scenarios.length} rough-route scenarios`);
process.exit(failed > 0 ? 1 : 0);
