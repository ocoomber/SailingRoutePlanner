// Contouring for the isobar layer: bicubic upsampling of the coarse pressure
// lattice followed by marching squares. Pure functions over plain arrays —
// no DOM, no Leaflet — so the test harness can drive them directly.
//
// Grid convention throughout: row-major values[row * w + col], and contour
// vertices come back as fractional [row, col] coordinates ON THE ORIGINAL
// (pre-upsample) grid, so the caller maps them straight onto the lat/lon axes.

// Catmull-Rom in 1D; the standard bicubic kernel. Bilinear would leave visible
// kinks at every source-cell boundary once the lines are drawn.
function cubic(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

// Out-of-range taps are filled by reflecting through the edge with linear
// extrapolation (v[-1] = 2·v[0] − v[1], etc.) — clamping instead would flatten
// the field at the border and bend contours that should run straight off it.
function gridValue(values, w, h, r, c) {
  if (r < 0) return 2 * gridValue(values, w, h, 0, c) - gridValue(values, w, h, -r, c);
  if (r > h - 1) return 2 * gridValue(values, w, h, h - 1, c) - gridValue(values, w, h, 2 * (h - 1) - r, c);
  if (c < 0) return 2 * values[r * w] - values[r * w + Math.min(-c, w - 1)];
  if (c > w - 1) return 2 * values[r * w + w - 1] - values[r * w + Math.max(2 * (w - 1) - c, 0)];
  return values[r * w + c];
}

function sampleBicubic(values, w, h, fr, fc) {
  const r1 = Math.floor(fr);
  const c1 = Math.floor(fc);
  const tr = fr - r1;
  const tc = fc - c1;

  const col = new Array(4);
  for (let m = -1; m <= 2; m++) {
    const r = r1 + m;
    col[m + 1] = cubic(
      gridValue(values, w, h, r, c1 - 1),
      gridValue(values, w, h, r, c1),
      gridValue(values, w, h, r, c1 + 1),
      gridValue(values, w, h, r, c1 + 2),
      tc
    );
  }
  return cubic(col[0], col[1], col[2], col[3], tr);
}

// Upsample a w×h grid by an integer factor. The output spans the same extent:
// out[(i,j)] = f(i / factor, j / factor) in source coordinates, and source
// points are reproduced exactly at multiples of `factor`.
export function upsampleGrid(values, w, h, factor) {
  const ow = (w - 1) * factor + 1;
  const oh = (h - 1) * factor + 1;
  const out = new Float32Array(ow * oh);
  for (let i = 0; i < oh; i++) {
    const fr = i / factor;
    for (let j = 0; j < ow; j++) {
      out[i * ow + j] = sampleBicubic(values, w, h, fr, j / factor);
    }
  }
  return { values: out, w: ow, h: oh };
}

// Marching squares with linear edge interpolation. Returns an array of
// polylines; each polyline is an array of [row, col] points in the coordinate
// space of the INPUT grid (divide by the upsample factor to get back to the
// source lattice — chooseContours below does this for you).
export function contourLines(values, w, h, level) {
  // Edge key -> interpolated point, so segments join into polylines exactly.
  const segments = [];   // [keyA, keyB, ptA, ptB]
  const pointFor = new Map();

  function edgePoint(r0, c0, r1, c1) {
    const key = `${r0},${c0}|${r1},${c1}`;
    let pt = pointFor.get(key);
    if (!pt) {
      const v0 = values[r0 * w + c0];
      const v1 = values[r1 * w + c1];
      const t = v1 === v0 ? 0.5 : (level - v0) / (v1 - v0);
      pt = [r0 + (r1 - r0) * t, c0 + (c1 - c0) * t];
      pointFor.set(key, pt);
    }
    return { key, pt };
  }

  for (let r = 0; r < h - 1; r++) {
    for (let c = 0; c < w - 1; c++) {
      const tl = values[r * w + c] >= level ? 8 : 0;
      const tr = values[r * w + c + 1] >= level ? 4 : 0;
      const br = values[(r + 1) * w + c + 1] >= level ? 2 : 0;
      const bl = values[(r + 1) * w + c] >= level ? 1 : 0;
      const idx = tl | tr | br | bl;
      if (idx === 0 || idx === 15) continue;

      const top = () => edgePoint(r, c, r, c + 1);
      const right = () => edgePoint(r, c + 1, r + 1, c + 1);
      const bottom = () => edgePoint(r + 1, c, r + 1, c + 1);
      const left = () => edgePoint(r, c, r + 1, c);

      const cases = {
        1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]],
        4: [[top, right]], 5: [[left, top], [bottom, right]], 6: [[top, bottom]],
        7: [[left, top]], 8: [[top, left]], 9: [[top, bottom]],
        10: [[top, right], [left, bottom]], 11: [[top, right]],
        12: [[right, left]], 13: [[right, bottom]], 14: [[bottom, left]]
      };

      for (const [ea, eb] of cases[idx]) {
        const a = ea();
        const b = eb();
        segments.push([a.key, b.key, a.pt, b.pt]);
      }
    }
  }

  return joinSegments(segments);
}

// Chain segments that share edge keys into continuous polylines.
function joinSegments(segments) {
  const byKey = new Map();   // edge key -> list of segment indices
  for (let i = 0; i < segments.length; i++) {
    for (const key of [segments[i][0], segments[i][1]]) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(i);
    }
  }

  const used = new Array(segments.length).fill(false);
  const lines = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const line = [segments[i][2], segments[i][3]];
    const keys = [segments[i][0], segments[i][1]];

    // Extend forward from the tail, then backward from the head.
    for (const end of [1, 0]) {
      let currentKey = keys[end];
      for (;;) {
        const nextIdx = (byKey.get(currentKey) || []).find(s => !used[s]);
        if (nextIdx === undefined) break;
        used[nextIdx] = true;
        const [ka, kb, pa, pb] = segments[nextIdx];
        const [pt, key] = ka === currentKey ? [pb, kb] : [pa, ka];
        if (end === 1) line.push(pt); else line.unshift(pt);
        currentKey = key;
      }
    }
    lines.push(line);
  }

  return lines;
}

// Isobar levels for a pressure range: classic 2 hPa steps, widening to 4 hPa
// when the viewport spans enough pressure that 2 hPa would be a thicket.
export function chooseIsobarLevels(min, max, maxLines = 12) {
  for (const step of [2, 4, 8]) {
    const first = Math.ceil(min / step) * step;
    const levels = [];
    for (let v = first; v <= max; v += step) levels.push(v);
    if (levels.length <= maxLines) return levels;
  }
  return [];
}

// Convenience wrapper used by the isobar layer: upsample, contour every chosen
// level, and rescale vertices back to source-lattice coordinates.
export function contourField(values, w, h, { factor = 6, maxLines = 12 } = {}) {
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < values.length; k++) {
    const v = values[k];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || min === max) return [];

  const up = upsampleGrid(values, w, h, factor);
  const out = [];
  for (const level of chooseIsobarLevels(min, max, maxLines)) {
    for (const line of contourLines(up.values, up.w, up.h, level)) {
      out.push({ level, points: line.map(([r, c]) => [r / factor, c / factor]) });
    }
  }
  return out;
}
