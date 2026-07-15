let map = null;
let startMarker = null;
let endMarker = null;
let routePolyline = null;
let legMarkers = [];
let placing = 'start';
let onPointSelected = null;

export function initMap(callback) {
  onPointSelected = callback;

  map = L.map('map', { tap: false }).setView([50.35, -4.15], 9);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  map.on('click', (e) => {
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

  return map;
}

export function setStart(lat, lon) {
  if (startMarker) map.removeLayer(startMarker);

  startMarker = L.circleMarker([lat, lon], {
    radius: 8,
    color: '#16a34a',
    fillColor: '#22c55e',
    fillOpacity: 0.8
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
    radius: 8,
    color: '#dc2626',
    fillColor: '#ef4444',
    fillOpacity: 0.8
  }).addTo(map);

  endMarker.bindTooltip('End — click to move', { permanent: true });

  endMarker.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    placing = 'end';
  });
}

export function drawRoute(legs) {
  if (routePolyline) map.removeLayer(routePolyline);
  clearLegMarkers();

  if (!legs || legs.length === 0) return;

  const points = [];
  if (startMarker) {
    const ll = startMarker.getLatLng();
    points.push([ll.lat, ll.lng]);
  }

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    points.push([leg.waypoint.lat, leg.waypoint.lon]);

    const isTack = leg.maneuver === 'tack';
    const isGybe = leg.maneuver === 'gybe';

    let color = '#1a6fb5';
    let fillColor = '#3b82f6';
    if (isTack) { color = '#1d4ed8'; fillColor = '#2563eb'; }
    if (isGybe) { color = '#b45309'; fillColor = '#f59e0b'; }

    const marker = L.circleMarker([leg.waypoint.lat, leg.waypoint.lon], {
      radius: 5,
      color,
      fillColor,
      fillOpacity: 0.9,
      weight: 2
    }).addTo(map);

    const label = `Leg ${i + 1}: ${leg.heading}\u00B0T`;
    const extra = isTack ? ' [TACK]' : isGybe ? ' [GYBE]' : '';
    marker.bindTooltip(label + extra, { permanent: false });

    legMarkers.push(marker);
  }

  routePolyline = L.polyline(points, {
    color: '#1a6fb5',
    weight: 3,
    opacity: 0.8
  }).addTo(map);

  map.fitBounds(routePolyline.getBounds(), { padding: [30, 30] });
}

function clearLegMarkers() {
  for (const m of legMarkers) {
    map.removeLayer(m);
  }
  legMarkers = [];
}

export function clearRoute() {
  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  }
  clearLegMarkers();
}

export function clearAll() {
  if (startMarker) {
    map.removeLayer(startMarker);
    startMarker = null;
  }
  if (endMarker) {
    map.removeLayer(endMarker);
    endMarker = null;
  }
  clearRoute();
  placing = 'start';
}

export function getMap() {
  return map;
}
