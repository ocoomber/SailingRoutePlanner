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

## Current State
Prototyping Phase 1. Testing against the live GitHub Pages build, not a local server.
Commit directly to main after each meaningful change — no branches, no PRs, no waiting.

## Conventions
- ES module imports with explicit .js extensions
- Leaflet loaded via CDN, not bundled
- Date/time in UTC throughout
- Coordinates as decimal degrees
