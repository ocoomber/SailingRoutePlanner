import { loadPolars } from '../core/polar.js';
import { loadCoastline } from '../core/coastline.js';
import { calculateRoute } from '../core/router.js';
import { fetchWindGrid } from '../services/wind.js';
import { initMap, setStart, setEnd, drawRoute, clearAll } from './map.js';
import { getInputs, setCoordinates, validateInputs, parseTidalData, setupTideToggle } from './controls.js';
import { showResults, showError, hideResults, showLoading, hideLoading } from './results.js';

let polars = null;
let coastline = null;

async function loadData() {
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

  if (!polars || !coastline) {
    showError('Data not loaded yet. Please wait a moment.');
    return;
  }

  hideResults();
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

    const departureISO = new Date(inputs.departure).toISOString();
    const endTime = new Date(new Date(inputs.departure).getTime() + 48 * 3600000).toISOString();

    const windGrid = await fetchWindGrid(area, departureISO, endTime);

    const tidalCurrent = inputs.tidalEnabled ? parseTidalData(inputs.tidalData) : null;

    const legs = calculateRoute({
      start,
      end,
      departureTime: departureISO,
      polars,
      coastline,
      windGrid,
      timeStepMinutes: inputs.timeStep,
      headingThreshold: inputs.headingThreshold,
      tidalCurrent
    });

    hideLoading();

    if (!legs || legs.length === 0) {
      showError('No route found. Try adjusting your waypoints or time.');
      return;
    }

    const totalTime = legs.reduce((sum, l) => sum + l.duration, 0);

    drawRoute(legs);
    showResults(legs, totalTime);
  } catch (err) {
    hideLoading();
    showError(err.message);
    console.error('Routing error:', err);
  }
}

function onClear() {
  clearAll();
  hideResults();
  document.getElementById('start-lat').value = '';
  document.getElementById('start-lon').value = '';
  document.getElementById('end-lat').value = '';
  document.getElementById('end-lon').value = '';
}

async function init() {
  initMap(onPointSelected);
  setupTideToggle();

  document.getElementById('calculate-btn').addEventListener('click', onCalculate);
  document.getElementById('clear-btn').addEventListener('click', onClear);

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('departure').value = now.toISOString().slice(0, 16);

  try {
    await loadData();
  } catch (err) {
    console.error('Failed to load data:', err);
    showError('Failed to load application data. Check console for details.');
  }
}

init();
