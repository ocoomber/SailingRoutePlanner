// Autosaves the drawn route to localStorage so a reload never loses the skipper's
// work. Follows the sparse/versioned pattern of ui/settings-store.js: on a
// version we don't understand, drop and warn rather than crash. Saves are
// debounced so a drag (many moves) writes once when it settles, not per frame.

import { serializeRoute, deserializeRoute } from '../core/route-model.js';

const STORAGE_KEY = 'srp.route.v1';
const SAVE_DEBOUNCE_MS = 500;

let saveTimer = null;

export function loadRoute() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const route = deserializeRoute(raw);
    if (!route) {
      console.warn('Saved route could not be read (unknown format/version) — starting empty.');
      return null;
    }
    return route;
  } catch (err) {
    console.warn('Could not read saved route, starting empty:', err);
    return null;
  }
}

export function saveRoute(route) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, serializeRoute(route));
    } catch (err) {
      console.warn('Could not save route:', err);
    }
  }, SAVE_DEBOUNCE_MS);
}

export function clearRoute() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Could not clear saved route:', err);
  }
}
