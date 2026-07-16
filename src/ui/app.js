import { loadPolars } from '../core/polar.js';
import { CoastlineManager } from '../data/coastline/index.js';
import { calculateRoute } from '../core/router.js';
import { planPassageForBrowser } from '../services/passage-service.js';
import { initMap, setStart, setEnd, drawRoute, clearAll, clearChartingTools, drawLandOverlay, clearLandOverlay, drawSailingDebug, clearSailingDebug, drawCoarseOverlay, clearCoarseOverlay, drawTileGrid, clearTileGrid, drawTileStates, clearTileStates } from './map.js';
import { getInputs, setCoordinates, validateInputs, parseTidalData, setupTideToggle, setupTimeModeToggle } from './controls.js';
import { showResults, showError, hideResults, showLoading, hideLoading, showLog, hideLog } from './results.js';

let polars = null;
let coastlineManager = null;

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

async function runGeometryMode(start, end, inputs) {
  return calculateRoute({
    start, end,
    departureTime: new Date().toISOString(),
    coastline: coastlineManager.getCoarseCoastline(),
    timeStepMinutes: inputs.timeStep,
    headingThreshold: inputs.headingThreshold,
    constantSpeedKn: 6,
    clearanceMarginNm: inputs.clearanceMargin
  });
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

    const targetTime = new Date(`${inputs.departureDate}T${inputs.departureTime}:00Z`);
    let departureTime = inputs.timeMode === 'departure'
      ? targetTime
      : new Date(targetTime.getTime() - 48 * 3600000);

    let route, log, rawNodes;

    if (inputs.geometryMode) {
      const result = await runGeometryMode(start, end, inputs);
      route = result.route;
      log = result.log;
      rawNodes = result.rawNodes;
    } else {
      const tidalCurrent = inputs.tidalEnabled ? parseTidalData(inputs.tidalData) : null;
      const passageResult = await planPassageForBrowser({
        start, end,
        departureTime: departureTime.toISOString(),
        basePolars: polars,
        coastlineManager,
        routerOpts: { timeStepMinutes: inputs.timeStep, headingThreshold: inputs.headingThreshold, clearanceMarginNm: inputs.clearanceMargin }
      });
      route = passageResult.legs;
      log = passageResult.debug.log;
      rawNodes = passageResult.debug.rawNodes;
      if (tidalCurrent) log += '\n(Tidal current input ignored — position-aware tidal modelling not yet built)';
    }

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
    window.__lastRawNodes = rawNodes;
    window.__coastlineManager = coastlineManager;
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
  window.__lastRawNodes = null;
  window.__coastlineManager = null;
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
