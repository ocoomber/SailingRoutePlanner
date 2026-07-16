import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { calculateRoute } from '../src/core/router.js';
import { loadPolars } from '../src/core/polar.js';
import { loadCoastline } from '../src/core/coastline.js';
import { analyzeRoute } from '../src/core/decision-logger.js';
import { narrateRoute } from '../src/core/explain.js';

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

  console.log(`\n=== ${sc.name} [${elapsed}ms] ===`);
  console.log(`  ${sc.description}`);
  console.log(narrateRoute(rawNodes, result.route, decisions));
  const totalDist = result.route.reduce((s, l) => s + l.distance, 0);
  console.log(`  Result: ${result.route.length} leg${result.route.length > 1 ? 's' : ''} over ${totalDist.toFixed(1)}NM`);
  return { pass: true };
}

let passed = 0;
let failed = 0;

for (const sc of scenarios) {
  const { pass } = await runScenario(sc);
  if (pass) passed++; else failed++;
}

console.log(`\n${passed} passed, ${failed} failed out of ${scenarios.length} scenarios`);
process.exit(failed > 0 ? 1 : 0);
