// Assembles a rough-route CORRECTION record: the app generated a rough course,
// the skipper edited it and said why. The output is a human-readable Markdown
// document (so a person or a coding assistant can read what went wrong) plus a
// compact machine record (so the corrections accrete into a dataset for
// hardening computeRoughRoute). Pure: takes data, returns { markdown, record }.
//
// It reads the drawn route's own edit history (route-model records
// add/insert/move/remove/note, moves coalesced per drag) for the ORDER of
// changes, and diffs baseline vs final geometry for the NET effect.

import { distanceNm, bearing } from './geometry.js';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function round(v, dp = 4) {
  return typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(dp)) : v;
}

function compass(deg) {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function coord(p) {
  return `${round(p.lat)}, ${round(p.lon)}`;
}

function totalDistance(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += distanceNm(points[i - 1], points[i]);
  return sum;
}

function signed(n, dp = 2) {
  const r = round(n, dp);
  return r > 0 ? `+${r}` : `${r}`;
}

// One plain-English line per recorded edit. Unknown ops fall through to their
// raw op name so a new route-model op never silently vanishes from the log.
function describeEdit(op) {
  switch (op.op) {
    case 'add':
      return `added a waypoint at ${coord(op.to)}`;
    case 'insert':
      return `inserted a waypoint at ${coord(op.to)} (position ${op.index + 1})`;
    case 'move': {
      const d = distanceNm(op.from, op.to);
      return `moved a waypoint ${coord(op.from)} → ${coord(op.to)} (${round(d, 2)} NM ${compass(bearing(op.from, op.to))})`;
    }
    case 'remove':
      return `removed the waypoint at ${coord(op.from)}`;
    case 'note':
      return `annotated a ${op.target || 'waypoint'}`;
    case 'reverse':
      return 'reversed the route';
    default:
      return op.op;
  }
}

function baselineSummary(rough) {
  const clean = rough.reachedCleanly ? 'yes' : 'no';
  return `${rough.legCount} leg(s), ${round(rough.totalDistanceNm, 2)} NM, reached cleanly: ${clean}, graph nodes: ${rough.nodeCount}`;
}

export function buildRoughRouteLog({ baseline, finalRoute, reason }) {
  const at = new Date().toISOString();
  const baseWps = baseline.rough.waypoints;
  const finalWps = finalRoute.waypoints.map(w => ({ lat: w.lat, lon: w.lon }));
  const finalDistance = totalDistance(finalWps);

  const edits = (finalRoute.history || []).slice(baseline.historyMark || 0);
  const wpDelta = finalWps.length - baseWps.length;
  const distDelta = finalDistance - baseline.rough.totalDistanceNm;

  const waypointNotes = finalRoute.waypoints
    .filter(w => w.note)
    .map(w => ({ at: { lat: w.lat, lon: w.lon }, note: w.note }));
  const legNotes = Object.entries(finalRoute.legNotes || {}).map(([fromId, note]) => {
    const wp = finalRoute.waypoints.find(w => w.id === fromId);
    return { at: wp ? { lat: wp.lat, lon: wp.lon } : null, note };
  });

  const record = {
    at,
    inputs: baseline.inputs,
    baseline: {
      legCount: baseline.rough.legCount,
      totalDistanceNm: round(baseline.rough.totalDistanceNm, 2),
      reachedCleanly: baseline.rough.reachedCleanly,
      nodeCount: baseline.rough.nodeCount,
      crossingLegIndices: baseline.rough.crossingLegIndices || [],
      waypoints: baseWps.map(p => ({ lat: round(p.lat), lon: round(p.lon) }))
    },
    final: {
      legCount: Math.max(finalWps.length - 1, 0),
      totalDistanceNm: round(finalDistance, 2),
      waypoints: finalWps.map(p => ({ lat: round(p.lat), lon: round(p.lon) }))
    },
    deltas: { waypoints: wpDelta, distanceNm: round(distDelta, 2) },
    edits,
    notes: { waypoints: waypointNotes, legs: legNotes },
    reason: reason || null
  };

  const md = [];
  md.push(`# Rough-route correction — ${at}`);
  md.push('');
  md.push('## Inputs');
  md.push(`- Start ${coord(baseline.inputs.start)} → End ${coord(baseline.inputs.end)}`);
  md.push(`- Clearance: coastal ${baseline.inputs.clearanceNm} NM · harbour ${baseline.inputs.harbourClearanceNm} NM · zone ${baseline.inputs.harbourZoneNm ?? 'auto'} NM`);
  md.push('');
  md.push('## What the app generated (baseline)');
  md.push(`- ${baselineSummary(baseline.rough)}`);
  if ((baseline.rough.crossingLegIndices || []).length) {
    md.push(`- Crossed land on leg(s): ${baseline.rough.crossingLegIndices.join(', ')}`);
  }
  baseWps.forEach((p, i) => md.push(`  ${i + 1}. ${coord(p)}`));
  md.push('');
  md.push('## What I changed');
  md.push(`- Waypoints ${baseWps.length} → ${finalWps.length} (${signed(wpDelta, 0)}); distance ${round(baseline.rough.totalDistanceNm, 2)} → ${round(finalDistance, 2)} NM (${signed(distDelta)})`);
  if (edits.length) {
    md.push('- Edits, in order:');
    edits.forEach(op => md.push(`  - ${describeEdit(op)}`));
  } else {
    md.push('- No edits recorded (route left as generated).');
  }
  md.push('');
  md.push('## Why');
  md.push(reason ? reason.split('\n').map(l => `> ${l}`).join('\n') : '> (no reason given)');
  if (waypointNotes.length || legNotes.length) {
    md.push('');
    for (const n of waypointNotes) md.push(`- waypoint ${coord(n.at)}: ${n.note}`);
    for (const n of legNotes) md.push(`- leg from ${n.at ? coord(n.at) : '?'}: ${n.note}`);
  }
  md.push('');
  md.push('## Machine-readable');
  md.push('```json');
  md.push(JSON.stringify(record, null, 2));
  md.push('```');
  md.push('');

  return { markdown: md.join('\n'), record };
}
