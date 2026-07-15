let map = null;
let startMarker = null;
let endMarker = null;
let routePolyline = null;

export function initMap(onPointSelected) {
  map = L.map('map').setView([50.35, -4.15], 9);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  map.on('click', (e) => {
    if (!startMarker) {
      setStart(e.latlng.lat, e.latlng.lng);
      onPointSelected('start', e.latlng.lat, e.latlng.lng);
    } else if (!endMarker) {
      setEnd(e.latlng.lat, e.latlng.lng);
      onPointSelected('end', e.latlng.lat, e.latlng.lng);
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

  startMarker.bindTooltip('Start', { permanent: true });
}

export function setEnd(lat, lon) {
  if (endMarker) map.removeLayer(endMarker);

  endMarker = L.circleMarker([lat, lon], {
    radius: 8,
    color: '#dc2626',
    fillColor: '#ef4444',
    fillOpacity: 0.8
  }).addTo(map);

  endMarker.bindTooltip('End', { permanent: true });
}

export function drawRoute(legs) {
  if (routePolyline) map.removeLayer(routePolyline);

  if (!legs || legs.length === 0) return;

  const points = [];
  for (const leg of legs) {
    points.push([leg.waypoint.lat, leg.waypoint.lon]);
  }

  if (startMarker) {
    const ll = startMarker.getLatLng();
    points.unshift([ll.lat, ll.lng]);
  }

  routePolyline = L.polyline(points, {
    color: '#1a6fb5',
    weight: 3,
    opacity: 0.8
  }).addTo(map);

  map.fitBounds(routePolyline.getBounds(), { padding: [30, 30] });
}

export function clearRoute() {
  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  }
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
}

export function getMap() {
  return map;
}
