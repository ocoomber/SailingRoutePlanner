import { loadCoastline } from '../../core/coastline.js';
import { TileCache } from './tile-cache.js';
import { pointToTile, tileKey, selectTilesForCorridor, DEFAULT_TILE_ZOOM } from './tile-selector.js';
import { SmartCoastline } from './smart-coastline.js';

const TILE_SERVER_BASE = 'tiles/coastline';

export class CoastlineManager {
  constructor() {
    this.coarseCoastline = null;
    this._tileCache = new TileCache();
    this._fineData = null;
    this._loadedTileKeys = new Set();
    this._tileDataMap = new Map();
    this._smartCoastline = null;
    this._tileZoom = DEFAULT_TILE_ZOOM;
    this._pendingFetches = new Map();
  }

  get tileZoom() {
    return this._tileZoom;
  }

  async init(coarseData) {
    this.coarseCoastline = loadCoastline(coarseData);
    await this._tileCache.open();
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

  async ensureTileForPoint(lat, lon) {
    const { x, y, z } = pointToTile(lat, lon, this._tileZoom);
    const key = tileKey(z, x, y);
    if (this._loadedTileKeys.has(key)) return;
    const keys = new Set([key]);
    await this._loadTiles(keys);
  }

  async _loadTiles(tileKeys) {
    const toFetch = [];
    for (const key of tileKeys) {
      if (this._loadedTileKeys.has(key)) continue;
      const [z, x, y] = key.split('/').map(Number);
      toFetch.push({ z, x, y, key });
    }

    if (toFetch.length === 0) return;

    const results = await Promise.allSettled(
      toFetch.map(async ({ z, x, y, key }) => {
        let data = await this._tileCache.get(z, x, y);
        if (data) return { key, data: { segments: data.data.segments, outerRings: data.data.outerRings || [], innerRings: data.data.innerRings || [] } };
        const url = `${TILE_SERVER_BASE}/${z}/${x}/${y}.json`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Failed to fetch tile ${key}: ${resp.status}`);
        const json = await resp.json();
        await this._tileCache.set(z, x, y, json);
        return { key, data: json };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { key, data } = result.value;
        this._loadedTileKeys.add(key);
        this._tileDataMap.set(key, data);
      } else {
        console.warn('Tile load failed:', result.reason);
      }
    }

    const allSegments = [];
    const allOuterRings = [];
    const allInnerRings = [];

    for (const data of this._tileDataMap.values()) {
      allSegments.push(...(data.segments || []));
      allOuterRings.push(...(data.outerRings || []));
      allInnerRings.push(...(data.innerRings || []));
    }

    const mergedData = { segments: allSegments, outerRings: allOuterRings, innerRings: allInnerRings };
    this._fineData = loadCoastline(mergedData);
    this._smartCoastline = new SmartCoastline(this._fineData, this.coarseCoastline, new Set(this._loadedTileKeys));
  }

  getTileStateMap() {
    const map = new Map();
    for (const key of this._loadedTileKeys) {
      map.set(key, 'loaded');
    }
    return map;
  }

  async getTileCacheStats() {
    return this._tileCache.stats();
  }
}
