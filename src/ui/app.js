import { loadPolars } from '../core/polar.js';
import { CoastlineManager } from '../data/coastline/index.js';
import { calculateRoute } from '../core/router.js';
import { fetchWindGrid } from '../services/wind.js';
import { initMap, setStart, setEnd, drawRoute, clearAll, clearChartingTools, drawLandOverlay, clearLandOverlay, drawSailingDebug, clearSailingDebug, drawCoarseOverlay, clearCoarseOverlay, drawTileGrid, clearTileGrid, drawTileStates, clearTileStates, drawCorridorOverlay, clearCorridorOverlay, drawRoughRoute, clearRoughRoute } from './map.js';
import { getInputs, setCoordinates, validateInputs, parseTidalData, setupTideToggle, setupTimeModeToggle } from './controls.js';
import { showResults, showError, hideResults, showLoading, hideLoading, showLog, hideLog } from './results.js';

let polars = null;
let coastlineManager = null;
let roughRoute = null;
let roughCorridor = null;

const COARSE_CLEARANCE_NM = 2;

async function loadData() {
  const calcBtn = document.getElementById('calculate-btn');
  calcBtn.disabled = true;
  calcBtn.textContent = 'Loading data...';

  try {
    const [polarsResp, coarseResp] = await Promise.all([
      fetch('src/data/polars/oceanis393.json'),
      fetch('src/data/coastline/sw-england-coarse.json')
    ]);

    if (!polarsResp.ok) throw new Error('Failed to load polar data');
    if (!coarseResp.ok) throw new Error('Failed to load coastline data');

    const polarsJson = await polarsResp.json();
    const coarseJson = await coarseResp.json();

    polars = loadPolars(polarsJson);

    coastlineManager = new CoastlineManager();
    await coastlineManager.init(coarseJson);
  } finally {
    calcBtn.disabled = false;
    calcBtn.textContent = 'Calculate Route';
  }
}

function onPointSelected(field, lat, lon) {
  setCoordinates(field, lat, lon);
}

async function onCalculate() {
  const inputs = getInputs();
  const errors = validateInputs(inputs);

  if (errors.length > 0) {
    showError(errors.join('; '));
    return;
  }

  if (!coastlineManager) {
    showError('Data not loaded yet. Please wait a moment.');
    return;
  }

  if (!inputs.geometryMode && !polars) {
    showError('Polar data not loaded yet. Please wait a moment.');
    return;
  }

  hideResults();
  hideLog();
  showLoading();

  try {
    const start = { lat: inputs.startLat, lon: inputs.startLon };
    const end = { lat: inputs.endLat, lon: inputs.endLon };

    const area = {
      north: Math.max(start.lat, end.lat) + 0.5,
      south: Math.min(start.lat, end.lat) - 0.5,
      east: Math.max(start.lon, end.lon) + 0.5,
      west: Math.min(start.lon, end.lon) - 0.5
    };

    const targetTime = new Date(`${inputs.departureDate}T${inputs.departureTime}:00Z`);

    let departureTime;

    if (inputs.timeMode === 'departure') {
      departureTime = targetTime;
    } else {
      const arrivalTime = targetTime;
      departureTime = new Date(arrivalTime.getTime() - 48 * 3600000);
    }

    const departureISO = departureTime.toISOString();
    const endTime = new Date(departureTime.getTime() + 48 * 3600000).toISOString();

    let windGrid = null;
    if (!inputs.geometryMode) {
      windGrid = await fetchWindGrid(area, departureISO, endTime);
    }

    const tidalCurrent = inputs.tidalEnabled ? parseTidalData(inputs.tidalData) : null;

    const makeParams = (coastline, clearanceMarginNm) => ({
      start,
      end,
      departureTime: departureISO,
      coastline,
      timeStepMinutes: inputs.timeStep,
      headingThreshold: inputs.headingThreshold,
      tidalCurrent,
      clearanceMarginNm
    });

    const coarseParams = makeParams(coastlineManager.getCoarseCoastline(), Math.max(inputs.clearanceMargin, COARSE_CLEARANCE_NM));
    if (inputs.geometryMode) {
      coarseParams.constantSpeedKn = 6;
    } else {
      coarseParams.polars = polars;
      coarseParams.windGrid = windGrid;
    }

    const coarseResult = await calculateRoute(coarseParams);
    roughRoute = coarseResult;

    if (coarseResult.route && coarseResult.route.length > 0) {
      const waypoints = [];
      for (const leg of coarseResult.route) {
        waypoints.push(leg.waypoint);
      }
      const last = coarseResult.route[coarseResult.route.length - 1];
      if (last.endWaypoint) waypoints.push(last.endWaypoint);

      roughCorridor = buildCorridorPath(waypoints, 512, 3);

      await coastlineManager.prepareFineTiles(waypoints, 5);
    } else {
      roughCorridor = null;
    }

    const smartCoastline = coastlineManager.getSmartCoastline() || coastlineManager.getCoarseCoastline();

    const fineParams = makeParams(smartCoastline, inputs.clearanceMargin);
    if (inputs.geometryMode) {
      fineParams.constantSpeedKn = 6;
    } else {
      fineParams.polars = polars;
      fineParams.windGrid = windGrid;
    }

    const { route, log } = await calculateRoute(fineParams);

    hideLoading();
    showLog(log);

    if (!route || route.length === 0) {
      showError('Unable to find a route — check the coastline is passable between these points, or try increasing max steps in the debug options.');
      return;
    }

    const totalTime = route.reduce((sum, l) => sum + l.duration, 0);
    const computedDeparture = inputs.timeMode === 'arrival'
      ? new Date(targetTime.getTime() - totalTime * 3600000)
      : null;

    drawRoute(route);
    window.__lastRoute = route;
    window.__roughRoute = coarseResult;
    window.__coastlineManager = coastlineManager;
    window.__roughCorridor = roughCorridor;
    if (document.getElementById('show-sailing-debug').checked) {
      drawSailingDebug(route);
    }
    showResults(route, totalTime, inputs.timeMode, computedDeparture, targetTime);
    refreshDebugOverlays();
  } catch (err) {
    hideLoading();
    showError(err.message);
    console.error('Routing error:', err);
  }
}

function buildCorridorPath(waypoints, segments, marginNm) {
  if (!waypoints || waypoints.length < 2) return null;

  const marginDeg = marginNm / 60;
  const path = [];

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    for (let t = 0; t <= 1; t += 1 / segments) {
      const lat = a.lat + (b.lat - a.lat) * t;
      const lon = a.lon + (b.lon - a.lon) * t;
      const cosLat = Math.cos(lat * Math.PI / 180);
      path.push({ lat: lat + marginDeg * cosLat, lon: lon + marginDeg });
    }
  }

  for (let i = waypoints.length - 1; i > 0; i--) {
    const a = waypoints[i];
    const b = waypoints[i - 1];
    for (let t = 0; t <= 1; t += 1 / segments) {
      const lat = a.lat + (b.lat - a.lat) * t;
      const lon = a.lon + (b.lon - a.lon) * t;
      const cosLat = Math.cos(lat * Math.PI / 180);
      path.push({ lat: lat - marginDeg * cosLat, lon: lon - marginDeg });
    }
  }

  path.push(path[0]);
  return path;
}

function refreshDebugOverlays() {
  const showCoarse = document.getElementById('show-coarse-overlay');
  if (showCoarse && showCoarse.checked && coastlineManager) {
    drawCoarseOverlay(coastlineManager.getCoarseCoastline());
  } else {
    clearCoarseOverlay();
  }

  const showTileGrid = document.getElementById('show-tile-grid');
  if (showTileGrid && showTileGrid.checked) {
    const zoom = coastlineManager ? coastlineManager.tileZoom : 12;
    drawTileGrid(zoom);
  } else {
    clearTileGrid();
  }

  const showTileStates = document.getElementById('show-tile-states');
  if (showTileStates && showTileStates.checked && coastlineManager) {
    drawTileStates(coastlineManager, coastlineManager.getTileStateMap());
  } else {
    clearTileStates();
  }

  const showCorridor = document.getElementById('show-corridor');
  if (showCorridor && showCorridor.checked && roughCorridor) {
    drawCorridorOverlay(roughCorridor);
  } else {
    clearCorridorOverlay();
  }

  const showRough = document.getElementById('show-rough-route');
  if (showRough && showRough.checked && roughRoute && roughRoute.route) {
    drawRoughRoute(roughRoute.route);
  } else {
    clearRoughRoute();
  }

  const showLand = document.getElementById('show-land-overlay');
  if (showLand && showLand.checked && coastlineManager) {
    const smart = coastlineManager.getSmartCoastline();
    drawLandOverlay(smart || coastlineManager.getCoarseCoastline());
  } else {
    clearLandOverlay();
  }
}

function onClear() {
  clearAll();
  clearChartingTools();
  hideResults();
  hideLog();
  window.__lastRoute = null;
  window.__roughRoute = null;
  window.__coastlineManager = null;
  window.__roughCorridor = null;
  roughRoute = null;
  roughCorridor = null;
  document.getElementById('start-lat').value = '';
  document.getElementById('start-lon').value = '';
  document.getElementById('end-lat').value = '';
  document.getElementById('end-lon').value = '';
}

async function init() {
  initMap(onPointSelected);
  setupTideToggle();
  setupTimeModeToggle();

  document.getElementById('calculate-btn').addEventListener('click', onCalculate);
  document.getElementById('clear-btn').addEventListener('click', onClear);

  document.getElementById('show-land-overlay').addEventListener('change', () => {
    refreshDebugOverlays();
  });

  document.getElementById('show-coarse-overlay').addEventListener('change', () => {
    refreshDebugOverlays();
  });

  document.getElementById('show-tile-grid').addEventListener('change', () => {
    refreshDebugOverlays();
  });

  document.getElementById('show-tile-states').addEventListener('change', () => {
    refreshDebugOverlays();
  });

  document.getElementById('show-corridor').addEventListener('change', () => {
    refreshDebugOverlays();
  });

  document.getElementById('show-rough-route').addEventListener('change', () => {
    refreshDebugOverlays();
  });

  document.getElementById('show-sailing-debug').addEventListener('change', (e) => {
    if (e.target.checked) {
      const route = window.__lastRoute;
      if (route) drawSailingDebug(route);
    } else {
      clearSailingDebug();
    }
  });

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toISOString().slice(11, 16);
  document.getElementById('departure-date').value = dateStr;
  document.getElementById('departure-time').value = timeStr;

  try {
    await loadData();
  } catch (err) {
    console.error('Failed to load data:', err);
    showError('Failed to load application data. Check console for details.');
  }
}

init();
