// Route leg rendering. buildRouteLegs returns handles keyed by leg index so
// selection can restyle in place — selection must never trigger a rebuild.

import { styleForLeg } from '../leg-styles.js';
import { legTooltipHtml } from '../leg-tooltip.js';
import { setSelected, setHovered } from '../../selection.js';

const MANEUVER_COLOURS = { tack: '#2563eb', gybe: '#f59e0b' };

export function buildRouteLegs(state) {
  const legs = state.legs;
  if (!legs || legs.length === 0) return { layers: [], handles: null };

  const colourBy = state.colourBy || 'config';
  const layers = [];
  const byIndex = new Map();

  legs.forEach((leg, index) => {
    const line = L.polyline(
      [[leg.waypoint.lat, leg.waypoint.lon], [leg.endWaypoint.lat, leg.endWaypoint.lon]],
      styleForLeg(leg, { colourBy })
    );

    line.bindTooltip(legTooltipHtml(leg, index), { sticky: true, className: 'leg-tooltip' });
    line.on('click', (e) => {
      L.DomEvent.stopPropagation(e); // don't let a leg click move the start/end marker
      setSelected(index, 'map');
    });
    line.on('mouseover', () => setHovered(index, 'map'));
    line.on('mouseout', () => setHovered(null, 'map'));

    layers.push(line);
    byIndex.set(index, line);
  });

  return { layers, handles: { byIndex, legs, colourBy } };
}

export function applyRouteSelection(handles, selection) {
  const { byIndex, legs, colourBy } = handles;
  byIndex.forEach((line, index) => {
    line.setStyle(styleForLeg(legs[index], {
      selected: selection.selectedLegIndex === index,
      hovered: selection.hoveredLegIndex === index,
      colourBy
    }));
    if (selection.selectedLegIndex === index) line.bringToFront();
  });
}

// `maneuver` marks the END of the leg it sits on ("tack at the end of this leg"),
// so the marker belongs at endWaypoint, not waypoint.
export function buildManeuverMarkers(state) {
  const legs = state.legs;
  if (!legs) return [];

  const layers = [];
  legs.forEach((leg) => {
    if (!leg.maneuver) return;
    const colour = MANEUVER_COLOURS[leg.maneuver] || '#6b7280';
    const marker = L.circleMarker([leg.endWaypoint.lat, leg.endWaypoint.lon], {
      radius: 7, color: colour, fillColor: colour, fillOpacity: 0.4, weight: 2
    });
    marker.bindTooltip(leg.maneuver.toUpperCase(), { direction: 'right', offset: [6, 0] });
    layers.push(marker);
  });
  return layers;
}

export function buildWaypoints(state) {
  const legs = state.legs;
  if (!legs || legs.length === 0) return [];

  const layers = legs.map((leg, i) => L.circleMarker([leg.waypoint.lat, leg.waypoint.lon], {
    radius: 3, color: '#1a1a2e', fillColor: '#ffffff', fillOpacity: 0.9, weight: 1
  }).bindTooltip(`Waypoint ${i + 1}`, { direction: 'top' }));

  const last = legs[legs.length - 1];
  layers.push(L.circleMarker([last.endWaypoint.lat, last.endWaypoint.lon], {
    radius: 3, color: '#1a1a2e', fillColor: '#ffffff', fillOpacity: 0.9, weight: 1
  }).bindTooltip('Destination', { direction: 'top' }));

  return layers;
}
