// The rough course a skipper draws before reading the wind: a taut string from
// A to B that bends around headlands and never enters a dead-end river.
//
// It is the shortest path across a VISIBILITY GRAPH built on the COARSE land
// polygons (which fill rivers in as land, so the string cannot go up one). Nodes
// are the start, the end, and the coarse-ring corners near the passage, each
// nudged just off the coast into clear water. Two nodes are joined if the water
// between them is clear. Dijkstra then finds the taut string round the headlands.
//
// Deterministic, and exactly one leg when the water is open (fixing the wobble
// the 36-heading isochrone produced). Pure apart from read-only geometry tests.
//
// Slightly over the ~150-line ceiling on purpose: it is one coherent algorithm
// (graph build + Dijkstra + the public API). Splitting it would scatter a single
// idea across files for no reader benefit.

import { crossesLand, inAnyPolygon } from './coastline.js';
import { distanceNm, bearing } from './geometry.js';

const DEG2RAD = Math.PI / 180;
const BBOX_MARGIN_DEG = 0.35;      // ~21NM of slack around the direct line
const MAX_GRAPH_NODES = 300;       // bound on O(N^2) edge tests
const OFFSET_NM_FACTOR = 2;        // push corners this * clearance into the water

function segClear(coastline, a, b, start, end, clearanceNm, harbourClearanceNm, harbourZoneNm) {
  return !crossesLand(coastline, a, b, start, end, clearanceNm, harbourClearanceNm, harbourZoneNm);
}

function corridorBox(a, b) {
  return {
    north: Math.max(a.lat, b.lat) + BBOX_MARGIN_DEG,
    south: Math.min(a.lat, b.lat) - BBOX_MARGIN_DEG,
    east: Math.max(a.lon, b.lon) + BBOX_MARGIN_DEG,
    west: Math.min(a.lon, b.lon) - BBOX_MARGIN_DEG
  };
}

function inBox(p, box) {
  return p.lat >= box.south && p.lat <= box.north && p.lon >= box.west && p.lon <= box.east;
}

// Move a ring corner just off the coast into open water. Tries both sides of the
// edge-bisector and both edge normals, and keeps the first candidate that lands
// outside every land polygon.
function offsetCorner(V, prev, next, coastline, clearanceNm) {
  const cosLat = Math.cos(V.lat * DEG2RAD);
  const nmPerDegLat = 60;
  const d = Math.max(clearanceNm * OFFSET_NM_FACTOR, 0.15);

  const toVec = (p) => {
    const x = (p.lon - V.lon) * cosLat * nmPerDegLat;
    const y = (p.lat - V.lat) * nmPerDegLat;
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  };
  const up = toVec(prev), un = toVec(next);
  const bisector = { x: up.x + un.x, y: up.y + un.y };
  const perp = { x: -(un.y - up.y), y: (un.x - up.x) };

  const dirs = [bisector, { x: -bisector.x, y: -bisector.y }, perp, { x: -perp.x, y: -perp.y }];

  for (const dir of dirs) {
    const len = Math.hypot(dir.x, dir.y);
    if (len < 1e-9) continue;
    const cand = {
      lat: V.lat + (dir.y / len) * d / nmPerDegLat,
      lon: V.lon + (dir.x / len) * d / (nmPerDegLat * cosLat)
    };
    if (!inAnyPolygon(cand, coastline.outerRings, coastline.outerRingBboxes)) return cand;
  }
  return null;
}

function collectNodes(a, b, coastline, clearanceNm) {
  const box = corridorBox(a, b);
  const nodes = [a, b];

  for (const ring of coastline.outerRings || []) {
    if (ring.length < 3) continue;
    for (let i = 0; i < ring.length; i++) {
      const V = ring[i];
      if (!inBox(V, box)) continue;
      const prev = ring[(i - 1 + ring.length) % ring.length];
      const next = ring[(i + 1) % ring.length];
      const off = offsetCorner(V, prev, next, coastline, clearanceNm);
      if (off) nodes.push(off);
    }
  }

  // If the corridor is dense, keep the corners nearest the direct line — they are
  // the ones a taut string would actually round.
  if (nodes.length > MAX_GRAPH_NODES) {
    const rest = nodes.slice(2);
    rest.sort((p, q) => cornerKey(p, a, b) - cornerKey(q, a, b));
    return [a, b, ...rest.slice(0, MAX_GRAPH_NODES - 2)];
  }
  return nodes;
}

function cornerKey(p, a, b) {
  return distanceNm(p, a) + distanceNm(p, b);
}

function dijkstra(nodes, adj, sIdx, eIdx) {
  const dist = new Array(nodes.length).fill(Infinity);
  const prev = new Array(nodes.length).fill(-1);
  const done = new Array(nodes.length).fill(false);
  dist[sIdx] = 0;

  for (let iter = 0; iter < nodes.length; iter++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    }
    if (u === -1) break;
    if (u === eIdx) break;
    done[u] = true;
    for (const { to, w } of adj[u]) {
      if (dist[u] + w < dist[to]) { dist[to] = dist[u] + w; prev[to] = u; }
    }
  }

  if (dist[eIdx] === Infinity) return null;
  const path = [];
  for (let at = eIdx; at !== -1; at = prev[at]) path.unshift(nodes[at]);
  return path;
}

export function computeRoughRoute(start, end, coastline, { clearanceNm = 0.25, harbourClearanceNm = 0, harbourZoneNm = null } = {}) {
  // Fast path: open water needs no graph at all.
  if (!coastline || segClear(coastline, start, end, start, end, clearanceNm, harbourClearanceNm, harbourZoneNm)) {
    return {
      waypoints: [start, end], legCount: 1,
      totalDistanceNm: distanceNm(start, end),
      reachedCleanly: true, crossingLegIndices: [], nodeCount: 2
    };
  }

  const nodes = collectNodes(start, end, coastline, clearanceNm);
  const adj = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (segClear(coastline, nodes[i], nodes[j], start, end, clearanceNm, harbourClearanceNm, harbourZoneNm)) {
        const w = distanceNm(nodes[i], nodes[j]);
        adj[i].push({ to: j, w });
        adj[j].push({ to: i, w });
      }
    }
  }

  const path = dijkstra(nodes, adj, 0, 1);
  const waypoints = path || [start, end];

  const crossings = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (crossesLand(coastline, waypoints[i], waypoints[i + 1], start, end, clearanceNm, harbourClearanceNm, harbourZoneNm)) {
      crossings.push(i);
    }
  }
  const totalDistanceNm = waypoints.reduce(
    (sum, p, i) => i === 0 ? 0 : sum + distanceNm(waypoints[i - 1], p), 0);

  return {
    waypoints,
    legCount: waypoints.length - 1,
    totalDistanceNm,
    reachedCleanly: !!path && crossings.length === 0,
    crossingLegIndices: crossings,
    nodeCount: nodes.length
  };
}

// The skipper-drawn counterpart to computeRoughRoute: the human has already
// chosen the course and the clearance, so we don't generate anything — we just
// assess the given polyline the same way, so the rest of the planner reads it
// identically (same shape as computeRoughRoute's return). Crossings are tested
// at clearance 0: the point of drawing by hand is choosing your own offing, and
// the coarse rings fill rivers in as land, so a margin test would false-positive
// on legitimate harbour approaches. Pass 2 against the fine tiles is the real
// gate on whether the course actually sails.
export function assessProvidedRoute(waypoints, coastline, { clearanceNm = 0 } = {}) {
  const start = waypoints[0];
  const end = waypoints[waypoints.length - 1];
  const crossings = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (coastline && crossesLand(coastline, waypoints[i], waypoints[i + 1], start, end, clearanceNm, 0, null)) {
      crossings.push(i);
    }
  }
  const totalDistanceNm = waypoints.reduce(
    (sum, p, i) => i === 0 ? 0 : sum + distanceNm(waypoints[i - 1], p), 0);
  return {
    waypoints,
    legCount: waypoints.length - 1,
    totalDistanceNm,
    reachedCleanly: crossings.length === 0,
    crossingLegIndices: crossings,
    nodeCount: waypoints.length,
    provided: true
  };
}

// Turn the rough polyline into leg objects the map and trail can render. This is
// the geometry-only ("route-only") view: no wind, no sail config — just the
// course. Shape matches what the router emits so the UI treats them the same.
export function roughRouteToLegs(waypoints, speedKn = 6) {
  const legs = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const distance = distanceNm(a, b);
    legs.push({
      heading: Math.round(bearing(a, b)),
      waypoint: { ...a },
      endWaypoint: { ...b },
      distance,
      duration: speedKn > 0 ? distance / speedKn : 0,
      sog: speedKn,
      windAngle: 0,
      windSpeed: 0,
      windDir: 0,
      windDescription: 'rough course (no wind applied)',
      maneuver: null,
      tackSide: null,
      config: null
    });
  }
  return legs;
}
