import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

function ringToSegments(ring) {
  const segs = [];
  for (let i = 0; i < ring.length - 1; i++) {
    segs.push({ a: { lat: ring[i].lat, lon: ring[i].lon }, b: { lat: ring[i + 1].lat, lon: ring[i + 1].lon } });
  }
  segs.push({ a: { lat: ring[ring.length - 1].lat, lon: ring[ring.length - 1].lon }, b: { lat: ring[0].lat, lon: ring[0].lon } });
  return segs;
}

const raw = JSON.parse(readFileSync(join(ROOT, 'src/data/coastlines/sw-england.json'), 'utf-8'));

const EPSILON = 0.02;

const simplifiedOuterRings = raw.outerRings.map(r => simplifyRing(r, EPSILON));
const simplifiedInnerRings = raw.innerRings.map(r => simplifyRing(r, EPSILON));

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
console.log(`Coarse:   ${coarseSegments.length} segments, ${simplifiedOuterRings.length} outer rings`);
console.log(`Reduction: ${((1 - coarseSegments.length / origSegs) * 100).toFixed(1)}%`);
console.log(`Written to src/data/coastline/sw-england-coarse.json`);
