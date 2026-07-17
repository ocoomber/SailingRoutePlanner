// Full-screen view switching, driven by the URL hash (#/settings).
//
// Deliberately one document rather than a second HTML file: a separate page
// would re-fetch the polars and coarse coastline, throw away every loaded detail
// tile, and lose your map position and computed route every time you looked at a
// setting. The hash gives back/forward and reload-into-settings for free.

import { refreshMapSize } from './map/map-core.js';

const VIEWS = { map: 'view-map', settings: 'view-settings' };

let onEnterSettings = null;

function viewFromHash() {
  return location.hash === '#/settings' ? 'settings' : 'map';
}

function applyView(name) {
  for (const [key, id] of Object.entries(VIEWS)) {
    const node = document.getElementById(id);
    if (node) node.classList.toggle('hidden', key !== name);
  }

  if (name === 'settings' && onEnterSettings) onEnterSettings();

  // Leaflet renders a grey half-map if the container resized while hidden.
  if (name === 'map') refreshMapSize();
}

export function initViews(hooks = {}) {
  onEnterSettings = hooks.onEnterSettings || null;
  window.addEventListener('hashchange', () => applyView(viewFromHash()));
  applyView(viewFromHash());
}

export function goToSettings() {
  location.hash = '#/settings';
}

export function goToMap() {
  location.hash = '';
}
