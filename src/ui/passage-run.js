// Runs a passage and pushes the result into the render state and the trail.

import { computeRoughRoute, roughRouteToLegs } from '../core/rough-route.js';
import { planPassageForBrowser } from '../services/passage-service.js';
import { mergeComfortParams } from '../core/comfort-params.js';
import { buildRouteLog } from '../core/route-log.js';
import { postDebugLog } from '../services/debug-log.js';
import { renderState, getPolars, getCoastlineManager, redraw } from './app-state.js';
import { fitToLegs } from './map/map-core.js';
import { buildTrailCards, destinationOf, collectRejectedDecisions } from './trail-cards.js';
import { showTrail, clearTrail } from './trail-panel.js';
import { clearSelection } from './selection.js';
import { getInputs, validateInputs } from './controls.js';
import { showError, hideError, showLoading, hideLoading, showLog, hideLog, showWarnings } from './status.js';
import { toComfortParams, toRoutingOpts } from './settings-store.js';

// Route-only mode shows the rough course: the deterministic taut string around
// land, with no wind or sail logic applied. Computed against the coarse
// coastline (which fills rivers in), so it never wanders up a dead end.
function runGeometryMode(start, end, inputs) {
  const rough = computeRoughRoute(start, end, getCoastlineManager().getCoarseCoastline(), {
    clearanceNm: inputs.clearanceMargin
  });
  return { rough, legs: roughRouteToLegs(rough.waypoints) };
}

function departureFor(inputs) {
  const targetTime = new Date(`${inputs.departureDate}T${inputs.departureTime}:00Z`);
  const departureTime = inputs.timeMode === 'departure'
    ? targetTime
    : new Date(targetTime.getTime() - 48 * 3600000);
  return { targetTime, departureTime };
}

export async function onCalculate() {
  const inputs = getInputs();
  const errors = validateInputs(inputs);
  if (errors.length > 0) { showError(errors.join('; ')); return; }

  const manager = getCoastlineManager();
  if (!manager) { showError('Data not loaded yet. Please wait a moment.'); return; }
  if (!inputs.geometryMode && !getPolars()) { showError('Polar data not loaded yet.'); return; }

  // A corrupt or invalid saved setting must never reach the engine.
  let comfortParams = null;
  if (!inputs.geometryMode) {
    comfortParams = toComfortParams();
    try {
      mergeComfortParams(comfortParams);
    } catch (err) {
      showError(`Settings are not valid — ${err.message}. Open Settings to fix it.`);
      return;
    }
  }

  hideError();
  hideLog();
  clearSelection();
  showLoading();

  try {
    const start = { lat: inputs.startLat, lon: inputs.startLon };
    const end = { lat: inputs.endLat, lon: inputs.endLon };
    const { departureTime } = departureFor(inputs);
    const t0 = Date.now();

    let legs, decisions = null, configBlocksRaw = null, warnings = null;
    let rough = null, passage = null;

    if (inputs.geometryMode) {
      const result = runGeometryMode(start, end, inputs);
      legs = result.legs;
      rough = result.rough;
    } else {
      passage = await planPassageForBrowser({
        start, end,
        departureTime: departureTime.toISOString(),
        basePolars: getPolars(),
        comfortParams,
        coastlineManager: manager,
        routerOpts: {
          timeStepMinutes: inputs.timeStep,
          headingThreshold: inputs.headingThreshold,
          clearanceMarginNm: inputs.clearanceMargin
        }
      });
      legs = passage.legs;
      decisions = passage.decisions;
      configBlocksRaw = passage.debug.configBlocksRaw;
      warnings = passage.warnings;
    }

    hideLoading();
    showWarnings(warnings);

    // Write the structured debug log to a file (for the coding assistant to read
    // straight from logs/route-latest.json — no copy/paste).
    const settings = { ...toRoutingOpts(), comfort: comfortParams };
    const routeLog = buildRouteLog({
      mode: inputs.geometryMode ? 'route-only' : 'sailing',
      inputs, settings, rough, passage, elapsedMs: Date.now() - t0
    });
    postDebugLog(routeLog).then(saved => showLog(saved
      ? 'Debug log saved to logs/route-latest.json'
      : 'Debug log not saved — run start.cmd (node server) to capture route logs.'));

    if (!legs || legs.length === 0) {
      showError('No route found — check the coastline is passable between these points, or loosen the coastal clearance in Settings.');
      clearTrail();
      return;
    }

    renderState.legs = legs;
    renderState.decisions = decisions;
    renderState.coastline = manager.getSmartCoastline() || manager.getCoarseCoastline();

    showTrail(
      buildTrailCards(legs, configBlocksRaw, destinationOf(legs)),
      collectRejectedDecisions(decisions),
      decisions
    );

    redraw();
    // Owned here rather than by a layer: layers must never steal the viewport.
    fitToLegs(legs);
  } catch (err) {
    hideLoading();
    showError(err.message);
    console.error('Routing error:', err);
  }
}
