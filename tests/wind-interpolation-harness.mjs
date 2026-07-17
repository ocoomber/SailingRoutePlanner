// Guards the wind field against the nearest-neighbour regression.
//
// The field used to snap between grid cells, jumping direction by up to ~120°
// in a single step. That flipped TWA sign mid-passage and made the router fire
// spurious tacks/gybes — the route came out as a tangle. These tests assert the
// field is SMOOTH and that direction interpolation respects the 0/360 wrap.

import { interpolateWind } from '../src/core/wind-interpolation.js';

const T0 = '2026-07-17T12:00:00.000Z';
const T1 = '2026-07-17T13:00:00.000Z';

// 2x2 lattice with a deliberately violent direction contrast across it.
function makeGrid(corners) {
  const points = corners.map(c => ({ lat: c.lat, lon: c.lon }));
  const frame = (time) => ({
    time,
    points: corners.map(c => ({ lat: c.lat, lon: c.lon, speed: c.speed, direction: c.direction }))
  });
  return { grid: [frame(T0), frame(T1)], points };
}

function report(name, description, pass, detail) {
  console.log(`\n=== ${name} ===`);
  console.log(`  ${description}`);
  console.log(pass ? `  PASS: ${detail}` : `  FAIL: ${detail}`);
  return pass;
}

function angleDelta(a, b) {
  return Math.abs(((b - a + 540) % 360) - 180);
}

// The regression itself: walk across the field and assert no step change.
function testFieldIsSmooth() {
  const grid = makeGrid([
    { lat: 50.2, lon: -5.4, speed: 10, direction: 356 },
    { lat: 50.2, lon: -4.9, speed: 10, direction: 356 },
    { lat: 49.7, lon: -5.4, speed: 10, direction: 234 },
    { lat: 49.7, lon: -4.9, speed: 10, direction: 234 }
  ]);

  let maxJump = 0;
  let prev = null;
  for (let i = 0; i <= 100; i++) {
    const lat = 50.2 - (0.5 * i / 100);
    const w = interpolateWind(grid, lat, -5.15, T0);
    if (prev !== null) maxJump = Math.max(maxJump, angleDelta(prev, w.direction));
    prev = w.direction;
  }

  // 122° of shift spread over 100 samples is ~1.2°/step; nearest-neighbour gave
  // one 122° cliff. Anything above a few degrees means the cliff is back.
  const pass = maxJump < 5;
  return report('Wind field is smooth', 'crossing a 356°->234° contrast must not snap',
    pass, `largest single-step direction change ${maxJump.toFixed(1)}° (was ~122° with nearest-neighbour)`);
}

function testMidpointIsBlended() {
  const grid = makeGrid([
    { lat: 50.2, lon: -5.4, speed: 10, direction: 0 },
    { lat: 50.2, lon: -4.9, speed: 10, direction: 0 },
    { lat: 49.7, lon: -5.4, speed: 20, direction: 0 },
    { lat: 49.7, lon: -4.9, speed: 20, direction: 0 }
  ]);
  const mid = interpolateWind(grid, 49.95, -5.15, T0);
  const pass = Math.abs(mid.speed - 15) < 0.5;
  return report('Speed is blended across the lattice', 'halfway between 10kn and 20kn rows',
    pass, `got ${mid.speed.toFixed(2)}kn, expected ~15kn`);
}

// Averaging 350° and 10° must give 0°, never 180°.
function testWrapAroundNorth() {
  const grid = makeGrid([
    { lat: 50.2, lon: -5.4, speed: 10, direction: 350 },
    { lat: 50.2, lon: -4.9, speed: 10, direction: 350 },
    { lat: 49.7, lon: -5.4, speed: 10, direction: 10 },
    { lat: 49.7, lon: -4.9, speed: 10, direction: 10 }
  ]);
  const mid = interpolateWind(grid, 49.95, -5.15, T0);
  const pass = angleDelta(mid.direction, 0) < 2;
  return report('Direction wraps through north', '350° and 10° must average to 0°, not 180°',
    pass, `got ${mid.direction.toFixed(1)}°`);
}

// Opposing light airs should cancel toward calm, not pick a confident direction.
function testOpposingLightAirsCancel() {
  const grid = makeGrid([
    { lat: 50.2, lon: -5.4, speed: 2, direction: 0 },
    { lat: 50.2, lon: -4.9, speed: 2, direction: 0 },
    { lat: 49.7, lon: -5.4, speed: 2, direction: 180 },
    { lat: 49.7, lon: -4.9, speed: 2, direction: 180 }
  ]);
  const mid = interpolateWind(grid, 49.95, -5.15, T0);
  const pass = mid.speed < 0.5;
  return report('Opposing light airs cancel', '2kn from 0° against 2kn from 180°',
    pass, `blended speed ${mid.speed.toFixed(2)}kn (near calm, as it should be)`);
}

function testCornersAreExact() {
  const grid = makeGrid([
    { lat: 50.2, lon: -5.4, speed: 12, direction: 45 },
    { lat: 50.2, lon: -4.9, speed: 8, direction: 90 },
    { lat: 49.7, lon: -5.4, speed: 16, direction: 200 },
    { lat: 49.7, lon: -4.9, speed: 4, direction: 300 }
  ]);
  const checks = [
    [50.2, -5.4, 12, 45], [50.2, -4.9, 8, 90],
    [49.7, -5.4, 16, 200], [49.7, -4.9, 4, 300]
  ];
  let ok = true;
  for (const [lat, lon, speed, dir] of checks) {
    const w = interpolateWind(grid, lat, lon, T0);
    if (Math.abs(w.speed - speed) > 0.01 || angleDelta(w.direction, dir) > 0.01) ok = false;
  }
  return report('Grid corners read back exactly', 'interpolation must not distort the source data',
    ok, ok ? 'all four corners exact' : 'a corner did not round-trip');
}

// A single-point grid (as the comfort harness uses) must still work.
function testSinglePointGrid() {
  const grid = makeGrid([{ lat: 50.0, lon: -3.0, speed: 11, direction: 123 }]);
  const w = interpolateWind(grid, 50.5, -3.5, T0);
  const pass = Math.abs(w.speed - 11) < 0.01 && angleDelta(w.direction, 123) < 0.01;
  return report('Single-point grid still works', 'degenerate lattice must not break',
    pass, `${w.speed.toFixed(1)}kn from ${w.direction.toFixed(0)}°`);
}

// Time must NOT use vector averaging: a forecast frame is a state evolving, not
// a vector to average. Wind veering 350°->10° while building 10kn->20kn passes
// through ~15kn; vector-averaging would sag it to 14.8kn, and a full reversal
// would collapse to a flat calm halfway.
function testTimeStaysPolar() {
  const at = (time) => ({
    time,
    points: [{ lat: 50, lon: -3, speed: time === T0 ? 10 : 20, direction: time === T0 ? 350 : 10 }]
  });
  const grid = { grid: [at(T0), at(T1)], points: [{ lat: 50, lon: -3 }] };
  const mid = interpolateWind(grid, 50, -3, '2026-07-17T12:30:00.000Z');
  const pass = Math.abs(mid.speed - 15) < 0.01 && angleDelta(mid.direction, 0) < 0.01;
  return report('Time interpolation stays polar', '10kn@350° -> 20kn@10° must pass through 15kn@0°',
    pass, `got ${mid.speed.toFixed(2)}kn ${mid.direction.toFixed(1)}° (vector averaging would give 14.8kn/3.4°)`);
}

function testReversingWindDoesNotGoCalmInTime() {
  const at = (time) => ({
    time,
    points: [{ lat: 50, lon: -3, speed: 10, direction: time === T0 ? 0 : 180 }]
  });
  const grid = { grid: [at(T0), at(T1)], points: [{ lat: 50, lon: -3 }] };
  const mid = interpolateWind(grid, 50, -3, '2026-07-17T12:30:00.000Z');
  const pass = Math.abs(mid.speed - 10) < 0.01;
  return report('Reversing wind keeps its strength over time', '10kn backing 0°->180° across an hour',
    pass, `${mid.speed.toFixed(1)}kn at the midpoint (vector averaging would give a false 0kn calm)`);
}

const scenarios = [
  testFieldIsSmooth, testMidpointIsBlended, testWrapAroundNorth,
  testOpposingLightAirsCancel, testCornersAreExact, testSinglePointGrid,
  testTimeStaysPolar, testReversingWindDoesNotGoCalmInTime
];

let passed = 0;
let failed = 0;
for (const scenario of scenarios) {
  if (scenario()) passed++; else failed++;
}

console.log(`\n${passed} passed, ${failed} failed out of ${scenarios.length} wind-interpolation scenarios`);
process.exit(failed > 0 ? 1 : 0);
