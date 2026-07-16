import { readFileSync } from 'fs';
import { loadCoastline, crossesLand } from '../src/core/coastline.js';
import { calculateRoute } from '../src/core/router.js';
import { distanceNm, pointToSegmentDistNm } from '../src/core/geometry.js';

const coastline = loadCoastline(JSON.parse(readFileSync('src/data/coastlines/sw-england.json', 'utf-8')));
const testRoutes = JSON.parse(readFileSync('src/data/test-routes.json', 'utf-8'));

function nearestNmOutside(point, grid) {
  let min = Infinity;
  const CELL_SIZE = 0.1;
  const cx = Math.floor(point.lon / CELL_SIZE) * CELL_SIZE;
  const cy = Math.floor(point.lat / CELL_SIZE) * CELL_SIZE;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = (cx + dx * CELL_SIZE).toFixed(3) + ',' + (cy + dy * CELL_SIZE).toFixed(3);
      const segs = grid[key];
      if (!segs) continue;
      for (const seg of segs) {
        const d = pointToSegmentDistNm(point, seg[0], seg[1]);
        if (d < min) min = d;
      }
    }
  }
  return min;
}

function validateNodes(nodes, start, end, clearanceMarginNm) {
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i].point;
    const b = nodes[i + 1].point;
    if (crossesLand(coastline, a, b, start, end)) {
      return { crossed: true, index: i, from: a, to: b };
    }
  }
  if (clearanceMarginNm > 0) {
    for (let i = 1; i < nodes.length - 1; i++) {
      const d = nearestNmOutside(nodes[i].point, coastline.grid);
      if (d < clearanceMarginNm - 0.01) {
        return { clearanceViolation: true, index: i, point: nodes[i].point, dist: d };
      }
    }
  }
  return { crossed: false };
}

let passed = 0;
let failed = 0;

for (const tc of testRoutes) {
  const t0 = Date.now();

  const result = await calculateRoute({
    start: tc.start,
    end: tc.end,
    departureTime: new Date('2026-07-15T12:00:00Z').toISOString(),
    coastline,
    timeStepMinutes: 30,
    headingThreshold: 15,
    constantSpeedKn: 6,
    headingsPerStep: tc.headingsPerStep || 18,
    maxSteps: tc.maxSteps || 80,
    clearanceMarginNm: tc.clearanceMarginNm || 0
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

  const check = validateNodes(result.rawNodes, tc.start, tc.end, tc.clearanceMarginNm || 0);

  if (check.crossed) {
    console.log(`FAIL [${elapsed}ms]: ${tc.name}`);
    console.log(`  Step ${check.index} → ${check.index + 1} crosses land:`);
    console.log(`    from ${check.from.lat.toFixed(4)},${check.from.lon.toFixed(4)}`);
    console.log(`    to   ${check.to.lat.toFixed(4)},${check.to.lon.toFixed(4)}`);
    failed++;
  } else if (check.clearanceViolation) {
    console.log(`FAIL [${elapsed}ms]: ${tc.name}`);
    console.log(`  Node ${check.index} is ${check.dist.toFixed(3)}NM from coast (< ${tc.clearanceMarginNm}NM clearance):`);
    console.log(`    ${check.point.lat.toFixed(4)},${check.point.lon.toFixed(4)}`);
    failed++;
  } else {
    console.log(`PASS [${elapsed}ms]: ${tc.name}`);
    passed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed out of ${testRoutes.length}`);
process.exit(failed > 0 ? 1 : 0);
