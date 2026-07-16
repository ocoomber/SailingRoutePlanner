import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const ZOOM = 12;

function lonToTileX(lon, zoom) {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}

function latToTileY(lat, zoom) {
  return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
}

function tileToLon(x, zoom) {
  return x / Math.pow(2, zoom) * 360 - 180;
}

function tileToLat(y, zoom) {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function tileBounds(z, x, y) {
  return {
    north: tileToLat(y, z),
    south: tileToLat(y + 1, z),
    east: tileToLon(x + 1, z),
    west: tileToLon(x, z)
  };
}

function pointInBounds(lat, lon, bounds) {
  return lat >= bounds.south && lat <= bounds.north && lon >= bounds.west && lon <= bounds.east;
}

function segmentIntersectsBounds(seg, bounds) {
  if (pointInBounds(seg.a.lat, seg.a.lon, bounds)) return true;
  if (pointInBounds(seg.b.lat, seg.b.lon, bounds)) return true;
  return false;
}

const raw = JSON.parse(readFileSync(join(ROOT, 'src/data/coastlines/sw-england.json'), 'utf-8'));

const tileMap = new Map();
const tileRingMap = new Map();

for (const seg of raw.segments) {
  const tiles = new Set();
  for (const pt of [seg.a, seg.b]) {
    const x = lonToTileX(pt.lon, ZOOM);
    const y = latToTileY(pt.lat, ZOOM);
    tiles.add(`${ZOOM}/${x}/${y}`);
  }
  for (const key of tiles) {
    if (!tileMap.has(key)) tileMap.set(key, []);
    tileMap.get(key).push(seg);
  }
}

for (const ring of (raw.outerRings || [])) {
  const tileSet = new Set();
  for (const pt of ring) {
    const x = lonToTileX(pt.lon, ZOOM);
    const y = latToTileY(pt.lat, ZOOM);
    tileSet.add(`${ZOOM}/${x}/${y}`);
  }
  for (const key of tileSet) {
    if (!tileRingMap.has(key)) tileRingMap.set(key, { outerRings: [], innerRings: [] });
    tileRingMap.get(key).outerRings.push(ring);
  }
}

for (const ring of (raw.innerRings || [])) {
  const tileSet = new Set();
  for (const pt of ring) {
    const x = lonToTileX(pt.lon, ZOOM);
    const y = latToTileY(pt.lat, ZOOM);
    tileSet.add(`${ZOOM}/${x}/${y}`);
  }
  for (const key of tileSet) {
    if (!tileRingMap.has(key)) tileRingMap.set(key, { outerRings: [], innerRings: [] });
    tileRingMap.get(key).innerRings.push(ring);
  }
}

const outDir = join(ROOT, 'tiles/coastline', String(ZOOM));
try { mkdirSync(outDir, { recursive: true }); } catch {}

let tileCount = 0;
for (const [key, segments] of tileMap) {
  const [z, x, y] = key.split('/').map(Number);
  const tileDir = join(outDir, String(x));
  try { mkdirSync(tileDir, { recursive: true }); } catch {}
  const tilePath = join(tileDir, `${y}.json`);
  const rings = tileRingMap.get(key) || { outerRings: [], innerRings: [] };
  writeFileSync(tilePath, JSON.stringify({ segments, outerRings: rings.outerRings, innerRings: rings.innerRings }));
  tileCount++;
}

console.log(`Generated ${tileCount} tiles at zoom ${ZOOM}`);
console.log(`Output: tiles/coastline/${ZOOM}/`);
