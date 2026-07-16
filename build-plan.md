# Build Plan: Sailing Passage Planner Refactor

This is the concrete execution plan for the refactor. It is written for
an execution model to carry out without making its own judgement calls
on anything decided here, and was produced after auditing the actual
code and running all test suites on 2026-07-16 — Section 0 records
verified current state. The only other design document is
`comfort-sailing-rewrite-brief.md`, which is the spec authority for the
comfort rewrite (WS2); where this plan and that brief disagree on WS2
intent, the brief wins. Earlier briefing documents have been removed as
out of date — do not go looking for them in git history; this plan
supersedes them.

Rules for the executor:

- Follow `coding-constitution.yaml` at all times: complete files, one
  responsibility per file, ~150-line soft ceiling, pure logic never
  touches DOM/fetch/fs, no comments unless asked.
- Run `node tests/all.mjs` before declaring any task done. All suites
  currently pass (land-avoidance 6/6, sailing harness 6/6, coastline
  system 48/48). A task that breaks an existing test is not done.
- Commit directly to `main` after each completed task, plain-language
  commit message. Pushing to `main` triggers the GitHub Pages deploy
  (`.github/workflows/deploy.yml`), which regenerates tiles.
- Update `agents.md` in the same session as any new convention or module.
- Never access fastseas.com programmatically for any reason.
- Tasks are numbered `WS<stream>.<task>`. Within a stream, do tasks in
  order. Stream order and dependencies are in Section 8.

---

## 0. Ground truth — what is ALREADY FIXED. Do not re-fix.

Bugs reported during earlier development have largely been fixed
already. Audit results against the current code:

| Previously reported bug | Current state | Evidence |
|---|---|---|
| #9 `describeWind()` buckets inverted | **Fixed.** `<30° = "into wind"`, `≥160° = "dead downwind"` — correct convention | `src/core/router.js:377-387` |
| #10 `isTack` threshold inverted | **Fixed.** `isTack = absAvgTwa <= 90` — low TWA = tack, correct | `src/core/router.js:303` |
| #11 `totalWindDir` never resets | **Fixed** (resets at leg boundaries) — but averaging is still arithmetic, wrong across the 0°/360° wrap. Residual work: WS1.1 | `src/core/router.js:321` |
| #12 first maneuver never recorded | **Fixed.** Guard is now `legs.length >= 1` | `src/core/router.js:305` |
| #14 explanation ignores its trigger | **Fixed.** `classifyTransition()` checks real wind/bearing deltas and picks wording accordingly; the old "no-go zone" boilerplate is gone | `src/core/classify-transition.js` |
| #15 no explicit no-go cutoff | **Partially fixed.** Router has hardcoded `MIN_TWA = 30`; decision-logger separately derives no-go from the polar. Two inconsistent mechanisms. Residual work: WS1.2 | `src/core/router.js:9`, `src/core/decision-logger.js:25-32` |
| #16 light-air dithering | **Mitigated.** `VMG_STABILITY_THRESHOLD = 0.5` merges near-tied headings in `simplifyLegs`; harness passes. Revisit only if WS2 testing shows dithering again |
| #17 no minimum-progress floor | **Fixed.** Legs under 0.1NM or 15min are merged | `src/core/router.js:356-372` |
| #5 `constantSpeedKn` straight-line override | **Still present**, now gated by a direct-line `crossesLand` check, but still substitutes a different code path in geometry test mode. Work: WS1.3 | `src/core/router.js:150-174` |
| #13 `getTidalVector()` ignores position | **Still true.** Indexes by elapsed hours only. Work: WS4 | `src/core/router.js:401-405` |
| Sunrise/sunset suffixed-key bug | **Moot.** No sunrise/sunset code exists anywhere now. UV index also absent. Backlog, not in this plan |

Also already built (earlier notes listed these as specced-only):

- **The two-pass tiled coastline system is built and working**: coarse pass → corridor → tile fetch → fine pass
  (`src/ui/app.js:113-149`), `CoastlineManager`/`SmartCoastline`/
  `TileCache` (IndexedDB)/`tile-selector` in `src/data/coastline/`,
  static tiles generated at deploy time by `tools/generate-tiles.mjs`
  into `tiles/coastline/{z}/{x}/{y}.json`, debug overlays (tile grid,
  tile states, corridor, coarse layer, rough-vs-fine route) all wired.
- **Both test harnesses exist**: `tests/run.mjs` (land avoidance),
  `tests/sailing-harness.mjs` (5 synthetic wind scenarios + 1 edge
  case), `tests/coastline-system.mjs`, all green.
- Isochrone hard cap (`MAX_ISOCHRONE_SIZE = 200`), pruning, yielding,
  and the "no route found" failure path all exist in `router.js`.

**One decided thing that is NOT done:** the
coastline *source data* is still the original in-house file
(`src/data/coastlines/sw-england.json`, 3707 segments, one outer ring,
no provenance field) — the switch to osmdata.openstreetmap.de OSM land
polygons has not happened. The tiling *pipeline* consumes that file and
is source-agnostic, so this is a data-swap task, not a rearchitecture:
WS5.

---

## 1. Target architecture (end state)

```
src/core/          pure logic, no side effects (unchanged rule)
  geometry.js, polar.js, coastline.js, wind-interpolation.js   (existing)
  router.js              — per-block isochrone engine (modified)
  comfort-params.js      — NEW: parameter schema, defaults, validation
  sail-configs.js        — NEW: config definitions, per-config polars, hassle model
  config-planner.js      — NEW: Tier 1 — configuration blocks from forecast
  passage-planner.js     — NEW: pure orchestrator, single entry point
  decision-logger.js, classify-transition.js, explain.js       (extended)
  tidal.js               — NEW (WS4): position-aware tidal stream lookup
src/services/      side effects
  wind.js                — batched Open-Meteo fetch (modified)
  passage-service.js     — NEW: wires wind fetch + tile prep + planPassage
  easytide.js            — NEW (WS4): HW times/ranges
src/data/          static data + coastline data layer (unchanged structure)
src/ui/            debug/verification surface only (thin changes)
server/            NEW (WS3): Node API exposing planPassage
  index.js, plan-route.js, coastline-node.js, openapi.yaml
tools/             build-time scripts (extended in WS4/WS5)
tests/             all.mjs runs every suite (extended throughout)
```

The single most important structural change: **`planPassage()` becomes
the one entry point** that produces the full structured result
(`PassageResult`, Section 3). The browser UI and the WS3 server are two
thin callers of the same function. Nothing route-related may live only
in `src/ui/` or only in `server/`.

---

## 2. WS1 — Engine correctness and data-quality fixes

Small, independent patches to existing code. Do these first; WS2 builds
on them.

### WS1.1 Circular mean for wind direction in `simplifyLegs`
In `src/core/router.js`, replace the `totalWindDir` running sum with
`sumWindDirX += Math.cos(rad)`, `sumWindDirY += Math.sin(rad)` per node,
and compute the leg's `windDir` as
`(Math.atan2(sumY, sumX) * 180/Math.PI + 360) % 360`. Reset both at leg
boundaries exactly where `totalWindDir` resets today (lines 252, 321).
Add a case to `testNoFalseManeuver`-style unit tests in
`tests/sailing-harness.mjs`: nodes with windDir alternating 350° and 10°
must average to ~0°, not ~180°.

### WS1.2 Single no-go mechanism, polar-derived, configurable
- Move `findNoGoAngle(polars, windSpeed)` from
  `src/core/decision-logger.js` into `src/core/polar.js` and export it;
  decision-logger imports it from there.
- In `router.js`, delete the `MIN_TWA = 30` constant. Per candidate
  heading: `noGo = params.noGoAngleDeg ?? findNoGoAngle(polars, windSpeed)`,
  reject when `Math.abs(twaVal) < noGo`.
- `noGoAngleDeg` becomes an optional router param (and later a comfort
  param, WS2.1). No other behavior change.
- Note for WS2: the motor configuration must bypass this check entirely
  (a motor goes dead upwind fine). Implement the bypass in WS2.4, not
  here.

### WS1.3 Remove the geometry-mode straight-line substitution
Delete `src/core/router.js:150-174` (the `constantSpeedKn && route.length > 1`
block that swaps in a single direct leg when the computed route is >30%
longer than direct). Geometry-only mode must always return the route the
isochrone engine actually found. Run `node tests/run.mjs` — if any land
test now fails because a real route is inefficient, fix the routing
(pruning/heading count), never reinstate the substitution.

### WS1.4 Tack/gybe classification uses both sides of the flip
At the TWA sign change in `simplifyLegs` (`router.js:301-313`),
classify using the crossing point, not just the departing leg's average:
`crossTwa = (Math.abs(lastNodeTwaBeforeFlip) + Math.abs(firstNodeTwaAfterFlip)) / 2`;
`tack` if `crossTwa < 90`, else `gybe`. (Track the last node's TWA
alongside `prevTwaSign`; it is available as `path[i-1].twa`.) This fixes
the edge case where a boat bears away from close-hauled through beam
onto the other side and the departing-leg average misclassifies the
maneuver.

### WS1.5 Time-interpolated wind
`src/core/wind-interpolation.js` currently snaps to the nearest hour.
Replace `findTimeIndex` snapping with true interpolation:
- Find bracketing entries `i, i+1` and fraction `f`.
- For the nearest grid point (keep nearest-point spatial selection —
  the grid is 4×4 over a small area, spatial interpolation is not worth
  it yet), interpolate speed linearly and direction circularly
  (interpolate via shortest angular path:
  `d = ((dir1 - dir0 + 540) % 360) - 180; dir = (dir0 + d*f + 360) % 360`).
- Unit test in the sailing harness: fixture hour 0 = 10kn/350°, hour 1 =
  20kn/10°; query at :30 must return 15kn/0°.

### WS1.6 Batch the Open-Meteo request
`src/services/wind.js` makes 16 sequential fetches with 150ms delays.
Open-Meteo accepts comma-separated `latitude=` and `longitude=` lists
and returns an array of responses. Rewrite `fetchWindGrid` as one fetch;
`parseWindResponse` already receives `results` as an array, so it needs
only the call-site change plus handling the single-point case (API
returns an object, not an array, for one coordinate — normalize with
`Array.isArray(data) ? data : [data]`). Keep the same returned
`{grid, points}` shape so nothing downstream changes.

### WS1.7 Exact final leg to destination
The route currently ends at the first node within the arrival threshold
(0.5–2% of distance), not at the destination. After the `ROUTE FOUND`
branch in `router.js` selects `closest`:
- If `distanceNm(closest.point, end) > 0.05` and
  `!crossesLand(coastline, closest.point, end, start, end, clearanceMarginNm)`:
  append a synthetic final node at exactly `end`, heading
  `bearing(closest.point, end)`, sog = `closest.sog` (or
  `constantSpeedKn` in geometry mode), time advanced by
  `dist / sog` hours, wind fields copied from `closest`.
- If that segment does cross land, keep current behavior (end at
  `closest`) and append a warning string to the log.
This gives FastSeas-parity "exact partial final leg" and makes total
time not snapped to the time grid. Assert in the sailing harness that
the last leg's `endWaypoint` equals the scenario `end` to within 0.05NM.

---

## 3. The `PassageResult` contract (build in WS2, exposed by WS3)

This is the product surface. Every field below is required unless marked
optional. All times ISO-8601 UTC strings, coordinates decimal degrees,
distances NM, speeds knots, durations hours unless suffixed otherwise.

```js
{
  summary: {
    start: {lat, lon}, end: {lat, lon},
    departureTime, arrivalTime,
    totalDistanceNm, totalDurationH,
    motoringH, sailingH,            // sums over config blocks
    configChanges: <int>
  },
  configBlocks: [{
    config: 'motor' | 'headsail' | 'full' | 'reefed',
    startTime, endTime,
    startPoint: {lat, lon}, endPoint: {lat, lon},
    decision: <ConfigDecisionRecord>   // why this block exists — see WS2.6
  }],
  legs: [{
    config,                          // which block this leg belongs to
    heading, waypoint, endWaypoint, startTime,
    duration, distance, sog,
    windSpeed, windDir, windAngle, windDescription,
    maneuver: 'tack'|'gybe'|null, tackSide: 'port'|'starboard'|null
  }],
  decisions: [ /* union, discriminated by .kind:
    'heading'      — existing DecisionRecord from decision-logger.js
    'transition'   — existing classifyTransition record
    'config'       — ConfigDecisionRecord (WS2.6), incl. rejections
    'landDeviation'— LandDeviationRecord (WS2.7)
  */ ],
  narration: <string>,               // full plain-language passage story,
                                     // built by explain.js from the above
  warnings: [<string>],              // ALWAYS includes at minimum:
    // "Planning aid based on forecast, not real-time instruction"
    // "Tidal stream not modelled" (unless tidal data supplied — WS4)
    // "Forecast can be wrong"
    // "Cross-check against chart before departure"
    // plus OSM attribution once WS5 lands
  debug: { log: <string>, rawNodes: [...] }   // optional; stripped by the
                                              // API unless debug=true
}
```

---

## 4. WS2 — Comfort-based two-tier sailing rewrite (the main event)

Spec authority: `comfort-sailing-rewrite-brief.md`. Do not touch the
coastline/tiling system in this stream. Tasks in order:

### WS2.1 `src/core/comfort-params.js`
Exports `DEFAULT_COMFORT_PARAMS` and
`mergeComfortParams(overrides)` (validates types/ranges, throws with a
plain-language message listing each invalid field). Defaults — these are
starting values for Owen to tune, all overridable per call, none used
anywhere as literals outside this file:

```js
{
  minSailableWindKn: 5,
  engineOnWindKn: 4,          // drop TO motor below this (hysteresis low)
  engineOffWindKn: 6,         // leave motor above this (hysteresis high)
  reefWindKn: 18,
  maxComfortWindKn: 25,       // above: warn in output; do not refuse to route
  minWorthwhileDurationMin: { headsail: 45, full: 120, reefed: 120 },
  soloSailing: false,
  soloHassleMultiplier: 1.5,  // multiplies full/reefed duration thresholds
  mainHoistDifficultyByPointOfSail: { upwind: 1.0, reach: 1.2, downwind: 1.8 },
  finalApproachBufferMin: 45,
  motorCruiseSpeedKn: 6,
  headsailSpeedFactor: 0.6,   // stand-in until a real headsail polar exists
  reefedSpeedFactor: 0.85,
  noGoAngleDeg: null          // null = derive from polar (WS1.2)
}
```

Validation rule worth encoding: `engineOnWindKn < engineOffWindKn`,
`minSailableWindKn <= engineOffWindKn`, all speeds/durations positive.

### WS2.2 `src/core/sail-configs.js`
- `CONFIGS = ['motor', 'headsail', 'full', 'reefed']`.
- `getPolarForConfig(basePolars, config, params)`:
  - `motor`: flat polar — `motorCruiseSpeedKn` at every TWA including 0°
    and 180° (same `{twaSteps, twsSteps, speeds}` shape so `lookupSpeed`
    works unchanged).
  - `headsail`: base speeds × `headsailSpeedFactor`.
  - `full`: base polars unchanged.
  - `reefed`: base speeds × `reefedSpeedFactor`.
  These factor-based stand-ins are deliberate Phase-1 simplifications;
  the function signature is the swap point if real per-config polars
  arrive later (they'd become additional files in `src/data/polars/`).
- `changeDurationThresholdMin(fromConfig, toConfig, pointOfSail, params)`
  → minutes a new regime must persist to justify switching:
  - to `headsail`: `minWorthwhileDurationMin.headsail`.
  - to `full` or `reefed` (i.e. main goes up):
    `minWorthwhileDurationMin[to] × mainHoistDifficultyByPointOfSail[pos]
    × (soloSailing ? soloHassleMultiplier : 1)`, where `pos` is derived
    from TWA at the change moment: `<60°='upwind'`, `<140°='reach'`,
    else `'downwind'` (reuse `pointOfSailCategory` from
    `classify-transition.js` — map its six buckets onto these three).
  - to `motor`: 0 (dropping sail to motor is always allowed; hysteresis
    handles flapping).
  - reefing while already under full sail (`full→reefed` or back): use
    `minWorthwhileDurationMin.reefed` without the hoist multiplier — the
    main is already up.

### WS2.3 `src/core/config-planner.js` — Tier 1
Pure function
`planConfigurations(timeline, params)` →
`{ blocks: [...], rejections: [ConfigDecisionRecord...] }`.

`timeline` is an array of steps
`{ time, position: {lat,lon}, windSpeed, windDir, bearingToDest, remainingMin }`
supplied by the orchestrator (WS2.5) from the coarse-pass route.

Algorithm — implement exactly this, no cleverness:

1. **Ideal config per step**, ignoring hassle:
   - `remainingMin <= finalApproachBufferMin` → `motor` (hard override).
   - `windSpeed < minSailableWindKn` → `motor`.
   - `windSpeed > reefWindKn` → `reefed`.
   - otherwise → `full` if the step's best sailing TWA is workable
     (i.e. direct-course TWA outside no-go, or tacking viable), else
     still `full` (tacking is Tier 2's job); use `headsail` instead of
     `full` when `windSpeed <= minSailableWindKn + 3` (light air where
     the main isn't worth it) — this `+3` band is the initial heuristic,
     expose it as param `headsailPreferenceBandKn: 3` in WS2.1.
2. **Left-to-right pass** starting in `motor` (leaving harbour under
   engine is the physical reality):
   - At each step where ideal ≠ current: look ahead to find `D` = the
     consecutive minutes the ideal config persists.
   - Hysteresis on the motor boundary: to leave `motor`, require
     `windSpeed >= engineOffWindKn`; to fall back to `motor` mid-passage
     require `windSpeed <= engineOnWindKn` (or the final-approach/
     minSailable rules).
   - Accept the change iff
     `D >= changeDurationThresholdMin(current, ideal, pos, params)`.
   - Whether accepted or rejected, emit a `ConfigDecisionRecord`
     (WS2.6) with the actual numbers (`D`, threshold, wind, pos).
     Rejections go in `rejections` — they are first-class output ("not
     worth the hassle" narration).
3. Merge adjacent same-config steps into blocks
   `{ config, startTime, endTime, startIdx, endIdx, decision }`.

No DOM, no fetch, no Date.now — fully deterministic from inputs.

### WS2.4 Router changes for per-block execution
In `src/core/router.js`:
- New optional param `arriveByTime`: stop expanding when
  `node.time >= arriveByTime` and return the best node at that horizon
  as a *partial* result `{ route, rawNodes, reachedEnd: false, endNode }`
  (add `reachedEnd: true` to the normal arrival return). This lets the
  orchestrator run one router call per config block.
- New optional param `allowIntoWind` (set true for motor blocks):
  bypass the no-go rejection from WS1.2.
- Motor blocks should also pass `headingThreshold` unchanged — a motor
  route is naturally near-straight; no special-casing.

### WS2.5 `src/core/passage-planner.js` — pure orchestrator
`async planPassage({ start, end, departureTime, basePolars, windGrid,
tidalData, comfortParams, coastlineCoarse, getFineCoastline, routerOpts })`
→ `PassageResult` (Section 3).

`getFineCoastline(waypoints)` is an injected async callback (the
browser passes CoastlineManager's tile prep; the server passes the fs
version; tests pass `async () => coastlineCoarse`). This keeps the pure/
side-effect boundary: passage-planner never fetches.

Steps:
1. Coarse pass: `calculateRoute` with full-sail polar against
   `coastlineCoarse`, generous clearance (existing
   `COARSE_CLEARANCE_NM = 2` behavior moves here from `app.js`).
   No route → return early with `route: null`-style result and log.
2. Build `timeline` from the coarse rawNodes (each node already has
   time/position/wind; compute `bearingToDest` and `remainingMin` from
   the coarse arrival time).
3. `planConfigurations(timeline, params)` → blocks + rejections.
4. `await getFineCoastline(coarseWaypoints)` → fine coastline.
5. For each block in order: `calculateRoute` from the previous block's
   end node (position + time; block 1 starts at `start`/departure)
   toward `end`, with `getPolarForConfig(basePolars, block.config, params)`,
   `allowIntoWind: config === 'motor'`, and `arriveByTime: block.endTime`
   for every block except the last (the last runs to arrival, WS1.7
   exact final leg included). Collect legs, tagging each with
   `config`.
   - Edge case: if a block's router call collapses (no valid moves —
     e.g. a sailing block in a wind hole the coarse timeline missed),
     re-run that block as `motor` and emit a ConfigDecisionRecord noting
     the fallback.
6. Run `analyzeRoute` + `classifyTransition` over the stitched result;
   merge all decision kinds into `decisions[]` sorted by time.
7. Build `narration` via explain.js (WS2.6) and `warnings`, assemble
   `PassageResult`.

`src/services/passage-service.js` is the thin side-effect wrapper used
by the browser: fetches wind (WS1.6), constructs the callbacks, calls
`planPassage`. Keep it under ~60 lines.

### WS2.6 Explainability: `ConfigDecisionRecord` + narration
Record shape (kind `'config'`):
```js
{ kind: 'config', time, position,
  from, to, accepted: <bool>,
  windowMin,            // D from WS2.3
  thresholdMin,         // computed threshold
  windSpeedKn, pointOfSail,
  trigger: 'wind-below-sailable'|'wind-above-reef'|'wind-window'|
           'final-approach'|'hysteresis'|'router-fallback' }
```
In `src/core/explain.js` add `formatConfigDecision(rec)` producing the
brief's tone exactly, e.g.:
- accepted, to full: `"Wind forecast to hold above 12kn for the next 4
  hours on a beam reach — worth hoisting the main."`
- rejected: `"Wind window of ~20 minutes at 8kn expected before dropping
  again — not worth unfurling the headsail for that short a stretch."`
- final approach: `"Within 45 minutes of destination — sails down,
  motoring in for arrival."`
Extend `narrateRoute` to interleave config decisions chronologically
with leg/heading decisions into one passage story. The UI decision-panel
renderer (`src/ui/results.js`) gets a `config-change` panel type using
the same record — renderer only, no logic.

### WS2.7 Land-forced-deviation capture
In `router.js`, inside the candidate loop: when `crossesLand` rejects a
candidate, compute its VMG toward `end` and keep the best rejected VMG
per source node for that step. When a node's chosen successor has lower
VMG than that node's best rejected candidate by more than 0.5kn, attach
`landDeviation: { rejectedHeading, rejectedVmg, chosenVmg }` to the
successor node. `analyzeRoute` converts these into records
(kind `'landDeviation'`), and `explain.js` gets a formatter:
`"Ideal heading 195° (VMG 6.2kn) blocked by land/clearance — deviated to
230° (VMG 4.8kn), sacrificing 1.4kn toward the destination."`
Keep the bookkeeping O(1) per candidate — one `bestRejected` map keyed
by source node per step, discarded after the step.

### WS2.8 Comfort test harness — `tests/comfort-harness.mjs`
Same pattern as `sailing-harness.mjs`: synthetic wind fixtures in
`src/data/test-fixtures/`, no coastline
(`{segments:[],outerRings:[],innerRings:[],grid:{}}` + a
`getFineCoastline` stub), assertions against `planPassage` output.
Scenarios (each a named fixture + expectations on `configBlocks` and
`decisions`):

| Scenario | Fixture | Expected |
|---|---|---|
| Light-air short hop | 3kn wind, 5NM passage | single `motor` block, zero sail blocks, a rejection record with trigger `wind-below-sailable` |
| Long beam reach | 15kn abeam, 30NM | `motor` → `full` (or `headsail`) → `motor` (final approach); hoist accepted with `windowMin >= thresholdMin` in the record |
| Short wind window | 8kn for 20min, else 3kn | all-motor blocks + a **rejected** `headsail` ConfigDecisionRecord with `windowMin ≈ 20` |
| Final approach override | 15kn throughout, short passage | last block is `motor`, trigger `final-approach`, starts within `finalApproachBufferMin` of arrival |
| Solo downwind hoist | 12kn dead astern, `soloSailing: true`, window just above the base threshold | change to `full` **rejected** (solo × downwind multiplier), same run with `soloSailing: false` accepts |
| Reef trigger | 22kn sustained | a `reefed` block, never un-reefed `full` while wind > `reefWindKn` |

Wire into `tests/all.mjs`. Every scenario also runs its decisions
through `narrateRoute` and prints the narration (human-checkable, like
the existing harness does).

### WS2.9 Retire superseded single-tier behavior
After WS2.5 works end-to-end: `src/ui/app.js` calls
`passage-service.js` instead of assembling coarse/fine passes itself
(that logic moved into `planPassage`). Delete the now-dead orchestration
from `app.js` (constitution: no orphaned code). The existing
`sailing-harness.mjs` keeps testing `calculateRoute` directly — Tier 2
in isolation — and must stay green throughout.

---

## 5. WS3 — API/tool delivery (the product surface)

Depends on WS2. The client uses their existing ChatGPT subscription;
this stream turns the engine into a hosted API and wraps it as one
composite tool (never several fine-grained ones — a single tool that
runs the whole pipeline internally is more reliable than making ChatGPT
orchestrate wind/tide/routing itself).

### WS3.1 `server/` Node service
- `server/package.json` with the single dependency `express` (server
  code is exempt from the browser no-build rule but stays plain Node,
  no bundler, no TypeScript). Node ≥ 20 (global fetch).
- `server/coastline-node.js`: same interface as `CoastlineManager`
  (`init`, `prepareFineTiles`, `getSmartCoastline`,
  `getCoarseCoastline`) but reads tiles from the local `tiles/coastline/`
  directory with `fs.readFile` instead of fetch+IndexedDB. Reuses
  `loadCoastline`, `selectTilesForCorridor`, `SmartCoastline` merge
  logic — extract the merge logic in `manager.js` into a shared pure
  helper if needed rather than duplicating it.
- `server/plan-route.js`: request validation → `mergeComfortParams` →
  wind fetch → `planPassage` → response. Reuses `src/services/wind.js`
  and everything in `src/core/` directly via relative imports (ES
  modules with `.js` extensions already — they run in Node unchanged,
  as the test suites prove).
- `server/index.js`: `POST /plan-route`, `GET /health`. Errors return
  `{ error: <plain-language message> }` with 400 (validation) or 500.

### WS3.2 Request/response schema
Request body (only `start`, `end`, `departureTime` required; everything
else defaults):
```js
{ start: {lat, lon}, end: {lat, lon},
  departureTime: <ISO>,
  boat: 'oceanis393',            // polar file selector, default only option
  comfort: { <any subset of comfort-params> },
  tidal: null,                   // WS4 shape once built
  debug: false }
```
Response: `PassageResult` (Section 3), `debug` field omitted unless
`debug: true`. Write `server/openapi.yaml` describing exactly this — it
is the Custom GPT Action schema.

### WS3.3 Agent integration
- **Choose Custom GPT Actions first** (plain HTTPS + OpenAPI, mature,
  works on the client's existing ChatGPT subscription). Structure
  nothing that precludes adding an MCP wrapper later — MCP would be a
  second thin layer over the same `plan-route.js` handler.
- Deliverable `server/tool-instructions.md`: the text to paste into the
  GPT's instructions. It MUST contain, prominently: *always call this
  tool for any route, wind, tidal, or sail-configuration question; never
  estimate or blend in your own figures; relay the tool's `narration`
  and `warnings` to the client; use the structured fields for follow-up
  questions*. Plus guidance on mapping plain-language client intent
  ("solo today, not in a rush") onto comfort parameters.
- Hosting requires an always-on Node host with the repo's `tiles/`
  directory on disk (Render/Fly/Railway class). **Do not deploy or
  create accounts — prepare the code and a `server/README.md` with run
  instructions (`node server/index.js`, PORT env var); Owen chooses and
  operates the host.**

### WS3.4 API-level tests — `tests/api.mjs`
Boot the server on an ephemeral port with a stubbed wind fetch
(fixture-driven, no live API) and assert: valid request → 200 with all
required `PassageResult` fields; missing `start` → 400 with message;
invalid comfort param → 400 naming the field; `debug:false` strips
`debug`. Add to `tests/all.mjs`.

---

## 6. WS4 — Tidal stream module (code now, real data when Owen transcribes)

Design decision (made after reviewing the full spectrum of options, from
fully-manual entry to UKHO's paid Tidal API): a one-time manual
digitization of the tidal stream atlas for the home cruising ground into
a structured diamond dataset, with the applicable hourly stage automated
from free EasyTide high-water time and range data — the skipper never
types a current figure per passage. Global ocean-current models
(Open-Meteo Marine) were rejected as too coarse inshore; UKHO's paid
tier is the fallback only if this ever scales beyond one cruising
ground. Code and fixtures are buildable now;
the real dataset is gated on Owen's one-time atlas transcription.

### WS4.1 Data format + import tool
`src/data/tides/<area>.json`:
```js
{ area: 'sw-england', referencePort: '<EasyTide station id>',
  diamonds: [{ id: 'A', lat, lon,
    stages: [ {dirDeg, neapKn, springKn}, ... 13 entries, HW-6h..HW+6h ] }] }
```
`tools/import-tidal-diamonds.mjs`: CSV (one row per diamond-stage:
`id,lat,lon,stageHour,dirDeg,neapKn,springKn`) → this JSON, with
validation (13 stages per diamond, rates ≥ 0). Ship a small synthetic
fixture `src/data/test-fixtures/tides-synthetic.json` for tests.

### WS4.2 `src/core/tidal.js`
`getTidalCurrent(tideData, position, time, hw)` where
`hw = { hwTime, rangeM, meanNeapRangeM, meanSpringRangeM }`:
- nearest diamond to `position` (plain lat/lon distance; document that
  diamonds beyond ~10NM return null → no current applied + warning).
- stage index from `round((time - hwTime) in hours)` clamped to ±6.
- rate = neap/spring linear interpolation by where `rangeM` sits between
  mean neap and mean spring ranges.
- returns `{ direction, speed }` or `null`.
Replace `getTidalVector` in `router.js` with this (router receives
`tidal: { data, hw }` param); delete the old elapsed-time-modulo
function. The UI's existing manual per-leg tide entry
(`parseTidalData`) is retired in the same change — direct skipper
feedback established that skippers won't type per-leg current data.

### WS4.3 `src/services/easytide.js`
Fetch HW times + heights for the reference port (UKHO EasyTide free
endpoint — **executor must verify the current endpoint/terms from UKHO
docs before coding; if it now requires registration/keys, stop and
surface that to Owen rather than working around it**). Output the `hw`
object of WS4.2. Server and UI callers pass it into `planPassage`.

### WS4.4 Tests + explainability
- Harness scenario (extend `sailing-harness.mjs` or comfort harness):
  synthetic diamond field with 2kn cross-current — assert the route
  crabs (headings differ from the no-tide run) and that decision records
  of kind `'tide'` appear: `{ kind:'tide', time, position, setDeg,
  rateKn, headingWithout, headingWith }` with an explain.js formatter
  ("2.1kn stream setting 190° — steering 8° up-tide to hold the course
  made good").
- Until a real dataset exists, `warnings` must contain "Tidal stream not
  modelled" whenever `tidal` is absent — this is already required by
  Section 3 and must be verified by a test.

---

## 7. WS5 — Coastline source swap to OSM land polygons

Independent of all other streams (the pipeline is source-agnostic).
Decision is final: use osmdata.openstreetmap.de land polygons (the
output of the OSMCoastline tool — it exists precisely because turning
raw OSM coastline into correct closed land polygons is a known-hard,
already-solved problem); do not reimplement coastline processing.

### WS5.1 `tools/build-coastline-source.mjs`
- Input: the WGS84 *split* land-polygons download from
  osmdata.openstreetmap.de (Owen downloads the zip manually or the tool
  fetches it — fetching a ~700MB archive in CI is not acceptable, so:
  the tool takes a local path argument; document the download URL in the
  tool's usage message and `server/README.md`).
- Clip to bbox lat 49.0–51.5, lon −7.0 to −2.0 (SW England + margin).
- Convert to the existing shape:
  `{ segments: [{a:{lat,lon}, b:{lat,lon}}...], outerRings: [[{lat,lon}...]...], innerRings: [...] }`
  written to `src/data/coastlines/sw-england.json`, now including a
  `source`/`license` field (`"OSM via osmdata.openstreetmap.de, ODbL"`).
- A dev-only npm dependency for shapefile parsing is acceptable inside
  `tools/` (e.g. the `shapefile` package) — it never ships to the
  browser. Add `tools/package.json` for it; do not add a root
  package.json.

### WS5.2 Regenerate + validate
- Run existing `tools/simplify-coastline.mjs` (coarse layer) and
  `tools/generate-tiles.mjs` (tiles) against the new source. Tune the
  simplifier tolerance if the new source's density makes the coarse
  file huge — coarse target is the current order of magnitude (~700
  segments).
- All of `tests/run.mjs` and `tests/coastline-system.mjs` must pass
  unchanged — they assert behavior, not geometry counts (except the
  coarse-vs-fine ratio checks; adjust the fixture counts there only if
  the assertion is about the *ratio*).
- Visual check via the debug UI on: Falmouth harbour entrance, Helford
  river, the Lizard, Land's End — the fine layer should show visibly
  more real detail than before.

### WS5.3 Attribution (ODbL requirement, not optional)
Add "Contains OpenStreetMap data © OpenStreetMap contributors, ODbL"
to: the UI footer (`index.html`), the API `warnings` or a dedicated
`attribution` field in `PassageResult.summary`, and `server/README.md`.

---

## 8. WS6 — UI demoted to debug surface + documentation close-out

Last stream; mostly wiring and honesty.

- `src/ui/app.js` already slimmed by WS2.9. Add to the results panel:
  config-block strip (timeline bar of motor/headsail/full/reefed),
  config-change decision panels, the `narration` text block, and the
  `warnings` list rendered as the existing warning banner. All pure
  renderers of `PassageResult` — no calculation in `src/ui/` beyond
  formatting.
- Keep every existing debug overlay untouched (tile grid/states,
  corridor, coarse layer, rough route, sailing debug, charting tools).
- Rewrite `agents.md` to describe the end state: API-first product,
  UI = debug surface, the new module map (Section 1), the
  `PassageResult` contract location, all test suites, comfort-param
  philosophy, and the standing prohibitions (no fastseas.com, no Mac
  tooling, ODbL attribution). agents.md must be updated incrementally
  during every stream, not only here — this task is the final audit.
- Final pre-ship pass per `coding-constitution.yaml` phase 2 across the
  whole diff: no orphaned files (candidates to check: `src/data/coastlines/`
  originals if superseded, `parseTidalData` UI code after WS4, any
  `window.__*` debug globals no longer used).

---

## 9. Stream order, dependencies, sizing

```
WS1 (engine fixes)        — no dependencies. Small: ~1 session.
WS5 (OSM coastline swap)  — no dependencies, independent of everything.
                            Small-medium; can run any time, even first.
WS2 (comfort rewrite)     — after WS1. The big one: ~3-5 sessions.
                            WS2.1→2.8 in order; 2.7 can go in parallel.
WS3 (API delivery)        — after WS2. Medium: ~1-2 sessions.
WS4 (tidal)               — code after WS2 (router param change);
                            real data gated on Owen's transcription +
                            EasyTide endpoint verification. Medium.
WS6 (UI/debug + docs)     — after WS2; finalize after WS3/WS4/WS5.
```

Recommended execution order: **WS1 → WS2 → WS3 → WS5 → WS4 → WS6**,
with WS5 movable anywhere. WS3 before WS5/WS4 because the API is the
product delivery mechanism and works fine on the current coastline data
and without tide (with the honest warning in place).

## 10. Explicitly out of scope (do not build, do not scaffold)

- Phase 2: live GPS, underway replanning, Capacitor wrapping. (But keep
  the existing discipline: the engine never knows where a position came
  from.)
- Tack/gybe maneuver-loss speed penalty (FastSeas parity nicety —
  backlog).
- Fuel range/consumption modelling (flagged in the brief as future).
- UV index / sunrise-sunset (backlog; nothing exists in code now).
- MCP server (Actions first; MCP is a later thin layer).
- Lee-shore-aware clearance widening and narrow-channel margin
  relaxation (known limitations of the fixed `clearanceMarginNm` —
  only revisit if testing hits them).
- Any UI polish beyond rendering `PassageResult`.
- Anything touching fastseas.com programmatically. Never.
