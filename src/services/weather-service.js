// Fetches the viewport weather field (wind + MSL pressure) for the visual
// weather layers, decoupled from route planning (which keeps its own fetch in
// passage-service.js).
//
// Rules that keep this cheap and polite to Open-Meteo:
//  - nothing is fetched unless at least one weather layer is actually on
//    (the store's consumer count is the gate);
//  - the fetched bbox is padded well beyond the viewport, so ordinary panning
//    never refetches — only leaving the padded area, or changing zoom enough
//    that the grid density no longer suits the view;
//  - viewport events are debounced and in-flight fetches coalesced, keeping at
//    most one request in the air.

import { samplePoints, parseWindResponse } from './wind.js';
import { renderState, redraw } from '../ui/app-state.js';
import * as weatherStore from '../ui/weather/weather-store.js';

const API_BASE = 'https://api.open-meteo.com/v1/forecast';

export const GRID_SIZE = 12;          // 12x12 = 144 sample points
export const FORECAST_HOURS = 72;
const PAD_FRACTION = 0.35;            // padding on each side of the viewport
const DEBOUNCE_MS = 600;
const STALE_MS = 60 * 60 * 1000;      // refresh forecast data after an hour

// The refetch decision, kept pure so the test harness can drive it directly.
// `cache` is null or { area: padded bbox, viewWidth, viewHeight, fetchedAt }.
export function needsFetch(cache, viewport, now = Date.now()) {
  if (!cache) return true;
  if (now - cache.fetchedAt > STALE_MS) return true;

  const { area } = cache;
  const covered = viewport.north <= area.north && viewport.south >= area.south &&
    viewport.west >= area.west && viewport.east <= area.east;
  if (!covered) return true;

  // Zoomed far out: the padded area no longer covers much beyond the view.
  const width = viewport.east - viewport.west;
  if (width > cache.viewWidth * 2) return true;

  // Zoomed far in: the grid is too coarse for the view; refetch a tighter bbox.
  if (width < cache.viewWidth / 3) return true;

  return false;
}

export function padViewport(viewport, fraction = PAD_FRACTION) {
  const dLat = (viewport.north - viewport.south) * fraction;
  const dLon = (viewport.east - viewport.west) * fraction;
  return {
    north: Math.min(viewport.north + dLat, 89),
    south: Math.max(viewport.south - dLat, -89),
    east: viewport.east + dLon,
    west: viewport.west - dLon
  };
}

export async function fetchWeatherGrid(area, now = new Date()) {
  const points = samplePoints(area, GRID_SIZE);
  const start = new Date(now);
  const end = new Date(now.getTime() + FORECAST_HOURS * 3600 * 1000);

  const params = new URLSearchParams({
    latitude: points.map(p => p.lat.toFixed(3)).join(','),
    longitude: points.map(p => p.lon.toFixed(3)).join(','),
    hourly: 'wind_speed_10m,wind_direction_10m,pressure_msl',
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
    wind_speed_unit: 'kn',
    timezone: 'UTC'
  });

  const resp = await fetch(`${API_BASE}?${params}`);
  if (!resp.ok) throw new Error(`Weather API error: ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(`Weather API error: ${data.reason}`);

  const results = Array.isArray(data) ? data : [data];
  const parsed = parseWindResponse(results, points, { pressure: 'pressure_msl' });

  // The API returns whole days; trim to the animation window (the hour before
  // now, so "now" is always inside the range, through now + FORECAST_HOURS).
  const from = now.getTime() - 3600 * 1000;
  const to = end.getTime();
  parsed.grid = parsed.grid.filter(f => {
    const t = new Date(f.time).getTime();
    return t >= from && t <= to;
  });

  return parsed;
}

let cache = null;
let debounceTimer = null;
let loading = false;
let pendingBounds = null;

export function ensureWeatherFor(bounds) {
  if (!bounds || !weatherStore.hasActiveConsumers()) return;
  if (!needsFetch(cache, bounds)) return;

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runFetch(bounds), DEBOUNCE_MS);
}

async function runFetch(bounds) {
  // Coalesce: keep only the newest bounds while a fetch is in flight.
  if (loading) { pendingBounds = bounds; return; }
  if (!weatherStore.hasActiveConsumers() || !needsFetch(cache, bounds)) return;

  loading = true;
  try {
    const area = padViewport(bounds);
    const grid = await fetchWeatherGrid(area);
    cache = {
      area,
      viewWidth: bounds.east - bounds.west,
      viewHeight: bounds.north - bounds.south,
      fetchedAt: Date.now()
    };
    renderState.weatherGrid = grid;   // new identity -> registry rebuilds weather layers
    weatherStore.setGrid(grid);
    redraw();
  } catch (err) {
    console.warn('Weather fetch failed:', err);
  } finally {
    loading = false;
    if (pendingBounds) {
      const next = pendingBounds;
      pendingBounds = null;
      runFetch(next);
    }
  }
}

// When the first weather layer is switched on, fetch for wherever the map
// already is — don't wait for the next pan.
weatherStore.onConsumersChange(count => {
  if (count > 0 && renderState.bounds) ensureWeatherFor(renderState.bounds);
});
