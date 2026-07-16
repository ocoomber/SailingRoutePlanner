# Sailing Passage Planner — Server

A thin Node/Express API exposing `planPassage()` (`src/core/`) over
HTTP. This is the product surface (see `agents.md`) — the browser UI
under `src/ui/` is a debug tool, not the deployment target.

## Requirements

- Node.js ≥ 20 (uses the global `fetch`)
- The repo's `tiles/coastline/` directory must exist on disk (generated
  by `tools/generate-tiles.mjs` — already produced by the GitHub Pages
  deploy workflow; copy that output alongside this server, or run the
  tile generator locally)

## Local run

```
cd server
npm install
node index.js
```

Set `PORT` to change the listening port (default `3000`).

```
PORT=8080 node index.js
```

## Endpoints

- `GET /health` — `{ "status": "ok" }`
- `POST /plan-route` — see `server/openapi.yaml` for the full request/
  response schema.

Example:

```
curl -X POST http://localhost:3000/plan-route \
  -H "Content-Type: application/json" \
  -d '{
    "start": {"lat": 50.15, "lon": -5.05},
    "end": {"lat": 50.10, "lon": -5.30},
    "departureTime": "2026-07-20T08:00:00.000Z"
  }'
```

## Deploying

This repo does not deploy or provision a host itself. Any always-on
Node host with the repo (including `tiles/coastline/`) on disk works —
Render, Fly.io, Railway, or similar. Point the process at
`server/index.js` (or `npm start` from inside `server/`), expose the
port, and set that URL as the `servers.url` in `server/openapi.yaml`
before wiring it into a Custom GPT Action.

Nothing in this repo creates accounts or deploys on your behalf — you
choose and operate the host.

## Coastline data source (WS5)

`src/data/coastlines/sw-england.json` is built from OSM land polygons
via `tools/build-coastline-source.mjs`. That tool takes a local path to
a downloaded shapefile — it does not fetch it for you (the archive is
~700MB, too large for CI):

1. Download **land-polygons-split-4326** from
   https://osmdata.openstreetmap.de/data/land-polygons.html
2. Unzip it somewhere on disk (`tools/data/` is gitignored and works
   fine)
3. `node tools/build-coastline-source.mjs path/to/land-polygons.shp`
4. Then regenerate the coarse layer and tiles:
   `node tools/simplify-coastline.mjs && node tools/generate-tiles.mjs`

## Attribution

Coastline data is derived from OpenStreetMap
(`osmdata.openstreetmap.de`, ODbL) — "Contains OpenStreetMap data ©
OpenStreetMap contributors, ODbL" must be displayed wherever this
service's output is shown to an end client.

## GPT / agent wiring

See `server/tool-instructions.md` for the text to paste into a Custom
GPT's instructions field, and `server/openapi.yaml` for the Action
schema. Custom GPT Actions were chosen over an MCP server for this
phase — see `build-plan.md` Section 5 for the reasoning.
