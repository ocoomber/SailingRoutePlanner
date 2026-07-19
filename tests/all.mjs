import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const here = process.cwd();

let totalPassed = 0;
let totalFailed = 0;

function run(label, script) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(60)}\n`);

  const result = spawnSync('node', [join(here, 'tests', script)], {
    cwd: here,
    stdio: 'inherit',
    shell: true
  });

  if (result.status === 0) {
    totalPassed++;
  } else {
    totalFailed++;
  }

  return result.status === 0;
}

const landPassed = run('Land-avoidance tests', 'run.mjs');
const sailingPassed = run('Sailing-performance tests', 'sailing-harness.mjs');
const coastlinePassed = run('Coastline system tests', 'coastline-system.mjs');
const roughRoutePassed = run('Rough-route engine tests', 'rough-route-harness.mjs');
const routeModelPassed = run('Drawn-route model / IO tests', 'route-model-harness.mjs');
const corridorPassed = run('Corridor / along-route cost tests', 'corridor-harness.mjs');
const providedRoutePassed = run('Provided-route seam tests', 'provided-route-harness.mjs');
const windPassed = run('Wind interpolation tests', 'wind-interpolation-harness.mjs');
const comfortPassed = run('Comfort-based sail-config tests', 'comfort-harness.mjs');
const bandPassed = run('Hysteresis band / comfort-ceiling tests', 'comfort-band-harness.mjs');
const apiPassed = run('API server tests', 'api.mjs');

console.log(`\n${'='.repeat(60)}`);
if (totalFailed === 0) {
  console.log(`  ALL TESTS PASSED (${totalPassed}/${totalPassed + totalFailed})`);
} else {
  console.log(`  ${totalPassed} passed, ${totalFailed} failed`);
}
console.log(`${'='.repeat(60)}`);

process.exit(totalFailed > 0 ? 1 : 0);
