import polygonClipping from 'polygon-clipping';

export const CLIP_MARGIN_DEG = 0.01;

export function ringBbox(ring) {
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const pt of ring) {
    if (pt.lat < south) south = pt.lat;
    if (pt.lat > north) north = pt.lat;
    if (pt.lon < west) west = pt.lon;
    if (pt.lon > east) east = pt.lon;
  }
  return { south, north, west, east };
}

export function boundsOverlap(a, b) {
  return a.west <= b.east && a.east >= b.west &&
         a.south <= b.north && a.north >= b.south;
}

export function expandBounds(bounds, marginDeg) {
  return {
    south: bounds.south - marginDeg,
    north: bounds.north + marginDeg,
    west: bounds.west - marginDeg,
    east: bounds.east + marginDeg
  };
}

export function fullBoundsRing(bounds) {
  return [
    { lat: bounds.south, lon: bounds.west },
    { lat: bounds.south, lon: bounds.east },
    { lat: bounds.north, lon: bounds.east },
    { lat: bounds.north, lon: bounds.west }
  ];
}

export function clipRingToBounds(ring, bounds) {
  const coords = ring.map(pt => [pt.lon, pt.lat]);
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([first[0], first[1]]);
  }

  const rect = [[
    [bounds.west, bounds.south],
    [bounds.east, bounds.south],
    [bounds.east, bounds.north],
    [bounds.west, bounds.north],
    [bounds.west, bounds.south]
  ]];

  const result = polygonClipping.intersection([coords], rect);

  const pieces = [];
  for (const poly of result) {
    if (poly.length > 1) {
      throw new Error(`Clipping a simple ring produced ${poly.length - 1} hole(s) — refusing to ship a tile with inverted containment`);
    }
    const piece = poly[0].map(([lon, lat]) => ({ lat, lon }));
    if (piece.length >= 2) {
      const a = piece[0];
      const b = piece[piece.length - 1];
      if (a.lat === b.lat && a.lon === b.lon) piece.pop();
    }
    if (piece.length >= 3) pieces.push(piece);
  }
  return pieces;
}
