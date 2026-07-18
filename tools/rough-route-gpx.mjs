// Generate the rough course as a GPX route, and compare it against a
// skipper-corrected GPX. This is the iteration loop with the skipper:
//   1. node tools/rough-route-gpx.mjs --start lat,lon --end lat,lon [--clearance nm] [--out file.gpx]
//        -> runs computeRoughRoute over the coarse coastline, writes a .gpx route.
//   2. Skipper opens it in the chart plotter and corrects it.
//   3. node tools/rough-route-gpx.mjs --start ... --end ... --compare corrected.gpx
//        -> reports max/mean offset (NM) between the computed route and theirs.
// Tune the engine until the computed course sits within ~1 NM of the corrected one.

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeRoughRoute } from '../src/core/rough-route.js';
import { loadCoastline } from '../src/core/coastline.js';
import { distanceNm } from '../src/core/geometry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) args[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return args;
}

function parseLatLon(s, label) {
  const m = String(s).split(',').map(Number);
  if (m.length !== 2 || m.some(Number.isNaN)) {
    throw new Error(`--${label} must be "lat,lon" (got ${s})`);
  }
  return { lat: m[0], lon: m[1] };
}

// Minimal GPX <rtept> / <trkpt> / <wpt> reader — enough for chart-plotter exports.
function parseGpx(xml) {
  const pts = [];
  const re = /<(?:rtept|trkpt|wpt)\s+[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g;
  let m;
  while ((m = re.exec(xml))) pts.push({ lat: Number(m[1]), lon: Number(m[2]) });
  return pts;
}

function toGpx(waypoints, name) {
  const rtepts = waypoints.map(p =>
    `    <rtept lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"></rtept>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SailingRoutePlanner rough-route-gpx" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>${name}</name>
${rtepts}
  </rte>
</gpx>
`;
}

// Nearest distance (NM) from a point to a polyline, densely sampled.
function distToPolylineNm(point, polyline) {
  let min = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    for (let t = 0; t <= 1; t += 0.02) {
      const p = { lat: polyline[i].lat + (polyline[i + 1].lat - polyline[i].lat) * t,
                  lon: polyline[i].lon + (polyline[i + 1].lon - polyline[i].lon) * t };
      min = Math.min(min, distanceNm(point, p));
    }
  }
  return min;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.start || !args.end) {
    console.error('Usage: node tools/rough-route-gpx.mjs --start lat,lon --end lat,lon [--clearance nm] [--out file.gpx] [--compare corrected.gpx]');
    process.exit(2);
  }

  const start = parseLatLon(args.start, 'start');
  const end = parseLatLon(args.end, 'end');
  const clearanceNm = args.clearance ? Number(args.clearance) : 0.25;

  const coarse = loadCoastline(JSON.parse(
    readFileSync(join(ROOT, 'src', 'data', 'coastline', 'sw-england-coarse.json'), 'utf-8')));

  const rough = computeRoughRoute(start, end, coarse, { clearanceNm });
  console.log(`Rough route: ${rough.legCount} leg(s), ${rough.totalDistanceNm.toFixed(1)} NM, reachedCleanly=${rough.reachedCleanly}, clearance ${clearanceNm} NM`);
  console.log('Waypoints:');
  for (const p of rough.waypoints) console.log(`  ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`);

  const outPath = typeof args.out === 'string'
    ? args.out
    : join(ROOT, `rough-route-${start.lat.toFixed(3)}_${start.lon.toFixed(3)}-to-${end.lat.toFixed(3)}_${end.lon.toFixed(3)}.gpx`);
  writeFileSync(outPath, toGpx(rough.waypoints, 'Computed rough course'));
  console.log(`\nWrote GPX: ${outPath}`);

  if (typeof args.compare === 'string') {
    const skipper = parseGpx(readFileSync(args.compare, 'utf-8'));
    if (skipper.length < 2) {
      console.error(`\n--compare: could not read >=2 points from ${args.compare}`);
      process.exit(1);
    }
    // Offset of every computed vertex from the skipper's line, and vice versa,
    // so a shortcut on either side is caught.
    const a = rough.waypoints.map(p => distToPolylineNm(p, skipper));
    const b = skipper.map(p => distToPolylineNm(p, rough.waypoints));
    const all = [...a, ...b];
    const max = Math.max(...all);
    const mean = all.reduce((s, x) => s + x, 0) / all.length;
    console.log(`\nCompared against ${args.compare} (${skipper.length} points):`);
    console.log(`  max offset  ${max.toFixed(2)} NM`);
    console.log(`  mean offset ${mean.toFixed(2)} NM`);
    console.log(max <= 1 ? '  WITHIN 1 NM everywhere — course matches the skipper.'
                         : '  Off by > 1 NM somewhere — tune the engine and regenerate.');
  }
}

main();
