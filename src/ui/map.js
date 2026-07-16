let map = null;
let startMarker = null;
let endMarker = null;
let routePolyline = null;
let legMarkers = [];
let windArrows = [];
let sailingDebug = null;
let placing = 'start';
let onPointSelected = null;
let landOverlay = null;

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
  clearWindArrows();
  clearSailingDebug();

  if (!legs || legs.length === 0) return;

  const points = [];
  if (startMarker) {
    const ll = startMarker.getLatLng();
    points.push([ll.lat, ll.lng]);
  }

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (points.length === 0 || points[points.length - 1][0] !== leg.waypoint.lat || points[points.length - 1][1] !== leg.waypoint.lon) {
      points.push([leg.waypoint.lat, leg.waypoint.lon]);
    }

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

  const lastLeg = legs[legs.length - 1];
  if (lastLeg.endWaypoint) {
    points.push([lastLeg.endWaypoint.lat, lastLeg.endWaypoint.lon]);
  }

  routePolyline = L.polyline(points, {
    color: '#1a6fb5',
    weight: 3,
    opacity: 0.8
  }).addTo(map);

  drawWindArrows(legs);
  map.fitBounds(routePolyline.getBounds(), { padding: [30, 30] });
}

function clearLegMarkers() {
  for (const m of legMarkers) {
    map.removeLayer(m);
  }
  legMarkers = [];
}

function drawWindArrows(legs) {
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (!leg.windDir && leg.windDir !== 0) continue;

    const midLat = (leg.waypoint.lat + leg.endWaypoint.lat) / 2;
    const midLon = (leg.waypoint.lon + leg.endWaypoint.lon) / 2;

    const legHeadingRad = leg.heading * Math.PI / 180;
    const windFromRad = leg.windDir * Math.PI / 180;

    let relWind = windFromRad - legHeadingRad;
    if (relWind > Math.PI) relWind -= 2 * Math.PI;
    if (relWind < -Math.PI) relWind += 2 * Math.PI;
    const starboard = relWind >= 0;

    const perpRad = starboard ? legHeadingRad + Math.PI / 2 : legHeadingRad - Math.PI / 2;
    const offsetDist = 0.008;
    const centerLat = midLat + offsetDist * Math.cos(perpRad);
    const centerLon = midLon + offsetDist * Math.sin(perpRad);

    const arrowLen = 0.01;
    const windToRad = windFromRad + Math.PI;
    const tipLat = centerLat + arrowLen * Math.cos(windToRad);
    const tipLon = centerLon + arrowLen * Math.sin(windToRad);

    const line = L.polyline(
      [[centerLat, centerLon], [tipLat, tipLon]],
      { color: '#6b21a8', weight: 1.5, opacity: 0.8 }
    ).addTo(map);

    const headLen = 0.005;
    const headAng1 = windToRad + 2.6;
    const headAng2 = windToRad - 2.6;
    const head1 = [tipLat + headLen * Math.cos(headAng1), tipLon + headLen * Math.sin(headAng1)];
    const head2 = [tipLat + headLen * Math.cos(headAng2), tipLon + headLen * Math.sin(headAng2)];

    const head = L.polyline([head1, [tipLat, tipLon], head2], {
      color: '#6b21a8', weight: 1.5, opacity: 0.8
    }).addTo(map);

    const label = `${leg.windSpeed}kn ${leg.windDir}\u00B0`;
    line.bindTooltip(label, { permanent: false, direction: 'top' });

    windArrows.push(line, head);
  }
}

function clearWindArrows() {
  for (const m of windArrows) {
    map.removeLayer(m);
  }
  windArrows = [];
}

export function drawLandOverlay(coastline) {
  clearLandOverlay();
  if (!coastline || !coastline.outerRings) return;

  landOverlay = L.layerGroup().addTo(map);

  for (const ring of coastline.outerRings) {
    const latlngs = ring.map(p => [p.lat, p.lon]);
    L.polygon(latlngs, {
      color: '#dc2626',
      fillColor: '#dc2626',
      fillOpacity: 0.35,
      weight: 1,
      opacity: 0.5
    }).addTo(landOverlay);
  }

  for (const ring of coastline.innerRings) {
    const latlngs = ring.map(p => [p.lat, p.lon]);
    L.polygon(latlngs, {
      color: '#2563eb',
      fill: false,
      weight: 1,
      opacity: 0.6
    }).addTo(landOverlay);
  }

  for (const seg of coastline.segments) {
    L.polyline([[seg.a.lat, seg.a.lon], [seg.b.lat, seg.b.lon]], {
      color: '#f59e0b',
      weight: 1,
      opacity: 0.4
    }).addTo(landOverlay);
  }
}

export function clearLandOverlay() {
  if (landOverlay) {
    map.removeLayer(landOverlay);
    landOverlay = null;
  }
}

export function clearRoute() {
  if (routePolyline) {
    map.removeLayer(routePolyline);
    routePolyline = null;
  }
  clearLegMarkers();
  clearWindArrows();
  clearSailingDebug();
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

export function drawSailingDebug(legs) {
  clearSailingDebug();
  if (!legs || legs.length === 0 || !map) return;

  sailingDebug = L.layerGroup().addTo(map);

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];

    const pts = [[leg.waypoint.lat, leg.waypoint.lon], [leg.endWaypoint.lat, leg.endWaypoint.lon]];

    let color;
    if (leg.tackSide === 'port') color = '#059669';
    else if (leg.tackSide === 'starboard') color = '#d97706';
    else color = '#6b7280';

    L.polyline(pts, {
      color, weight: 5, opacity: 0.5, dashArray: '6 4'
    }).addTo(sailingDebug);

    const tackChar = leg.tackSide === 'port' ? 'P' : leg.tackSide === 'starboard' ? 'S' : '-';
    const label = `${leg.windAngle}\u00B0 ${tackChar}`;

    L.circleMarker([leg.waypoint.lat, leg.waypoint.lon], {
      radius: 3, color: '#1a1a2e', fillColor: '#1a1a2e', fillOpacity: 0.5, weight: 1
    }).bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -4] }).addTo(sailingDebug);

    if (leg.maneuver) {
      const mc = leg.maneuver === 'tack' ? '#2563eb' : '#f59e0b';
      L.circleMarker([leg.waypoint.lat, leg.waypoint.lon], {
        radius: 8, color: mc, fillColor: mc, fillOpacity: 0.3, weight: 2
      }).bindTooltip(leg.maneuver.toUpperCase(), { permanent: true, direction: 'right', offset: [6, 0] }).addTo(sailingDebug);
    }
  }

  const last = legs[legs.length - 1];
  if (last.endWaypoint) {
    L.circleMarker([last.endWaypoint.lat, last.endWaypoint.lon], {
      radius: 3, color: '#1a1a2e', fillColor: '#1a1a2e', fillOpacity: 0.5, weight: 1
    }).addTo(sailingDebug);
  }
}

export function clearSailingDebug() {
  if (sailingDebug) {
    map.removeLayer(sailingDebug);
    sailingDebug = null;
  }
}

export function getMap() {
  return map;
}
