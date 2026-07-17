// Targeted tests for the engine-on/engine-off hysteresis band and the
// max-comfort-wind advisory. planConfigurations is pure, so these drive it with
// a synthetic timeline instead of a full passage — the band is asserted exactly,
// with no router or polar interpolation in the way.

import { planConfigurations } from '../src/core/config-planner.js';
import { mergeComfortParams } from '../src/core/comfort-params.js';
import { findUncomfortableLegs } from '../src/core/comfort-warnings.js';
import { buildWarnings } from '../src/core/passage-result.js';

const DEPARTURE = '2026-07-16T12:00:00.000Z';
const START = { lat: 50.0, lon: -3.0 };

// remainingMin is kept far above finalApproachBufferMin so the final-approach
// rule never fires and the band is tested in isolation.
function makeTimeline(steps, tailMin = 400) {
  const t0 = new Date(DEPARTURE).getTime();
  const last = steps[steps.length - 1].minute;
  return steps.map(s => ({
    time: new Date(t0 + s.minute * 60000).toISOString(),
    position: START,
    windSpeed: s.windSpeed,
    windDir: 0,
    bearingToDest: 90,
    remainingMin: (last - s.minute) + tailMin
  }));
}

function stepsBetween(fromMin, toMin, windSpeed, everyMin = 10) {
  const out = [];
  for (let m = fromMin; m < toMin; m += everyMin) out.push({ minute: m, windSpeed });
  return out;
}

function report(name, description, pass, detail) {
  console.log(`\n=== ${name} ===`);
  console.log(`  ${description}`);
  console.log(pass ? `  PASS: ${detail}` : `  FAIL: ${detail}`);
  return pass;
}

// Sailing at 12kn, wind falls to 4.5 (inside the 4-6 band) then to 3.5 (below it).
// Expect: hold sail through 4.5, start the engine only at 3.5.
function testHysteresisBandHoldsThenReleases() {
  const params = mergeComfortParams({});
  const timeline = makeTimeline([
    ...stepsBetween(0, 300, 12),
    ...stepsBetween(300, 400, 4.5),
    ...stepsBetween(400, 520, 3.5)
  ]);

  const { blocks, rejections } = planConfigurations(timeline, params);
  const configs = blocks.map(b => b.config);

  const heldOff = rejections.find(r => r.trigger === 'hysteresis' && r.to === 'motor' && r.windSpeedKn === 4.5);
  const engaged = blocks.find(b => b.config === 'motor' && b.decision && b.decision.windSpeedKn === 3.5);
  const sailed = configs.includes('full');

  const pass = sailed && !!heldOff && !!engaged;
  return report('Hysteresis band holds then releases',
    '12kn sailing -> 4.5kn (in band, keep sailing) -> 3.5kn (below band, engine on)',
    pass,
    `blocks: ${configs.join(' -> ')} | held off at 4.5kn: ${!!heldOff} | engine on at 3.5kn: ${!!engaged}`);
}

// The band must never strand the boat under sail: once wind is below engineOn,
// the engine must engage even though the change was refused earlier.
function testBandDoesNotLatchOut() {
  const params = mergeComfortParams({});
  const timeline = makeTimeline([
    ...stepsBetween(0, 300, 12),
    ...stepsBetween(300, 360, 4.5),
    ...stepsBetween(360, 520, 3.0)
  ]);

  const { blocks } = planConfigurations(timeline, params);
  const lastConfig = blocks[blocks.length - 1].config;
  const pass = lastConfig === 'motor';
  return report('Band does not latch out the engine',
    'a refused motor change at 4.5kn must not block a later one at 3.0kn',
    pass,
    `final block: ${lastConfig} (blocks: ${blocks.map(b => b.config).join(' -> ')})`);
}

// Dropping sail for arrival is standing practice, not a wind decision.
function testFinalApproachBypassesBand() {
  const params = mergeComfortParams({});
  const timeline = makeTimeline([
    ...stepsBetween(0, 300, 12),
    ...stepsBetween(300, 400, 12)
  ], 10); // tail of 10min puts the end inside finalApproachBufferMin (45)

  const { blocks } = planConfigurations(timeline, params);
  const finalApproach = blocks.find(b => b.decision && b.decision.trigger === 'final-approach');
  const pass = !!finalApproach && finalApproach.config === 'motor';
  return report('Final approach bypasses the band',
    '12kn (well above engineOn) but inside the arrival buffer -> motor anyway',
    pass,
    `final-approach motor block present: ${!!finalApproach}`);
}

// maxComfortWindKn is advisory: it warns, it never reroutes.
function testMaxComfortWarnsOnly() {
  const params = mergeComfortParams({});
  const legs = [
    { windSpeed: 12 }, { windSpeed: 28 }, { windSpeed: 31 }, { windSpeed: 10 }
  ];

  const uncomfortable = findUncomfortableLegs(legs, params);
  const warnings = buildWarnings(null, uncomfortable, params);
  const ceilingWarning = warnings.find(w => w.includes('max comfort wind'));

  const pass = uncomfortable.length === 2 &&
    !!ceilingWarning &&
    ceilingWarning.includes('peak 31kn') &&
    ceilingWarning.includes('Routing unchanged');

  return report('Max comfort wind warns only',
    'legs at 28kn and 31kn against a 25kn ceiling',
    pass,
    `${uncomfortable.length} leg(s) flagged | warning: ${ceilingWarning || 'MISSING'}`);
}

function testNoComfortWarningWhenBelowCeiling() {
  const params = mergeComfortParams({});
  const legs = [{ windSpeed: 12 }, { windSpeed: 18 }];
  const uncomfortable = findUncomfortableLegs(legs, params);
  const warnings = buildWarnings(null, uncomfortable, params);
  const pass = uncomfortable.length === 0 && !warnings.some(w => w.includes('max comfort wind'));
  return report('No comfort warning below the ceiling',
    'all legs under 25kn', pass, `${uncomfortable.length} leg(s) flagged`);
}

const scenarios = [
  testHysteresisBandHoldsThenReleases,
  testBandDoesNotLatchOut,
  testFinalApproachBypassesBand,
  testMaxComfortWarnsOnly,
  testNoComfortWarningWhenBelowCeiling
];

let passed = 0;
let failed = 0;
for (const scenario of scenarios) {
  if (scenario()) passed++; else failed++;
}

console.log(`\n${passed} passed, ${failed} failed out of ${scenarios.length} band/comfort scenarios`);
process.exit(failed > 0 ? 1 : 0);
