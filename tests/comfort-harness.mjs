import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { planPassage } from '../src/core/passage-planner.js';
import { loadPolars } from '../src/core/polar.js';
import { destination } from '../src/core/geometry.js';
import { mergeComfortParams } from '../src/core/comfort-params.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const polarsPath = join(__dirname, '..', 'src', 'data', 'polars', 'oceanis393.json');
const basePolars = loadPolars(JSON.parse(readFileSync(polarsPath, 'utf-8')));

const EMPTY_COASTLINE = { segments: [], outerRings: [], innerRings: [], grid: {} };
const START = { lat: 50.0, lon: -3.0 };
const DEPARTURE = '2026-07-16T12:00:00.000Z';

function makeWindGrid(totalHours, stepMinutes, windFn) {
  const grid = [];
  const t0 = new Date(DEPARTURE).getTime();
  for (let m = 0; m <= totalHours * 60; m += stepMinutes) {
    const w = windFn(m);
    grid.push({ time: new Date(t0 + m * 60000).toISOString(), points: [{ lat: 50.0, lon: -3.0, speed: w.speed, direction: w.direction }] });
  }
  return { grid, points: [{ lat: 50.0, lon: -3.0 }] };
}

async function runPassage(end, windGrid, comfortOverrides, routerOpts) {
  return planPassage({
    start: START, end, departureTime: DEPARTURE, basePolars, windGrid,
    comfortParams: comfortOverrides,
    coastlineCoarse: EMPTY_COASTLINE,
    getFineCoastline: async () => EMPTY_COASTLINE,
    routerOpts: { headingsPerStep: 18, maxSteps: 300, ...routerOpts }
  });
}

function report(name, description, pass, detail, result) {
  console.log(`\n=== ${name} ===`);
  console.log(`  ${description}`);
  console.log(pass ? `  PASS: ${detail}` : `  FAIL: ${detail}`);
  if (result) console.log(result.narration.split('\n').slice(0, 6).join('\n'));
  return pass;
}

async function testLightAirShortHop() {
  const end = destination(START, 90, 5);
  const windGrid = makeWindGrid(1, 15, () => ({ speed: 3, direction: 0 }));
  const result = await runPassage(end, windGrid, {});
  const pass = result.configBlocks.length === 1 && result.configBlocks[0].config === 'motor';
  return report('Light-air short hop', '3kn wind, 5NM passage', pass,
    `single motor block, ${result.configBlocks.length} block(s), ${result.decisions.filter(d => d.kind === 'config').length} config decisions`, result);
}

async function testLongBeamReach() {
  const end = destination(START, 90, 30);
  const windGrid = makeWindGrid(6, 15, () => ({ speed: 15, direction: 0 }));
  const result = await runPassage(end, windGrid, {});
  const configs = result.configBlocks.map(b => b.config);
  const hoisted = result.configBlocks.find(b => (b.config === 'full' || b.config === 'headsail') && b.decision && b.decision.accepted);
  // In a steady 15kn the boat sails from the off (an accepted hoist decision at
  // departure) and motors only for the final approach. There is no leading motor
  // block — that used to appear only because the old coarse pass seeded the
  // timeline with a windSpeed:0 root node.
  const pass = configs.some(c => c === 'full' || c === 'headsail') &&
    configs[configs.length - 1] === 'motor' &&
    hoisted && hoisted.decision.windowMin >= hoisted.decision.thresholdMin;
  return report('Long beam reach', '15kn abeam, 30NM (sails from the off, motors in)', pass, `blocks: ${configs.join(' -> ')}`, result);
}

async function testShortWindWindow() {
  const end = destination(START, 90, 12);
  const windGrid = makeWindGrid(2, 5, m => (m >= 20 && m < 40 ? { speed: 8, direction: 0 } : { speed: 3, direction: 0 }));
  const result = await runPassage(end, windGrid, {}, { timeStepMinutes: 10 });
  const configs = result.configBlocks.map(b => b.config);
  const rejection = result.decisions.find(d => d.kind === 'config' && !d.accepted && d.to === 'headsail');
  const pass = configs.every(c => c === 'motor') && rejection && Math.abs(rejection.windowMin - 20) <= 5;
  return report('Short wind window', '8kn for 20min, else 3kn', pass,
    `all-motor: ${configs.every(c => c === 'motor')}, rejection windowMin=${rejection ? rejection.windowMin.toFixed(0) : 'none'}`, result);
}

async function testFinalApproachOverride() {
  const end = destination(START, 90, 25);
  const windGrid = makeWindGrid(6, 15, () => ({ speed: 15, direction: 0 }));
  const result = await runPassage(end, windGrid, {});
  const lastBlock = result.configBlocks[result.configBlocks.length - 1];
  const finalApproachDecision = result.decisions.find(d => d.kind === 'config' && d.trigger === 'final-approach');
  const params = mergeComfortParams({});
  const startedWithinBuffer = finalApproachDecision && finalApproachDecision.windowMin <= params.finalApproachBufferMin + 1;
  const pass = lastBlock.config === 'motor' && !!finalApproachDecision && startedWithinBuffer;
  return report('Final approach override', '15kn throughout, 20NM', pass,
    `last block ${lastBlock.config}, final-approach decision present: ${!!finalApproachDecision}`, result);
}

async function testSoloDownwindHoist() {
  const end = destination(START, 0, 60);
  const windGrid = makeWindGrid(10, 15, m => (m < 260 ? { speed: 12, direction: 180 } : { speed: 3, direction: 180 }));

  const soloResult = await runPassage(end, windGrid, { soloSailing: true });
  const soloRejected = soloResult.decisions.find(d => d.kind === 'config' && d.to === 'full' && !d.accepted);

  const crewedResult = await runPassage(end, windGrid, { soloSailing: false });
  const crewedAccepted = crewedResult.configBlocks.some(b => b.config === 'full' && b.decision && b.decision.accepted);

  const pass = !!soloRejected && crewedAccepted;
  return report('Solo downwind hoist', '12kn dead astern, window between solo/non-solo thresholds', pass,
    `solo rejected: ${!!soloRejected}, crewed accepted: ${crewedAccepted}`, crewedResult);
}

async function testReefTrigger() {
  const end = destination(START, 90, 25);
  const windGrid = makeWindGrid(5, 15, () => ({ speed: 22, direction: 0 }));
  const result = await runPassage(end, windGrid, {});
  const configs = result.configBlocks.map(b => b.config);
  const pass = configs.includes('reefed') && !configs.includes('full');
  return report('Reef trigger', '22kn sustained', pass, `blocks: ${configs.join(' -> ')}`, result);
}

const scenarios = [
  testLightAirShortHop, testLongBeamReach, testShortWindWindow,
  testFinalApproachOverride, testSoloDownwindHoist, testReefTrigger
];

let passed = 0;
let failed = 0;

for (const scenario of scenarios) {
  const pass = await scenario();
  if (pass) passed++; else failed++;
}

console.log(`\n${passed} passed, ${failed} failed out of ${scenarios.length} comfort scenarios`);
process.exit(failed > 0 ? 1 : 0);
