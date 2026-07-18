import { distanceNm } from './geometry.js';
import { narrateRoute } from './explain.js';
import { mergeComfortParams } from './comfort-params.js';
import { getPolarForConfig } from './sail-configs.js';
import { planConfigurations } from './config-planner.js';
import { executeBlocks } from './passage-block-executor.js';
import { buildDecisions } from './passage-decisions.js';
import { findUncomfortableLegs, markUncomfortableLegs } from './comfort-warnings.js';
import { computeRoughRoute } from './rough-route.js';
import { makeCorridor, pruneCoastlineToCorridor } from './route-corridor.js';
import { buildTimelineAlongRoute } from './route-timeline.js';
import {
  computeLegStartTimes, mergeAdjacentConfigBlocks,
  buildWarnings, buildSummary, buildFailureResult
} from './passage-result.js';

// Tries the requested clearance first, then relaxes toward the harbour.
const NARROW_HARBOUR_CLEARANCE_FALLBACKS_NM = [0.2, 0.1, 0.05];
// How far the sailing pass may stray either side of the rough course. Wide
// enough to tack a beat, tight enough to keep it off a mid-passage river.
const CORRIDOR_WIDTH_NM = 3;
// Beyond this the plan is not a passage to the destination and must say so.
const ARRIVAL_SHORTFALL_NM = 1;

const DEFAULT_ROUTER_OPTS = {
  timeStepMinutes: 30,
  headingThreshold: 15,
  headingsPerStep: 36,
  maxSteps: 500,
  clearanceMarginNm: 0.25,
  // Clearance near the start/destination, where the skipper cons the boat in and
  // out of port. Default 0: don't plan any offshore margin there — just don't
  // cross land. The coastal margin above still holds in open water.
  harbourClearanceNm: 0
};

export async function planPassage(input) {
  const {
    start, end, departureTime, basePolars, windGrid,
    tidalData = null, comfortParams, coastlineCoarse,
    getFineCoastline, routerOpts
  } = input;

  const params = mergeComfortParams(comfortParams || {});
  const opts = { ...DEFAULT_ROUTER_OPTS, ...(routerOpts || {}) };
  const requestedClearanceNm = opts.clearanceMarginNm;

  // Pass 1 — the rough course: a taut geometric string around the coarse land,
  // which fills rivers in, so it never heads up a dead end. Relax the clearance
  // only if the course can't be drawn at the requested margin (a tight harbour).
  const harbourClearanceNm = opts.harbourClearanceNm ?? 0;
  let effectiveClearanceNm = requestedClearanceNm;
  let rough = computeRoughRoute(start, end, coastlineCoarse, { clearanceNm: effectiveClearanceNm, harbourClearanceNm });
  for (const fallback of NARROW_HARBOUR_CLEARANCE_FALLBACKS_NM) {
    if (rough.reachedCleanly || fallback >= effectiveClearanceNm) continue;
    effectiveClearanceNm = fallback;
    rough = computeRoughRoute(start, end, coastlineCoarse, { clearanceNm: effectiveClearanceNm, harbourClearanceNm });
    if (rough.reachedCleanly) break;
  }

  const planningNotes = [];
  if (effectiveClearanceNm < requestedClearanceNm) {
    planningNotes.push(
      `Coastal clearance reduced from ${requestedClearanceNm}NM to ${effectiveClearanceNm}NM to draw the rough course (narrow harbour approach or a close-in destination). Check the pilot book for this stretch.`
    );
  }
  if (!rough.reachedCleanly) {
    planningNotes.push(
      `The rough course still crosses land on ${rough.crossingLegIndices.length} leg(s) even at ${effectiveClearanceNm}NM clearance — the sailing pass may not find a clean route.`
    );
  }

  const fineOpts = { ...opts, clearanceMarginNm: effectiveClearanceNm };

  // The rough course defines the corridor both passes must stay inside.
  const corridor = makeCorridor(rough.waypoints, CORRIDOR_WIDTH_NM);

  // Pass 2a — walk the rough course through the forecast to get the wind/time
  // timeline the config planner reasons over (motor out, sails up, reef, etc.).
  const timeline = buildTimelineAlongRoute({
    waypoints: rough.waypoints,
    windGrid,
    polars: getPolarForConfig(basePolars, 'full', params),
    departureTime,
    end,
    stepMinutes: opts.timeStepMinutes
  });
  const { blocks, rejections } = planConfigurations(timeline, params);

  const fineCoastline = await getFineCoastline(rough.waypoints);
  // Only the coast near the corridor can affect a route confined to it. Pruning
  // to it keeps the per-point land test cheap even when the whole viewport's
  // worth of detail tiles is loaded.
  const finePruned = pruneCoastlineToCorridor(fineCoastline, rough.waypoints, CORRIDOR_WIDTH_NM + 3);

  // Pass 2b — sail each config block for real, constrained to the corridor.
  const execution = await executeBlocks(blocks, {
    start, end, departureTime, basePolars, windGrid, tidalData, params,
    opts: fineOpts, fineCoastline: finePruned, corridor,
    coarseCoastline: coastlineCoarse
  });

  const combinedLog = execution.logs.join('\n---\n');

  if (!execution.legs.length) {
    return buildFailureResult(start, end, departureTime, tidalData, combinedLog);
  }

  const legTimes = computeLegStartTimes(execution.legs, departureTime);
  execution.legs.forEach((leg, i) => { leg.startTime = legTimes[i]; });

  const uncomfortableLegs = findUncomfortableLegs(execution.legs, params);
  markUncomfortableLegs(execution.legs, uncomfortableLegs);

  // executeBlocks bails out of its loop if a block finds no route, so the legs
  // can stop well short of the destination. That must never be presented as a
  // finished passage.
  const finalLeg = execution.legs[execution.legs.length - 1];
  const shortfallNm = distanceNm(finalLeg.endWaypoint, end);
  if (shortfallNm > ARRIVAL_SHORTFALL_NM) {
    planningNotes.push(
      `INCOMPLETE PASSAGE — the plan stops ${shortfallNm.toFixed(1)}NM short of the destination. No route could be found for the rest of it. Do not read this as a passage to the destination.`
    );
  }

  const decisions = buildDecisions(execution, rejections, basePolars, params, end, departureTime);
  const configBlocks = mergeAdjacentConfigBlocks(execution.configBlocks);
  const narration = narrateRoute(execution.rawNodes, execution.legs, decisions);
  const warnings = buildWarnings(tidalData, uncomfortableLegs, params, planningNotes);
  const summary = buildSummary(start, end, departureTime, execution.legs, configBlocks);
  summary.reachedDestination = shortfallNm <= ARRIVAL_SHORTFALL_NM;
  summary.shortfallNm = shortfallNm;
  summary.clearanceMarginUsedNm = effectiveClearanceNm;

  return {
    summary,
    configBlocks,
    legs: execution.legs,
    decisions,
    narration,
    warnings,
    debug: {
      log: combinedLog,
      rawNodes: execution.rawNodes,
      configBlocksRaw: execution.configBlocks,
      roughRoute: {
        waypoints: rough.waypoints,
        legCount: rough.legCount,
        totalDistanceNm: rough.totalDistanceNm,
        reachedCleanly: rough.reachedCleanly,
        nodeCount: rough.nodeCount
      },
      corridorWidthNm: CORRIDOR_WIDTH_NM,
      clearanceUsedNm: effectiveClearanceNm
    }
  };
}
