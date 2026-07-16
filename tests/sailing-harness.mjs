import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { calculateRoute, simplifyLegs } from '../src/core/router.js';
import { loadPolars } from '../src/core/polar.js';
import { loadCoastline } from '../src/core/coastline.js';
import { analyzeRoute } from '../src/core/decision-logger.js';
import { narrateRoute } from '../src/core/explain.js';
import { interpolateWind } from '../src/core/wind-interpolation.js';
import { distanceNm } from '../src/core/geometry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '..', 'src', 'data', 'test-fixtures');

const polarsPath = join(__dirname, '..', 'src', 'data', 'polars', 'oceanis393.json');
const scenariosPath = join(FIXTURE_DIR, 'scenarios.json');

const polars = loadPolars(JSON.parse(readFileSync(polarsPath, 'utf-8')));
const scenarios = JSON.parse(readFileSync(scenariosPath, 'utf-8'));

function loadWindFixture(name) {
  const path = join(FIXTURE_DIR, name);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

async function runScenario(sc) {
  const windGrid = loadWindFixture(sc.windFixture);
  if (!windGrid) {
    console.log(`FAIL: ${sc.name} — missing wind fixture: ${sc.windFixture}`);
    return { pass: false };
  }

  const t0 = Date.now();

  const tide = sc.tide ? [sc.tide] : null;

  const result = await calculateRoute({
    start: sc.start,
    end: sc.end,
    departureTime: new Date('2026-07-16T12:00:00Z').toISOString(),
    coastline: { segments: [], outerRings: [], innerRings: [], grid: {} },
    timeStepMinutes: 30,
    headingThreshold: 15,
    polars,
    windGrid,
    tidalCurrent: tide,
    headingsPerStep: 18,
    maxSteps: 100
  });

  const elapsed = Date.now() - t0;
  const hasRoute = result.route !== null && result.route.length > 0;

  if (sc.expectRoute && !hasRoute) {
    console.log(`FAIL [${elapsed}ms]: ${sc.name}`);
    console.log(`  Expected route, got null`);
    console.log(`  ${sc.description}`);
    return { pass: false };
  }

  if (!hasRoute) {
    console.log(`SKIP [${elapsed}ms]: ${sc.name} — no route found`);
    console.log(`  ${sc.description}`);
    return { pass: true };
  }

  const rawNodes = result.rawNodes;
  const decisions = analyzeRoute(rawNodes, sc.end, polars);

  if (sc.expectTack === true) {
    const hasManeuver = result.route.some(leg => leg.maneuver === 'tack' || leg.maneuver === 'gybe');
    if (!hasManeuver) {
      console.log(`FAIL [${elapsed}ms]: ${sc.name}`);
      console.log(`  Expected tack/gybe, route sailed direct`);
      console.log(`  ${sc.description}`);
      console.log(`  Legs: ${result.route.length}`);
      for (const leg of result.route) {
        console.log(`    ${leg.heading}°T ${leg.sog.toFixed(1)}kn ${leg.windDescription}${leg.maneuver ? ` -> ${leg.maneuver}` : ''}`);
      }
      return { pass: false };
    }
  }

  if (sc.expectTack === false) {
    const hasManeuver = result.route.some(leg => leg.maneuver !== null);
    if (hasManeuver) {
      console.log(`FAIL [${elapsed}ms]: ${sc.name}`);
      console.log(`  Expected no tack, but route has maneuvers`);
      console.log(`  ${sc.description}`);
      return { pass: false };
    }
  }

  const lastLeg = result.route[result.route.length - 1];
  const endGap = distanceNm(lastLeg.endWaypoint, sc.end);
  if (endGap > 0.05) {
    console.log(`FAIL [${elapsed}ms]: ${sc.name}`);
    console.log(`  Final leg endWaypoint ${endGap.toFixed(3)}NM from destination, expected <= 0.05NM (exact final leg)`);
    return { pass: false };
  }

  console.log(`\n=== ${sc.name} [${elapsed}ms] ===`);
  console.log(`  ${sc.description}`);
  console.log(narrateRoute(rawNodes, result.route, decisions));
  const totalDist = result.route.reduce((s, l) => s + l.distance, 0);
  console.log(`  Result: ${result.route.length} leg${result.route.length > 1 ? 's' : ''} over ${totalDist.toFixed(1)}NM`);
  return { pass: true };
}

async function testNoFalseManeuver() {
  const path = [
    { heading: null, twa: 0, windDir: 136, windSpeed: 14, point: { lat: 50.0, lon: -3.5 }, time: '2026-07-16T12:00:00.000Z', sog: 0, distToEnd: 50 },
    { heading: 230, twa: 94, windDir: 136, windSpeed: 14, point: { lat: 50.04, lon: -3.48 }, time: '2026-07-16T12:30:00.000Z', sog: 6.5, distToEnd: 48 },
    { heading: 230, twa: 94, windDir: 136, windSpeed: 14, point: { lat: 50.08, lon: -3.46 }, time: '2026-07-16T13:00:00.000Z', sog: 6.5, distToEnd: 46 },
    { heading: 230, twa: 94, windDir: 136, windSpeed: 14, point: { lat: 50.12, lon: -3.44 }, time: '2026-07-16T13:30:00.000Z', sog: 6.5, distToEnd: 44 },
    { heading: 200, twa: 64, windDir: 136, windSpeed: 14, point: { lat: 50.16, lon: -3.42 }, time: '2026-07-16T14:00:00.000Z', sog: 6.5, distToEnd: 42 },
    { heading: 200, twa: 64, windDir: 136, windSpeed: 14, point: { lat: 50.20, lon: -3.40 }, time: '2026-07-16T14:30:00.000Z', sog: 6.5, distToEnd: 40 },
  ];

  const legs = simplifyLegs(path, 15);

  const hasManeuver = legs.some(leg => leg.maneuver !== null);
  let pass = true;

  if (hasManeuver) {
    console.log(`\n=== Reported-case test ===`);
    console.log(`  FAIL: false maneuver detected (TWA sign +94→+64 both port)`);
    for (const leg of legs) {
      console.log(`  ${leg.heading}°T wind ${leg.windDir}° TWA ${leg.windAngle}° ${leg.tackSide} ${leg.maneuver || ''}`);
    }
    pass = false;
  }

  if (legs.length >= 2) {
    if (legs[0].windDir !== 136) {
      if (!hasManeuver) console.log(`\n=== Reported-case test ===`);
      console.log(`  FAIL: Leg 1 windDir=${legs[0].windDir}, expected 136 — totalWindDir accumulation bug`);
      pass = false;
    }
    if (legs[1].windDir !== 136) {
      if (!hasManeuver) console.log(`\n=== Reported-case test ===`);
      console.log(`  FAIL: Leg 2 windDir=${legs[1].windDir}, expected 136 — same bug`);
      pass = false;
    }
  }

  if (pass) {
    console.log(`\n=== Reported-case [same-tack heading change] ===`);
    console.log(`  PASS: TWA sign consistent, no maneuver, windDir correct per leg`);
  }

  return pass;
}

async function testCircularWindMean() {
  const path = [
    { heading: null, twa: 0, windDir: 350, windSpeed: 14, point: { lat: 50.0, lon: -3.5 }, time: '2026-07-16T12:00:00.000Z', sog: 0, distToEnd: 50 },
    { heading: 230, twa: 94, windDir: 350, windSpeed: 14, point: { lat: 50.04, lon: -3.48 }, time: '2026-07-16T12:30:00.000Z', sog: 6.5, distToEnd: 48 },
    { heading: 230, twa: 94, windDir: 10, windSpeed: 14, point: { lat: 50.08, lon: -3.46 }, time: '2026-07-16T13:00:00.000Z', sog: 6.5, distToEnd: 46 },
  ];

  const legs = simplifyLegs(path, 15);
  const pass = legs.length === 1 && Math.abs(normalizeSigned(legs[0].windDir)) < 1;

  console.log(`\n=== Circular mean wind direction ===`);
  if (pass) {
    console.log(`  PASS: windDir ${legs[0].windDir}° (350°/10° averages to ~0°, not ~180°)`);
  } else {
    console.log(`  FAIL: windDir ${legs[0] ? legs[0].windDir : 'n/a'}°, expected ~0°`);
  }
  return pass;
}

function normalizeSigned(deg) {
  return ((deg + 180) % 360 + 360) % 360 - 180;
}

function testWindTimeInterpolation() {
  const windGrid = {
    grid: [
      { time: '2026-07-16T12:00:00.000Z', points: [{ lat: 50, lon: -3, speed: 10, direction: 350 }] },
      { time: '2026-07-16T13:00:00.000Z', points: [{ lat: 50, lon: -3, speed: 20, direction: 10 }] }
    ]
  };

  const wind = interpolateWind(windGrid, 50, -3, '2026-07-16T12:30:00.000Z');
  const pass = Math.abs(wind.speed - 15) < 0.01 && Math.abs(normalizeSigned(wind.direction)) < 0.01;

  console.log(`\n=== Wind time interpolation ===`);
  if (pass) {
    console.log(`  PASS: :30 query -> ${wind.speed.toFixed(1)}kn ${wind.direction.toFixed(1)}° (expected 15kn/0°)`);
  } else {
    console.log(`  FAIL: :30 query -> ${wind.speed.toFixed(1)}kn ${wind.direction.toFixed(1)}° (expected 15kn/0°)`);
  }
  return pass;
}

let passed = 0;
let failed = 0;

for (const sc of scenarios) {
  const { pass } = await runScenario(sc);
  if (pass) passed++; else failed++;
}

const edgePass = await testNoFalseManeuver();
if (edgePass) passed++; else failed++;

const circularMeanPass = await testCircularWindMean();
if (circularMeanPass) passed++; else failed++;

const windInterpPass = testWindTimeInterpolation();
if (windInterpPass) passed++; else failed++;

console.log(`\n${passed} passed, ${failed} failed out of ${scenarios.length + 3} tests (${scenarios.length} scenarios + 3 edge cases)`);
process.exit(failed > 0 ? 1 : 0);
