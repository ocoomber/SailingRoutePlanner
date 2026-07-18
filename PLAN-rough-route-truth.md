# Plan: make the rough route the actual truth (Lizard failure, river wandering, motor fixes)

Status: planned 2026-07-17. All root causes below were **reproduced against the saved route logs**, not guessed.

## Context

The rough-route engine ([src/core/rough-route.js](src/core/rough-route.js)) is meant to be the ground truth: the taut string a skipper draws from A to B around land, which the sailing logic then refines. Today it fails that job in the app, and the fine pass on top of it wanders. Four distinct defects were found, each with a confirmed reproduction.

### Defect A — `crossesLand` endpoint exemption clears whole peninsulas (root cause of Issues 2 and 3, and "doesn't round the Lizard")

The harbour-departure exemption at [src/core/coastline.js:189-197](src/core/coastline.js#L189) waives the **entire segment-crossing test** for any leg whose first point is the start (or last point is the end) whenever that endpoint is within 1 NM of any coast. It then flags land only if the *far endpoint* is inside a polygon. So a segment from a nearshore start straight across a whole peninsula to water on the other side is "clear".

Reproduced with the exact points from `logs/route-2026-07-17T16-35-58-034Z.json` (start 49.9748,-5.1752 off Church Cove; end 49.969,-5.2294 off Kynance; clearance 0):

```
crossesLand WITH start/end exemption (as rough-route calls it): false   ← BUG
crossesLand WITHOUT exemption (null endpoints):                 true
computeRoughRoute → 1 leg straight across the Lizard, reachedCleanly: true
```

This explains:
- **Issue 2** (route-only straight line across land): `computeRoughRoute`'s fast path ([rough-route.js:131](src/core/rough-route.js#L131)) accepts the exempted straight segment.
- **Issue 3** (sailing route clipping Bass Point / Lizard Point): the fine isochrone uses the same `crossesLand`; its first legs (a = start) and the appended exact final leg ([router.js:206](src/core/router.js#L206), b = end) get the same blanket exemption.
- The harness (`tests/rough-route-harness.mjs`) passes because St Mawes → Newlyn's land-crossing segments are mid-route, far from both endpoints, so the exemption never fires there.

Two latent holes in the same function, found while verifying:
1. `segsCross` ([coastline.js:105-135](src/core/coastline.js#L105)) tests only the grid cells near `a`, near `b`, and the single midpoint cell (cells are 0.06° ≈ 3.6 NM). Long visibility-graph edges (rough-route edges are routinely 5–15 NM) have unchecked middle sections.
2. Midpoint containment sampling ([coastline.js:203-209](src/core/coastline.js#L203)) only runs `landContains(mid)` when the midpoint is **more than 1 NM from any coast segment** — a point in the middle of a narrow peninsula (like the Lizard neck, everywhere < 1 NM from coast) is never containment-tested.

### Defect B — the fine pass can sail up rivers and gets trapped in local minima (latest log, 20:15Z)

`logs/route-latest.json` (St Mawes 50.1507,-5.0236 → Newlyn 50.1065,-5.5385): the **rough route is correct** (4 legs rounding the Lizard), but the executed passage has 26 legs of which 1–22 meander around Falmouth Bay for ~10 hours, including legs 5–7 going **up the Helford River** (to 50.0964,-5.1394) and motor legs 13–17 looping at 6 kn with headings 100°, 30°, 160°, 0°, 150° — net movement *away* from the destination.

Two mechanisms, both structural:

1. **The corridor is a pure lateral band.** `makeCorridor(rough.waypoints, 3 NM)` ([route-corridor.js:24](src/core/route-corridor.js#L24), used at [passage-planner.js:71](src/core/passage-planner.js#L71)) contains the Helford mouth, and the fine tile coastline legitimately has water up the river, so `withinCorridor` + `crossesLand` both permit entering it. The coarse coastline — which fills rivers in as land, precisely so routes can't go up them — is never consulted by the fine pass.
2. **Cost is straight-line distance to the final end.** The router's cost is `distToEnd + maneuverPenalty` ([router.js:132-138](src/core/router.js#L132)), and each block routes toward the final destination ([passage-block-executor.js:8](src/core/passage-block-executor.js#L8)). From Falmouth Bay, following the corridor **south around the Lizard increases straight-line distance to Newlyn**, so the isochrone sits at a local minimum near the corridor's western edge (which is the Helford area) and dithers — under sail *and* under motor — until pruning-driven diffusion eventually leaks a node around the headland. This is why the boat "goes round in circles".

### Defect C — arrival dithering (part of Issue 1)

The isochrone advances in fixed time steps (15 min ≈ 1.5 NM under motor). Near the destination every heading overshoots, so the boat dances around the endpoint for extra full-length legs. `logs/route-2026-07-17T16-29-14-067Z.json` shows headings 290° → 240° → 330° at the end, one leg with VMG 0.3 kn while the log itself notes the direct course offered VMG 6.0. The exact-final-leg append ([router.js:197-225](src/core/router.js#L197)) only fires once a node already lies within `max(0.5, 2%·dist)` NM.

### Defect D — motor legs narrated as sailing (rest of Issue 1)

`simplifyLegs` stamps `windDescription` / `tackSide` / `windAngle` from TWA regardless of config ([router.js:351-364](src/core/router.js#L351)), and `classifyInitial` / `classifyTransition` ([src/core/classify-transition.js:24,58,93](src/core/classify-transition.js)) never check `leg.config`. Result: "Point of sail: close hauled" and "heading adjusted … to hold the same beam reach angle" on engine legs. UI rows: [src/ui/map/leg-tooltip.js:35](src/ui/map/leg-tooltip.js#L35), [src/ui/trail-card-view.js:71](src/ui/trail-card-view.js#L71).

---

## Changes

### 1. Fix the endpoint exemption in `crossesLand` (core fix — Defect A)

File: [src/core/coastline.js](src/core/coastline.js), lines 189-197.

The exemption's only legitimate purpose is letting the boat leave/enter a berth the coarse polygon covers. Forgive crossings **only within `ENDPOINT_CLEARANCE_EXEMPT_NM` (0.5 NM) of the exempted endpoint**, never mid-segment:

- When `segsCross` fires on a segment whose `a` is at/near the start (or `b` at/near the end), trim 0.5 NM off the exempted end(s) with `interpolatePoint` and re-test the trimmed sub-segment with `segsCross`. If the trimmed segment still crosses (or the far endpoint is land-contained, as now) → return `true`.
- Segments shorter than the trim are fully exempt (pure berth-exit hop), matching today's intended behaviour.

The Lizard case then returns `true` and the rough route builds its visibility graph instead of taking the fast path.

### 2. Close the two latent `crossesLand` holes (Defect A continued)

- `segsCross`: walk **all** grid cells along the segment (step along it at ≤ CELL_SIZE/2 intervals, collect cell keys in a Set, test each cell's segments once) instead of only a-cells, b-cells, and one midpoint cell.
- Midpoint sampling: drop the `nearestNm(mid) > 1 NM` guard — always run `landContains(mid)` on sampled points (ring-grid containment is cheap), and sample at ~1 NM intervals instead of 2 NM so narrow necks can't slip between samples.

### 3. Fine pass must respect the coarse water mask (Defect B, river entry)

The coarse coastline (rivers filled in) is the truth about *where a passage may go*; the fine tiles are the truth about *where the water's edge is*. The fine pass currently only uses the latter.

In the router's candidate filter (next to the corridor check, [router.js:113-117](src/core/router.js#L113)): reject `newPoint` if it is **inside a coarse land polygon** (`inAnyPolygon` against the coarse coastline's outer rings, grid-accelerated) — with the same 0.5 NM start/end exemption so a harbour berth that the coarse polygon swallows stays reachable. Thread the coarse coastline into `calculateRoute` params from [passage-planner.js](src/core/passage-planner.js) via [passage-block-executor.js](src/core/passage-block-executor.js) (it is already loaded there as `coastlineCoarse`).

This makes it *structurally impossible* for the sailing pass to enter any river the rough route filled in, regardless of corridor width.

### 4. Cost = progress along the rough route, not straight-line to end (Defect B, local-minimum trap)

Add to [route-corridor.js](src/core/route-corridor.js): `distanceToGoAlongRoute(point, polyline)` — project the point onto its nearest polyline segment, return (remaining polyline length from that projection) + (lateral distance from point to projection). Precompute cumulative segment lengths in `makeCorridor`.

In [router.js](src/core/router.js), when a corridor is supplied, use this as the node cost (`cost = distToGoAlongRoute + maneuverPenalty`) in place of straight-line `distToEnd`. Keep `distToEnd` for the arrival test only. Without a corridor (route-only/tests), behaviour is unchanged.

This turns "round the headland" from a cost *hill* into a cost *descent* — the isochrone follows the rough course instead of clinging to the Falmouth Bay local minimum. It should eliminate the hours of meandering (sail and motor) in the 20:15 log.

### 5. Kill arrival dithering (Defect C)

In the expansion loop: if a node can reach the destination within one time step (`distanceNm(node.point, end) ≤ node's max step distance`) and the direct segment passes `crossesLand` + corridor, synthesize an **arrival node** exactly at `end` with fractional duration (`dist / speed` on the direct bearing) and terminate with it (compare by arrival time if several). Removes the overshoot dance for motor and sail; the last leg aims straight at the destination.

### 6. Motor-leg narrative (Defect D)

- After `leg.config` is stamped ([passage-block-executor.js:61](src/core/passage-block-executor.js#L61)), give motor legs `windDescription: 'under engine'` and suppress point-of-sail semantics.
- `classifyInitial` / `classifyTransition` ([src/core/classify-transition.js](src/core/classify-transition.js)): branch on `config === 'motor'` — "motoring, steering direct bearing NNN°"; heading changes explained as tracking the shifting bearing, never as holding a wind angle.
- UI "Point of sail" rows ([leg-tooltip.js:35](src/ui/map/leg-tooltip.js#L35), [trail-card-view.js:71](src/ui/trail-card-view.js#L71)): show "Under engine" for motor legs.

### 7. Regression tests + the skipper-GPX oracle loop

- `tests/rough-route-harness.mjs`, new scenarios:
  - Church Cove → Kynance (49.9748,-5.1752 → 49.969,-5.2294), clearance 0 **and** 0.25: direct line must be detected as crossing; route must round Lizard Point (southmost waypoint < 49.960); `reachedCleanly` true with > 1 leg.
  - Raw `crossesLand` unit case: nearshore start → nearshore end across the peninsula, with start/end exemption active, must return `true`.
  - Keep all 5 existing scenarios green (same code path).
- New tests for `distanceToGoAlongRoute` (monotone along the polyline, lateral penalty) and the coarse-mask rejection (a point up the Helford is rejected; the berth-adjacent start is not).
- New tool `tools/rough-route-gpx.mjs`:
  - `--start lat,lon --end lat,lon [--clearance nm]` → runs `computeRoughRoute` against the coarse coastline, writes a `.gpx` route file.
  - `--compare corrected.gpx` → reports max/mean offset (NM) between the computed route and a skipper-corrected GPX (reuse `distToGpxNm` logic from the harness).
  - This is the iteration loop with the skipper: generate GPX → they correct it in the chart plotter → compare → tune.

## Files to modify

| File | Change |
|---|---|
| `src/core/coastline.js` | exemption trim (§1), segsCross full traversal + midpoint sampling (§2) |
| `src/core/router.js` | coarse-mask candidate rejection (§3), corridor-progress cost (§4), arrival-node synthesis (§5), motor-aware leg description (§6) |
| `src/core/route-corridor.js` | `distanceToGoAlongRoute`, cumulative lengths in `makeCorridor` (§4) |
| `src/core/passage-planner.js`, `src/core/passage-block-executor.js` | thread coarse coastline into router params (§3) |
| `src/core/classify-transition.js`, `src/core/passage-decisions.js` | motor narrative (§6) |
| `src/ui/map/leg-tooltip.js`, `src/ui/trail-card-view.js` | "Under engine" row (§6) |
| `tests/rough-route-harness.mjs` (+ new test files as fits `tests/all.mjs`) | regressions (§7) |
| `tools/rough-route-gpx.mjs` | new GPX export/compare tool (§7) |

Suggested order: §1–§2 first (they make every land test honest; everything else sits on them), then §3–§4 together (they share the corridor/coarse threading), then §5, §6, §7 alongside each step.

## Verification

1. `node tests/all.mjs` — existing 5 harness scenarios plus all new ones pass.
2. Repro the three logged failures in the running app (preview server), same inputs as the logs:
   - **Route-only**, 49.9748,-5.1752 → 49.969,-5.2294, clearance 0 → multi-leg route rounding the Lizard, `reachedCleanly: true`, no leg crosses land (screenshot).
   - **Sailing**, same points → no land clipping at Bass Point / Lizard Point.
   - **Sailing**, St Mawes → Newlyn (50.1507,-5.0236 → 50.1065,-5.5385, the 20:15 log) → no waypoint up the Helford; no looping legs in Falmouth Bay; motor legs hold near-direct headings along the corridor; final leg lands exactly on the destination. Check `logs/route-latest.json` leg list for monotone progress along the rough course.
   - **Motor passage** (49.9578,-5.2542 → 50.0288,-5.6655, the 17:29 log) → no 240°/330° end dance; log says "under engine", not "beam reach".
3. `node tools/rough-route-gpx.mjs --start 50.1507,-5.0236 --end 50.1065,-5.5385` → hand the GPX to the skipper for correction; `--compare` the returned file; iterate until the rough route is within ~1 NM of what they would have done.
