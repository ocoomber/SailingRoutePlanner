import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as shapefile from 'shapefile';
import polygonClipping from 'polygon-clipping';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const USAGE = `
Usage: node tools/build-coastline-source.mjs <path-to-land-polygons.shp>

Input: the WGS84 "complete" (NOT "split") land-polygons shapefile from
  https://osmdata.openstreetmap.de/data/land-polygons.html
  (download "land-polygons-complete-4326", unzip it, pass the .shp path
  here — the matching .dbf/.shx files must sit alongside it)

Use "complete", not "split": the split variant pre-tiles landmasses on
its own internal 1-degree grid, and wherever a landmass crosses one of
those internal tile boundaries the split tool leaves a straight bridge
edge along the seam — confirmed by inspection (nearly every long fake
edge sat exactly on a round-degree line). "complete" has one genuine,
correctly-closed polygon per landmass with no internal seams.

This is a ~700MB-1.3GB download; fetching it automatically is not done
here — download it yourself and pass the local path. A good place to
keep it is tools/data/ (gitignored).

Output: src/data/coastlines/sw-england.json, clipped to the bbox
  lat 49.0-51.5, lon -7.0 to -2.0 using the polygon-clipping package
  (a real polygon-boolean library implementing Martinez-Rueda), not
  hand-rolled Sutherland-Hodgman and not @turf/bbox-clip (also
  Sutherland-Hodgman under the hood — verified both produce the same
  bogus bridge-edge artifact for a concave ring that splits into
  disjoint pieces at the clip boundary; polygon-clipping correctly
  returns each piece as its own separate ring instead). Rings are then
  lightly simplified (~56m tolerance — well below any clearance margin
  this router ever checks) to keep the spatial index usable against
  raw OSM's meter-scale vertex density, in the existing
  {segments, outerRings, innerRings, source} shape.
`;

const BBOX = { south: 49.0, north: 51.5, west: -7.0, east: -2.0 };
const CLIP_WINDOW = [[[
  [BBOX.west, BBOX.south], [BBOX.east, BBOX.south],
  [BBOX.east, BBOX.north], [BBOX.west, BBOX.north],
  [BBOX.west, BBOX.south]
]]];

function bboxIntersectsRaw(ring, bbox) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lon, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return maxLat >= bbox.south && minLat <= bbox.north && maxLon >= bbox.west && minLon <= bbox.east;
}

const LIGHT_SIMPLIFY_EPSILON_DEG = 0.0005;

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
  let maxDist = 0, maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function lightSimplify(ring) {
  if (ring.length <= 3) return ring;
  const simplified = douglasPeucker(ring, LIGHT_SIMPLIFY_EPSILON_DEG);
  return simplified.length < 3 ? ring : simplified;
}

function toPoints(coords) {
  const points = coords.map(([lon, lat]) => ({ lat, lon }));
  const first = points[0];
  const last = points[points.length - 1];
  if (first.lat === last.lat && first.lon === last.lon) points.pop();
  return points;
}

function ringToSegments(ring) {
  const segs = [];
  for (let i = 0; i < ring.length - 1; i++) {
    segs.push({ a: ring[i], b: ring[i + 1] });
  }
  segs.push({ a: ring[ring.length - 1], b: ring[0] });
  return segs;
}

function geometryToMultiPolygonCoords(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function pointsToClosedCoords(points) {
  const coords = points.map(p => [p.lon, p.lat]);
  coords.push(coords[0]);
  return coords;
}

const SEGMENT_KEEP_BUFFER_DEG = 1.0;
const MAX_CONTAINMENT_RING_POINTS = 5000;

function pointNearBbox(p, bbox, buffer) {
  return p.lat >= bbox.south - buffer && p.lat <= bbox.north + buffer &&
    p.lon >= bbox.west - buffer && p.lon <= bbox.east + buffer;
}

function relevantSegmentsFromRing(ring, bbox, buffer) {
  const segs = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (pointNearBbox(a, bbox, buffer) || pointNearBbox(b, bbox, buffer)) {
      segs.push({ a, b });
    }
  }
  return segs;
}

async function main() {
  const shpPath = process.argv[2];
  if (!shpPath) {
    console.log(USAGE);
    process.exit(1);
  }

  const outerRings = [];
  const innerRings = [];
  const segments = [];
  let featuresSeen = 0;
  let ringsKept = 0;
  let fallbackCount = 0;
  let oversizedRingsSkipped = 0;

  const source = await shapefile.open(shpPath);
  let result = await source.read();

  while (!result.done) {
    featuresSeen++;
    const geometry = result.value.geometry;

    if (geometry && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')) {
      const rawPolygons = geometryToMultiPolygonCoords(geometry);
      const touchesBbox = rawPolygons.some(polygon => bboxIntersectsRaw(polygon[0], BBOX));

      if (touchesBbox) {
        const presimplified = rawPolygons.map(polygon =>
          polygon.map(ring => lightSimplify(toPoints(ring)))
        );

        try {
          const clipInput = presimplified.map(polygon => polygon.map(pointsToClosedCoords));
          const clipped = polygonClipping.intersection(clipInput, CLIP_WINDOW);

          for (const polygon of clipped) {
            for (let i = 0; i < polygon.length; i++) {
              const points = toPoints(polygon[i]);
              if (points.length < 3) continue;
              (i === 0 ? outerRings : innerRings).push(points);
              segments.push(...ringToSegments(points));
              ringsKept++;
            }
          }
        } catch (err) {
          fallbackCount++;
          for (const polygon of presimplified) {
            for (let i = 0; i < polygon.length; i++) {
              const ring = polygon[i];
              if (ring.length < 3) continue;
              segments.push(...relevantSegmentsFromRing(ring, BBOX, SEGMENT_KEEP_BUFFER_DEG));
              ringsKept++;
              if (ring.length > MAX_CONTAINMENT_RING_POINTS) {
                oversizedRingsSkipped++;
                continue;
              }
              (i === 0 ? outerRings : innerRings).push(ring);
            }
          }
        }
      }
    }

    if (featuresSeen % 5000 === 0) {
      console.log(`  ...scanned ${featuresSeen} features, kept ${ringsKept} rings so far`);
    }

    result = await source.read();
  }

  const output = {
    segments,
    outerRings,
    innerRings,
    source: 'OSM via osmdata.openstreetmap.de, ODbL'
  };

  const outPath = join(ROOT, 'src/data/coastlines/sw-england.json');
  writeFileSync(outPath, JSON.stringify(output));

  console.log(`Scanned ${featuresSeen} shapefile features.`);
  console.log(`Kept ${outerRings.length} outer rings, ${innerRings.length} inner rings, ${segments.length} segments.`);
  if (fallbackCount > 0) {
    console.log(`${fallbackCount} feature(s) fell back to whole-ring (unclipped) handling — the clipping library failed on them, likely due to size/complexity (e.g. a whole connected continent's coastline in one ring). Their nearby segments are still kept for line-crossing detection.`);
  }
  if (oversizedRingsSkipped > 0) {
    console.log(`${oversizedRingsSkipped} fallback ring(s) exceeded ${MAX_CONTAINMENT_RING_POINTS} points and were excluded from point-in-polygon containment checks (too slow to be worth it as a rarely-needed fallback) — their segments are still kept.`);
  }
  console.log(`Written to ${outPath}`);
  console.log(`Next: run tools/simplify-coastline.mjs and tools/generate-tiles.mjs against the new source.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
