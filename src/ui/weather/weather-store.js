// Single owner of the viewport weather field and the animation time cursor.
//
// Two kinds of change flow out of here and they deliberately take different
// paths (mirroring the layer registry's "restyle, never rebuild" rule):
//  - a NEW GRID is structural: it goes onto renderState.weatherGrid and through
//    redraw(), so the registry rebuilds the weather layers once;
//  - a TIME CURSOR move is per-frame: subscribers (the canvas layers) repaint
//    in place, and the registry never hears about it.
//
// The grid is also compiled into per-frame Float32Arrays here, because the
// heatmap samples tens of thousands of points per repaint — the string-keyed
// lookups in wind-interpolation.js are fine for a router but not a render loop.
// sampleField() must agree with interpolateWind() (bilinear u/v in space;
// speed lerped linearly in time, direction along the shortest arc) — a test
// harness asserts they match.

let grid = null;          // raw { grid: [{time, points}], points } — interpolateWind-compatible
let field = null;         // compiled typed-array form, see compileField()
let timeCursor = Date.now();

const timeSubs = new Set();
const gridSubs = new Set();
const consumerSubs = new Set();
const consumers = new Set();   // active weather layers (registered in onAdd/onRemove)

export function setGrid(newGrid) {
  grid = newGrid;
  field = newGrid ? compileField(newGrid) : null;
  if (field) {
    timeCursor = clampTime(timeCursor);
  }
  for (const fn of gridSubs) fn(grid);
  for (const fn of timeSubs) fn(timeCursor);
}

export function getGrid() { return grid; }
export function getField() { return field; }
export function getTimeCursor() { return timeCursor; }

export function getTimeRange() {
  if (!field || field.times.length === 0) return null;
  return { start: field.times[0], end: field.times[field.times.length - 1] };
}

export function setTimeCursor(t) {
  const clamped = clampTime(t);
  if (clamped === timeCursor) return;
  timeCursor = clamped;
  for (const fn of timeSubs) fn(timeCursor);
}

function clampTime(t) {
  const range = getTimeRange();
  if (!range) return t;
  return Math.min(Math.max(t, range.start), range.end);
}

export function onTimeCursor(fn) { timeSubs.add(fn); return () => timeSubs.delete(fn); }
export function onGridChange(fn) { gridSubs.add(fn); return () => gridSubs.delete(fn); }
export function onConsumersChange(fn) { consumerSubs.add(fn); return () => consumerSubs.delete(fn); }

// Layers call these from onAdd/onRemove so the weather service knows whether
// anyone is actually looking — no active consumers means no API fetches.
export function addConsumer(id) {
  consumers.add(id);
  for (const fn of consumerSubs) fn(consumers.size);
}

export function removeConsumer(id) {
  consumers.delete(id);
  for (const fn of consumerSubs) fn(consumers.size);
}

export function hasActiveConsumers() { return consumers.size > 0; }

// --- compiled field ---------------------------------------------------------

// Lattice order: lats north->south (rows), lons west->east (cols), value at
// [latIdx * lons.length + lonIdx]. Derived from the points rather than assumed,
// same as wind-interpolation.js.
function compileField(windGrid) {
  const points = windGrid.points || (windGrid.grid[0] && windGrid.grid[0].points) || [];
  const lats = [...new Set(points.map(p => p.lat))].sort((a, b) => b - a);
  const lons = [...new Set(points.map(p => p.lon))].sort((a, b) => a - b);
  const w = lons.length;
  const h = lats.length;

  const cellIndex = new Map();
  points.forEach((p, idx) => cellIndex.set(`${p.lat},${p.lon}`, idx));

  const times = windGrid.grid.map(f => new Date(f.time).getTime());
  const frames = windGrid.grid.map(frame => {
    const u = new Float32Array(w * h);
    const v = new Float32Array(w * h);
    const pressure = new Float32Array(w * h);
    let hasPressure = false;
    for (let i = 0; i < h; i++) {
      for (let j = 0; j < w; j++) {
        const idx = cellIndex.get(`${lats[i]},${lons[j]}`);
        const p = idx !== undefined ? frame.points[idx] : null;
        const k = i * w + j;
        if (p) {
          const r = p.direction * Math.PI / 180;
          u[k] = p.speed * Math.sin(r);
          v[k] = p.speed * Math.cos(r);
          if (Number.isFinite(p.pressure)) { pressure[k] = p.pressure; hasPressure = true; }
        }
      }
    }
    return { u, v, pressure: hasPressure ? pressure : null };
  });

  return { lats, lons, w, h, times, frames };
}

// Fractional index of `value` on an axis, clamped at the edges (the forecast
// is never extrapolated beyond the area it covers).
function axisFrac(axis, value) {
  const n = axis.length;
  if (n === 1) return 0;
  const ascending = axis[n - 1] > axis[0];
  for (let i = 0; i < n - 1; i++) {
    const a = axis[i];
    const b = axis[i + 1];
    const within = ascending ? (value >= a && value <= b) : (value <= a && value >= b);
    if (within) return i + (b === a ? 0 : (value - a) / (b - a));
  }
  const beyondStart = ascending ? value < axis[0] : value > axis[0];
  return beyondStart ? 0 : n - 1;
}

function bilinear(arr, w, h, fi, fj) {
  const i0 = Math.min(Math.floor(fi), h - 1);
  const j0 = Math.min(Math.floor(fj), w - 1);
  const i1 = Math.min(i0 + 1, h - 1);
  const j1 = Math.min(j0 + 1, w - 1);
  const di = fi - i0;
  const dj = fj - j0;
  const top = arr[i0 * w + j0] + (arr[i0 * w + j1] - arr[i0 * w + j0]) * dj;
  const bot = arr[i1 * w + j0] + (arr[i1 * w + j1] - arr[i1 * w + j0]) * dj;
  return top + (bot - top) * di;
}

function timeBracket(times, t) {
  const n = times.length;
  if (n === 1 || t <= times[0]) return { a: 0, b: 0, frac: 0 };
  if (t >= times[n - 1]) return { a: n - 1, b: n - 1, frac: 0 };
  for (let i = 0; i < n - 1; i++) {
    if (t >= times[i] && t <= times[i + 1]) {
      const span = times[i + 1] - times[i];
      return { a: i, b: i + 1, frac: span === 0 ? 0 : (t - times[i]) / span };
    }
  }
  return { a: n - 1, b: n - 1, frac: 0 };
}

// Fast sampler over the compiled field. Returns { speed, direction, pressure }
// (pressure null when the grid has none). Semantics match interpolateWind:
// bilinear on u/v within a frame; between frames speed lerps linearly and
// direction takes the shortest arc.
export function sampleField(lat, lon, t) {
  if (!field) return null;
  const { lats, lons, w, h, times, frames } = field;
  const fi = axisFrac(lats, lat);
  const fj = axisFrac(lons, lon);
  const { a, b, frac } = timeBracket(times, t);

  const fa = frames[a];
  const ua = bilinear(fa.u, w, h, fi, fj);
  const va = bilinear(fa.v, w, h, fi, fj);
  const speedA = Math.hypot(ua, va);
  const dirA = (Math.atan2(ua, va) * 180 / Math.PI + 360) % 360;
  const pressA = fa.pressure ? bilinear(fa.pressure, w, h, fi, fj) : null;

  if (b === a || frac === 0) {
    return { speed: speedA, direction: dirA, pressure: pressA };
  }

  const fb = frames[b];
  const ub = bilinear(fb.u, w, h, fi, fj);
  const vb = bilinear(fb.v, w, h, fi, fj);
  const speedB = Math.hypot(ub, vb);
  const dirB = (Math.atan2(ub, vb) * 180 / Math.PI + 360) % 360;
  const pressB = fb.pressure ? bilinear(fb.pressure, w, h, fi, fj) : null;

  const d = ((dirB - dirA + 540) % 360) - 180;
  return {
    speed: speedA + (speedB - speedA) * frac,
    direction: (dirA + d * frac + 360) % 360,
    pressure: pressA !== null && pressB !== null ? pressA + (pressB - pressA) * frac : pressA
  };
}

// Bulk speed sampler for the heatmap raster: one call fills `out` with the
// speed at every (row lat, col lon) pair. The axis lookups and time bracket
// are hoisted out of the pixel loop, which is what keeps a full-viewport
// repaint comfortably inside a playback frame.
export function sampleSpeedRaster(rowLats, colLons, t, out) {
  if (!field) return null;
  const { lats, lons, w, h, times, frames } = field;
  const { a, b, frac } = timeBracket(times, t);
  const fa = frames[a];
  const fb = frames[b];
  const blend = b !== a && frac > 0;

  const fis = new Float32Array(rowLats.length);
  for (let i = 0; i < rowLats.length; i++) fis[i] = axisFrac(lats, rowLats[i]);
  const fjs = new Float32Array(colLons.length);
  for (let j = 0; j < colLons.length; j++) fjs[j] = axisFrac(lons, colLons[j]);

  let k = 0;
  for (let i = 0; i < rowLats.length; i++) {
    const fi = fis[i];
    for (let j = 0; j < colLons.length; j++, k++) {
      const fj = fjs[j];
      const ua = bilinear(fa.u, w, h, fi, fj);
      const va = bilinear(fa.v, w, h, fi, fj);
      let speed = Math.hypot(ua, va);
      if (blend) {
        const ub = bilinear(fb.u, w, h, fi, fj);
        const vb = bilinear(fb.v, w, h, fi, fj);
        speed += (Math.hypot(ub, vb) - speed) * frac;
      }
      out[k] = speed;
    }
  }
  return out;
}

// Pressure-only view of one moment: the two bracketing frames lerped into a
// scratch array. The isobar layer contours this directly.
export function pressureFieldAt(t) {
  if (!field || !field.frames[0] || !field.frames[0].pressure) return null;
  const { w, h, times, frames } = field;
  const { a, b, frac } = timeBracket(times, t);
  const out = new Float32Array(w * h);
  const pa = frames[a].pressure;
  const pb = frames[b].pressure;
  if (!pa || !pb) return null;
  for (let k = 0; k < out.length; k++) {
    out[k] = pa[k] + (pb[k] - pa[k]) * frac;
  }
  return { values: out, w, h, lats: field.lats, lons: field.lons };
}
