// Pure builders for the tile-debug overlays.
// They take state.bounds rather than reading map.getBounds() themselves — that
// is what keeps them free of the map and testable.

import { tileToLat, tileToLon, lonToTileX, latToTileY } from '../../../data/coastline/tile-selector.js';

const TILE_GRID_COLOR = '#6b7280';
const TILE_LOADED_COLOR = '#22c55e';
const TILE_WATER_COLOR = '#3b82f6';
const TILE_ABSENT_COLOR = '#ef4444';

export const TILE_STATE_LEGEND = [
  { label: 'Detail tile loaded', colour: TILE_LOADED_COLOR },
  { label: 'Open water (no land tile exists)', colour: TILE_WATER_COLOR },
  { label: 'Tile exists but not loaded', colour: TILE_ABSENT_COLOR }
];

function tilesInBounds(bounds, zoom) {
  if (!bounds) return [];
  const x1 = lonToTileX(bounds.west, zoom);
  const x2 = lonToTileX(bounds.east, zoom);
  const y1 = latToTileY(bounds.north, zoom);
  const y2 = latToTileY(bounds.south, zoom);

  const out = [];
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      out.push({ x, y });
    }
  }
  return out;
}

function tileRect(x, y, zoom) {
  return [[tileToLat(y, zoom), tileToLon(x, zoom)], [tileToLat(y + 1, zoom), tileToLon(x + 1, zoom)]];
}

export function buildTileGrid(state) {
  const zoom = state.tileZoom;
  if (!zoom) return [];

  const layers = [];
  for (const { x, y } of tilesInBounds(state.bounds, zoom)) {
    layers.push(L.rectangle(tileRect(x, y, zoom), {
      color: TILE_GRID_COLOR, weight: 1, opacity: 0.3, fill: false
    }));
    const rect = tileRect(x, y, zoom);
    layers.push(L.marker(
      [(rect[0][0] + rect[1][0]) / 2, (rect[0][1] + rect[1][1]) / 2],
      {
        icon: L.divIcon({ className: 'tile-label', html: `${zoom}/${x}/${y}`, iconSize: [80, 12], iconAnchor: [40, 6] }),
        interactive: false
      }
    ));
  }
  return layers;
}

export function buildTileStates(state) {
  const manager = state.coastlineManager;
  const zoom = state.tileZoom;
  if (!manager || !zoom) return [];

  const layers = [];
  for (const { x, y } of tilesInBounds(state.bounds, zoom)) {
    const rect = tileRect(x, y, zoom);
    const centreLat = (rect[0][0] + rect[1][0]) / 2;
    const centreLon = (rect[0][1] + rect[1][1]) / 2;
    const info = manager.getTileInfo(centreLat, centreLon);

    let colour = TILE_ABSENT_COLOR;
    let label = 'not loaded';
    if (info.loaded) {
      colour = TILE_LOADED_COLOR;
      label = 'loaded';
    } else if (info.existsInManifest === false) {
      colour = TILE_WATER_COLOR;
      label = 'open water';
    }

    layers.push(L.rectangle(rect, {
      color: colour, weight: 1.5, opacity: 0.5, fillColor: colour, fillOpacity: 0.2
    }));
    layers.push(L.marker([centreLat, centreLon], {
      icon: L.divIcon({
        className: 'tile-state-label',
        html: `<span style="background:${colour};color:#fff;padding:1px 4px;border-radius:2px;font-size:9px">${label}</span>`,
        iconSize: [70, 14],
        iconAnchor: [35, 7]
      }),
      interactive: false
    }));
  }
  return layers;
}
