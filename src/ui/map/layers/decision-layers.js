// Pure builders for decision markers — where on the map the planner made a call.
//
// Only the sparse decision kinds get markers. 'heading' records fire once per
// raw node (hundreds to thousands per passage), so mapping them would be noise;
// they live in the trail cards and the raw log instead.
//
// These rely on decision positions being full-precision (see roundCoord in
// decision-logger.js) — at the old 1dp they would land ~11km from the truth.

import { formatLandDeviation, formatConfigDecision } from '../../../core/explain.js';

const LAND_DEVIATION_COLOUR = '#dc2626';
const CONFIG_ACCEPTED_COLOUR = '#16a34a';
const CONFIG_REJECTED_COLOUR = '#9ca3af';

function hasPosition(rec) {
  return rec && rec.position &&
    typeof rec.position.lat === 'number' && typeof rec.position.lon === 'number';
}

export function buildLandDeviationMarkers(state) {
  const decisions = state.decisions;
  if (!decisions) return [];

  return decisions
    .filter(rec => rec.kind === 'landDeviation' && hasPosition(rec))
    .map(rec => L.circleMarker([rec.position.lat, rec.position.lon], {
      radius: 6,
      color: LAND_DEVIATION_COLOUR,
      fillColor: LAND_DEVIATION_COLOUR,
      fillOpacity: 0.3,
      weight: 2
    }).bindTooltip(formatLandDeviation(rec), { direction: 'top', className: 'decision-tooltip' }));
}

export function buildConfigDecisionMarkers(state) {
  const decisions = state.decisions;
  if (!decisions) return [];

  return decisions
    .filter(rec => rec.kind === 'config' && hasPosition(rec))
    .map(rec => {
      const colour = rec.accepted ? CONFIG_ACCEPTED_COLOUR : CONFIG_REJECTED_COLOUR;
      const label = `${rec.from} → ${rec.to}${rec.accepted ? '' : ' (rejected)'}`;
      return L.circleMarker([rec.position.lat, rec.position.lon], {
        radius: 6,
        color: colour,
        fillColor: colour,
        fillOpacity: rec.accepted ? 0.5 : 0.2,
        weight: 2
      }).bindTooltip(`<strong>${label}</strong><br>${formatConfigDecision(rec)}`, {
        direction: 'top', className: 'decision-tooltip'
      });
    });
}
