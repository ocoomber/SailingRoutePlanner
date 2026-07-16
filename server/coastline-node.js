import { readFile } from 'fs/promises';
import { join } from 'path';
import { loadCoastline } from '../src/core/coastline.js';
import { selectTilesForCorridor, DEFAULT_TILE_ZOOM } from '../src/data/coastline/tile-selector.js';
import { SmartCoastline } from '../src/data/coastline/smart-coastline.js';

const TILES_DIR = join(process.cwd(), 'tiles', 'coastline');

export class CoastlineNode {
  constructor() {
    this.coarseCoastline = null;
    this._loadedTileKeys = new Set();
    this._tileDataMap = new Map();
    this._smartCoastline = null;
    this._tileZoom = DEFAULT_TILE_ZOOM;
  }

  async init(coarseData) {
    this.coarseCoastline = loadCoastline(coarseData);
  }

  getCoarseCoastline() {
    return this.coarseCoastline;
  }

  getSmartCoastline() {
    return this._smartCoastline;
  }

  async prepareFineTiles(routePoints, marginNm) {
    const tileKeys = selectTilesForCorridor(routePoints, this._tileZoom, marginNm);
    await this._loadTiles(tileKeys);
  }

  async _loadTiles(tileKeys) {
    const toFetch = [...tileKeys].filter(key => !this._loadedTileKeys.has(key));
    if (toFetch.length === 0) return;

    await Promise.all(toFetch.map(async key => {
      const [z, x, y] = key.split('/').map(Number);
      try {
        const raw = await readFile(join(TILES_DIR, String(z), String(x), `${y}.json`), 'utf-8');
        this._loadedTileKeys.add(key);
        this._tileDataMap.set(key, JSON.parse(raw));
      } catch {
        this._loadedTileKeys.add(key);
      }
    }));

    const allSegments = [];
    const allOuterRings = [];
    const allInnerRings = [];
    for (const data of this._tileDataMap.values()) {
      allSegments.push(...(data.segments || []));
      allOuterRings.push(...(data.outerRings || []));
      allInnerRings.push(...(data.innerRings || []));
    }

    const fineCoastline = loadCoastline({ segments: allSegments, outerRings: allOuterRings, innerRings: allInnerRings });
    this._smartCoastline = new SmartCoastline(fineCoastline, this.coarseCoastline, new Set(this._loadedTileKeys));
  }
}
