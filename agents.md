# Sailing Passage Planner — Agents Context

## Project
Pre-departure sailing passage planner for South West England (Cornwall, Devon, Dorset).
Phase 1 only: no live tracking, no GPS, no real-time nav.

## Stack
- Vanilla HTML/CSS/JS, ES modules, no build step
- Leaflet.js via CDN for map
- Browser-only processing (no server)
- Open-Meteo API for wind forecast (free, no key)

## Boat
Beneteau Oceanis Clipper 393
Polar data sourced from ORC-certified boats of same model.

## Architecture
- `src/core/` — Pure logic, no side effects, no DOM, no fetch
- `src/services/` — Side effects (API calls, file loading)
- `src/ui/` — Presentation, DOM manipulation, event handlers
- `src/data/` — Static JSON data files

## Coding Rules
- One file, one responsibility
- Soft ceiling ~150 lines per file
- Pure logic never touches DOM, fetch, or file I/O
- Clear descriptive names, no cleverness
- Complete files always, never partial diffs
- No comments unless asked

## Routing Algorithm
Isochrone method:
1. Step forward in fixed time increments
2. Fan out headings from each reachable point
3. Look up boat speed from polar table
4. Apply wind + optional tidal vectors
5. Discard land-crossing candidates
6. Keep outer boundary (isochrone)
7. Backtrack to recover route
8. Simplify legs by merging similar headings

## Key Decisions
- Route engine returns structured data, UI renders it
- Wind service accepts arbitrary time windows (Phase 2 ready)
- Leg output as {heading, waypoint, duration} objects
- Tidal current optional, user-supplied only

## Warnings (must appear in UI)
- Planning aid based on forecast, not real-time instruction
- Tidal stream not modelled unless user supplies data
- Forecast can be wrong
- Cross-check against chart before departure

## Test Suites
- `tests/run.mjs` — Land-avoidance tests (5 routes + 1 clearance-margin test)
- `tests/sailing-harness.mjs` — Sailing-performance tests (5 synthetic wind/tide scenarios)
- `tests/all.mjs` — Runs both suites

Run with `node tests/run.mjs`, `node tests/sailing-harness.mjs`, or `node tests/all.mjs`.

## Sailing Test Harness (`tests/sailing-harness.mjs`)
Isolates polar/heading-selection logic from coastline concerns. Five named scenarios against a fixed open-water route (50.00°N, 3.50°W → 50.00°N, 2.50°W, no land near the direct path):

| Scenario | Wind | Tide | Expected |
|---|---|---|---|
| Dead upwind | 14kn from 270° | none | Tacking required (no-go zone) |
| Dead downwind | 14kn from 90° | none | Gybing required (no-go zone) |
| Beam reach | 14kn from 0° | none | Sail direct, no tack |
| Wind shift mid-route | 270°→0° at 2h | none | Switch tack at shift |
| Current pushing across | 14kn from 0° | 2kn from 180° | Crab into current |

Wind fixture files in `src/data/test-fixtures/` match the `WindGridObject` shape — the engine consumes them identically to real Open-Meteo data. Tide data embedded in scenario metadata.

### Decision Logger (`src/core/decision-logger.js`)
Post-hoc analysis of raw route nodes. For each node, evaluates:
- Wind direction/speed, bearing to destination, no-go zone status
- Best port-tack and starboard-tack headings by VMG toward destination
- Structured `DecisionRecord` with alternatives, VMG comparison, and reasoning

Key exports: `analyzeRoute(rawNodes, end, polars)` → `DecisionRecord[]`
              `evaluateDecision(node, end, polars)` → `DecisionRecord`

### Explainer (`src/core/explain.js`)
Converts `DecisionRecord` objects to plain-language sentences:
"Wind from 270° at 14kn — dead ahead of the direct course to the destination (090°). inside the no-go zone (≤30° from wind direction). Compared port tack (VMG 3.2kn) against starboard tack (VMG 4.2kn). Chose starboard — better VMG (4.2kn vs 3.2kn)."

Key exports: `formatDecision(record)` → string
              `narrateRoute(rawNodes, route, decisions)` → string

The decision record structure (`DecisionRecord`) is generic enough that a future UI could consume it directly without rework.

## Current State
Prototyping Phase 1. Testing against the live GitHub Pages build, not a local server.
Commit directly to main after each meaningful change — no branches, no PRs, no waiting.

## Conventions
- ES module imports with explicit .js extensions
- Leaflet loaded via CDN, not bundled
- Date/time in UTC throughout
- Coordinates as decimal degrees
