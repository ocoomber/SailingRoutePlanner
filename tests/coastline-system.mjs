import { readFileSync } from 'fs';
import {
  lonToTileX, latToTileY, tileToLon, tileToLat,
  pointToTile, tileKey, tileBounds,
  selectTilesForCorridor, DEFAULT_TILE_ZOOM
} from '../src/data/coastline/tile-selector.js';
import { loadCoastline, crossesLand } from '../src/data/coastline/index.js';

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  PASS: ${msg}`);
    passed++;
  } else {
    console.log(`  FAIL: ${msg}`);
    failed++;
  }
}

function assertClose(actual, expected, tol, msg) {
  const ok = Math.abs(actual - expected) < tol;
  if (ok) {
    console.log(`  PASS: ${msg} (${actual})`);
    passed++;
  } else {
    console.log(`  FAIL: ${msg} — expected ${expected} ±${tol}, got ${actual}`);
    failed++;
  }
}

console.log('\n--- Tile Coordinate Maths ---');

{
  const zoom = 12;
  const plymouth = { lat: 50.37, lon: -4.14 };
  const tile = pointToTile(plymouth.lat, plymouth.lon, zoom);
  assert(tile.z === zoom, `zoom preserved`);
  assert(typeof tile.x === 'number' && tile.x >= 0, `x is valid: ${tile.x}`);
  assert(typeof tile.y === 'number' && tile.y >= 0, `y is valid: ${tile.y}`);
}

{
  const zoom = 12;
    const roundtrip = (lat, lon) => {
    const t = pointToTile(lat, lon, zoom);
    const lat2 = tileToLat(t.y, zoom);
    const lon2 = tileToLon(t.x, zoom);
    return { latOk: Math.abs(lat - lat2) < 0.1, lonOk: Math.abs(lon - lon2) < 0.1 };
  };

  const tests = [
    { lat: 50.37, lon: -4.14, name: 'Plymouth' },
    { lat: 50.10, lon: -5.30, name: 'Mounts Bay' },
    { lat: 50.00, lon: -2.00, name: 'Channel' }
  ];

  for (const t of tests) {
    const r = roundtrip(t.lat, t.lon);
    assert(r.latOk && r.lonOk, `tile roundtrip ${t.name}`);
  }
}

{
  const zoom = 12;
  const key = tileKey(zoom, 2048, 1400);
  assert(key === '12/2048/1400', `tileKey format: ${key}`);
}

{
  const bounds = tileBounds(12, 2048, 1400);
  assert(bounds.north > bounds.south, `north > south`);
  assert(bounds.east > bounds.west, `east > west`);
}

console.log('\n--- Tile Selection for Corridor ---');

{
  const route = [
    { lat: 50.08, lon: -5.42 },
    { lat: 49.80, lon: -5.00 },
    { lat: 50.15, lon: -4.50 }
  ];

  const tiles = selectTilesForCorridor(route, 10, 5);
  assert(tiles.size > 0, `corridor selects ${tiles.size} tiles`);

  for (const key of tiles) {
    const parts = key.split('/');
    assert(parts.length === 3, `tile key "${key}" has 3 parts`);
    assert(parseInt(parts[0]) === 10, `tile key ${key} at zoom 10`);
  }
}

{
  const short = [{ lat: 50.0, lon: -4.0 }];
  const tiles = selectTilesForCorridor(short, 10, 5);
  assert(tiles.size === 0, `single point yields no tiles`);
}

{
  const line = [
    { lat: 50.0, lon: -4.5 },
    { lat: 50.0, lon: -3.0 }
  ];

  const noMargin = selectTilesForCorridor(line, 10, 0);
  const withMargin = selectTilesForCorridor(line, 10, 10);
  assert(withMargin.size >= noMargin.size, `larger margin selects more or equal tiles`);
}

console.log('\n--- SmartCoastline Merge ---');

{
  const coarseData = {
    segments: [
      { a: { lat: 50.10, lon: -4.30 }, b: { lat: 50.20, lon: -4.30 } }
    ],
    outerRings: [[
      { lat: 50.05, lon: -4.35 },
      { lat: 50.05, lon: -4.25 },
      { lat: 50.25, lon: -4.25 },
      { lat: 50.25, lon: -4.35 },
      { lat: 50.05, lon: -4.35 }
    ]],
    innerRings: []
  };

  const fineData = {
    segments: [
      { a: { lat: 50.12, lon: -4.30 }, b: { lat: 50.18, lon: -4.30 } }
    ],
    outerRings: [[
      { lat: 50.10, lon: -4.33 },
      { lat: 50.10, lon: -4.27 },
      { lat: 50.20, lon: -4.27 },
      { lat: 50.20, lon: -4.33 },
      { lat: 50.10, lon: -4.33 }
    ]],
    innerRings: []
  };

  const coarse = loadCoastline(coarseData);
  const fine = loadCoastline(fineData);

  const mergedGrid = {};
  for (const key of Object.keys(coarse.grid)) mergedGrid[key] = coarse.grid[key];
  for (const key of Object.keys(fine.grid)) mergedGrid[key] = fine.grid[key];

  const smartCoastline = {
    segments: fineData.segments.concat(coarseData.segments),
    outerRings: fineData.outerRings.concat(coarseData.outerRings),
    innerRings: [],
    grid: mergedGrid
  };

  const oceanPoint = { lat: 50.0, lon: -4.5 };
  const gridKeys = Object.keys(mergedGrid);
  assert(gridKeys.length > 0, `merged grid has ${gridKeys.length} cells`);

  const waterA = { lat: 50.00, lon: -4.40 };
  const waterB = { lat: 50.02, lon: -4.38 };
  assert(!crossesLand(smartCoastline, waterA, waterB), `open water not blocked`);

  const landA = { lat: 50.15, lon: -4.30 };
  const landB = { lat: 50.15, lon: -4.20 };
  assert(crossesLand(smartCoastline, landA, landB, null, null, 0), `land-to-land blocked`);
}

console.log('\n--- Coarse vs Fine Resolution ---');

{
  const coarseJson = JSON.parse(readFileSync('src/data/coastline/sw-england-coarse.json', 'utf-8'));
  const fullJson = JSON.parse(readFileSync('src/data/coastlines/sw-england.json', 'utf-8'));

  assert(coarseJson.segments.length < fullJson.segments.length,
    `coarse (${coarseJson.segments.length}) has fewer segments than full (${fullJson.segments.length})`);

  assert(coarseJson.outerRings.length > 0 && coarseJson.outerRings.length <= fullJson.outerRings.length,
    `coarse (${coarseJson.outerRings.length}) has fewer or equal outer rings than full (${fullJson.outerRings.length}) — coarse legitimately drops islands too small to matter at coarse-pass clearance`);

  const coarse = loadCoastline(coarseJson);
  const full = loadCoastline(fullJson);

  const coarseKeys = Object.keys(coarse.grid).length;
  assert(coarseKeys > 0, `coarse grid has ${coarseKeys} cells`);
  assert(coarse.segments.length < full.segments.length,
    `coarse (${coarse.segments.length} segs) < full (${full.segments.length} segs)`);
}

console.log('\n--- Coarse pass finds approximate route ---');

{
  const fullJson = JSON.parse(readFileSync('src/data/coastlines/sw-england.json', 'utf-8'));
  const fullCoast = loadCoastline(fullJson);
  const coarseJson = JSON.parse(readFileSync('src/data/coastline/sw-england-coarse.json', 'utf-8'));
  const coarseCoast = loadCoastline(coarseJson);

  const routes = JSON.parse(readFileSync('src/data/test-routes.json', 'utf-8'));

  for (const tc of routes) {
    if (tc.expectRoute === false) continue;

    let coarseCrosses = false;
    for (let i = 0; i < 3; i++) {
      const mid = { lat: tc.start.lat + (tc.end.lat - tc.start.lat) * (i / 3), lon: tc.start.lon + (tc.end.lon - tc.start.lon) * (i / 3) };
      const mid2 = { lat: tc.start.lat + (tc.end.lat - tc.start.lat) * ((i + 1) / 3), lon: tc.start.lon + (tc.end.lon - tc.start.lon) * ((i + 1) / 3) };
      if (crossesLand(coarseCoast, mid, mid2, tc.start, tc.end, 0.5)) {
        coarseCrosses = true;
        break;
      }
    }

    if (tc.name.includes('Lizard') || tc.name.includes('Start Point')) {
      assert(coarseCrosses, `${tc.name}: coarse detects crossing`);
    } else {
      assert(!coarseCrosses, `${tc.name}: coarse does not false-positive`);
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
