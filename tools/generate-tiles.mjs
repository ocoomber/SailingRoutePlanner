import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pointInPolygon } from '../src/core/geometry.js';
import {
  CLIP_MARGIN_DEG, ringBbox, boundsOverlap, expandBounds,
  fullBoundsRing, clipRingToBounds
} from './tile-ring-clipper.mjs';

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

function tileKeysForBbox(bbox, zoom) {
  const keys = [];
  const x1 = lonToTileX(bbox.west, zoom);
  const x2 = lonToTileX(bbox.east, zoom);
  const y1 = latToTileY(bbox.north, zoom);
  const y2 = latToTileY(bbox.south, zoom);
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      keys.push(`${zoom}/${x}/${y}`);
    }
  }
  return keys;
}

const raw = JSON.parse(readFileSync(join(ROOT, 'src/data/coastlines/sw-england.json'), 'utf-8'));

const tileMap = new Map();
for (const seg of raw.segments) {
  const bbox = {
    south: Math.min(seg.a.lat, seg.b.lat),
    north: Math.max(seg.a.lat, seg.b.lat),
    west: Math.min(seg.a.lon, seg.b.lon),
    east: Math.max(seg.a.lon, seg.b.lon)
  };
  for (const key of tileKeysForBbox(bbox, ZOOM)) {
    if (!tileMap.has(key)) tileMap.set(key, []);
    tileMap.get(key).push(seg);
  }
}

function edgeTileSets(rings) {
  const sets = rings.map(() => new Set());
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const bbox = expandBounds({
        south: Math.min(a.lat, b.lat),
        north: Math.max(a.lat, b.lat),
        west: Math.min(a.lon, b.lon),
        east: Math.max(a.lon, b.lon)
      }, CLIP_MARGIN_DEG);
      for (const key of tileKeysForBbox(bbox, ZOOM)) {
        sets[r].add(key);
      }
    }
  }
  return sets;
}

const outerRings = raw.outerRings || [];
const innerRings = raw.innerRings || [];
const outerBboxes = outerRings.map(ringBbox);
const innerBboxes = innerRings.map(ringBbox);
const outerEdgeTiles = edgeTileSets(outerRings);
const innerEdgeTiles = edgeTileSets(innerRings);

function ringPiecesForTile(key, bounds, rings, bboxes, edgeTiles) {
  const expanded = expandBounds(bounds, CLIP_MARGIN_DEG);
  const center = {
    lat: (bounds.north + bounds.south) / 2,
    lon: (bounds.east + bounds.west) / 2
  };
  const pieces = [];
  for (let r = 0; r < rings.length; r++) {
    if (!boundsOverlap(bboxes[r], expanded)) continue;
    if (edgeTiles[r].has(key)) {
      pieces.push(...clipRingToBounds(rings[r], expanded));
    } else if (pointInPolygon(center, rings[r])) {
      pieces.push(fullBoundsRing(expanded));
    }
  }
  return pieces;
}

const outDir = join(ROOT, 'tiles/coastline', String(ZOOM));
mkdirSync(outDir, { recursive: true });

let tileCount = 0;
let totalPieces = 0;
let maxPiecePoints = 0;

for (const [key, segments] of tileMap) {
  const [z, x, y] = key.split('/').map(Number);
  const bounds = tileBounds(z, x, y);

  const outerPieces = ringPiecesForTile(key, bounds, outerRings, outerBboxes, outerEdgeTiles);
  const innerPieces = ringPiecesForTile(key, bounds, innerRings, innerBboxes, innerEdgeTiles);

  for (const piece of outerPieces) {
    totalPieces++;
    if (piece.length > maxPiecePoints) maxPiecePoints = piece.length;
  }

  const tileDir = join(outDir, String(x));
  mkdirSync(tileDir, { recursive: true });
  writeFileSync(join(tileDir, `${y}.json`), JSON.stringify({
    segments,
    outerRings: outerPieces,
    innerRings: innerPieces
  }));
  tileCount++;
}

const manifestTiles = Array.from(tileMap.keys()).sort();
const manifestBbox = { north: -90, south: 90, east: -180, west: 180 };
for (const key of manifestTiles) {
  const [z, x, y] = key.split('/').map(Number);
  const b = tileBounds(z, x, y);
  if (b.north > manifestBbox.north) manifestBbox.north = b.north;
  if (b.south < manifestBbox.south) manifestBbox.south = b.south;
  if (b.east > manifestBbox.east) manifestBbox.east = b.east;
  if (b.west < manifestBbox.west) manifestBbox.west = b.west;
}

writeFileSync(join(ROOT, 'tiles/coastline', 'manifest.json'), JSON.stringify({
  zoom: ZOOM,
  bbox: manifestBbox,
  tiles: manifestTiles
}));

console.log(`Generated ${tileCount} tiles at zoom ${ZOOM}`);
console.log(`Outer ring pieces: ${totalPieces} (largest ${maxPiecePoints} points)`);
console.log(`Manifest: ${manifestTiles.length} tiles, bbox ${JSON.stringify(manifestBbox)}`);
console.log(`Output: tiles/coastline/${ZOOM}/`);
