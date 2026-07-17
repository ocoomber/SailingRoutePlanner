export const DEFAULT_TILE_ZOOM = 12;

export function lonToTileX(lon, zoom) {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}

export function latToTileY(lat, zoom) {
  return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
}

export function tileToLon(x, zoom) {
  return x / Math.pow(2, zoom) * 360 - 180;
}

export function tileToLat(y, zoom) {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function pointToTile(lat, lon, zoom) {
  return { z: zoom, x: lonToTileX(lon, zoom), y: latToTileY(lat, zoom) };
}

export function tileKey(z, x, y) {
  return `${z}/${x}/${y}`;
}

export function parseTileKey(key) {
  const parts = key.split('/');
  return { z: parseInt(parts[0], 10), x: parseInt(parts[1], 10), y: parseInt(parts[2], 10) };
}

export function tileBounds(z, x, y) {
  return {
    north: tileToLat(y, z),
    south: tileToLat(y + 1, z),
    east: tileToLon(x + 1, z),
    west: tileToLon(x, z)
  };
}

export function selectTilesForBounds(bounds, zoom) {
  const tileSet = new Set();
  if (!bounds) return tileSet;

  const x1 = lonToTileX(bounds.west, zoom);
  const x2 = lonToTileX(bounds.east, zoom);
  const y1 = latToTileY(bounds.north, zoom);
  const y2 = latToTileY(bounds.south, zoom);

  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      tileSet.add(tileKey(zoom, x, y));
    }
  }

  return tileSet;
}

export function selectTilesForCorridor(routePoints, zoom, marginNm) {
  if (!routePoints || routePoints.length < 2) return new Set();

  const marginDeg = marginNm / 60;

  const tileSet = new Set();
  const seen = new Set();

  for (let i = 0; i < routePoints.length - 1; i++) {
    const a = routePoints[i];
    const b = routePoints[i + 1];

    const minLat = Math.min(a.lat, b.lat) - marginDeg;
    const maxLat = Math.max(a.lat, b.lat) + marginDeg;
    const minLon = Math.min(a.lon, b.lon) - marginDeg;
    const maxLon = Math.max(a.lon, b.lon) + marginDeg;

    const x1 = lonToTileX(minLon, zoom);
    const x2 = lonToTileX(maxLon, zoom);
    const y1 = latToTileY(maxLat, zoom);
    const y2 = latToTileY(minLat, zoom);

    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        const key = tileKey(zoom, x, y);
        if (seen.has(key)) continue;
        seen.add(key);
        tileSet.add(key);
      }
    }
  }

  return tileSet;
}
