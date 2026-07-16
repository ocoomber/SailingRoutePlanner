import { analyzeRoute } from './decision-logger.js';
import { classifyTransition } from './classify-transition.js';
import { getPolarForConfig } from './sail-configs.js';
import { computeLegStartTimes } from './passage-result.js';

export function buildDecisions(execution, rejections, basePolars, params, end, departureTime) {
  const decisions = [];

  for (const br of execution.blockResults) {
    const polar = getPolarForConfig(basePolars, br.config, params);
    decisions.push(...analyzeRoute(br.rawNodes, end, polar));
  }

  for (const block of execution.configBlocks) {
    if (block.decision) decisions.push(block.decision);
  }

  decisions.push(...rejections);

  const legTimes = computeLegStartTimes(execution.legs, departureTime);
  for (let i = 0; i < execution.legs.length - 1; i++) {
    const transition = classifyTransition(execution.legs[i], execution.legs[i + 1], end);
    decisions.push({ kind: 'transition', time: legTimes[i + 1], position: execution.legs[i].endWaypoint, ...transition });
  }

  decisions.sort((a, b) => new Date(a.time) - new Date(b.time));
  return decisions;
}
