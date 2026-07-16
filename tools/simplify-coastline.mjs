import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import polygonClipping from 'polygon-clipping';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function perpendicularDist(point, a, b) {
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return Math.sqrt(Math.pow(point.lon - a.lon, 2) + Math.pow(point.lat - a.lat, 2));
  const t = Math.max(0, Math.min(1, ((point.lon - a.lon) * dx + (point.lat - a.lat) * dy) / (len * len)));
  const projLon = a.lon + t * dx;
  const projLat = a.lat + t * dy;
  return Math.sqrt(Math.pow(point.lon - projLon, 2) + Math.pow(point.lat - projLat, 2));
}

function douglasPeucker(points, epsilon) {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [first, last];
  }
}

function simplifyRing(ring, epsilon) {
  if (ring.length <= 3) return ring;
  const simplified = douglasPeucker(ring, epsilon);
  if (simplified.length < 3) return ring;
  return simplified;
}

function bboxDiagonalNm(ring) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of ring) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  const dLatNm = (maxLat - minLat) * 60;
  const dLonNm = (maxLon - minLon) * 60 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  return Math.sqrt(dLatNm * dLatNm + dLonNm * dLonNm);
}

function ringToSegments(ring) {
  const segs = [];
  for (let i = 0; i < ring.length - 1; i++) {
    segs.push({ a: { lat: ring[i].lat, lon: ring[i].lon }, b: { lat: ring[i + 1].lat, lon: ring[i + 1].lon } });
  }
  segs.push({ a: { lat: ring[ring.length - 1].lat, lon: ring[ring.length - 1].lon }, b: { lat: ring[0].lat, lon: ring[0].lon } });
  return segs;
}

const BBOX = { south: 49.0, north: 51.5, west: -7.0, east: -2.0 };
const CLIP_WINDOW = [[[
  [BBOX.west, BBOX.south], [BBOX.east, BBOX.south],
  [BBOX.east, BBOX.north], [BBOX.west, BBOX.north],
  [BBOX.west, BBOX.south]
]]];

function toClipCoords(ring) {
  const coords = ring.map(p => [p.lon, p.lat]);
  coords.push(coords[0]);
  return coords;
}

function fromClipCoords(coords) {
  const points = coords.map(([lon, lat]) => ({ lat, lon }));
  const first = points[0];
  const last = points[points.length - 1];
  if (first.lat === last.lat && first.lon === last.lon) points.pop();
  return points;
}

function clipToBboxForCoarseLayer(ring) {
  try {
    const clipped = polygonClipping.intersection([[toClipCoords(ring)]], CLIP_WINDOW);
    return clipped.map(polygon => fromClipCoords(polygon[0])).filter(r => r.length >= 3);
  } catch {
    return [ring];
  }
}

const raw = JSON.parse(readFileSync(join(ROOT, 'src/data/coastlines/sw-england.json'), 'utf-8'));

const EPSILON = 0.005;
const MIN_RING_DIAGONAL_NM = 2;
const CLIP_RING_ABOVE_POINTS = 500;

const outerRingsForCoarse = raw.outerRings.filter(r => bboxDiagonalNm(r) >= MIN_RING_DIAGONAL_NM);
const innerRingsForCoarse = raw.innerRings.filter(r => bboxDiagonalNm(r) >= MIN_RING_DIAGONAL_NM);

function simplifyAndClip(rings) {
  const out = [];
  for (const ring of rings) {
    const simplified = simplifyRing(ring, EPSILON);
    const pieces = simplified.length > CLIP_RING_ABOVE_POINTS ? clipToBboxForCoarseLayer(simplified) : [simplified];
    out.push(...pieces);
  }
  return out;
}

const simplifiedOuterRings = simplifyAndClip(outerRingsForCoarse);
const simplifiedInnerRings = simplifyAndClip(innerRingsForCoarse);

const coarseSegments = [];
for (const ring of simplifiedOuterRings) {
  coarseSegments.push(...ringToSegments(ring));
}
for (const ring of simplifiedInnerRings) {
  coarseSegments.push(...ringToSegments(ring));
}

const coarse = {
  segments: coarseSegments,
  outerRings: simplifiedOuterRings,
  innerRings: simplifiedInnerRings
};

const outDir = join(ROOT, 'src/data/coastline');
try { mkdirSync(outDir, { recursive: true }); } catch {}

writeFileSync(join(outDir, 'sw-england-coarse.json'), JSON.stringify(coarse));

const origSegs = raw.segments.length;
console.log(`Original: ${origSegs} segments, ${raw.outerRings.length} outer rings`);
console.log(`Dropped ${raw.outerRings.length - outerRingsForCoarse.length} outer rings under ${MIN_RING_DIAGONAL_NM}NM diagonal (irrelevant at coarse-pass clearance)`);
console.log(`Coarse:   ${coarseSegments.length} segments, ${simplifiedOuterRings.length} outer rings`);
console.log(`Reduction: ${((1 - coarseSegments.length / origSegs) * 100).toFixed(1)}%`);

function onBboxBoundary(p) {
  return p.lat === BBOX.south || p.lat === BBOX.north || p.lon === BBOX.west || p.lon === BBOX.east;
}

let maxEdgeNm = 0;
let longEdges = 0;
for (const seg of coarseSegments) {
  if (onBboxBoundary(seg.a) && onBboxBoundary(seg.b)) continue;
  const dLatNm = (seg.b.lat - seg.a.lat) * 60;
  const dLonNm = (seg.b.lon - seg.a.lon) * 60 * Math.cos((seg.a.lat + seg.b.lat) / 2 * Math.PI / 180);
  const edgeNm = Math.sqrt(dLatNm * dLatNm + dLonNm * dLonNm);
  if (edgeNm > maxEdgeNm) maxEdgeNm = edgeNm;
  if (edgeNm > 10) longEdges++;
}
console.log(`Longest non-boundary edge: ${maxEdgeNm.toFixed(1)}NM${longEdges > 0 ? ` — WARNING: ${longEdges} edges over 10NM chord across real geometry` : ''}`);
console.log(`Written to src/data/coastline/sw-england-coarse.json`);
