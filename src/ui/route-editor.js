// The map half of drawing a rough route: numbered draggable waypoints and the
// legs between them. It owns its own Leaflet layer group (added straight to the
// map, NOT the layer registry — the registry rebuilds layers on state change,
// which would fight live drag state). The route model in core/route-model.js is
// the truth; this reflects it and reports every edit through onRouteChanged so
// the app can autosave and refresh the panel.
//
// Interaction (the ChartPlotter model, re-implemented as a module):
//   click empty water   -> append a waypoint
//   drag a waypoint      -> move it (live); commit on drop
//   click a leg          -> insert a waypoint into that leg at the click point
//   delete (from panel)  -> remove and renumber

import {
  createRoute, addWaypoint, insertWaypoint, moveWaypoint, removeWaypoint,
  routeLegs
} from '../core/route-model.js';
import { distanceNm, bearing } from '../core/geometry.js';

let map = null;
let group = null;
let route = createRoute();
let enabled = true;
let onRouteChanged = () => {};
const markers = new Map(); // waypoint id -> L.marker
let legLines = [];         // { line, tooltip, fromIndex }

export function initRouteEditor(leafletMap, { onRouteChanged: cb } = {}) {
  map = leafletMap;
  group = L.layerGroup().addTo(map);
  if (cb) onRouteChanged = cb;
  return {
    setRoute, getRoute, setEnabled, clear,
    addWaypointAt, removeWaypoint: removeById, redraw: render
  };
}

export function getRoute() { return route; }

export function setEnabled(on) { enabled = on; }

export function setRoute(next) {
  route = next || createRoute();
  render();
}

export function clear() {
  route = createRoute();
  render();
  notify();
}

// Called by the map-click handler when no charting tool has claimed the click.
export function addWaypointAt(latlng) {
  if (!enabled) return;
  addWaypoint(route, { lat: latlng.lat, lon: latlng.lng });
  render();
  notify();
}

function removeById(id) {
  if (removeWaypoint(route, id)) {
    render();
    notify();
  }
}

function notify() { onRouteChanged(route); }

function iconFor(number, kind) {
  const bg = kind === 'start' ? '#16a34a' : kind === 'end' ? '#dc2626' : '#2563eb';
  return L.divIcon({
    className: 'route-wp-icon',
    html: `<span style="background:${bg}">${number}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13]
  });
}

function kindOf(index, total) {
  if (index === 0) return 'start';
  if (index === total - 1) return 'end';
  return 'mid';
}

// Live geometry update while a waypoint is dragged: only the legs touching it.
function refreshLegsAround(index) {
  const wps = route.waypoints;
  for (const leg of legLines) {
    if (leg.fromIndex !== index - 1 && leg.fromIndex !== index) continue;
    const a = wps[leg.fromIndex], b = wps[leg.fromIndex + 1];
    if (!a || !b) continue;
    leg.line.setLatLngs([[a.lat, a.lon], [b.lat, b.lon]]);
    const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
    leg.tooltip.setLatLng([mid.lat, mid.lon]).setContent(legLabel(a, b));
  }
}

function legLabel(a, b) {
  const d = distanceNm(a, b);
  const brg = bearing(a, b);
  const varDeg = route.magneticVariationDeg || 0;
  const mag = ((brg + varDeg) % 360 + 360) % 360;
  const brgText = varDeg
    ? `${brg.toFixed(0)}°T/${mag.toFixed(0)}°M`
    : `${brg.toFixed(0)}°T`;
  return `${d.toFixed(2)} NM @ ${brgText}`;
}

function render() {
  if (!group) return;
  group.clearLayers();
  markers.clear();
  legLines = [];
  const wps = route.waypoints;

  // Legs first, so waypoint markers sit on top and win the click.
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i], b = wps[i + 1];
    const line = L.polyline([[a.lat, a.lon], [b.lat, b.lon]], {
      color: '#2563eb', weight: 3, opacity: 0.85
    });
    const tooltip = L.tooltip({ permanent: true, direction: 'top', offset: [0, -6], className: 'route-leg-tooltip' })
      .setLatLng([(a.lat + b.lat) / 2, (a.lon + b.lon) / 2])
      .setContent(legLabel(a, b));
    const fromIndex = i;
    line.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (!enabled) return;
      insertWaypoint(route, fromIndex + 1, { lat: e.latlng.lat, lon: e.latlng.lng });
      render();
      notify();
    });
    line.bindTooltip(tooltip);
    line.addTo(group);
    tooltip.addTo(group);
    legLines.push({ line, tooltip, fromIndex });
  }

  wps.forEach((wp, i) => {
    const marker = L.marker([wp.lat, wp.lon], {
      icon: iconFor(i + 1, kindOf(i, wps.length)),
      draggable: enabled,
      bubblingMouseEvents: false,
      keyboard: false
    });
    marker.on('click', (e) => L.DomEvent.stopPropagation(e));
    // Right-click a waypoint to delete it (suppress the browser menu). Mirrors
    // the panel's ✕, but where the skipper is already looking — on the chart.
    marker.on('contextmenu', (e) => {
      L.DomEvent.stopPropagation(e);
      if (e.originalEvent) L.DomEvent.preventDefault(e.originalEvent);
      if (!enabled) return;
      removeById(wp.id);
    });
    marker.on('drag', () => {
      const ll = marker.getLatLng();
      wp.lat = ll.lat; wp.lon = ll.lng; // provisional; committed on dragend
      refreshLegsAround(i);
    });
    marker.on('dragend', () => {
      const ll = marker.getLatLng();
      moveWaypoint(route, wp.id, { lat: ll.lat, lon: ll.lng });
      notify();
    });
    marker.addTo(group);
    markers.set(wp.id, marker);
  });
}
