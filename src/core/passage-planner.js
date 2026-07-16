import { calculateRoute } from './router.js';
import { narrateRoute } from './explain.js';
import { mergeComfortParams } from './comfort-params.js';
import { getPolarForConfig } from './sail-configs.js';
import { planConfigurations } from './config-planner.js';
import { executeBlocks } from './passage-block-executor.js';
import { buildDecisions } from './passage-decisions.js';
import {
  buildTimeline, computeLegStartTimes, mergeAdjacentConfigBlocks,
  buildWarnings, buildSummary, buildFailureResult
} from './passage-result.js';

const COARSE_CLEARANCE_NM = 2;

const DEFAULT_ROUTER_OPTS = {
  timeStepMinutes: 30,
  headingThreshold: 15,
  headingsPerStep: 36,
  maxSteps: 500,
  clearanceMarginNm: 0.2
};

export async function planPassage(input) {
  const {
    start, end, departureTime, basePolars, windGrid,
    tidalData = null, comfortParams, coastlineCoarse,
    getFineCoastline, routerOpts
  } = input;

  const params = mergeComfortParams(comfortParams || {});
  const opts = { ...DEFAULT_ROUTER_OPTS, ...(routerOpts || {}) };

  const coarseResult = await calculateRoute({
    start, end, departureTime,
    coastline: coastlineCoarse,
    timeStepMinutes: opts.timeStepMinutes,
    headingThreshold: opts.headingThreshold,
    polars: getPolarForConfig(basePolars, 'full', params),
    windGrid,
    tidalCurrent: tidalData,
    clearanceMarginNm: COARSE_CLEARANCE_NM,
    noGoAngleDeg: params.noGoAngleDeg,
    headingsPerStep: opts.headingsPerStep,
    maxSteps: opts.maxSteps
  });

  if (!coarseResult.route || coarseResult.route.length === 0) {
    return buildFailureResult(start, end, departureTime, tidalData, coarseResult.log);
  }

  const timeline = buildTimeline(coarseResult.rawNodes, end);
  const { blocks, rejections } = planConfigurations(timeline, params);

  const coarseWaypoints = coarseResult.route.map(leg => leg.waypoint);
  coarseWaypoints.push(coarseResult.route[coarseResult.route.length - 1].endWaypoint);
  const fineCoastline = await getFineCoastline(coarseWaypoints);

  const execution = await executeBlocks(blocks, {
    start, end, departureTime, basePolars, windGrid, tidalData, params, opts, fineCoastline
  });

  const combinedLog = [coarseResult.log, ...execution.logs].join('\n---\n');

  if (!execution.legs.length) {
    return buildFailureResult(start, end, departureTime, tidalData, combinedLog);
  }

  const legTimes = computeLegStartTimes(execution.legs, departureTime);
  execution.legs.forEach((leg, i) => { leg.startTime = legTimes[i]; });

  const decisions = buildDecisions(execution, rejections, basePolars, params, end, departureTime);
  const configBlocks = mergeAdjacentConfigBlocks(execution.configBlocks);
  const narration = narrateRoute(execution.rawNodes, execution.legs, decisions);
  const warnings = buildWarnings(tidalData);
  const summary = buildSummary(start, end, departureTime, execution.legs, configBlocks);

  return {
    summary,
    configBlocks,
    legs: execution.legs,
    decisions,
    narration,
    warnings,
    debug: { log: combinedLog, rawNodes: execution.rawNodes }
  };
}
