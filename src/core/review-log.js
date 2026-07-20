// Flags a rough-route + sailing-plan combo for review, with a note saying what's
// wrong (e.g. "the plan sailed over land here"). The rough route is the course
// the skipper was happy with; the sailing plan is what the engine produced from
// it. We capture BOTH plus the note so a failing case can be studied and turned
// into a regression fixture. Pure: takes data, returns { markdown, record }.
//
// Reuses the passage-log assembler (route-log.js) for the full leg-by-leg detail,
// then adds the drawn route, its notes, and the reason on top.

import { buildRouteLog } from './route-log.js';

function round(v, dp = 4) {
  return typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(dp)) : v;
}

function coord(p) {
  return `${round(p.lat)}, ${round(p.lon)}`;
}

export function buildReviewLog({ note, lastRun, route }) {
  const at = new Date().toISOString();
  const passageLog = lastRun ? buildRouteLog(lastRun) : null;

  const drawnWaypoints = (route?.waypoints || []).map(w => ({
    lat: round(w.lat), lon: round(w.lon), note: w.note || null
  }));

  const record = {
    at,
    kind: 'plan-review',
    note: note || null,
    drawnRoute: {
      waypoints: drawnWaypoints,
      legNotes: route?.legNotes || {},
      magneticVariationDeg: route?.magneticVariationDeg ?? 0
    },
    passageLog
  };

  const result = passageLog?.result;
  const md = [];
  md.push(`# Plan flagged for review — ${at}`);
  md.push('');
  md.push('## Why');
  md.push(note ? note.split('\n').map(l => `> ${l}`).join('\n') : '> (no reason given)');
  md.push('');
  md.push('## Inputs');
  if (passageLog?.inputs) {
    md.push(`- Start ${coord(passageLog.inputs.start)} → End ${coord(passageLog.inputs.end)}`);
    md.push(`- Mode: ${passageLog.mode}; departure ${passageLog.inputs.departureDate} ${passageLog.inputs.departureTime} (${passageLog.inputs.timeMode})`);
  } else {
    md.push('- No sailing plan captured — run "Create Sailing Plan" first, then flag.');
  }
  md.push('');
  md.push('## Rough route (the course I was happy with)');
  md.push(`- ${drawnWaypoints.length} waypoints`);
  drawnWaypoints.forEach((p, i) => md.push(`  ${i + 1}. ${p.lat}, ${p.lon}${p.note ? ` — ${p.note}` : ''}`));
  const legNoteEntries = Object.values(record.drawnRoute.legNotes);
  if (legNoteEntries.length) {
    md.push('- Leg notes:');
    legNoteEntries.forEach(n => md.push(`  - ${n}`));
  }
  md.push('');
  md.push('## Sailing plan produced');
  if (result) {
    md.push(`- Reached destination: ${result.reachedDestination ? 'yes' : 'no'}${result.shortfallNm != null ? ` (shortfall ${result.shortfallNm} NM)` : ''}`);
    md.push(`- ${result.legCount} legs, ${result.totalDistanceNm} NM, ${result.totalDurationH} h`);
    if (passageLog.warnings?.length) {
      md.push('- Warnings:');
      passageLog.warnings.forEach(w => md.push(`  - ${w}`));
    }
  } else {
    md.push('- (none)');
  }
  md.push('');
  md.push('## Machine-readable');
  md.push('```json');
  md.push(JSON.stringify(record, null, 2));
  md.push('```');
  md.push('');

  return { markdown: md.join('\n'), record };
}
