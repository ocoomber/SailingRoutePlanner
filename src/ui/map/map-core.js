// Map lifecycle and viewport plumbing. Map clicks are delegated to whoever has
// claimed them: a charting tool if one is active, otherwise the route editor
// (which drops a waypoint). Overlay drawing lives in the layer registry.

import { addChartingTools } from '../charting-tools.js';

let map = null;
let chartingTools = null;
let onMapClick = null;
let cursorRaf = null;

function boundsToObj(bounds) {
  return {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest()
  };
}

export function initMap(hooks = {}) {
  const { onViewportChanged, onCursorMove, onMapClick: clickHook } = hooks;
  onMapClick = clickHook || null;

  map = L.map('map', { tap: false }).setView([50.35, -4.15], 9);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Bottom-right, clear of the left-hand panels (which would otherwise cover it).
  L.control.scale({ imperial: false, metric: true, position: 'bottomright' }).addTo(map);
  chartingTools = addChartingTools(map);

  // A charting tool (ruler/measure) claims the click first; otherwise the editor
  // drops a waypoint.
  map.on('click', (e) => {
    if (chartingTools && chartingTools.isToolActive()) return;
    if (onMapClick) onMapClick(e.latlng);
  });

  if (onViewportChanged) {
    const fireViewport = () => onViewportChanged(boundsToObj(map.getBounds()));
    map.on('moveend', fireViewport);
    map.whenReady(fireViewport);
  }

  if (onCursorMove) {
    let pending = null;
    map.on('mousemove', (e) => {
      pending = e.latlng;
      if (cursorRaf) return;
      cursorRaf = requestAnimationFrame(() => {
        cursorRaf = null;
        if (pending) onCursorMove(pending.lat, pending.lng);
      });
    });
  }

  return map;
}

export function getMap() {
  return map;
}

export function getViewportBounds() {
  return map ? boundsToObj(map.getBounds()) : null;
}

// Leaflet renders a grey half-map if the container was hidden while it resized.
export function refreshMapSize() {
  if (map) map.invalidateSize();
}

export function fitToLegs(legs) {
  if (!map || !legs || legs.length === 0) return;
  const points = legs.map(l => [l.waypoint.lat, l.waypoint.lon]);
  const last = legs[legs.length - 1];
  points.push([last.endWaypoint.lat, last.endWaypoint.lon]);
  map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
}

export function panToLeg(leg) {
  if (!map || !leg) return;
  map.panTo([
    (leg.waypoint.lat + leg.endWaypoint.lat) / 2,
    (leg.waypoint.lon + leg.endWaypoint.lon) / 2
  ]);
}

export function clearChartingTools() {
  if (chartingTools) chartingTools.clearAll();
}
