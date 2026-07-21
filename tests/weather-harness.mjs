// Guards the weather overlay's data path: the refetch predicate that keeps
// Open-Meteo traffic polite, and the compiled-field sampler that must agree
// with the router's interpolateWind (the two must never drift apart, or the
// heatmap would show a different wind than the plan was computed from).

import { needsFetch, padViewport } from '../src/services/weather-service.js';
import * as weatherStore from '../src/ui/weather/weather-store.js';
import { interpolateWind } from '../src/core/wind-interpolation.js';

function report(name, description, pass, detail) {
  console.log(`\n=== ${name} ===`);
  console.log(`  ${description}`);
  console.log(pass ? `  PASS: ${detail}` : `  FAIL: ${detail}`);
  return pass;
}

const view = { north: 50.7, south: 50.0, east: -3.7, west: -4.6 };

function cacheFor(viewport, fetchedAt = Date.now()) {
  return {
    area: padViewport(viewport),
    viewWidth: viewport.east - viewport.west,
    viewHeight: viewport.north - viewport.south,
    fetchedAt
  };
}

function shift(v, dLat, dLon) {
  return { north: v.north + dLat, south: v.south + dLat, east: v.east + dLon, west: v.west + dLon };
}

function testNoCacheFetches() {
  const pass = needsFetch(null, view) === true;
  return report('Empty cache fetches', 'first activation must fetch', pass, `needsFetch(null) = ${!pass ? 'false' : 'true'}`);
}

function testSmallPanReusesCache() {
  const cache = cacheFor(view);
  const nudged = shift(view, 0.1, 0.15);   // well inside the 35% padding
  const pass = needsFetch(cache, nudged) === false;
  return report('Small pan reuses the cache', 'panning within the padded bbox must not refetch',
    pass, `needsFetch = ${!pass}`);
}

function testBigPanRefetches() {
  const cache = cacheFor(view);
  const far = shift(view, 1.5, 0);   // clean out of the padded area
  const pass = needsFetch(cache, far) === true;
  return report('Leaving the padded area refetches', 'a big pan must fetch fresh data', pass, `needsFetch = ${pass}`);
}

function testZoomOutRefetches() {
  const cache = cacheFor(view);
  const zoomedOut = {
    north: view.north + 1.2, south: view.south - 1.2,
    east: view.east + 1.5, west: view.west - 1.5
  };
  const pass = needsFetch(cache, zoomedOut) === true;
  return report('Zooming far out refetches', 'viewport wider than 2x the fetched view must refetch',
    pass, `needsFetch = ${pass}`);
}

function testZoomInRefetchesForResolution() {
  const cache = cacheFor(view);
  const mid = { lat: (view.north + view.south) / 2, lon: (view.east + view.west) / 2 };
  const zoomedIn = { north: mid.lat + 0.05, south: mid.lat - 0.05, east: mid.lon + 0.07, west: mid.lon - 0.07 };
  const pass = needsFetch(cache, zoomedIn) === true;
  return report('Zooming far in refetches', 'a much smaller viewport deserves a denser grid',
    pass, `needsFetch = ${pass}`);
}

function testStaleCacheRefetches() {
  const cache = cacheFor(view, Date.now() - 2 * 60 * 60 * 1000);
  const pass = needsFetch(cache, view) === true;
  return report('Stale data refetches', 'two-hour-old forecast data must refresh', pass, `needsFetch = ${pass}`);
}

// --- sampler vs interpolateWind ---------------------------------------------

const T0 = '2026-07-21T12:00:00.000Z';
const T1 = '2026-07-21T13:00:00.000Z';

function makeGrid() {
  const lats = [50.6, 50.4, 50.2, 50.0];
  const lons = [-4.6, -4.3, -4.0, -3.7];
  const points = [];
  for (const lat of lats) for (const lon of lons) points.push({ lat, lon });

  const frame = (time, seed) => ({
    time,
    points: points.map((p, i) => ({
      lat: p.lat, lon: p.lon,
      speed: 8 + 7 * Math.abs(Math.sin(i * 1.3 + seed)),
      direction: (i * 47 + seed * 90) % 360,
      pressure: 1000 + 10 * Math.sin(i * 0.7 + seed)
    }))
  });
  return { grid: [frame(T0, 0), frame(T1, 1)], points };
}

function testSamplerMatchesInterpolateWind() {
  const grid = makeGrid();
  weatherStore.setGrid(grid);

  let maxSpeedErr = 0;
  let maxDirErr = 0;
  let n = 0;
  for (let i = 0; i < 200; i++) {
    const lat = 50.0 + Math.random() * 0.6;
    const lon = -4.6 + Math.random() * 0.9;
    const t = new Date(T0).getTime() + Math.random() * 3600 * 1000;

    const a = interpolateWind(grid, lat, lon, new Date(t).toISOString());
    const b = weatherStore.sampleField(lat, lon, t);
    if (!b) continue;
    n++;
    maxSpeedErr = Math.max(maxSpeedErr, Math.abs(a.speed - b.speed));
    const dd = Math.abs(((b.direction - a.direction + 540) % 360) - 180);
    maxDirErr = Math.max(maxDirErr, dd);
  }

  const pass = n === 200 && maxSpeedErr < 0.01 && maxDirErr < 0.1;
  return report('Fast sampler matches interpolateWind', '200 random (lat, lon, t) probes across the lattice',
    pass, `max speed error ${maxSpeedErr.toFixed(4)} kn, max direction error ${maxDirErr.toFixed(3)}°, samples ${n}`);
}

function testPressureLerp() {
  const grid = makeGrid();
  weatherStore.setGrid(grid);

  // At an exact grid point, halfway in time, pressure must be the frame average.
  const p = grid.points[5];
  const p0 = grid.grid[0].points[5].pressure;
  const p1 = grid.grid[1].points[5].pressure;
  const tMid = new Date(T0).getTime() + 1800 * 1000;
  const s = weatherStore.sampleField(p.lat, p.lon, tMid);

  const pass = s && Math.abs(s.pressure - (p0 + p1) / 2) < 1e-3;
  return report('Pressure lerps in time', 'grid-point pressure halfway between frames',
    pass, s ? `got ${s.pressure.toFixed(3)}, expected ${((p0 + p1) / 2).toFixed(3)}` : 'no sample');
}

function testCursorClampsToRange() {
  const grid = makeGrid();
  weatherStore.setGrid(grid);
  weatherStore.setTimeCursor(new Date(T1).getTime() + 999999999);
  const clampedHigh = weatherStore.getTimeCursor() === new Date(T1).getTime();
  weatherStore.setTimeCursor(0);
  const clampedLow = weatherStore.getTimeCursor() === new Date(T0).getTime();
  const pass = clampedHigh && clampedLow;
  return report('Time cursor clamps to the forecast window', 'cursor can never leave the data',
    pass, `high: ${clampedHigh}, low: ${clampedLow}`);
}

const scenarios = [
  testNoCacheFetches, testSmallPanReusesCache, testBigPanRefetches,
  testZoomOutRefetches, testZoomInRefetchesForResolution, testStaleCacheRefetches,
  testSamplerMatchesInterpolateWind, testPressureLerp, testCursorClampsToRange
];

let passed = 0;
let failed = 0;
for (const scenario of scenarios) {
  if (scenario()) passed++; else failed++;
}

console.log(`\n${passed} passed, ${failed} failed out of ${scenarios.length} weather scenarios`);
process.exit(failed > 0 ? 1 : 0);
