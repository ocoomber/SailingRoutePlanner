// The plan-review flag builder: captures the drawn rough route, the sailing plan
// it produced, and a note saying why it's wrong (e.g. the plan sailed over land).
// It wraps the passage-log assembler, so we check the note, the drawn route and
// the embedded passage detail all survive, and that the record is valid JSON.

import { buildReviewLog } from '../src/core/review-log.js';
import { createRoute, addWaypoint, setWaypointNote } from '../src/core/route-model.js';

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  PASS: ${name}`); }
  else { failed++; console.log(`  FAIL: ${name} ${detail}`); }
}

function sampleRoute() {
  const r = createRoute();
  addWaypoint(r, { lat: 50.12, lon: -5.02 });
  addWaypoint(r, { lat: 50.06, lon: -5.30 });
  setWaypointNote(r, r.waypoints[0].id, 'leave Falmouth');
  return r;
}

// A lastRun as passage-run.js stashes it. buildRouteLog reads inputs.start*/end*,
// and passage.summary/legs/etc.
function sampleLastRun() {
  return {
    mode: 'sailing',
    inputs: {
      startLat: 50.12, startLon: -5.02, endLat: 50.06, endLon: -5.30,
      timeMode: 'departure', departureDate: '2026-07-20', departureTime: '09:00'
    },
    settings: { corridorWidthNm: 3, comfort: {} },
    rough: null,
    passage: {
      summary: { reachedDestination: false, shortfallNm: 1.2, totalDistanceNm: 22.4, totalDurationH: 4.1 },
      legs: [{ config: 'full', heading: 200, waypoint: { lat: 50.12, lon: -5.02 }, endWaypoint: { lat: 50.06, lon: -5.30 }, distance: 22.4, duration: 4.1, sog: 5.4, windSpeed: 12, windDir: 250, windAngle: 50 }],
      decisions: [], warnings: ['Plan crossed land between the Manacles and Black Head'],
      debug: {}
    },
    elapsedMs: 42
  };
}

// --- full flag: note, drawn route, and plan summary all captured ---
(function () {
  const { markdown, record } = buildReviewLog({
    note: 'the sailing plan sailed over land',
    lastRun: sampleLastRun(),
    route: sampleRoute()
  });
  check('note recorded', record.note === 'the sailing plan sailed over land');
  check('note appears in markdown', markdown.includes('the sailing plan sailed over land'));
  check('drawn route captured', record.drawnRoute.waypoints.length === 2);
  check('waypoint note captured', record.drawnRoute.waypoints[0].note === 'leave Falmouth');
  check('passage log embedded', record.passageLog && record.passageLog.result.reachedDestination === false);
  check('plan warning surfaced in markdown', markdown.includes('Black Head'));
  check('markdown reports reached: no', markdown.includes('Reached destination: no'));
})();

// --- no plan yet: still produces a usable record, flags the gap ---
(function () {
  const { markdown, record } = buildReviewLog({ note: 'x', lastRun: null, route: sampleRoute() });
  check('no-plan record has null passage log', record.passageLog === null);
  check('no-plan markdown notes the gap', markdown.includes('No sailing plan captured'));
})();

// --- record round-trips through JSON (valid dataset row) ---
(function () {
  const { record } = buildReviewLog({ note: 'y', lastRun: sampleLastRun(), route: sampleRoute() });
  const back = JSON.parse(JSON.stringify(record));
  check('record survives JSON round-trip', back.drawnRoute.waypoints.length === 2);
})();

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} review-log scenarios`);
process.exit(failed > 0 ? 1 : 0);
