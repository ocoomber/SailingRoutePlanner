import { pointToTile, tileKey, DEFAULT_TILE_ZOOM } from './tile-selector.js';

export class SmartCoastline {
  constructor(fineCoastline, coarseCoastline, loadedTileKeys) {
    this.fine = fineCoastline;
    this.coarse = coarseCoastline;
    this.loadedTileKeys = loadedTileKeys;

    this.segments = fineCoastline.segments.concat(coarseCoastline.segments);
    this.outerRings = fineCoastline.outerRings.concat(coarseCoastline.outerRings);
    this.innerRings = fineCoastline.innerRings.concat(coarseCoastline.innerRings);

    const merged = {};
    for (const key of Object.keys(coarseCoastline.grid)) {
      merged[key] = coarseCoastline.grid[key];
    }
    for (const key of Object.keys(fineCoastline.grid)) {
      merged[key] = fineCoastline.grid[key];
    }
    this.grid = merged;
  }

  hasTileForPoint(lat, lon) {
    const { x, y } = pointToTile(lat, lon, DEFAULT_TILE_ZOOM);
    return this.loadedTileKeys.has(tileKey(DEFAULT_TILE_ZOOM, x, y));
  }

  hasTile(z, x, y) {
    return this.loadedTileKeys.has(tileKey(z, x, y));
  }
}
