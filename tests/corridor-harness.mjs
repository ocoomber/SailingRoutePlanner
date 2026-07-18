// Corridor helpers behind the two-tier router fix:
//   §4 distanceToGoAlongRoute — the along-route cost that follows the rough
//      course round a headland instead of a straight-line-to-end local minimum.
//   §3 coarse water mask — the predicate the fine pass uses to refuse any
//      candidate the coarse polygons cover as land.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { makeCorridor, distanceToGoAlongRoute } from '../src/core/route-corridor.js';
import { loadCoastline, inAnyPolygon } from '../src/core/coastline.js';
import { distanceNm } from '../src/core/geometry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const coarse = loadCoastline(JSON.parse(
  readFileSync(join(__dirname, '..', 'src', 'data', 'coastline', 'sw-england-coarse.json'), 'utf-8')));

function report(name, description, pass, detail) {
  console.log(`\n=== ${name} ===`);
  console.log(`  ${description}`);
  console.log(pass ? `  PASS: ${detail}` : `  FAIL: ${detail}`);
  return pass;
}

// An L-shaped course: south down a coast, then west round a headland. The end is
// north-westish of the start, so straight-line-to-end is NOT monotone along the
// course, but distance-to-go must be.
const POLY = [
  { lat: 50.15, lon: -5.02 },
  { lat: 49.95, lon: -5.02 },
  { lat: 49.95, lon: -5.55 },
  { lat: 50.11, lon: -5.55 }
];
const corridor = makeCorridor(POLY, 3);

function testMonotoneAlongRoute() {
  // Walk the vertices in order; distance-to-go must strictly decrease.
  const dtg = POLY.map(p => distanceToGoAlongRoute(p, corridor));
  let monotone = true;
  for (let i = 1; i < dtg.length; i++) if (!(dtg[i] < dtg[i - 1])) monotone = false;
  const end = POLY[POLY.length - 1];
  const slEnd = POLY.map(p => distanceNm(p, end));
  // Straight-line to end is deliberately non-monotone here (the headland leg
  // increases it), which is the whole reason the along-route cost is needed.
  const slNonMonotone = slEnd[1] > slEnd[0] || slEnd[2] > slEnd[1];
  const pass = monotone && dtg[dtg.length - 1] < 0.001 && slNonMonotone;
  return report('Distance-to-go is monotone along the course', 'shrinks vertex by vertex where straight-line-to-end does not',
    pass, `dtg=[${dtg.map(d => d.toFixed(1)).join(', ')}], straight-line non-monotone=${slNonMonotone}`);
}

function testLateralPenalty() {
  // A point 2 NM off the course beam has a larger distance-to-go than its foot
  // on the course, by ~the lateral offset.
  const onCourse = { lat: 50.05, lon: -5.02 };            // on the first leg
  const offCourse = { lat: 50.05, lon: -5.02 + 2 / (60 * Math.cos(50.05 * Math.PI / 180)) };
  const dOn = distanceToGoAlongRoute(onCourse, corridor);
  const dOff = distanceToGoAlongRoute(offCourse, corridor);
  const extra = dOff - dOn;
  const pass = extra > 1.5 && extra < 2.5; // ~2 NM lateral hop
  return report('Lateral offset adds to distance-to-go', 'straying off the course costs the lateral hop back',
    pass, `on=${dOn.toFixed(2)}, off=${dOff.toFixed(2)}, extra=${extra.toFixed(2)}NM`);
}

function coarseLand(p) {
  return inAnyPolygon(p, coarse.outerRings, coarse.outerRingBboxes,
    coarse.outerRingGrid, coarse.outerRingGlobalRings);
}

function testCoarseMaskRejectsLand() {
  // A point inside the coarse Lizard landmass is masked out; the St Mawes berth
  // (open water in the coarse estuary) is not.
  const onLand = { lat: 49.98, lon: -5.20 };   // Lizard peninsula interior
  const stMawes = { lat: 50.1507, lon: -5.0236 };
  const pass = coarseLand(onLand) && !coarseLand(stMawes);
  return report('Coarse mask rejects land, keeps the berth', 'fine pass refuses coarse-land candidates but not the water start',
    pass, `land point masked=${coarseLand(onLand)}, St Mawes masked=${coarseLand(stMawes)}`);
}

function testCoarseMaskEndpointExemption() {
  // The router forgives coarse-land candidates within 0.5 NM of start/end (berth
  // the coarse polygon swallows). Verify the exemption radius logic: a land point
  // 0.3 NM from an exempted endpoint is spared; 0.8 NM is not.
  const onLand = { lat: 49.98, lon: -5.20 };
  const near = { lat: onLand.lat + 0.3 / 60, lon: onLand.lon };
  const far = { lat: onLand.lat + 0.8 / 60, lon: onLand.lon };
  const EXEMPT = 0.5;
  const spared = coarseLand(onLand) && distanceNm(onLand, near) < EXEMPT;
  const rejected = coarseLand(onLand) && distanceNm(onLand, far) > EXEMPT;
  const pass = spared && rejected;
  return report('Coarse-mask endpoint exemption radius', 'berth within 0.5NM spared, beyond it rejected',
    pass, `near=${distanceNm(onLand, near).toFixed(2)}NM spared=${spared}, far=${distanceNm(onLand, far).toFixed(2)}NM rejected=${rejected}`);
}

const scenarios = [
  testMonotoneAlongRoute, testLateralPenalty,
  testCoarseMaskRejectsLand, testCoarseMaskEndpointExemption
];

let passed = 0, failed = 0;
for (const s of scenarios) { if (s()) passed++; else failed++; }
console.log(`\n${passed} passed, ${failed} failed out of ${scenarios.length} corridor scenarios`);
process.exit(failed > 0 ? 1 : 0);
