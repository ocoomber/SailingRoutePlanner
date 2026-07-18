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

// Walk the WHOLE segment, collecting every grid cell it passes through and
// testing each once. Rough-route edges run 5-15 NM; checking only the cells near
// the endpoints and one midpoint (the old behaviour) left long middle sections
// unexamined, so an edge could cross land in a cell nobody looked at.
function segsCross(grid, a, b) {
  const checked = new Set();
  const dLat = b.lat - a.lat, dLon = b.lon - a.lon;
  const span = Math.max(Math.abs(dLat), Math.abs(dLon));
  const nSteps = Math.max(1, Math.ceil(span / (CELL_SIZE / 2)));

  for (let i = 0; i <= nSteps; i++) {
    const t = i / nSteps;
    const p = { lat: a.lat + dLat * t, lon: a.lon + dLon * t };
    for (const key of nearCells(p)) {
      if (checked.has(key)) continue;
      checked.add(key);
      const segs = grid[key];
      if (!segs) continue;
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
// How far off the berth the *actual land* tests (segment crossing, containment)
// are forgiven — just enough to leave a slip the coarse polygon overhangs. This
// is a run-aground concern, NOT a pilotage one, so it stays small and fixed. The
// separate harbour clearance zone below governs how close to shore the route
// PLANS near port, which the skipper controls.
const ENDPOINT_CLEARANCE_EXEMPT_NM = 0.5;

// The clearance margin is relaxed to `harbourClearanceNm` within this radius of
// the start/end — the pilotage water where the skipper cons the boat and the
// open-water margin can't apply (a berth up an estuary is closer to shore than
// any coastal margin for miles). Defaults to at least the coastal clearance so a
// berth can always be left, but the caller sets it to cover its actual approach.
const DEFAULT_HARBOUR_ZONE_NM = 2;
export function defaultHarbourZoneNm(clearanceMarginNm) {
  // Cover the approaches even when the coastal margin is wide: a berth up an
  // estuary can be a couple of miles from water that holds a big offing.
  return Math.max(DEFAULT_HARBOUR_ZONE_NM, clearanceMarginNm * 2);
}

export function crossesLand(coastline, a, b, startPt, endPt, clearanceMarginNm = 0, harbourClearanceNm = 0, harbourZoneNmParam = null) {
  const dA = nearestNm(a, coastline.grid);
  const dB = nearestNm(b, coastline.grid);

  const legDist = distanceNm(a, b);

  if (segsCross(coastline.grid, a, b)) {
    // The exemption is ONLY a berth-exit/entry hop: forgive a crossing that lies
    // within ENDPOINT_CLEARANCE_EXEMPT_NM of an exempted endpoint, never one in
    // the body of the segment. Trim that stub off each exempted end and re-test —
    // a crossing that survives the trim is real land, not the berth.
    const exemptA = startPt && nearestNm(startPt, coastline.grid) < SAFE_DIST_NM && distanceNm(startPt, a) < 1;
    const exemptB = endPt && nearestNm(endPt, coastline.grid) < SAFE_DIST_NM && distanceNm(endPt, b) < 1;

    if (!exemptA && !exemptB) return true;

    const tA = exemptA && legDist > 0 ? Math.min(ENDPOINT_CLEARANCE_EXEMPT_NM / legDist, 1) : 0;
    const tB = exemptB && legDist > 0 ? Math.min(ENDPOINT_CLEARANCE_EXEMPT_NM / legDist, 1) : 0;
    // tA + tB >= 1 means the trim consumes the whole segment: a pure berth hop.
    if (tA + tB < 1) {
      const a2 = tA > 0 ? interpolatePoint(a, b, tA) : a;
      const b2 = tB > 0 ? interpolatePoint(a, b, 1 - tB) : b;
      if (segsCross(coastline.grid, a2, b2)) return true;
    }
    // The far endpoint sitting inside land is never a berth hop.
    if (exemptA && landContains(coastline, b)) return true;
    if (exemptB && landContains(coastline, b) && dB > SAFE_DIST_NM) return true;
  }

  if (dA > BROAD_DIST_NM && landContains(coastline, a)) return true;
  if (dB > BROAD_DIST_NM && landContains(coastline, b)) return true;

  // Sample the interior for containment so a narrow neck (like the Lizard, which
  // is < 1 NM from coast everywhere) can't slip between samples. No nearest-coast
  // guard: ring-grid containment is cheap and the guard used to skip exactly the
  // narrow necks we need to catch. Points within the berth exemption are skipped.
  if (legDist > 1) {
    const steps = Math.ceil(legDist);
    for (let i = 1; i < steps; i++) {
      const mid = interpolatePoint(a, b, i / steps);
      if (startPt && distanceNm(mid, startPt) < ENDPOINT_CLEARANCE_EXEMPT_NM) continue;
      if (endPt && distanceNm(mid, endPt) < ENDPOINT_CLEARANCE_EXEMPT_NM) continue;
      if (landContains(coastline, mid)) return true;
    }
  }

  // Clearance-margin test. This is pilotage, not run-aground: the actual land
  // tests above already stop the boat crossing land. Near port (within the
  // harbour zone of start/end) a separate, usually much smaller clearance applies
  // — the skipper cons the boat in and out, so the open-water margin must not
  // fence it against its own berth. Everywhere else the full coastal margin holds.
  if (clearanceMarginNm > 0 || harbourClearanceNm > 0) {
    const zone = harbourZoneNmParam != null ? harbourZoneNmParam : defaultHarbourZoneNm(clearanceMarginNm);
    const positiveClrs = [clearanceMarginNm, harbourClearanceNm].filter(c => c > 0);
    const stepSize = Math.min(Math.min(...positiveClrs) / 2, 0.5);
    const nSteps = Math.max(1, Math.ceil(legDist / stepSize));

    for (let i = 0; i <= nSteps; i++) {
      const pt = i === 0 ? a : i === nSteps ? b : interpolatePoint(a, b, i / nSteps);

      const nearHarbour =
        (startPt && distanceNm(pt, startPt) < zone) ||
        (endPt && distanceNm(pt, endPt) < zone);
      const eff = nearHarbour ? harbourClearanceNm : clearanceMarginNm;

      if (eff > 0 && nearestNm(pt, coastline.grid) < eff) return true;
    }
  }

  return false;
}
