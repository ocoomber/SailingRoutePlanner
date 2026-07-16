import { bearing } from './geometry.js';

export function buildTimeline(rawNodes, end) {
  const arrivalTime = new Date(rawNodes[rawNodes.length - 1].time).getTime();
  return rawNodes.map(node => ({
    time: node.time,
    position: node.point,
    windSpeed: node.windSpeed,
    windDir: node.windDir,
    bearingToDest: bearing(node.point, end),
    remainingMin: (arrivalTime - new Date(node.time).getTime()) / 60000
  }));
}

export function computeLegStartTimes(legs, departureTime) {
  let t = new Date(departureTime).getTime();
  const times = [];
  for (const leg of legs) {
    times.push(new Date(t).toISOString());
    t += leg.duration * 3600000;
  }
  return times;
}

export function mergeAdjacentConfigBlocks(blocks) {
  if (blocks.length <= 1) return blocks;
  const merged = [blocks[0]];
  for (let i = 1; i < blocks.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = blocks[i];
    if (cur.config === prev.config) {
      prev.endTime = cur.endTime;
      prev.endPoint = cur.endPoint;
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

export function buildWarnings(tidalData) {
  const warnings = ['Planning aid based on forecast, not real-time instruction'];
  if (!tidalData) warnings.push('Tidal stream not modelled');
  warnings.push('Forecast can be wrong', 'Cross-check against chart before departure');
  return warnings;
}

export const COASTLINE_ATTRIBUTION = 'Contains OpenStreetMap data © OpenStreetMap contributors, ODbL';

export function buildSummary(start, end, departureTime, legs, configBlocks) {
  const totalDistanceNm = legs.reduce((s, l) => s + l.distance, 0);
  const totalDurationH = legs.reduce((s, l) => s + l.duration, 0);
  const motoringH = legs.filter(l => l.config === 'motor').reduce((s, l) => s + l.duration, 0);
  const arrivalTime = new Date(new Date(departureTime).getTime() + totalDurationH * 3600000).toISOString();

  return {
    start, end,
    departureTime,
    arrivalTime,
    totalDistanceNm,
    totalDurationH,
    motoringH,
    sailingH: totalDurationH - motoringH,
    configChanges: Math.max(0, configBlocks.length - 1),
    attribution: COASTLINE_ATTRIBUTION
  };
}

export function buildFailureResult(start, end, departureTime, tidalData, log) {
  return {
    summary: {
      start, end, departureTime, arrivalTime: null,
      totalDistanceNm: 0, totalDurationH: 0, motoringH: 0, sailingH: 0, configChanges: 0,
      attribution: COASTLINE_ATTRIBUTION
    },
    configBlocks: [],
    legs: [],
    decisions: [],
    narration: 'No route could be found for this passage.',
    warnings: buildWarnings(tidalData),
    debug: { log, rawNodes: [] }
  };
}
