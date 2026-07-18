import { calculateRoute } from './router.js';
import { getPolarForConfig } from './sail-configs.js';

async function runBlock(config, isLast, arriveByTime, fromPoint, fromTime, ctx) {
  const { end, basePolars, windGrid, tidalData, params, opts, fineCoastline, corridor, coarseCoastline } = ctx;

  const blockParams = {
    start: fromPoint, end,
    departureTime: fromTime,
    coastline: fineCoastline,
    timeStepMinutes: opts.timeStepMinutes,
    headingThreshold: opts.headingThreshold,
    polars: getPolarForConfig(basePolars, config, params),
    windGrid,
    tidalCurrent: tidalData,
    clearanceMarginNm: opts.clearanceMarginNm,
    harbourClearanceNm: opts.harbourClearanceNm,
    noGoAngleDeg: params.noGoAngleDeg,
    tackPenaltyKn: params.tackPenaltyKn,
    allowIntoWind: config === 'motor',
    headingsPerStep: opts.headingsPerStep,
    maxSteps: opts.maxSteps,
    corridor,
    coarseCoastline
  };

  if (!isLast) blockParams.arriveByTime = arriveByTime;

  return calculateRoute(blockParams);
}

export async function executeBlocks(blocks, ctx) {
  let currentPoint = ctx.start;
  let currentTime = ctx.departureTime;
  const legs = [];
  const rawNodes = [];
  const configBlocks = [];
  const logs = [];
  const blockResults = [];

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    const isLast = bi === blocks.length - 1;
    let executedConfig = block.config;
    let decision = block.decision;

    let result = await runBlock(block.config, isLast, block.endTime, currentPoint, currentTime, ctx);

    if ((!result.route || result.route.length === 0) && block.config !== 'motor') {
      result = await runBlock('motor', isLast, block.endTime, currentPoint, currentTime, ctx);
      executedConfig = 'motor';
      decision = {
        kind: 'config', time: currentTime, position: currentPoint,
        from: block.config, to: 'motor', accepted: true,
        windowMin: 0, thresholdMin: 0, windSpeedKn: 0, pointOfSail: null,
        trigger: 'router-fallback'
      };
    }

    logs.push(result.log);
    if (!result.route || result.route.length === 0) break;

    for (const leg of result.route) {
      leg.config = executedConfig;
      // A motor leg is steered on a bearing, not a wind angle — don't let the
      // sail-derived point-of-sail / tack narrative describe it.
      if (executedConfig === 'motor') {
        leg.windDescription = 'under engine';
        leg.tackSide = null;
        leg.maneuver = null; // a tack/gybe is a wind-angle event, not a motor one
      }
    }

    const legStartIndex = legs.length;
    legs.push(...result.route);
    rawNodes.push(...(bi === 0 ? result.rawNodes : result.rawNodes.slice(1)));
    blockResults.push({ config: executedConfig, rawNodes: result.rawNodes });

    const lastNode = result.rawNodes[result.rawNodes.length - 1];
    configBlocks.push({
      config: executedConfig,
      startTime: currentTime,
      endTime: lastNode.time,
      startPoint: currentPoint,
      endPoint: lastNode.point,
      legStartIndex,
      legEndIndex: legs.length - 1,
      decision
    });

    currentPoint = lastNode.point;
    currentTime = lastNode.time;

    if (result.reachedEnd) break;
  }

  return { legs, rawNodes, configBlocks, logs, blockResults };
}
