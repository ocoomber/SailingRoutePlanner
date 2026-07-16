import { loadPolars } from '../core/polar.js';
import { loadCoastline } from '../core/coastline.js';
import { calculateRoute } from '../core/router.js';
import { fetchWindGrid } from '../services/wind.js';
import { initMap, setStart, setEnd, drawRoute, clearAll, drawLandOverlay, clearLandOverlay } from './map.js';
import { getInputs, setCoordinates, validateInputs, parseTidalData, setupTideToggle, setupTimeModeToggle } from './controls.js';
import { showResults, showError, hideResults, showLoading, hideLoading, showLog, hideLog } from './results.js';

let polars = null;
let coastline = null;

async function loadData() {
  const calcBtn = document.getElementById('calculate-btn');
  calcBtn.disabled = true;
  calcBtn.textContent = 'Loading data...';

  try {
    const [polarsResp, coastResp] = await Promise.all([
      fetch('src/data/polars/oceanis393.json'),
      fetch('src/data/coastlines/sw-england.json')
    ]);

    if (!polarsResp.ok) throw new Error('Failed to load polar data');
    if (!coastResp.ok) throw new Error('Failed to load coastline data');

    const polarsJson = await polarsResp.json();
    const coastJson = await coastResp.json();

    polars = loadPolars(polarsJson);
    coastline = loadCoastline(coastJson);
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

  if (!coastline) {
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
    let arrivalTime;

    if (inputs.timeMode === 'departure') {
      departureTime = targetTime;
    } else {
      arrivalTime = targetTime;
      departureTime = new Date(targetTime.getTime() - 48 * 3600000);
    }

    const departureISO = departureTime.toISOString();
    const endTime = arrivalTime
      ? arrivalTime.toISOString()
      : new Date(departureTime.getTime() + 48 * 3600000).toISOString();

    let windGrid = null;
    if (!inputs.geometryMode) {
      windGrid = await fetchWindGrid(area, departureISO, endTime);
    }

    const tidalCurrent = inputs.tidalEnabled ? parseTidalData(inputs.tidalData) : null;

    const routeParams = {
      start,
      end,
      departureTime: departureISO,
      coastline,
      timeStepMinutes: inputs.timeStep,
      headingThreshold: inputs.headingThreshold,
      tidalCurrent
    };

    if (inputs.geometryMode) {
      routeParams.constantSpeedKn = 6;
    } else {
      routeParams.polars = polars;
      routeParams.windGrid = windGrid;
    }

    const { route, log } = await calculateRoute(routeParams);

    hideLoading();
    showLog(log);

    if (!route || route.length === 0) {
      showError('Unable to find a route — check the coastline is passable between these points, or try increasing max steps in the debug options.');
      return;
    }

    const totalTime = route.reduce((sum, l) => sum + l.duration, 0);
    const computedDeparture = inputs.timeMode === 'arrival'
      ? new Date(arrivalTime.getTime() - totalTime * 3600000)
      : null;

    drawRoute(route);
    showResults(route, totalTime, inputs.timeMode, computedDeparture, targetTime);
  } catch (err) {
    hideLoading();
    showError(err.message);
    console.error('Routing error:', err);
  }
}

function onClear() {
  clearAll();
  hideResults();
  hideLog();
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

  document.getElementById('show-land-overlay').addEventListener('change', (e) => {
    if (!coastline) return;
    if (e.target.checked) {
      drawLandOverlay(coastline);
    } else {
      clearLandOverlay();
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
