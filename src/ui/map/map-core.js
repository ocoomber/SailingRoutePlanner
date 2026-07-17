// Map lifecycle, start/end markers and viewport plumbing.
// Overlay drawing lives in the layer registry, not here.

import { addChartingTools } from '../charting-tools.js';

let map = null;
let chartingTools = null;
let startMarker = null;
let endMarker = null;
let placing = 'start';
let onPointSelected = null;
let cursorRaf = null;

function boundsToObj(bounds) {
  return {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest()
  };
}

export function initMap(callback, hooks = {}) {
  onPointSelected = callback;
  const { onViewportChanged, onCursorMove } = hooks;

  map = L.map('map', { tap: false }).setView([50.35, -4.15], 9);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);
  chartingTools = addChartingTools(map);

  map.on('click', (e) => {
    if (chartingTools && chartingTools.isRulerActive()) return;
    if (placing === 'start') {
      setStart(e.latlng.lat, e.latlng.lng);
      onPointSelected('start', e.latlng.lat, e.latlng.lng);
      placing = 'end';
    } else {
      setEnd(e.latlng.lat, e.latlng.lng);
      onPointSelected('end', e.latlng.lat, e.latlng.lng);
      placing = 'start';
    }
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

export function setStart(lat, lon) {
  if (startMarker) map.removeLayer(startMarker);
  startMarker = L.circleMarker([lat, lon], {
    radius: 8, color: '#16a34a', fillColor: '#22c55e', fillOpacity: 0.8
  }).addTo(map);
  startMarker.bindTooltip('Start — click to move', { permanent: true });
  startMarker.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    placing = 'start';
  });
}

export function setEnd(lat, lon) {
  if (endMarker) map.removeLayer(endMarker);
  endMarker = L.circleMarker([lat, lon], {
    radius: 8, color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.8
  }).addTo(map);
  endMarker.bindTooltip('End — click to move', { permanent: true });
  endMarker.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    placing = 'end';
  });
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

export function clearMarkers() {
  if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
  if (endMarker) { map.removeLayer(endMarker); endMarker = null; }
  placing = 'start';
}

export function clearChartingTools() {
  if (chartingTools) chartingTools.clearAll();
}
