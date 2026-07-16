import { readFileSync } from 'fs';
import { loadCoastline, crossesLand } from '../src/core/coastline.js';
import { calculateRoute } from '../src/core/router.js';

const coastline = loadCoastline(JSON.parse(readFileSync('src/data/coastlines/sw-england.json', 'utf-8')));
const testRoutes = JSON.parse(readFileSync('src/data/test-routes.json', 'utf-8'));

function validateNodes(nodes, start, end) {
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i].point;
    const b = nodes[i + 1].point;
    if (crossesLand(coastline, a, b, start, end)) {
      return { crossed: true, index: i, from: a, to: b };
    }
  }
  return { crossed: false };
}

let passed = 0;
let failed = 0;

for (const tc of testRoutes) {
  const t0 = Date.now();

  const result = calculateRoute({
    start: tc.start,
    end: tc.end,
    departureTime: new Date('2026-07-15T12:00:00Z').toISOString(),
    coastline,
    timeStepMinutes: 30,
    headingThreshold: 15,
    constantSpeedKn: 6,
    headingsPerStep: tc.headingsPerStep || 18,
    maxSteps: tc.maxSteps || 80
  });

  const elapsed = Date.now() - t0;
  const hasRoute = result.rawNodes !== null && result.rawNodes.length > 1;

  if (tc.expectRoute === true && !hasRoute) {
    console.log(`FAIL [${elapsed}ms]: ${tc.name}`);
    console.log(`  Expected route, got null`);
    console.log(`  ${tc.description}`);
    failed++;
    continue;
  }

  if (tc.expectRoute === false && hasRoute) {
    console.log(`FAIL [${elapsed}ms]: ${tc.name}`);
    console.log(`  Expected no route, but got ${result.rawNodes.length} nodes`);
    console.log(`  ${tc.description}`);
    failed++;
    continue;
  }

  if (tc.expectRoute === false && !hasRoute) {
    console.log(`PASS [${elapsed}ms]: ${tc.name}`);
    passed++;
    continue;
  }

  if (!hasRoute) {
    console.log(`PASS [${elapsed}ms]: ${tc.name}`);
    console.log(`  No route found (acceptable — algorithm could not find safe path)`);
    passed++;
    continue;
  }

  const check = validateNodes(result.rawNodes, tc.start, tc.end);

  if (check.crossed) {
    console.log(`FAIL [${elapsed}ms]: ${tc.name}`);
    console.log(`  Step ${check.index} → ${check.index + 1} crosses land:`);
    console.log(`    from ${check.from.lat.toFixed(4)},${check.from.lon.toFixed(4)}`);
    console.log(`    to   ${check.to.lat.toFixed(4)},${check.to.lon.toFixed(4)}`);
    failed++;
  } else {
    console.log(`PASS [${elapsed}ms]: ${tc.name}`);
    passed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed out of ${testRoutes.length}`);
process.exit(failed > 0 ? 1 : 0);
