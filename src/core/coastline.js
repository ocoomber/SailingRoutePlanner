import { segmentsCross, pointInPolygon, distanceNm, pointToSegmentDistNm, interpolatePoint } from './geometry.js';

export const CELL_SIZE = 0.06;

export function buildRingBboxes(rings) {
  return (rings || []).map(ring => {
    let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
    for (const pt of ring) {
      if (pt.lat < south) south = pt.lat;
      if (pt.lat > north) north = pt.lat;
      if (pt.lon < west) west = pt.lon;
      if (pt.lon > east) east = pt.lon;
    }
    return { south, north, west, east };
  });
}

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
  data.outerRingBboxes = buildRingBboxes(data.outerRings);
  buildRingGrid(data);
  return data;
}

// A cell -> ring-index map so containment can scan only the rings near a point
// instead of every ring. Detail-tile coastlines have hundreds of small ring
// pieces; without this, each land test scanned them all. Rings whose bbox spans
// a lot of cells (a big landmass) go in a small "global" list tested every time,
// so they don't bloat the grid.
const RING_GRID_MAX_CELLS = 400;

function buildRingGrid(data) {
  const ringGrid = {};
  const globalRings = [];
  const bboxes = data.outerRingBboxes;

  for (let i = 0; i < bboxes.length; i++) {
    const bb = bboxes[i];
    const cx1 = Math.floor(bb.west / CELL_SIZE), cx2 = Math.floor(bb.east / CELL_SIZE);
    const cy1 = Math.floor(bb.south / CELL_SIZE), cy2 = Math.floor(bb.north / CELL_SIZE);
    if ((cx2 - cx1 + 1) * (cy2 - cy1 + 1) > RING_GRID_MAX_CELLS) {
      globalRings.push(i);
      continue;
    }
    for (let cx = cx1; cx <= cx2; cx++) {
      for (let cy = cy1; cy <= cy2; cy++) {
        const key = (cx * CELL_SIZE).toFixed(3) + ',' + (cy * CELL_SIZE).toFixed(3);
        (ringGrid[key] || (ringGrid[key] = [])).push(i);
      }
    }
  }

  data.outerRingGrid = ringGrid;
  data.outerRingGlobalRings = globalRings;
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

function ringHit(point, rings, bboxes, i) {
  if (bboxes) {
    const b = bboxes[i];
    if (point.lat < b.south || point.lat > b.north ||
        point.lon < b.west || point.lon > b.east) return false;
  }
  return pointInPolygon(point, rings[i]);
}

// Grid-accelerated when a ringGrid is supplied (built by loadCoastline), linear
// otherwise so ad-hoc callers still work.
export function inAnyPolygon(point, rings, bboxes, ringGrid, globalRings) {
  if (!rings) return false;

  if (ringGrid) {
    const cx = Math.floor(point.lon / CELL_SIZE) * CELL_SIZE;
    const cy = Math.floor(point.lat / CELL_SIZE) * CELL_SIZE;
    const candidates = ringGrid[cx.toFixed(3) + ',' + cy.toFixed(3)];
    if (candidates) {
      for (const i of candidates) if (ringHit(point, rings, bboxes, i)) return true;
    }
    if (globalRings) {
      for (const i of globalRings) if (ringHit(point, rings, bboxes, i)) return true;
    }
    return false;
  }

  for (let i = 0; i < rings.length; i++) {
    if (ringHit(point, rings, bboxes, i)) return true;
  }
  return false;
}

function landContains(coastline, point) {
  if (coastline.containsLand) return coastline.containsLand(point);
  return inAnyPolygon(point, coastline.outerRings, coastline.outerRingBboxes,
    coastline.outerRingGrid, coastline.outerRingGlobalRings);
}

const SAFE_DIST_NM = 1;
const BROAD_DIST_NM = 1;
// Near the start/end the clearance margin is waived so the boat can leave and
// enter a harbour (the actual land-crossing tests still apply, so it can't cut
// through land — it just gets to hug the berth). Coastal passages always begin
// and end near land, so this exemption must exist. It is applied for BOTH ends
// during the search (router.js passes start and end).
const ENDPOINT_CLEARANCE_EXEMPT_NM = 0.5;

export function crossesLand(coastline, a, b, startPt, endPt, clearanceMarginNm = 0) {
  const dA = nearestNm(a, coastline.grid);
  const dB = nearestNm(b, coastline.grid);

  if (segsCross(coastline.grid, a, b)) {
    if (startPt && nearestNm(startPt, coastline.grid) < SAFE_DIST_NM && distanceNm(startPt, a) < 1) {
      if (landContains(coastline, b)) return true;
    } else if (endPt && nearestNm(endPt, coastline.grid) < SAFE_DIST_NM && distanceNm(endPt, b) < 1) {
      if (landContains(coastline, b) && dB > SAFE_DIST_NM) return true;
    } else {
      return true;
    }
  }

  if (dA > BROAD_DIST_NM && landContains(coastline, a)) return true;
  if (dB > BROAD_DIST_NM && landContains(coastline, b)) return true;

  const legDist = distanceNm(a, b);
  if (legDist > 2) {
    const steps = Math.ceil(legDist / 2);
    for (let i = 1; i < steps; i++) {
      const mid = interpolatePoint(a, b, i / steps);
      if (nearestNm(mid, coastline.grid) > BROAD_DIST_NM && landContains(coastline, mid)) return true;
    }
  }

  if (clearanceMarginNm > 0) {
    const stepSize = Math.min(clearanceMarginNm / 2, 0.5);
    const nSteps = Math.max(1, Math.ceil(legDist / stepSize));

    for (let i = 0; i <= nSteps; i++) {
      const pt = i === 0 ? a : i === nSteps ? b : interpolatePoint(a, b, i / nSteps);

      if (startPt && distanceNm(pt, startPt) < ENDPOINT_CLEARANCE_EXEMPT_NM) continue;
      if (endPt && distanceNm(pt, endPt) < ENDPOINT_CLEARANCE_EXEMPT_NM) continue;

      if (nearestNm(pt, coastline.grid) < clearanceMarginNm) return true;
    }
  }

  return false;
}
