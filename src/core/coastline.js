import { segmentsCross, pointInPolygon } from './geometry.js';

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
    polygons.push(
      geometry.coordinates[0].map(c => ({ lat: c[1], lon: c[0] }))
    );
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      polygons.push(
        polygon[0].map(c => ({ lat: c[1], lon: c[0] }))
      );
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

  if (coastline.polygons) {
    const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
    for (const polygon of coastline.polygons) {
      if (pointInPolygon(mid, polygon)) return true;
      if (pointInPolygon(a, polygon)) return true;
      if (pointInPolygon(b, polygon)) return true;
    }
  }

  return false;
}
