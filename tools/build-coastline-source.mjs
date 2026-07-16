import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as shapefile from 'shapefile';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const USAGE = `
Usage: node tools/build-coastline-source.mjs <path-to-land-polygons.shp>

Input: the WGS84 "split" land-polygons shapefile from
  https://osmdata.openstreetmap.de/data/land-polygons.html
  (download "land-polygons-split-4326", unzip it, pass the .shp path here
  — the matching .dbf/.shx files must sit alongside it)

This is a ~700MB download; fetching it automatically is not done here —
download it yourself and pass the local path. A good place to keep it
is tools/data/ (gitignored).

Output: src/data/coastlines/sw-england.json, clipped to the bbox
  lat 49.0-51.5, lon -7.0 to -2.0, in the existing
  {segments, outerRings, innerRings, source} shape.
`;

const BBOX = { south: 49.0, north: 51.5, west: -7.0, east: -2.0 };

function bboxIntersects(ring, bbox) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lon, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return maxLat >= bbox.south && minLat <= bbox.north && maxLon >= bbox.west && minLon <= bbox.east;
}

function toPoints(ring) {
  const points = ring.map(([lon, lat]) => ({ lat, lon }));
  const first = points[0];
  const last = points[points.length - 1];
  if (first.lat === last.lat && first.lon === last.lon) points.pop();
  return points;
}

function intersectVertical(a, b, lon) {
  const t = (lon - a.lon) / (b.lon - a.lon);
  return { lat: a.lat + t * (b.lat - a.lat), lon };
}

function intersectHorizontal(a, b, lat) {
  const t = (lat - a.lat) / (b.lat - a.lat);
  return { lat, lon: a.lon + t * (b.lon - a.lon) };
}

function clipEdge(points, inside, intersect) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const prev = points[(i - 1 + points.length) % points.length];
    const currentIn = inside(current);
    const prevIn = inside(prev);
    if (currentIn) {
      if (!prevIn) result.push(intersect(prev, current));
      result.push(current);
    } else if (prevIn) {
      result.push(intersect(prev, current));
    }
  }
  return result;
}

function clipRingToBbox(points, bbox) {
  let clipped = points;
  clipped = clipEdge(clipped, p => p.lon >= bbox.west, (a, b) => intersectVertical(a, b, bbox.west));
  clipped = clipEdge(clipped, p => p.lon <= bbox.east, (a, b) => intersectVertical(a, b, bbox.east));
  clipped = clipEdge(clipped, p => p.lat >= bbox.south, (a, b) => intersectHorizontal(a, b, bbox.south));
  clipped = clipEdge(clipped, p => p.lat <= bbox.north, (a, b) => intersectHorizontal(a, b, bbox.north));
  return clipped;
}

function ringToSegments(ring) {
  const segs = [];
  for (let i = 0; i < ring.length - 1; i++) {
    segs.push({ a: ring[i], b: ring[i + 1] });
  }
  segs.push({ a: ring[ring.length - 1], b: ring[0] });
  return segs;
}

function polygonsFromGeometry(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

async function main() {
  const shpPath = process.argv[2];
  if (!shpPath) {
    console.log(USAGE);
    process.exit(1);
  }

  const outerRings = [];
  const innerRings = [];
  let featuresSeen = 0;
  let ringsKept = 0;

  const source = await shapefile.open(shpPath);
  let result = await source.read();

  while (!result.done) {
    featuresSeen++;
    const polygons = polygonsFromGeometry(result.value.geometry || {});

    for (const rings of polygons) {
      for (let i = 0; i < rings.length; i++) {
        const rawRing = rings[i];
        if (!bboxIntersects(rawRing, BBOX)) continue;

        const clipped = clipRingToBbox(toPoints(rawRing), BBOX);
        if (clipped.length < 3) continue;

        (i === 0 ? outerRings : innerRings).push(clipped);
        ringsKept++;
      }
    }

    if (featuresSeen % 5000 === 0) {
      console.log(`  ...scanned ${featuresSeen} features, kept ${ringsKept} rings so far`);
    }

    result = await source.read();
  }

  const segments = [];
  for (const ring of outerRings) segments.push(...ringToSegments(ring));
  for (const ring of innerRings) segments.push(...ringToSegments(ring));

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
  console.log(`Written to ${outPath}`);
  console.log(`Next: run tools/simplify-coastline.mjs and tools/generate-tiles.mjs against the new source.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
