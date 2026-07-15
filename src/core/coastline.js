import { segmentsCross, pointInPolygon, distanceNm, interpolatePoint } from './geometry.js';

const CELL_SIZE = 0.1;

export function loadCoastline(data) {
  const grid = {};
  for (const seg of data.segments) {
    const a = seg.a;
    const b = seg.b;
    const cx = Math.floor((a.lon + b.lon) / 2 / CELL_SIZE) * CELL_SIZE;
    const cy = Math.floor((a.lat + b.lat) / 2 / CELL_SIZE) * CELL_SIZE;
    const key = cx.toFixed(3) + ',' + cy.toFixed(3);
    if (!grid[key]) grid[key] = [];
    grid[key].push([a, b]);
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
      const d = distanceNm(point, seg[0]);
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

export function crossesLand(coastline, a, b, startPt, endPt) {
  const dA = nearestNm(a, coastline.grid);
  const dB = nearestNm(b, coastline.grid);

  if (segsCross(coastline.grid, a, b)) {
    if (dA < SAFE_DIST_NM && dB < SAFE_DIST_NM) {
    } else if (startPt && nearestNm(startPt, coastline.grid) < SAFE_DIST_NM && distanceNm(startPt, a) < 1) {
    } else if (endPt && nearestNm(endPt, coastline.grid) < SAFE_DIST_NM && distanceNm(endPt, b) < 1) {
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

  return false;
}
