# Sailing Passage Planner — Agents Context

## Project
Pre-departure sailing passage planner for South West England (Cornwall,
Devon, Dorset), for one boat and skipper. Phase 1 only: no live
tracking, no GPS, no real-time nav.

**Direction (current — supersedes the earlier fully-automatic framing):**
the skipper **hand-draws the rough course** on the map (choosing their own
clearance around land, TSS lanes, etc.), then presses **Create Sailing
Plan**. The drawn route becomes the rough-course spine that the engine's
corridor + weather/sail-config passes run over. The auto rough-route
generator is kept as a **Suggest route** helper that seeds an editable
course. The ultimate goal is unchanged: agent/MCP access through `server/`.
The human-guided flow also exists to gather data on *how skippers think* —
the saved route format optionally captures intent (per-waypoint notes,
edit history) so we can later study route-planning decisions and flag
likely mistakes.

The real product remains the API/tool contract (`PassageResult`). The web
UI is the developer's own verification surface and now also the skipper's
drawing surface. (Historical planning docs `build-plan.md`,
`comfort-sailing-rewrite-brief.md`, `PLAN-rough-route-truth.md` and
`coding-constitution.yaml` were removed once their work shipped; git
history has them.)

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
  (`src/data/coastlines/sw-england.json`) is built from the OSM
  **complete** (not "split") land-polygons dataset
  (`osmdata.openstreetmap.de`, ODbL) via
  `tools/build-coastline-source.mjs` — done (WS5). Hard-won lessons
  from building this, don't repeat them:
  - **Never hand-roll bbox polygon clipping, and never trust a bbox
    clipper that's secretly Sutherland-Hodgman** (this includes
    `@turf/bbox-clip` — verified it has the same flaw). Clipping a
    concave ring that the box splits into disjoint pieces produces one
    self-intersecting ring with bogus "bridge" edges along the clip
    boundary — this shipped once and showed up as giant misaligned
    triangles in the land-overlay debug view. Use a real polygon-
    boolean library (`polygon-clipping`, Martinez-Rueda) which returns
    each disjoint piece as its own ring.
  - **The OSM "split" land-polygons variant has this exact bug baked
    into its own internal 1° tiling** — confirmed by inspection (fake
    edges landing on round-degree coordinates). Use "complete" instead.
  - **Eurasia is one topologically connected landmass** — its coastline
    is a single polygon ring with hundreds of thousands of points even
    after simplification, and general polygon-clipping libraries choke
    on it (numerical robustness limits). `build-coastline-source.mjs`
    catches this, falls back to keeping the ring whole (never clips it,
    so no artifact), and excludes anything over
    `MAX_CONTAINMENT_RING_POINTS` (5000) from point-in-polygon
    containment checks entirely — `pointInPolygon` is O(ring length)
    and a 582k-point ring in that hot path was a 10-40x routing
    slowdown. Its segments are still kept (filtered to near the bbox)
    for line-crossing detection, which doesn't have this problem.
  - Raw OSM vertex density is lightly simplified at ingestion (~56m
    tolerance, far below any clearance margin the router checks) purely
    to keep the spatial index fast; `src/core/coastline.js`'s
    `CELL_SIZE` (0.06°, exported) must stay larger than the largest
    clearance margin ever passed to `crossesLand` (currently 2NM) or
    lookups silently miss land beyond the 3×3 cell search window. The
    coarse layer (`tools/simplify-coastline.mjs`, `EPSILON = 0.005°`
    ≈550m tolerance) additionally drops outer rings smaller than 2NM
    bbox-diagonal (tiny rocks/islets are irrelevant at coarse-pass
    clearance) and bbox-clips (via the same safe library) any single
    ring over 500 points post-simplification. It logs its longest
    non-boundary edge — chords over ~10NM mean the tolerance is chording
    across real geometry.
  - **Rings are CLIPPED per tile, never included whole**
    (`tools/generate-tiles.mjs` + `tools/tile-ring-clipper.mjs`):
    each tile stores the Martinez-intersection of every ring with its
    bounds expanded by `CLIP_MARGIN_DEG` (0.01°) — the overlap makes
    containment seams at tile boundaries impossible (overlap is safe
    for "in any polygon"; gaps are not). Tiles fully inside a ring with
    no ring edge nearby get a full-rect piece. This means the mainland
    ring IS present (as small pieces) in every tile it covers — fine
    tiles answer mainland containment themselves. Only tiles containing
    segments are written; unwritten tiles fall back to coarse
    containment, which is correct (deep-inland = land, open-sea =
    water, both within coarse tolerance).
  - **Containment is layered, never merged** (`SmartCoastline.containsLand`):
    point in a loaded tile → fine rings only; otherwise → coarse rings
    only. Coarse outerRings are NEVER concatenated into the fine set —
    doing so once let coarse chords across the Fal estuary mark real
    water as land in the fine routing pass (the "land overlay doesn't
    match the map" bug). `crossesLand` calls `containsLand` when the
    coastline object provides it. Segments/grid stay merged (fine cells
    override coarse per cell) — crossing detection is safe to layer that
    way, containment is not.
  - `TileCache` bumps `DB_VERSION` and clears the store on upgrade
    whenever tile content/shape changes — IndexedDB caches tiles
    forever, so regenerated tiles are invisible without a version bump.
  - **The clearance margin is exempt within 1NM of the start/end points**
    (`ENDPOINT_CLEARANCE_EXEMPT_NM` in `src/core/coastline.js`): with
    accurate OSM data, harbour mouths (e.g. St Mawes, ~1NM wide) are
    narrower than 2× the default 0.5NM comfort margin, so without the
    exemption no route can ever leave or enter harbour. Real land
    crossings near endpoints are still blocked by the segment checks —
    only the open-water comfort buffer is waived. Mid-route narrow
    channels remain subject to the full margin (known limitation,
    future refinement).
  - The land-overlay debug view renders exactly what containment uses:
    red fill = fine tile pieces, orange dashed = coarse fallback. An
    all-orange overlay just means no tiles are loaded yet (no route
    calculated) — approximate by design, not a bug. Straight edges on
    lon −2.0/lat 51.5 are the data bbox boundary, also not a bug.
  To regenerate from a fresh archive: see
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
- `tiles/coastline/manifest.json` — generated list of which tiles exist +
  the data bbox. The client fetches only tiles in the manifest, so open
  water produces no 404s and can be labelled "no land tile" rather than
  "not loaded". **Regenerate with `node tools/generate-tiles.mjs`
  whenever the coastline source changes.**

### UI structure (debug tool, map-first)
- `index.html` holds two full-screen views: `#view-map` and
  `#view-settings`, switched by URL hash via `src/ui/views.js`. One
  document on purpose — a separate settings page would re-fetch the
  polars and coarse coastline, discard every loaded detail tile, and lose
  the map position and computed route.
- Floating panels (Route, Layers, Decision trail) are **siblings of `#map`,
  never children**: as children, every click on a panel also reaches Leaflet
  and would drop a waypoint. They sit at `--z-panel: 1100` to clear
  Leaflet's own controls (400–1000).
- `src/ui/map/` — the map module, split by responsibility:
  - `map-core.js` — lifecycle, viewport, `fitToLegs`, and map-click
    arbitration: a charting tool claims the click first (`isToolActive()`),
    otherwise the click is delegated to the route editor (drops a waypoint).
    `fitBounds` is called by `passage-run.js`, **not** by a layer: layers
    must never steal the viewport.
  - `layer-registry.js` — the ONLY place Leaflet layers are added/removed.
  - `layer-defs.js` — every overlay declared once (label, description,
    swatch, `dependsOn`, `build`). The Layers panel renders from this.
  - `layers/*.js` — pure builders, `build(state) -> L.Layer[]`. They never
    read the map; anything viewport-dependent takes `state.bounds`.
  - `leg-styles.js` / `leg-tooltip.js` — pure; single source of truth for
    sail-config colours, shared by the map legend and the trail cards.
- `src/ui/selection.js` — shared leg selection. Every change carries an
  `origin`; the map only pans when origin is `'trail'` and the trail only
  scrolls when origin is `'map'`. Without that guard the two panels chase
  each other in a feedback loop.
- `src/ui/app-state.js` — the render state layers draw from. **Replace a
  key, never mutate what it points at** — `dependsOn` uses identity
  comparison to decide what rebuilds.
- `src/ui/settings-schema.js` — every tunable number with a plain-English
  description of what it ACTUALLY does. Deliberately over the line ceiling:
  it is one coherent data table. If you change engine behaviour, change the
  description in the same edit.
- `src/ui/settings-store.js` — persists **sparse overrides only** to
  `localStorage['srp.settings.v1']`, keyed by schema path. Never a full
  snapshot: untouched values keep following the engine defaults.

### Layer registry rules (easy to get wrong)
- Visibility is `addLayer`/`removeLayer` on a persistent group — **never a
  rebuild**. Toggling stays instant and keeps selection.
- Selection restyles existing handles via `setStyle` — **never triggers
  `render()`**. Rebuilding polylines on hover flickers and drops bindings.
- Fine land and coarse land are **separate, independent layers**. They were
  once drawn into one group behind one checkbox, which made the fine
  coastline impossible to assess on its own. Do not re-merge them.

### Drawn route: the skipper's rough course
The rough course is drawn by hand, not generated. The flow and its modules:
- `src/core/route-model.js` — the pure route data model (no DOM/Leaflet, runs
  in Node and `server/`). Waypoints carry a **stable id**; notes/leg-notes are
  keyed by id, never array index, so insert/delete never re-labels a note.
  Optional intent fields (`name`, `note`, `legNotes`, `history`) — a bare
  route is just `format`/`version`/`waypoints`. `history` records
  add/insert/move/remove/note/suggest/import ops (moves coalesce per drag,
  capped 1000) so we can later study how a course was refined. `toWaypoints()`
  yields the plain `[{lat,lon}]` the engine consumes.
- `src/core/route-io.js` — pure GPX/CSV converters for nav-system interop.
  GPX uses the same `<rtept>` dialect `tools/rough-route-gpx.mjs` parses, and
  embeds the full route JSON in `<extensions>` for loss-free re-import.
- `src/services/route-store.js` — debounced localStorage autosave
  (`srp.route.v1`), drop-and-warn on version mismatch (settings-store pattern).
- `src/ui/route-editor.js` — the map interaction: numbered draggable waypoints
  and per-leg polylines, click-a-leg-to-insert. Owns its **own** `L.layerGroup`
  (NOT the registry — registry builders are pure and rebuild on state change,
  which fights live drag state). Reports every edit via `onRouteChanged`.
- `src/ui/route-panel.js` — the Route panel: leg table, totals, magnetic
  variation, notes (one-tap intent capture), and actions (Suggest, Reverse,
  Clear route, Export GPX/CSV, Import). `src/ui/app.js` wires these together.

### The rough-route seam (`planPassage`)
`planPassage(input)` takes an optional `input.roughRoute` (`[{lat,lon}]`, ≥2).
When present it **bypasses `computeRoughRoute`** and calls
`assessProvidedRoute` (rough-route.js) instead — same return shape, so the
corridor/timeline/execution passes are unchanged, `start`/`end` come from the
route endpoints, and `debug.roughRoute.provided` is set. Drawn-route legs are
crossing-tested at **clearance 0** (the skipper chose the offing; the coarse
rings fill rivers in as land, so a margin test would false-positive on real
harbour approaches). A crossing is a **warning, not a block** — Pass 2 against
the fine tiles plus the `ARRIVAL_SHORTFALL_NM` note is the real gate.
`server/plan-route.js` accepts the same `roughRoute` for MCP parity.

### Charting overlays
- OpenSeaMap seamarks are a **registry layer** (`layers/chart-layers.js`,
  group "Charts", `dependsOn: []`), toggled from the Layers panel — not a tool.
- `charting-tools.js` (ruler, measuring bar) owns its own Leaflet objects and
  exposes `isToolActive()` for the map-click arbitration. Draggable handles use
  `L.marker` + a divIcon, never `L.circleMarker` — Leaflet silently ignores
  `draggable` on circle markers (the old bar endpoints never actually moved).
  A future refactor may split this into a per-tool `tool-manager` framework.

## Coding Rules
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

**Maneuver-cost bias (`tackPenaltyKn`, comfort param):** isochrone
candidates are ranked by `cost = distToEnd + accumulatedManeuverPenalty`,
not raw `distToEnd`. Each step that flips the boat's TWA sign (tack or
gybe) adds `tackPenaltyKn * timeStepHours` NM to a penalty that
**accumulates along the path**, so a route that dithered many times loses
to a cleaner one reaching the same frontier. This models the real cost of
a maneuver and stops the router flipping tack/gybe on sub-NM VMG
differences under realistic slowly-veering wind (the earlier "56 legs /
14 tacks / 25 gybes" St Mawes→Newlyn symptom). A per-step (non-
accumulating) penalty was tried first and was too weak/noisy — the merge
in `simplifyLegs` also can't fix this, since it runs after route
selection and never merges across a TWA-sign change. Arrival/arrive-by
checks still use true `distToEnd`. Default 0.8kn; 0 disables it and
restores raw-distance ranking (the default for direct `calculateRoute`
callers like `tests/run.mjs` and the UI Route-only debug path, which
don't pass comfort params).

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

### Engine-on/off hysteresis band
`engineOnWindKn` (4) and `engineOffWindKn` (6) form a dead band: inside it
the boat keeps whatever it is already doing rather than flip-flopping in
marginal air. `passesHysteresis` gates BOTH directions; **final-approach
motoring deliberately bypasses the band**. `minSailableWindKn` (5) sits
inside the band and only sets the *preferred* config — the band decides
when the switch actually happens. This is coherent because
`changeDurationThresholdMin(→motor)` is 0, so the band is the only lever
that can hold off the engine. The 4kn default is also the lowest TWS the
polar has data for, so below it the boat genuinely cannot sail.

`maxComfortWindKn` (25) is **advisory only** — it flags legs
(`leg.comfortExceeded`) and adds a passage warning. It never reroutes.

### Coastal clearance cascade
The coarse pass starts at `COARSE_CLEARANCE_NM` (2) and relaxes through
`NARROW_HARBOUR_CLEARANCE_FALLBACKS_NM` until a route exists. **Whichever margin
worked must be carried into the fine pass** (`effectiveClearanceNm =
min(requested, coarseClearanceUsedNm)`) — it once wasn't, so the planner would
prove 0.5NM impossible, then route the fine pass at 0.5NM anyway and the passage
died. When it is reduced below what the skipper asked for, say so in `warnings`.
Measured out of Falmouth: 2NM cannot leave the harbour at all (every heading is
blocked, fails in 3ms); 0.5NM cannot reach Penzance (stalls 0.8NM off); 0.2NM
works. `summary.clearanceMarginUsedNm` reports what was actually used.

### Truncated passages must declare themselves
`executeBlocks` breaks out of its loop when a block finds no route, so
`execution.legs` can stop well short of the destination while still looking like
a successful result (`summary.arrivalTime` is computed from summed leg durations
regardless). `passage-planner` checks the shortfall against
`ARRIVAL_SHORTFALL_NM` and sets `summary.reachedDestination` /
`summary.shortfallNm`, and pushes an INCOMPLETE PASSAGE warning. Never present a
short route as a passage to the destination.

### Two-tier routing: rough course, then sail the corridor
The greedy isochrone alone wandered (up rivers, round headlands). It is now
wrapped by a rough-course first pass. **The rough course is normally the one
the skipper drew** (`roughRoute` → `assessProvidedRoute`, see "The rough-route
seam" above); the generator below is the fallback and the "Suggest route" seed:
1. **Rough course** — `src/core/rough-route.js`. `computeRoughRoute` is a
   shortest path across a VISIBILITY GRAPH over the **coarse** land (which fills
   rivers in, so the string can't go up one). Nodes are coarse-ring corners near
   the passage, nudged into open water; edges are clear-water `crossesLand`
   tests; Dijkstra finds the taut string. One leg in open water (fixes the
   36-heading wobble); rounds headlands like the skipper's own GPX. Its
   counterpart `assessProvidedRoute` takes a drawn course as-is (no generation),
   returning the same shape so the rest of the planner reads them identically.
   **Route-only mode** (`passage-run.js`) now assesses the *drawn* route (no
   generation, no wind), showing its legs plus any land-crossing warning.
2. **Corridor** — `src/core/route-corridor.js`. The rough polyline + a
   half-width (`CORRIDOR_WIDTH_NM = 3`). `router.js` rejects any candidate whose
   lateral offset exceeds it, so the sailing isochrone can't divert off the
   course (no more Helford strand). Falmouth→Penzance now reaches the
   destination.
3. **Timeline** — `src/core/route-timeline.js` `buildTimelineAlongRoute` walks
   the rough course through the forecast to feed the config planner. This
   REPLACED the old coarse isochrone pass. NB: the old pass's leading `motor`
   block was an artifact of the router's root node carrying `windSpeed: 0` — the
   walker samples real wind at departure, so a passage in sailing wind now
   correctly starts under sail.

**Performance guards (both essential — without them a real passage takes minutes):**
- `pruneCoastlineToCorridor` (route-corridor.js) filters the fine coastline to
  the corridor band before routing, so land far from the course can't be tested.
- `loadCoastline` builds an **`outerRingGrid`** (cell → ring indices) and
  `inAnyPolygon` uses it, so containment scans only rings near the point, not
  every loaded detail-tile ring. Big rings (>400 cells) go in a small global
  list. This is the containment analogue of the segment grid.

### KNOWN LIMITATION — light-air passages are slow and over-tack
The corridor fixes *correctness* (reaches the destination, no wander) but the
sailing isochrone inside it is still greedy best-first on
`cost = distToEnd + maneuverPenalty`, with no elapsed-time term. On a long
light/variable-wind beat (e.g. Falmouth→Penzance in real forecast wind) it
produces many short tacks (100+ legs) and takes tens of seconds. That is a
distinct problem from the wander — it needs a real cost function (A*-style
elapsed time + admissible heuristic) and stronger light-air tack damping. Use
`logs/route-latest.json` (leg-by-leg wind/tack/config) to diagnose. Do not paper
over it with clearance or corridor tweaks.

### Endpoint clearance (leaving/entering a harbour)
Coastal passages always start and end near land, so clearance must relax there.
`crossesLand` waives the margin within `ENDPOINT_CLEARANCE_EXEMPT_NM` (0.5) of
`start`/`end` — the land-crossing tests still apply, so it hugs the berth without
cutting through land. **`router.js` expansion must pass BOTH `start` and `end`**
(it once passed `end` as `null`, so arrival was never exempt and a harbour
destination was unreachable — stalled ~0.8NM off). Default coastal clearance is
`0.25` NM (`ROUTING_DEFAULTS`, `DEFAULT_ROUTER_OPTS`).

### Debug log is a file, not the on-screen panel
Every route POSTs a structured JSON log to `POST /debug-log`
(`src/services/debug-log.js` → `server/index.js`), written to
`logs/route-latest.json` (+ timestamped copy, `logs/` gitignored). Assembled by
the pure `src/core/route-log.js`. **Read that file to debug a route** — the user
does not copy/paste. This is why `start.cmd` now runs `node server/index.js`
(serves the app AND receives logs) instead of a static server. The server's
entry check uses `pathToFileURL(process.argv[1])` so it actually listens on
Windows (the old `file://${argv[1]}` never matched).

### Wind field interpolation (`src/core/wind-interpolation.js`)
The forecast is a **4x4 lattice** (`samplePoints(area, 4)` in `services/wind.js`)
— roughly 13NM x 7NM spacing over a typical passage. How it is sampled matters
enormously:
- **Space is bilinear on vector (u/v) components.** It was once
  nearest-neighbour, which turned the lattice into four hard Voronoi cells:
  crossing an invisible boundary snapped wind direction by up to ~120° in one
  step, flipping TWA sign. The router answered with spurious tacks/gybes and
  wandering, and the config planner thrashed motor↔sail across the same
  boundaries — routes came out as a visible tangle. Route-only mode looked fine
  purely because it never reads the wind. **Do not go back to nearest-neighbour.**
  Working in u/v also handles the 0°/360° wrap and lets opposing light airs blend
  toward calm (physically right where airstreams meet).
- **Time stays polar** (speed linear, direction along the shortest arc). A
  forecast frame is a state evolving, not a vector to average: 10kn veering to
  20kn must pass through ~15kn, and a wind reversing across an hour must not
  vector-average to a false calm at the midpoint. `tests/sailing-harness.mjs`
  and `tests/wind-interpolation-harness.mjs` both pin this.
- **Sample wind once per node, never per heading.** `router.js` hoists
  `interpolateWind` and `findNoGoAngle` out of the heading loop — they depend
  only on the node's position/time. Putting them back inside costs ~36x.

### Data-shape traps (verified — a debug tool that gets these wrong lies)
- **Never pair decisions to legs by timestamp.** `decision.time` comes from
  the coarse-pass timeline; `leg.startTime` is a cumulative sum of
  fine-pass durations. Two independent clocks that drift, so boundary
  records get misattributed. Pair **structurally by index**:
  `configBlocks[].legStartIndex`/`legEndIndex` (set in
  `passage-block-executor.js`), and `classifyTransition(legs[i-1], legs[i])`
  which is index-aligned by construction.
- `debug.configBlocksRaw` is the **unmerged** blocks.
  `mergeAdjacentConfigBlocks` copies (it used to mutate its input) and
  absorbs decisions, which would lose `router-fallback` records. The trail
  reads the raw ones.
- **`leg.maneuver` marks the END of the leg it sits on** ("tack at the end
  of this leg"), not the start. Draw the marker at `endWaypoint`.
- **`leg.config` only exists on legs from `executeBlocks`.** Route-only /
  geometry mode legs have no `config` — always guard.
- `leg.windAngle` is **absolute**; `tackSide` is the only place the TWA
  sign survives.
- `decisions[].step` is a rawNode index **within its block** and restarts
  per block — never use it as a leg index.
- `heading` decisions fire once per raw node, so they vastly outnumber legs.
  They are not attached to cards and get no map layer.
- Decision positions use `roundCoord` (5dp). The shared `round1` is for
  speeds/VMG only — using it on lat/lon put markers ~11km out.
- `formatConfigDecision` checks `accepted` FIRST, then the trigger supplies
  the reason. A refused change must never render affirmative prose.
- `config-planner` re-evaluates on **every** step; `lastEvaluatedIdeal` only
  de-duplicates the rejection log. It must never gate the evaluation itself,
  or a change refused once (e.g. by the band) can never pass later.

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
  (6 synthetic wind/tide scenarios + 3 edge cases), fixtures in
  `src/data/test-fixtures/`. The "Slowly veering wind" scenario
  (`wind-veering.json`, 2°/hr veer) asserts `maxManeuvers <= 3` — it
  guards the tack/gybe dithering fixed by `tackPenaltyKn`; with the
  penalty at 0 it produces 5+ maneuvers and fails.
- `tests/coastline-system.mjs` — Tiling/coastline system (48 checks)
- `tests/comfort-harness.mjs` — Comfort/Tier-1 config planner, full
  `planPassage()` end-to-end (6 scenarios: light air, long beam reach,
  short wind window, final-approach override, solo-vs-crewed hassle,
  reef trigger)
- `tests/rough-route-harness.mjs` — The rough-course engine (9 scenarios):
  open water is one leg (Issue 2), the course clears the coast and rounds the
  Lizard, tracks the skipper's GPX within tolerance, never enters the Helford,
  and the harbour-clearance split lets an estuary berth escape at a wide margin.
- `tests/wind-interpolation-harness.mjs` — The wind field (8 scenarios). Guards
  the nearest-neighbour regression: asserts the field is smooth (no >5° step
  across a 356°→234° contrast), that space blends and wraps through north, that
  opposing light airs cancel in space, and that TIME stays polar (10kn@350° →
  20kn@10° passes through 15kn@0°; a reversing wind keeps its strength).
- `tests/comfort-band-harness.mjs` — The engine-on/off hysteresis band and
  the max-comfort advisory (5 scenarios). Drives `planConfigurations`
  directly with a synthetic timeline, so the band is asserted exactly with
  no router or polar interpolation in the way. Covers: band holds at 4.5kn
  then releases at 3.5kn; a refused change does not latch the engine out;
  final approach bypasses the band; comfort ceiling warns without
  rerouting.
- `tests/route-model-harness.mjs` — The drawn-route model and IO (27 checks):
  id-stable annotations across insert/delete, history coalescing/cap, serialize
  and GPX/CSV round-trips (incl. against the `tools/` GPX parser).
- `tests/provided-route-harness.mjs` — The rough-route seam (7 checks):
  `assessProvidedRoute` flags a land-crossing drawn route, and `planPassage`
  with a `roughRoute` follows the drawn spine and marks `debug.roughRoute.provided`.
- `tests/api.mjs` — Boots `server/index.js` on an ephemeral port with a
  stubbed wind fetch, exercises `/health` and `/plan-route` (valid
  request, validation errors, debug flag, and a `roughRoute` request)
- `tests/all.mjs` — Runs everything; must pass before any task is done
Tests always call real production functions, never reimplementations.

## Current State
Phase 1 prototyping. All test suites green. Pivot to skipper-drawn routes
shipped: the map now has a route editor (draw → Create Sailing Plan), the
engine takes a provided `roughRoute`, routes autosave to localStorage and
export/import as GPX/CSV, and an OpenSeaMap seamark overlay was added. The
auto-generator remains as "Suggest route". Remaining engine backlog: WS4
tidal, and the light-air over-tack cost function below. Testing against the
live GitHub Pages build. Commit directly to main after each meaningful
change — no branches, no PRs.

**Known open issue (not yet fixed):** with a small `timeStepMinutes`
(e.g. 15) the isochrone router can dither indefinitely near the arrival
threshold instead of converging — seen live in the browser for a real
route (St Mawes → Newlyn), hundreds of steps oscillating at ~0.5-0.7NM
from destination without ever crossing the threshold, eventually
exhausting `maxSteps`. Reproducible; not yet root-caused. Separate from
(and discovered while investigating) the coastline data bugs above.

**Fixed since (same investigation, two more real bugs found beyond the
clip-artifact one above):**
- `tools/generate-tiles.mjs` was assigning each ring's FULL point list to
  *every* tile whose bbox contained any single point of that ring. A
  ring representing a whole regional landmass (hundreds of points)
  touches dozens of tiles, so it got duplicated into every one of them
  — bloating tile files (46MB → 6.3MB after the fix) and, worse, making
  `SmartCoastline` render/scan the same giant polygon N times when N
  tiles loaded for one route (this is what the "garbage" triangular
  overlay in Truro/Falmouth actually was — not corrupt geometry, just
  the same real polygon stacked and rendered many times over). Fixed
  two ways: `generate-tiles.mjs` now skips rings over
  `MAX_RING_POINTS_PER_TILE` (500) entirely — the coarse layer already
  carries an equivalent copy for containment fallback — and
  `src/data/coastline/dedupe-rings.js` deduplicates by ring signature
  when merging tiles at runtime (`manager.js`, `server/coastline-node.js`)
  as a second layer of defense.
- The coarse pass's clearance-margin fallback (single step, 2NM → 0.5NM)
  wasn't small enough for the tightest real channels — confirmed the Fal
  estuary near St Mawes genuinely narrows below 0.5NM in the accurate
  OSM data (the old crude in-house coastline just couldn't see this).
  `planPassage()` now cascades through `[2, 0.5, 0.2, 0.05]` NM,
  stopping at the first clearance that finds a route. Note this can be
  slow (each failing attempt runs the isochrone out to `maxSteps` before
  giving up, so a route needing the tightest fallback can take ~10s) —
  not fixed, just made correct. The UI's "Route-only mode" debug path
  does NOT use this cascade (it calls `calculateRoute` directly with
  whatever clearance the user set) — that's intentional, it's meant to
  show the literal outcome at the chosen clearance, not paper over it.

## Conventions
- ES module imports with explicit .js extensions
- Leaflet via CDN, not bundled
- Date/time in UTC (ISO-8601) throughout
- Coordinates as decimal degrees; distances NM; speeds knots
