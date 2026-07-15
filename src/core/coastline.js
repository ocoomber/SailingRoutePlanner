import { segmentsCross } from './geometry.js';

export function loadCoastline(geojson) {
  const segments = [];

  for (const feature of geojson.features) {
    extractSegments(feature.geometry, segments);
  }

  return { segments };
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
  return false;
}
