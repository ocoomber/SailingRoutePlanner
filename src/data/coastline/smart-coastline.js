import { pointToTile, tileKey, DEFAULT_TILE_ZOOM } from './tile-selector.js';
import { inAnyPolygon } from '../../core/coastline.js';

export class SmartCoastline {
  constructor(fineCoastline, coarseCoastline, loadedTileKeys) {
    this.fine = fineCoastline;
    this.coarse = coarseCoastline;
    this.loadedTileKeys = loadedTileKeys;

    this.segments = fineCoastline.segments.concat(coarseCoastline.segments);
    this.outerRings = fineCoastline.outerRings;
    this.innerRings = fineCoastline.innerRings;

    const merged = {};
    for (const key of Object.keys(coarseCoastline.grid)) {
      merged[key] = coarseCoastline.grid[key];
    }
    for (const key of Object.keys(fineCoastline.grid)) {
      merged[key] = fineCoastline.grid[key];
    }
    this.grid = merged;
  }

  containsLand(point) {
    if (this.hasTileForPoint(point.lat, point.lon)) {
      return inAnyPolygon(point, this.fine.outerRings, this.fine.outerRingBboxes,
        this.fine.outerRingGrid, this.fine.outerRingGlobalRings);
    }
    return inAnyPolygon(point, this.coarse.outerRings, this.coarse.outerRingBboxes,
      this.coarse.outerRingGrid, this.coarse.outerRingGlobalRings);
  }

  hasTileForPoint(lat, lon) {
    const { x, y } = pointToTile(lat, lon, DEFAULT_TILE_ZOOM);
    return this.loadedTileKeys.has(tileKey(DEFAULT_TILE_ZOOM, x, y));
  }

  hasTile(z, x, y) {
    return this.loadedTileKeys.has(tileKey(z, x, y));
  }
}
