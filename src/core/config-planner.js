import { changeDurationThresholdMin, pointOfSailFromTwa } from './sail-configs.js';

function idealConfigForStep(step, params) {
  if (step.remainingMin <= params.finalApproachBufferMin) return 'motor';
  if (step.windSpeed < params.minSailableWindKn) return 'motor';
  if (step.windSpeed > params.reefWindKn) return 'reefed';
  if (step.windSpeed <= params.minSailableWindKn + params.headsailPreferenceBandKn) return 'headsail';
  return 'full';
}

function approxTwaAbs(step) {
  const raw = step.bearingToDest - step.windDir;
  return Math.abs(((raw % 360) + 540) % 360 - 180);
}

function lookaheadDurationMin(timeline, startIdx, ideal, params) {
  let minutes = 0;
  for (let j = startIdx; j < timeline.length; j++) {
    if (idealConfigForStep(timeline[j], params) !== ideal) break;
    if (j + 1 < timeline.length) {
      minutes += (new Date(timeline[j + 1].time) - new Date(timeline[j].time)) / 60000;
    } else {
      minutes += timeline[j].remainingMin;
    }
  }
  return minutes;
}

// The engine-on/engine-off pair forms a dead band: inside it the boat keeps
// whatever it is already doing rather than flip-flopping in marginal air.
// Below engineOnWindKn the polar has no data at all (lowest TWS step is 4kn),
// so that edge is also where the boat genuinely stops sailing.
function passesHysteresis(fromConfig, toConfig, step, params) {
  if (fromConfig === 'motor' && toConfig !== 'motor') {
    return step.windSpeed >= params.engineOffWindKn;
  }

  if (fromConfig !== 'motor' && toConfig === 'motor') {
    // Dropping sail for arrival is a standing practice, not a wind decision.
    if (step.remainingMin <= params.finalApproachBufferMin) return true;
    return step.windSpeed <= params.engineOnWindKn;
  }

  return true;
}

function triggerFor(fromConfig, toConfig, step, params) {
  if (toConfig === 'motor' && step.remainingMin <= params.finalApproachBufferMin) return 'final-approach';
  if (toConfig === 'motor' && step.windSpeed < params.minSailableWindKn) return 'wind-below-sailable';
  if (toConfig === 'reefed' && step.windSpeed > params.reefWindKn) return 'wind-above-reef';
  return 'wind-window';
}

function buildDecisionRecord(fromConfig, toConfig, step, windowMin, thresholdMin, accepted, trigger, pos) {
  return {
    kind: 'config',
    time: step.time,
    position: step.position,
    from: fromConfig,
    to: toConfig,
    accepted,
    windowMin,
    thresholdMin,
    windSpeedKn: step.windSpeed,
    pointOfSail: pos,
    trigger
  };
}

export function planConfigurations(timeline, params) {
  const rejections = [];
  const stepConfig = [];
  const blockDecisions = {};

  let currentConfig = 'motor';
  let lastEvaluatedIdeal = null;

  for (let i = 0; i < timeline.length; i++) {
    const step = timeline[i];
    const ideal = idealConfigForStep(step, params);

    if (ideal === currentConfig) {
      lastEvaluatedIdeal = null;
    } else {
      // Re-evaluate on EVERY step: conditions keep moving (wind falling through
      // the hysteresis band, a window growing), so a change refused once must
      // still be able to pass later. lastEvaluatedIdeal only de-duplicates the
      // rejection log — it must never gate the evaluation itself.
      const pos = pointOfSailFromTwa(approxTwaAbs(step));
      const windowMin = lookaheadDurationMin(timeline, i, ideal, params);
      const thresholdMin = changeDurationThresholdMin(currentConfig, ideal, pos, params);
      const hysteresisOk = passesHysteresis(currentConfig, ideal, step, params);
      const accepted = hysteresisOk && windowMin >= thresholdMin;
      const trigger = hysteresisOk ? triggerFor(currentConfig, ideal, step, params) : 'hysteresis';

      const record = buildDecisionRecord(currentConfig, ideal, step, windowMin, thresholdMin, accepted, trigger, pos);

      if (accepted) {
        blockDecisions[i] = record;
        currentConfig = ideal;
        lastEvaluatedIdeal = null;
      } else {
        if (ideal !== lastEvaluatedIdeal) rejections.push(record);
        lastEvaluatedIdeal = ideal;
      }
    }

    stepConfig[i] = currentConfig;
  }

  const blocks = [];
  let blockStart = 0;
  for (let i = 1; i <= timeline.length; i++) {
    if (i === timeline.length || stepConfig[i] !== stepConfig[blockStart]) {
      blocks.push({
        config: stepConfig[blockStart],
        startTime: timeline[blockStart].time,
        endTime: timeline[i - 1].time,
        startIdx: blockStart,
        endIdx: i - 1,
        decision: blockDecisions[blockStart] || null
      });
      blockStart = i;
    }
  }

  return { blocks, rejections };
}
