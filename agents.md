# Sailing Passage Planner — Agents Context

## Project
Pre-departure sailing passage planner for South West England (Cornwall,
Devon, Dorset), for one boat and skipper. Phase 1 only: no live
tracking, no GPS, no real-time nav.

**Product surface (current framing — supersedes earlier "web app"
framing):** the end client will use this via their own ChatGPT
subscription calling it as a tool. The real product is the API/tool
contract (`PassageResult` — see `build-plan.md` section 3). The web UI
is the developer's own debugging and verification surface, not the
product. `build-plan.md` is the active refactor/build plan;
`comfort-sailing-rewrite-brief.md` is the design authority for the
comfort rewrite (WS2). No other briefing documents exist — older ones
were removed as out of date.

## Stack
- Vanilla HTML/CSS/JS, ES modules with explicit `.js` extensions, no
  build step, no framework (deliberate, final decision)
- Leaflet.js via CDN for map
- Browser app plus a thin Node/Express server (`server/`, WS3) exposing
  `planPassage()` as `POST /plan-route` — core modules run unchanged in
  Node (the test suites prove this). `server/coastline-node.js` mirrors
  `CoastlineManager`'s interface but reads tiles from disk (`fs`)
  instead of fetch+IndexedDB; both share the pure
  `src/data/coastline/smart-coastline.js` merge logic. `server/` has
  its own `package.json`/`node_modules` (Express only) — no root
  package.json.
- Open-Meteo Forecast API for wind (free, no key)
- Coastline: two-pass tiled system (coarse bundled layer + z/x/y detail
  tiles generated at deploy time, cached in IndexedDB). Source data
  (`src/data/coastlines/sw-england.json`) is built from OSM land
  polygons (`osmdata.openstreetmap.de`, ODbL) via
  `tools/build-coastline-source.mjs` — done (WS5). Raw OSM vertex
  density is lightly simplified at ingestion (~56m tolerance, far below
  any clearance margin the router checks) purely to keep the spatial
  index fast; `src/core/coastline.js`'s `CELL_SIZE` (0.06°) must stay
  larger than the largest clearance margin ever passed to `crossesLand`
  (currently 2NM) or lookups silently miss land beyond the 3×3 cell
  search window. The coarse layer additionally drops outer rings
  smaller than 2NM bbox-diagonal (irrelevant at coarse-pass clearance —
  thousands of tiny rocks/islets exist in real OSM data, e.g. the Isles
  of Scilly). To regenerate from a fresh archive: see
  `server/README.md`.
- Windows PC dev environment — never assume Mac tooling

## Boat
Beneteau Oceanis Clipper 393. Polar: ORC-certified same-model proxy
(`src/data/polars/oceanis393.json`), swappable via config.

## Architecture
- `src/core/` — Pure logic, no side effects, no DOM, no fetch
- `src/services/` — Side effects (API calls, file loading)
- `src/ui/` — Presentation, DOM manipulation, event handlers (debug
  surface only)
- `src/data/` — Static JSON data + the coastline data layer
  (`src/data/coastline/`: manager, tile cache, tile selector)
- `tools/` — Build-time scripts (tile generation, coastline
  simplification), run in CI by `.github/workflows/deploy.yml`
- `tiles/coastline/{z}/{x}/{y}.json` — generated static coastline tiles

## Coding Rules
- Follow `coding-constitution.yaml` in full
- One file, one responsibility; soft ceiling ~150 lines
- Pure logic never touches DOM, fetch, or file I/O
- Complete files always, never partial diffs
- No comments unless asked
- Never access fastseas.com programmatically

## Routing Algorithm
Two-pass isochrone routing:
1. Coarse pass against the bundled simplified coastline (generous
   clearance) to discover the rough route shape
2. Buffer rough route into a corridor, fetch/cache intersecting detail
   tiles
3. Fine pass against merged tiles with the real clearance margin
Per pass: step forward in fixed time increments, fan out headings, look
up polar speed, apply wind + optional tidal vector, discard
land-crossing candidates (`crossesLand`), cap and prune the isochrone,
backtrack, simplify legs.

**Built (WS2):** a Tier-1 configuration planner
(`src/core/config-planner.js`) decides motor / headsail / full / reefed
blocks from duration-vs-hassle comfort logic
(`src/core/comfort-params.js`, `src/core/sail-configs.js`) before Tier-2
heading optimization runs per block (`router.js` `arriveByTime` /
`allowIntoWind` params). `planPassage()` in `src/core/passage-planner.js`
is the single pure entry point, returning `PassageResult` (Section 3 of
build-plan.md): summary, configBlocks, legs, decisions (heading /
landDeviation / config / transition, discriminated by `.kind`, merged
chronologically), narration, warnings, debug. Orchestration helpers:
`passage-block-executor.js` (per-block router execution + motor
fallback), `passage-decisions.js` (decision merge), `passage-result.js`
(timeline/summary/warnings assembly) — split out to keep each file
under the ~150-line soft ceiling. `src/services/passage-service.js` is
the thin browser wrapper (wind fetch + CoastlineManager callbacks);
`src/ui/app.js` calls it directly — the old manual coarse/fine
two-pass orchestration in `app.js` no longer exists. `app.js` keeps a
separate lightweight "Route-only mode" path (constant-speed
`calculateRoute` call, no wind, no comfort logic) for geometry-only
debug checks.

## Key Decisions
- Route engine returns structured data; UI renders it
- All comfort/behavior parameters configurable, none hardcoded
  (`src/core/comfort-params.js`)
- Engine agnostic to where a position came from (Phase 2 ready)
- Tidal current: planned as digitized tidal-diamond dataset + EasyTide
  stage lookup (build-plan WS4); until then routes carry a "tidal
  stream not modelled" warning
- Explainability: structured decision records + plain-language
  narration are primary outputs (for the AI-agent consumer), UI panels
  render the same records

## Warnings (must appear in every output — UI and API)
- Planning aid based on forecast, not real-time instruction
- Tidal stream not modelled unless data supplied
- Forecast can be wrong
- Cross-check against chart before departure
- OSM/ODbL attribution: `PassageResult.summary.attribution`, the UI
  footer, and `server/README.md`

## Test Suites
- `tests/run.mjs` — Land-avoidance (6 routes/cases)
- `tests/sailing-harness.mjs` — Sailing logic / Tier 2 in isolation
  (5 synthetic wind/tide scenarios + 3 edge cases), fixtures in
  `src/data/test-fixtures/`
- `tests/coastline-system.mjs` — Tiling/coastline system (48 checks)
- `tests/comfort-harness.mjs` — Comfort/Tier-1 config planner, full
  `planPassage()` end-to-end (6 scenarios: light air, long beam reach,
  short wind window, final-approach override, solo-vs-crewed hassle,
  reef trigger)
- `tests/api.mjs` — Boots `server/index.js` on an ephemeral port with a
  stubbed wind fetch, exercises `/health` and `/plan-route` (valid
  request, validation errors, debug flag)
- `tests/all.mjs` — Runs everything; must pass before any task is done
Tests always call real production functions, never reimplementations.

## Current State
Phase 1 prototyping. All test suites green as of 2026-07-16. Executing
`build-plan.md`: WS1 engine fixes (done) → WS2 comfort rewrite (done)
→ WS3 API (done) → WS5 OSM coastline swap (done) → WS4 tidal → WS6
UI/docs. Testing against the live GitHub Pages build. Commit directly
to main after each meaningful change — no branches, no PRs.

## Conventions
- ES module imports with explicit .js extensions
- Leaflet via CDN, not bundled
- Date/time in UTC (ISO-8601) throughout
- Coordinates as decimal degrees; distances NM; speeds knots
