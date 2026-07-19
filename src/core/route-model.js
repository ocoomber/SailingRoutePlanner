// The rough route a skipper draws by hand, before the wind is read. This is the
// pure data model — no DOM, no Leaflet — so it runs in Node tests and, later, in
// the server for MCP/agent access. The map editor (route-editor.js) owns the
// Leaflet markers; this owns the truth.
//
// Waypoints carry a STABLE id. Annotations (per-waypoint notes, per-leg notes)
// are keyed by that id, never by array index, so inserting or deleting a
// waypoint never re-labels someone else's note. Intent-capture fields (name,
// note, legNotes, history) are all optional: a bare route is just
// format/version/waypoints, so files that don't need the detail stay small.

import { distanceNm, bearing } from './geometry.js';

export const ROUTE_FORMAT = 'srp-route';
export const ROUTE_VERSION = 1;

// Keep autosave and the history from growing without bound. A drag records one
// event on dragend (see route-editor.js), so this is thousands of edits deep.
const MAX_HISTORY = 1000;

let idCounter = 0;
function newId() {
  idCounter += 1;
  return `wp_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export function createRoute(fields = {}) {
  return {
    format: ROUTE_FORMAT,
    version: ROUTE_VERSION,
    name: fields.name ?? null,
    createdAt: fields.createdAt ?? nowIso(),
    updatedAt: fields.updatedAt ?? nowIso(),
    magneticVariationDeg: fields.magneticVariationDeg ?? 0,
    waypoints: [],
    legNotes: {},
    history: []
  };
}

// Append a history event, coalescing a run of moves of the same waypoint into
// one (keep the original `from`, update the `to`) so a nudged-into-place
// waypoint is a single "moved from A to B", not a trail of micro-steps. Capped
// drop-oldest.
function record(route, event) {
  const last = route.history[route.history.length - 1];
  if (event.op === 'move' && last && last.op === 'move' && last.id === event.id) {
    last.to = event.to;
    last.at = event.at;
  } else {
    route.history.push(event);
    if (route.history.length > MAX_HISTORY) route.history.shift();
  }
  route.updatedAt = event.at;
}

export function addWaypoint(route, { lat, lon }) {
  const wp = { id: newId(), lat, lon, name: null, note: null, createdAt: nowIso() };
  route.waypoints.push(wp);
  record(route, { at: wp.createdAt, op: 'add', id: wp.id, to: { lat, lon } });
  return wp;
}

export function insertWaypoint(route, index, { lat, lon }) {
  const wp = { id: newId(), lat, lon, name: null, note: null, createdAt: nowIso() };
  const clamped = Math.max(0, Math.min(index, route.waypoints.length));
  route.waypoints.splice(clamped, 0, wp);
  record(route, { at: wp.createdAt, op: 'insert', id: wp.id, index: clamped, to: { lat, lon } });
  return wp;
}

export function moveWaypoint(route, id, { lat, lon }) {
  const wp = route.waypoints.find(w => w.id === id);
  if (!wp) return null;
  const from = { lat: wp.lat, lon: wp.lon };
  wp.lat = lat;
  wp.lon = lon;
  record(route, { at: nowIso(), op: 'move', id, from, to: { lat, lon } });
  return wp;
}

export function removeWaypoint(route, id) {
  const idx = route.waypoints.findIndex(w => w.id === id);
  if (idx === -1) return false;
  const [removed] = route.waypoints.splice(idx, 1);
  delete route.legNotes[id];
  record(route, { at: nowIso(), op: 'remove', id, from: { lat: removed.lat, lon: removed.lon } });
  return true;
}

export function setWaypointNote(route, id, note) {
  const wp = route.waypoints.find(w => w.id === id);
  if (!wp) return false;
  wp.note = note && note.trim() ? note.trim() : null;
  record(route, { at: nowIso(), op: 'note', id, target: 'waypoint' });
  return true;
}

export function setWaypointName(route, id, name) {
  const wp = route.waypoints.find(w => w.id === id);
  if (!wp) return false;
  wp.name = name && name.trim() ? name.trim() : null;
  route.updatedAt = nowIso();
  return true;
}

// A leg note belongs to the leg leaving a waypoint, so it is keyed by that
// waypoint's id and travels with it. The last waypoint has no outgoing leg.
export function setLegNote(route, fromId, note) {
  if (!route.waypoints.some(w => w.id === fromId)) return false;
  if (note && note.trim()) route.legNotes[fromId] = note.trim();
  else delete route.legNotes[fromId];
  record(route, { at: nowIso(), op: 'note', id: fromId, target: 'leg' });
  return true;
}

export function reverseRoute(route) {
  route.waypoints.reverse();
  route.legNotes = {}; // leg notes no longer map to the same legs; drop rather than mislabel
  record(route, { at: nowIso(), op: 'reverse' });
  return route;
}

export function setMagneticVariation(route, deg) {
  route.magneticVariationDeg = Number.isFinite(deg) ? deg : 0;
  route.updatedAt = nowIso();
}

// Plain [{lat, lon}] for the engine — the seam computeRoughRoute also produces.
export function toWaypoints(route) {
  return route.waypoints.map(w => ({ lat: w.lat, lon: w.lon }));
}

// Per-leg geometry for the route panel. `magneticVariationDeg` is West-positive:
// magnetic = (true + variation) mod 360.
export function routeLegs(route) {
  const legs = [];
  const wps = route.waypoints;
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i], b = wps[i + 1];
    const brgTrue = bearing(a, b);
    legs.push({
      fromId: a.id,
      toId: b.id,
      distanceNm: distanceNm(a, b),
      bearingTrue: brgTrue,
      bearingMag: ((brgTrue + route.magneticVariationDeg) % 360 + 360) % 360,
      note: route.legNotes[a.id] || null
    });
  }
  return legs;
}

export function totalDistanceNm(route) {
  return routeLegs(route).reduce((sum, leg) => sum + leg.distanceNm, 0);
}

// A route with fewer than two waypoints can't be a passage.
export function isPlannable(route) {
  return !!route && Array.isArray(route.waypoints) && route.waypoints.length >= 2;
}

export function serializeRoute(route) {
  return JSON.stringify(route);
}

// Tolerant of unknown/missing fields and of a bare {waypoints:[...]}. Returns
// null when the payload isn't a route of a version we understand, so the caller
// can drop-and-warn rather than crash on a stale or foreign file.
export function deserializeRoute(json) {
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  if (data.format && data.format !== ROUTE_FORMAT) return null;
  if (data.version && data.version > ROUTE_VERSION) return null;
  if (!Array.isArray(data.waypoints)) return null;

  const route = createRoute({
    name: data.name ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    magneticVariationDeg: data.magneticVariationDeg ?? 0
  });
  route.waypoints = data.waypoints
    .filter(w => Number.isFinite(w.lat) && Number.isFinite(w.lon))
    .map(w => ({
      id: w.id || newId(),
      lat: w.lat,
      lon: w.lon,
      name: w.name ?? null,
      note: w.note ?? null,
      createdAt: w.createdAt ?? route.createdAt
    }));
  if (data.legNotes && typeof data.legNotes === 'object') route.legNotes = { ...data.legNotes };
  if (Array.isArray(data.history)) route.history = data.history.slice(-MAX_HISTORY);
  return route;
}
