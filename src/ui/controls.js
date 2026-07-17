// The per-run inputs that live on the map view: where you're going, when, and
// the route-only mode switch. Everything tunable lives on the settings page.

import { toRoutingOpts } from './settings-store.js';

export function getInputs() {
  const routing = toRoutingOpts();
  return {
    startLat: parseFloat(document.getElementById('start-lat').value),
    startLon: parseFloat(document.getElementById('start-lon').value),
    endLat: parseFloat(document.getElementById('end-lat').value),
    endLon: parseFloat(document.getElementById('end-lon').value),
    departureDate: document.getElementById('departure-date').value,
    departureTime: document.getElementById('departure-time').value,
    timeMode: document.querySelector('input[name="time-mode"]:checked').value,
    geometryMode: document.getElementById('geometry-mode').checked,
    timeStep: routing.timeStep,
    headingThreshold: routing.headingThreshold,
    clearanceMargin: routing.clearanceMargin
  };
}

export function setCoordinates(field, lat, lon) {
  if (field === 'start') {
    document.getElementById('start-lat').value = lat.toFixed(4);
    document.getElementById('start-lon').value = lon.toFixed(4);
  } else {
    document.getElementById('end-lat').value = lat.toFixed(4);
    document.getElementById('end-lon').value = lon.toFixed(4);
  }
}

export function clearCoordinates() {
  for (const id of ['start-lat', 'start-lon', 'end-lat', 'end-lon']) {
    document.getElementById(id).value = '';
  }
}

export function validateInputs(inputs) {
  const errors = [];

  if (isNaN(inputs.startLat) || isNaN(inputs.startLon)) {
    errors.push('Start coordinates are required');
  } else if (inputs.startLat < -90 || inputs.startLat > 90 || inputs.startLon < -180 || inputs.startLon > 180) {
    errors.push('Start coordinates are out of range');
  }

  if (isNaN(inputs.endLat) || isNaN(inputs.endLon)) {
    errors.push('End coordinates are required');
  } else if (inputs.endLat < -90 || inputs.endLat > 90 || inputs.endLon < -180 || inputs.endLon > 180) {
    errors.push('End coordinates are out of range');
  }

  if (!inputs.departureDate || !inputs.departureTime) {
    errors.push('Date and time are required');
  }

  return errors;
}

export function setupTimeModeToggle() {
  const radios = document.querySelectorAll('input[name="time-mode"]');
  const hint = document.getElementById('time-hint');
  if (!hint) return;

  const update = () => {
    const mode = document.querySelector('input[name="time-mode"]:checked').value;
    hint.textContent = mode === 'departure'
      ? 'When you plan to leave'
      : 'When you want to arrive — departure time will be computed';
  };

  radios.forEach(r => r.addEventListener('change', update));
  update();
}

export function setDefaultDateTime() {
  const now = new Date();
  document.getElementById('departure-date').value = now.toISOString().slice(0, 10);
  document.getElementById('departure-time').value = now.toISOString().slice(11, 16);
}
