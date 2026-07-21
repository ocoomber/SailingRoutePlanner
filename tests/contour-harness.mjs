// Exercises the isobar contouring: marching squares on synthetic fields with
// known answers, the bicubic upsampler's exactness at source points, and the
// adaptive 2/4 hPa level chooser.

import { upsampleGrid, contourLines, chooseIsobarLevels, contourField } from '../src/core/contour.js';

function report(name, description, pass, detail) {
  console.log(`\n=== ${name} ===`);
  console.log(`  ${description}`);
  console.log(pass ? `  PASS: ${detail}` : `  FAIL: ${detail}`);
  return pass;
}

// A linear ramp along columns: contours must be straight vertical lines at the
// exact interpolated column, one per level.
function testLinearRamp() {
  const w = 10, h = 8;
  const values = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) values[r * w + c] = c * 10;   // 0..90 across
  }

  const lines = contourLines(values, w, h, 45);
  const oneLine = lines.length === 1;
  let straight = true;
  let colOk = true;
  if (oneLine) {
    for (const [, c] of lines[0]) {
      if (Math.abs(c - 4.5) > 1e-6) { straight = false; colOk = false; }
    }
  }
  const spansRows = oneLine && lines[0].length >= h - 1;
  const pass = oneLine && straight && colOk && spansRows;
  return report('Linear ramp contours straight', 'level 45 on a 0..90 column ramp',
    pass, oneLine
      ? `1 polyline, ${lines[0].length} pts, all at column 4.5: ${straight}`
      : `expected 1 polyline, got ${lines.length}`);
}

// A radial bump: the contour must come back as a single CLOSED loop around the peak.
function testRadialBumpCloses() {
  const w = 20, h = 20;
  const values = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const d = Math.hypot(r - 9.5, c - 9.5);
      values[r * w + c] = 100 - d * d;
    }
  }

  const lines = contourLines(values, w, h, 60);
  const one = lines.length === 1;
  let closed = false;
  if (one) {
    const first = lines[0][0];
    const last = lines[0][lines[0].length - 1];
    closed = Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6;
  }
  return report('Radial bump contour closes', 'level 60 around a radial peak must form one loop',
    one && closed, one ? `1 polyline, closed: ${closed}` : `expected 1 polyline, got ${lines.length}`);
}

// Bicubic upsampling must reproduce the source lattice exactly at source points.
function testUpsampleExactAtSources() {
  const w = 5, h = 4;
  const values = new Float32Array(w * h);
  for (let k = 0; k < values.length; k++) values[k] = Math.sin(k * 1.7) * 50 + 1000;

  const factor = 4;
  const up = upsampleGrid(values, w, h, factor);
  const sizeOk = up.w === (w - 1) * factor + 1 && up.h === (h - 1) * factor + 1;

  let maxErr = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const err = Math.abs(up.values[(r * factor) * up.w + c * factor] - values[r * w + c]);
      maxErr = Math.max(maxErr, err);
    }
  }
  const pass = sizeOk && maxErr < 1e-4;
  return report('Upsample is exact at source points', 'Catmull-Rom must interpolate, not approximate',
    pass, `size ${up.w}x${up.h} (ok: ${sizeOk}), max error at sources ${maxErr.toExponential(2)}`);
}

// Upsampling a linear field must stay linear (no ringing on smooth gradients).
function testUpsampleLinearStaysLinear() {
  const w = 6, h = 6;
  const values = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) values[r * w + c] = 1000 + r * 2 + c * 3;
  }
  const up = upsampleGrid(values, w, h, 5);
  let maxErr = 0;
  for (let i = 0; i < up.h; i++) {
    for (let j = 0; j < up.w; j++) {
      const expected = 1000 + (i / 5) * 2 + (j / 5) * 3;
      maxErr = Math.max(maxErr, Math.abs(up.values[i * up.w + j] - expected));
    }
  }
  const pass = maxErr < 1e-3;
  return report('Upsampled linear field stays linear', 'Catmull-Rom reproduces planes exactly',
    pass, `max deviation ${maxErr.toExponential(2)}`);
}

function testLevelChooser() {
  const narrow = chooseIsobarLevels(1008.3, 1015.9);
  const narrowOk = narrow.length > 0 && narrow.every(v => v % 2 === 0) &&
    narrow[0] >= 1008.3 && narrow[narrow.length - 1] <= 1015.9;

  const wide = chooseIsobarLevels(960, 1040);
  const wideOk = wide.length > 0 && wide.length <= 12 && wide.every(v => v % 4 === 0);

  const pass = narrowOk && wideOk;
  return report('Adaptive isobar levels', 'narrow range gets 2 hPa steps, wide range widens to stay readable',
    pass, `narrow: ${narrow.join(',')} | wide: ${wide.length} lines at step ${wide.length > 1 ? wide[1] - wide[0] : '-'}`);
}

// End-to-end: contourField on a synthetic low should produce labelled loops in
// source-lattice coordinates (0..w-1 range, not upsampled coordinates).
function testContourFieldCoordinates() {
  const w = 12, h = 12;
  const values = new Float32Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const d = Math.hypot(r - 5.5, c - 5.5);
      values[r * w + c] = 990 + d * 3;   // a low centred in the grid
    }
  }

  const contours = contourField(values, w, h, { factor: 6 });
  const some = contours.length > 0;
  let inRange = true;
  for (const { points } of contours) {
    for (const [r, c] of points) {
      if (r < -0.01 || r > h - 0.99 || c < -0.01 || c > w - 0.99) inRange = false;
    }
  }
  const levelsEven = contours.every(k => k.level % 2 === 0);
  const pass = some && inRange && levelsEven;
  return report('contourField maps back to lattice coordinates', 'a 990 hPa low contoured end-to-end',
    pass, `${contours.length} contour lines, coords in range: ${inRange}, even levels: ${levelsEven}`);
}

const scenarios = [
  testLinearRamp, testRadialBumpCloses, testUpsampleExactAtSources,
  testUpsampleLinearStaysLinear, testLevelChooser, testContourFieldCoordinates
];

let passed = 0;
let failed = 0;
for (const scenario of scenarios) {
  if (scenario()) passed++; else failed++;
}

console.log(`\n${passed} passed, ${failed} failed out of ${scenarios.length} contour scenarios`);
process.exit(failed > 0 ? 1 : 0);
