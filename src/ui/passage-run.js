// Runs a passage and pushes the result into the render state and the trail.

import { assessProvidedRoute, roughRouteToLegs } from '../core/rough-route.js';
import { getRoute } from './route-editor.js';
import { toWaypoints, isPlannable } from '../core/route-model.js';
import { planPassageForBrowser } from '../services/passage-service.js';
import { mergeComfortParams } from '../core/comfort-params.js';
import { renderState, getPolars, getCoastlineManager, redraw } from './app-state.js';
import { fitToLegs } from './map/map-core.js';
import { buildTrailCards, destinationOf, collectRejectedDecisions } from './trail-cards.js';
import { showTrail, clearTrail } from './trail-panel.js';
import { clearSelection } from './selection.js';
import { getInputs, validateInputs } from './controls.js';
import { showError, hideError, showLoading, hideLoading, showWarnings } from './status.js';
import { toComfortParams, toRoutingOpts } from './settings-store.js';

// Route-only mode shows the drawn course itself — the legs the skipper laid
// down, with no wind or sail logic applied. It assesses (does not regenerate)
// the drawn route against the coarse coastline so you can see, before running
// the full plan, whether any leg cuts across land.
function runGeometryMode(waypoints) {
  const rough = assessProvidedRoute(waypoints, getCoastlineManager().getCoarseCoastline());
  const warnings = [];
  if (!rough.reachedCleanly) {
    warnings.push(
      `Your drawn route crosses the coarse coastline on ${rough.crossingLegIndices.length} leg(s). Check those legs against the chart — the full sailing plan may not find a route there.`
    );
  }
  return { rough, legs: roughRouteToLegs(rough.waypoints), warnings };
}

function departureFor(inputs) {
  const targetTime = new Date(`${inputs.departureDate}T${inputs.departureTime}:00Z`);
  const departureTime = inputs.timeMode === 'departure'
    ? targetTime
    : new Date(targetTime.getTime() - 48 * 3600000);
  return { targetTime, departureTime };
}

export async function onCreateSailingPlan() {
  const inputs = getInputs();
  const errors = validateInputs(inputs);
  if (errors.length > 0) { showError(errors.join('; ')); return; }

  const route = getRoute();
  if (!isPlannable(route)) {
    showError('Draw a rough course first — click the map to drop at least two waypoints.');
    return;
  }
  const drawnWaypoints = toWaypoints(route);

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
  clearSelection();
  showLoading();

  try {
    const start = drawnWaypoints[0];
    const end = drawnWaypoints[drawnWaypoints.length - 1];
    const { departureTime } = departureFor(inputs);
    const t0 = Date.now();

    let legs, decisions = null, configBlocksRaw = null, warnings = null;
    let rough = null, passage = null;

    if (inputs.geometryMode) {
      const result = runGeometryMode(drawnWaypoints);
      legs = result.legs;
      rough = result.rough;
      warnings = result.warnings;
    } else {
      passage = await planPassageForBrowser({
        start, end,
        roughRoute: drawnWaypoints,
        departureTime: departureTime.toISOString(),
        basePolars: getPolars(),
        comfortParams,
        coastlineManager: manager,
        routerOpts: {
          timeStepMinutes: inputs.timeStep,
          headingThreshold: inputs.headingThreshold,
          headingsPerStep: inputs.headingsPerStep,
          clearanceMarginNm: inputs.clearanceMargin,
          harbourClearanceNm: inputs.harbourClearanceMargin,
          harbourZoneNm: inputs.harbourZoneNm,
          corridorWidthNm: inputs.corridorWidthNm
        }
      });
      legs = passage.legs;
      decisions = passage.decisions;
      configBlocksRaw = passage.debug.configBlocksRaw;
      warnings = passage.warnings;
    }

    hideLoading();
    showWarnings(warnings);

    // Stash the raw material for this run so the dev-only "Download passage log"
    // button (debug.html) can assemble the full passage JSON on demand. No auto
    // POST any more — the rough-route correction tool is the everyday log.
    renderState.lastRun = {
      mode: inputs.geometryMode ? 'route-only' : 'sailing',
      inputs: { ...inputs, startLat: start.lat, startLon: start.lon, endLat: end.lat, endLon: end.lon },
      settings: { ...toRoutingOpts(), comfort: comfortParams },
      rough, passage, elapsedMs: Date.now() - t0
    };

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
