// The per-run inputs that live on the map view: where you're going, when, and
// the route-only mode switch. Everything tunable lives on the settings page.

import { toRoutingOpts } from './settings-store.js';

export function getInputs() {
  const routing = toRoutingOpts();
  return {
    departureDate: document.getElementById('departure-date').value,
    departureTime: document.getElementById('departure-time').value,
    timeMode: document.querySelector('input[name="time-mode"]:checked').value,
    geometryMode: document.getElementById('geometry-mode')?.checked ?? false,
    timeStep: routing.timeStep,
    headingThreshold: routing.headingThreshold,
    clearanceMargin: routing.clearanceMargin,
    harbourClearanceMargin: routing.harbourClearanceMargin,
    harbourZoneNm: routing.harbourZoneNm,
    corridorWidthNm: routing.corridorWidthNm,
    headingsPerStep: routing.headingsPerStep
  };
}

// The course now comes from the drawn route, so this validates only the depart/
// arrive time. Route presence is checked in passage-run against the editor.
export function validateInputs(inputs) {
  const errors = [];
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
