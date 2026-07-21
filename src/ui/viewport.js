// Viewport-driven tile loading and the live cursor inspector.

import { inAnyPolygon } from '../core/coastline.js';
import { renderState, getCoastlineManager, redraw } from './app-state.js';
import { updateInspector } from './inspector.js';
import { ensureWeatherFor } from '../services/weather-service.js';

let viewportLoading = false;
let viewportPending = null;

function updateTileStats() {
  const el = document.getElementById('tile-stats');
  const manager = getCoastlineManager();
  if (!el || !manager) return;
  const loaded = manager.getLoadedTileCount();
  const total = manager.getManifestTileCount();
  el.textContent = total !== null
    ? `Detail tiles loaded: ${loaded} / ${total}`
    : `Detail tiles loaded: ${loaded} (no manifest)`;
}

export async function onViewportChanged(bounds) {
  renderState.bounds = bounds;
  ensureWeatherFor(bounds);   // self-debounced; no-op unless a weather layer is on
  const manager = getCoastlineManager();
  if (!manager) { redraw(); return; }

  // Coalesce: keep only the newest pending viewport while a load is in flight.
  if (viewportLoading) { viewportPending = bounds; return; }

  viewportLoading = true;
  try {
    const loaded = await manager.prepareTilesForBounds(bounds);
    if (loaded > 0) {
      // New identity so the land layers know to rebuild.
      renderState.coastline = manager.getSmartCoastline() || manager.getCoarseCoastline();
      renderState.tileEpoch += 1;
    }
    updateTileStats();
    redraw();
  } catch (err) {
    console.warn('Viewport tile load failed:', err);
  } finally {
    viewportLoading = false;
    if (viewportPending) {
      const next = viewportPending;
      viewportPending = null;
      onViewportChanged(next);
    }
  }
}

export function landAtPoint(lat, lon) {
  const manager = getCoastlineManager();
  if (!manager) return null;

  // SmartCoastline picks fine-vs-coarse per point; before any tile loads there
  // is only the plain coarse coastline, which has no containsLand method.
  const smart = manager.getSmartCoastline();
  if (smart) return smart.containsLand({ lat, lon });
  const coarse = manager.getCoarseCoastline();
  if (coarse) return inAnyPolygon({ lat, lon }, coarse.outerRings, coarse.outerRingBboxes);
  return null;
}

export function onCursorMove(lat, lon) {
  const manager = getCoastlineManager();
  if (!manager) return;
  updateInspector({
    lat, lon,
    tileInfo: manager.getTileInfo(lat, lon),
    containsLand: landAtPoint(lat, lon)
  });
}
