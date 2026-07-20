// The rough-route CORRECTION log builder: given a snapshotted baseline and the
// route the skipper edited into, does it capture the right diff, the ordered
// edits, the reasons, and does the machine record round-trip through JSON?

import { buildRoughRouteLog } from '../src/core/rough-route-log.js';
import {
  createRoute, addWaypoint, insertWaypoint, moveWaypoint, setLegNote, toWaypoints
} from '../src/core/route-model.js';
import { distanceNm } from '../src/core/geometry.js';

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name} ${detail}`); }
}

function totalDistance(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += distanceNm(points[i - 1], points[i]);
  return sum;
}

// A baseline as the lab would snapshot it: the app's generated rough route plus
// the inputs and the history mark taken right after loading it.
function makeBaselineAndRoute() {
  const start = { lat: 50.15, lon: -5.06 };
  const end = { lat: 50.09, lon: -5.54 };
  const roughWps = [start, { lat: 50.102, lon: -5.31 }, end];
  const route = createRoute();
  for (const p of roughWps) addWaypoint(route, p);
  route.history.push({ at: new Date().toISOString(), op: 'suggest', legCount: roughWps.length - 1 });
  const baseline = {
    inputs: { start, end, clearanceNm: 0.25, harbourClearanceNm: 0, harbourZoneNm: 2 },
    rough: {
      waypoints: roughWps,
      legCount: roughWps.length - 1,
      totalDistanceNm: totalDistance(roughWps),
      reachedCleanly: true,
      nodeCount: 148,
      crossingLegIndices: []
    },
    historyMark: route.history.length
  };
  return { baseline, route };
}

// --- no edits: diff is zero, edits list empty ---
(function () {
  const { baseline, route } = makeBaselineAndRoute();
  const { markdown, record } = buildRoughRouteLog({ baseline, finalRoute: route, reason: null });
  check('no-edit waypoint delta is 0', record.deltas.waypoints === 0, `got ${record.deltas.waypoints}`);
  check('no-edit distance delta ~0', Math.abs(record.deltas.distanceNm) < 1e-9);
  check('no-edit edits list empty', record.edits.length === 0, `got ${record.edits.length}`);
  check('markdown mentions baseline legs', markdown.includes('leg(s)'));
  check('markdown has machine block', markdown.includes('## Machine-readable'));
})();

// --- insert + move: captured as ordered edits and reflected in deltas ---
(function () {
  const { baseline, route } = makeBaselineAndRoute();
  const wp = insertWaypoint(route, 1, { lat: 50.14, lon: -5.20 });
  moveWaypoint(route, wp.id, { lat: 50.16, lon: -5.21 });

  const { record } = buildRoughRouteLog({ baseline, finalRoute: route, reason: 'took it north of the rocks' });
  check('added one waypoint', record.deltas.waypoints === 1, `got ${record.deltas.waypoints}`);
  check('final waypoint count is 4', record.final.waypoints.length === 4);
  const ops = record.edits.map(e => e.op);
  check('edits captured in order (insert then move)',
    ops[0] === 'insert' && ops.includes('move'), `ops=${ops.join(',')}`);
  check('reason recorded', record.reason === 'took it north of the rocks');
})();

// --- leg notes are folded into the record ---
(function () {
  const { baseline, route } = makeBaselineAndRoute();
  setLegNote(route, route.waypoints[1].id, 'give the Manacles a wide berth');
  const { markdown, record } = buildRoughRouteLog({ baseline, finalRoute: route, reason: null });
  check('leg note captured in record', record.notes.legs.some(n => /Manacles/.test(n.note)));
  check('leg note appears in markdown', markdown.includes('Manacles'));
})();

// --- machine record round-trips through JSON (dataset row is valid JSON) ---
(function () {
  const { baseline, route } = makeBaselineAndRoute();
  insertWaypoint(route, 1, { lat: 50.14, lon: -5.20 });
  const { record } = buildRoughRouteLog({ baseline, finalRoute: route, reason: 'x' });
  const line = JSON.stringify(record);
  const back = JSON.parse(line);
  check('record survives JSON round-trip', back.final.waypoints.length === record.final.waypoints.length);
  check('record carries inputs', back.inputs.clearanceNm === 0.25);
})();

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} rough-route-log scenarios`);
process.exit(failed > 0 ? 1 : 0);
