import { segmentsCross, pointInPolygon, distanceNm, pointToSegmentDistNm, interpolatePoint } from './geometry.js';

const CELL_SIZE = 0.06;

export function loadCoastline(data) {
  const grid = {};
  for (const seg of data.segments) {
    const a = seg.a;
    const b = seg.b;

    const minLon = Math.min(a.lon, b.lon);
    const maxLon = Math.max(a.lon, b.lon);
    const minLat = Math.min(a.lat, b.lat);
    const maxLat = Math.max(a.lat, b.lat);

    const cx1 = Math.floor(minLon / CELL_SIZE);
    const cx2 = Math.floor(maxLon / CELL_SIZE);
    const cy1 = Math.floor(minLat / CELL_SIZE);
    const cy2 = Math.floor(maxLat / CELL_SIZE);

    for (let cx = cx1; cx <= cx2; cx++) {
      for (let cy = cy1; cy <= cy2; cy++) {
        const key = (cx * CELL_SIZE).toFixed(3) + ',' + (cy * CELL_SIZE).toFixed(3);
        if (!grid[key]) grid[key] = [];
        grid[key].push([a, b]);
      }
    }
  }
  data.grid = grid;
  return data;
}

function nearCells(pt) {
  const cells = [];
  const cx = Math.floor(pt.lon / CELL_SIZE) * CELL_SIZE;
  const cy = Math.floor(pt.lat / CELL_SIZE) * CELL_SIZE;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      cells.push((cx + dx * CELL_SIZE).toFixed(3) + ',' + (cy + dy * CELL_SIZE).toFixed(3));
    }
  }
  return cells;
}

function nearestNm(point, grid) {
  let min = Infinity;
  for (const key of nearCells(point)) {
    const segs = grid[key];
    if (!segs) continue;
    for (const seg of segs) {
      const d = pointToSegmentDistNm(point, seg[0], seg[1]);
      if (d < min) min = d;
    }
  }
  return min;
}

function segsCross(grid, a, b) {
  const checked = new Set();
  for (const key of nearCells(a)) {
    if (checked.has(key)) continue;
    checked.add(key);
    const segs = grid[key];
    if (!segs) continue;
    for (const seg of segs) {
      if (segmentsCross(a, b, seg[0], seg[1])) return true;
    }
  }
  for (const key of nearCells(b)) {
    if (checked.has(key)) continue;
    const segs = grid[key];
    if (!segs) continue;
    for (const seg of segs) {
      if (segmentsCross(a, b, seg[0], seg[1])) return true;
    }
  }
  const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
  const key = (Math.floor(mid.lon / CELL_SIZE) * CELL_SIZE).toFixed(3) + ',' + (Math.floor(mid.lat / CELL_SIZE) * CELL_SIZE).toFixed(3);
  if (!checked.has(key)) {
    const segs = grid[key];
    if (segs) {
      for (const seg of segs) {
        if (segmentsCross(a, b, seg[0], seg[1])) return true;
      }
    }
  }
  return false;
}

function inAnyPolygon(point, rings) {
  if (!rings) return false;
  for (const ring of rings) {
    if (pointInPolygon(point, ring)) return true;
  }
  return false;
}

const SAFE_DIST_NM = 1;
const BROAD_DIST_NM = 1;

export function crossesLand(coastline, a, b, startPt, endPt, clearanceMarginNm = 0) {
  const dA = nearestNm(a, coastline.grid);
  const dB = nearestNm(b, coastline.grid);

  if (segsCross(coastline.grid, a, b)) {
    if (startPt && nearestNm(startPt, coastline.grid) < SAFE_DIST_NM && distanceNm(startPt, a) < 1) {
      if (inAnyPolygon(b, coastline.outerRings)) return true;
    } else if (endPt && nearestNm(endPt, coastline.grid) < SAFE_DIST_NM && distanceNm(endPt, b) < 1) {
      if (inAnyPolygon(b, coastline.outerRings) && dB > SAFE_DIST_NM) return true;
    } else {
      return true;
    }
  }

  if (dA > BROAD_DIST_NM && inAnyPolygon(a, coastline.outerRings)) return true;
  if (dB > BROAD_DIST_NM && inAnyPolygon(b, coastline.outerRings)) return true;

  const legDist = distanceNm(a, b);
  if (legDist > 2) {
    const steps = Math.ceil(legDist / 2);
    for (let i = 1; i < steps; i++) {
      const mid = interpolatePoint(a, b, i / steps);
      if (nearestNm(mid, coastline.grid) > BROAD_DIST_NM && inAnyPolygon(mid, coastline.outerRings)) return true;
    }
  }

  if (clearanceMarginNm > 0) {
    const stepSize = Math.min(clearanceMarginNm / 2, 0.5);
    const nSteps = Math.max(1, Math.ceil(legDist / stepSize));

    for (let i = 0; i <= nSteps; i++) {
      const pt = i === 0 ? a : i === nSteps ? b : interpolatePoint(a, b, i / nSteps);

      if (startPt && distanceNm(pt, startPt) < 0.1) continue;
      if (endPt && distanceNm(pt, endPt) < 0.1) continue;

      if (nearestNm(pt, coastline.grid) < clearanceMarginNm) return true;
    }
  }

  return false;
}
