// Interchange with onboard nav systems and other plotters. Pure string in/out —
// no Blob, no DOM, no file picker (that plumbing lives in the UI). GPX is the
// portable format nav systems read; the srp JSON travels in a <extensions> block
// so a round-trip back into this app keeps the skipper-intent detail that GPX
// itself can't carry. CSV matches the ChartPlotter `lat,lon[,name]` dialect.
//
// The GPX <rtept> dialect matches tools/rough-route-gpx.mjs so the existing
// skipper-comparison loop keeps parsing routes exported from here.

import { createRoute, addWaypoint, setWaypointName, setWaypointNote, serializeRoute, deserializeRoute } from './route-model.js';

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

export function routeToGpx(route) {
  const name = route.name || 'SailingRoutePlanner route';
  const rtepts = route.waypoints.map(w => {
    const parts = [`      <rtept lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}">`];
    if (w.name) parts.push(`        <name>${escapeXml(w.name)}</name>`);
    if (w.note) parts.push(`        <desc>${escapeXml(w.note)}</desc>`);
    parts.push('      </rtept>');
    return parts.join('\n');
  }).join('\n');

  // The full route JSON, embedded so a re-import is loss-free. Other tools ignore
  // an <extensions> block they don't recognise.
  const ext = escapeXml(serializeRoute(route));

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SailingRoutePlanner" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>${escapeXml(name)}</name>
    <extensions>
      <srp:route xmlns:srp="https://sailingrouteplanner">${ext}</srp:route>
    </extensions>
${rtepts}
  </rte>
</gpx>
`;
}

// Prefer a loss-free re-import from our own <extensions> block; otherwise read
// the standard rtept/trkpt/wpt points (rich name/desc where present).
export function gpxToRoute(xml) {
  const embedded = /<srp:route[^>]*>([\s\S]*?)<\/srp:route>/.exec(xml);
  if (embedded) {
    const decoded = embedded[1]
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const route = deserializeRoute(decoded);
    if (route) return route;
  }

  const route = createRoute();
  const ptRe = /<(rtept|trkpt|wpt)\s+[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"[^>]*?(\/>|>([\s\S]*?)<\/\1>)/g;
  let m;
  while ((m = ptRe.exec(xml))) {
    const lat = Number(m[2]), lon = Number(m[3]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const wp = addWaypoint(route, { lat, lon });
    const inner = m[5] || '';
    const name = /<name>([\s\S]*?)<\/name>/.exec(inner);
    const desc = /<desc>([\s\S]*?)<\/desc>/.exec(inner);
    if (name) setWaypointName(route, wp.id, name[1].trim());
    if (desc) setWaypointNote(route, wp.id, desc[1].trim());
  }
  route.history = []; // an import is a fresh start, not the exporter's edit trail
  return route;
}

export function routeToCsv(route) {
  const lines = route.waypoints.map(w => {
    const base = `${w.lat.toFixed(5)}, ${w.lon.toFixed(5)}`;
    return w.name ? `${base}, ${w.name.replace(/,/g, ' ')}` : base;
  });
  return lines.join('\n') + '\n';
}

export function csvToRoute(text) {
  const route = createRoute();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /[a-df-zA-DF-Z]/.test(line.split(',')[0])) continue; // skip blanks/headers (allow 'E'/'e' exponents only in numbers)
    const parts = line.split(',').map(s => s.trim());
    const lat = Number(parts[0]), lon = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const wp = addWaypoint(route, { lat, lon });
    if (parts[2]) setWaypointName(route, wp.id, parts[2]);
  }
  route.history = [];
  return route;
}
