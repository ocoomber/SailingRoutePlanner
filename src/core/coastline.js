import { segmentsCross, pointInPolygon, distanceNm, interpolatePoint } from './geometry.js';

export function loadCoastline(geojson) {
  const segments = [];
  const polygons = [];

  for (const feature of geojson.features) {
    extractSegments(feature.geometry, segments);
    extractPolygons(feature.geometry, polygons);
  }

  return { segments, polygons };
}

function extractSegments(geometry, segments) {
  if (geometry.type === 'Polygon') {
    addRingSegments(geometry.coordinates[0], segments);
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      addRingSegments(polygon[0], segments);
    }
  } else if (geometry.type === 'LineString') {
    addLineSegments(geometry.coordinates, segments);
  } else if (geometry.type === 'MultiLineString') {
    for (const line of geometry.coordinates) {
      addLineSegments(line, segments);
    }
  }
}

function extractPolygons(geometry, polygons) {
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      polygons.push(ring.map(c => ({ lat: c[1], lon: c[0] })));
    }
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        polygons.push(ring.map(c => ({ lat: c[1], lon: c[0] })));
      }
    }
  }
}

function addRingSegments(coords, segments) {
  for (let i = 0; i < coords.length - 1; i++) {
    segments.push([
      { lat: coords[i][1], lon: coords[i][0] },
      { lat: coords[i + 1][1], lon: coords[i + 1][0] }
    ]);
  }
}

function addLineSegments(coords, segments) {
  for (let i = 0; i < coords.length - 1; i++) {
    segments.push([
      { lat: coords[i][1], lon: coords[i][0] },
      { lat: coords[i + 1][1], lon: coords[i + 1][0] }
    ]);
  }
}

export function crossesLand(coastline, a, b) {
  for (const seg of coastline.segments) {
    if (segmentsCross(a, b, seg[0], seg[1])) {
      return true;
    }
  }

  for (const poly of coastline.polygons) {
    if (pointInPolygon(a, poly)) return true;
    if (pointInPolygon(b, poly)) return true;
    if (pointInPolygon({ lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 }, poly)) return true;
  }

  const dist = distanceNm(a, b);
  if (dist > 1) {
    const steps = Math.ceil(dist);
    for (let i = 1; i < steps; i++) {
      const mid = interpolatePoint(a, b, i / steps);
      for (const poly of coastline.polygons) {
        if (pointInPolygon(mid, poly)) return true;
      }
    }
  }

  return false;
}
