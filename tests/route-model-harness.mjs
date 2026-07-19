// The drawn-route data model and its interchange formats. Covers id-stable
// annotations across renumbering, history coalescing/cap, serialize round-trip,
// and GPX/CSV round-trips (including against the tools/ GPX parser).

import {
  createRoute, addWaypoint, insertWaypoint, moveWaypoint, removeWaypoint,
  setWaypointNote, setLegNote, reverseRoute, toWaypoints, routeLegs,
  totalDistanceNm, isPlannable, serializeRoute, deserializeRoute
} from '../src/core/route-model.js';
import { routeToGpx, gpxToRoute, routeToCsv, csvToRoute } from '../src/core/route-io.js';

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name} ${detail}`); }
}

// A three-waypoint route for reuse.
function sample() {
  const r = createRoute({ name: 'Plymouth → Fowey' });
  addWaypoint(r, { lat: 50.36, lon: -4.13 });
  addWaypoint(r, { lat: 50.31, lon: -4.30 });
  addWaypoint(r, { lat: 50.33, lon: -4.63 });
  return r;
}

// --- annotations survive insert/delete (keyed by id, not index) ---
(function () {
  const r = sample();
  const midId = r.waypoints[1].id;
  setWaypointNote(r, midId, 'clear the overfalls');
  insertWaypoint(r, 1, { lat: 50.34, lon: -4.20 }); // shifts mid to index 2
  const mid = r.waypoints.find(w => w.id === midId);
  check('note follows waypoint across insert', mid && mid.note === 'clear the overfalls',
    `note=${mid && mid.note}, index=${r.waypoints.indexOf(mid)}`);
  removeWaypoint(r, r.waypoints[0].id);
  const still = r.waypoints.find(w => w.id === midId);
  check('note survives a delete elsewhere', still && still.note === 'clear the overfalls');
})();

// --- leg note travels with its from-waypoint and drops on removal ---
(function () {
  const r = sample();
  const fromId = r.waypoints[0].id;
  setLegNote(r, fromId, 'cross the TSS at right angles');
  check('leg note appears on its leg', routeLegs(r)[0].note === 'cross the TSS at right angles');
  removeWaypoint(r, fromId);
  check('leg note removed with its waypoint', r.legNotes[fromId] === undefined);
})();

// --- history coalesces a run of moves into one event ---
(function () {
  const r = createRoute();
  const wp = addWaypoint(r, { lat: 50, lon: -4 });
  const before = r.history.length;
  moveWaypoint(r, wp.id, { lat: 50.1, lon: -4 });
  moveWaypoint(r, wp.id, { lat: 50.2, lon: -4 });
  moveWaypoint(r, wp.id, { lat: 50.3, lon: -4 });
  const moves = r.history.filter(e => e.op === 'move' && e.id === wp.id);
  check('consecutive moves coalesce to one', moves.length === 1, `got ${moves.length}`);
  check('coalesced move keeps original from + latest to',
    moves[0].from.lat === 50 && moves[0].to.lat === 50.3);
  check('history grew by exactly one event for the run', r.history.length === before + 1);
})();

// --- history is capped ---
(function () {
  const r = createRoute();
  const a = addWaypoint(r, { lat: 50, lon: -4 });
  const b = addWaypoint(r, { lat: 51, lon: -4 });
  for (let i = 0; i < 1500; i++) {
    // alternate ids so moves never coalesce, forcing distinct events
    moveWaypoint(r, i % 2 ? a.id : b.id, { lat: 50 + i * 1e-4, lon: -4 });
  }
  check('history capped at 1000', r.history.length === 1000, `got ${r.history.length}`);
})();

// --- serialize round-trip ---
(function () {
  const r = sample();
  setWaypointNote(r, r.waypoints[1].id, 'note');
  const back = deserializeRoute(serializeRoute(r));
  check('serialize round-trip preserves waypoints', back.waypoints.length === 3);
  check('serialize round-trip preserves ids', back.waypoints[1].id === r.waypoints[1].id);
  check('serialize round-trip preserves notes', back.waypoints[1].note === 'note');
})();

// --- deserialize tolerates a bare {waypoints} and rejects junk ---
(function () {
  const bare = deserializeRoute(JSON.stringify({ waypoints: [{ lat: 50, lon: -4 }, { lat: 51, lon: -5 }] }));
  check('bare waypoints array deserializes', bare && bare.waypoints.length === 2);
  check('bare waypoints get ids', bare.waypoints[0].id && bare.waypoints[0].id.startsWith('wp_'));
  check('junk returns null', deserializeRoute('not json') === null);
  check('future version returns null', deserializeRoute(JSON.stringify({ format: 'srp-route', version: 99, waypoints: [] })) === null);
})();

// --- GPX round-trip (loss-free via extensions) ---
(function () {
  const r = sample();
  setWaypointNote(r, r.waypoints[0].id, 'off Rame Head');
  const back = gpxToRoute(routeToGpx(r));
  check('GPX round-trip preserves count', back.waypoints.length === 3);
  check('GPX round-trip preserves note (via extensions)', back.waypoints[0].note === 'off Rame Head');
  check('GPX round-trip preserves coords',
    Math.abs(back.waypoints[2].lon - (-4.63)) < 1e-5);
})();

// --- GPX standard-parse path (strip extensions, read rtept) ---
(function () {
  const gpx = routeToGpx(sample()).replace(/<extensions>[\s\S]*?<\/extensions>/, '');
  const back = gpxToRoute(gpx);
  check('GPX without extensions still parses rtept points', back.waypoints.length === 3);
})();

// --- GPX we emit is readable by the tools/ parser regex ---
(function () {
  const gpx = routeToGpx(sample());
  const re = /<(?:rtept|trkpt|wpt)\s+[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g;
  let n = 0; while (re.exec(gpx)) n++;
  check('tools/ GPX parser reads our rtepts', n === 3, `parsed ${n}`);
})();

// --- CSV round-trip ---
(function () {
  const r = sample();
  const back = csvToRoute(routeToCsv(r));
  check('CSV round-trip preserves count', back.waypoints.length === 3);
  check('CSV skips a header row', csvToRoute('lat, lon\n50.1, -4.2\n50.3, -4.4\n').waypoints.length === 2);
})();

// --- geometry helpers ---
(function () {
  const r = sample();
  check('routeLegs count is n-1', routeLegs(r).length === 2);
  check('totalDistance is positive', totalDistanceNm(r) > 0);
  check('isPlannable needs >= 2 waypoints', isPlannable(r) && !isPlannable(createRoute()));
  const wps = toWaypoints(r);
  check('toWaypoints is plain lat/lon', wps.length === 3 && wps[0].lat === 50.36 && !('id' in wps[0]));
  reverseRoute(r);
  check('reverse flips endpoints', r.waypoints[0].lat === 50.33);
})();

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} route-model scenarios`);
process.exit(failed > 0 ? 1 : 0);
