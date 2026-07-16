import { pointOfSailCategory } from './classify-transition.js';

export const CONFIGS = ['motor', 'headsail', 'full', 'reefed'];

const SIX_TO_THREE_BUCKET = {
  'into wind': 'upwind',
  'close hauled': 'upwind',
  'close reach': 'reach',
  'beam reach': 'reach',
  'broad reach': 'downwind',
  'dead downwind': 'downwind'
};

export function pointOfSailFromTwa(twaAbs) {
  return SIX_TO_THREE_BUCKET[pointOfSailCategory(twaAbs)];
}

export function getPolarForConfig(basePolars, config, params) {
  if (config === 'motor') {
    return {
      twaSteps: basePolars.twaSteps,
      twsSteps: basePolars.twsSteps,
      speeds: basePolars.twaSteps.map(() =>
        basePolars.twsSteps.map(() => params.motorCruiseSpeedKn))
    };
  }

  if (config === 'headsail') {
    return scalePolar(basePolars, params.headsailSpeedFactor);
  }

  if (config === 'reefed') {
    return scalePolar(basePolars, params.reefedSpeedFactor);
  }

  return basePolars;
}

function scalePolar(basePolars, factor) {
  return {
    twaSteps: basePolars.twaSteps,
    twsSteps: basePolars.twsSteps,
    speeds: basePolars.speeds.map(row => row.map(v => v * factor))
  };
}

export function changeDurationThresholdMin(fromConfig, toConfig, pointOfSail, params) {
  if (toConfig === 'motor') return 0;

  if (toConfig === 'headsail') {
    return params.minWorthwhileDurationMin.headsail;
  }

  const reefingUnderSail =
    (fromConfig === 'full' && toConfig === 'reefed') ||
    (fromConfig === 'reefed' && toConfig === 'full');

  if (reefingUnderSail) {
    return params.minWorthwhileDurationMin.reefed;
  }

  const hassleMultiplier = params.mainHoistDifficultyByPointOfSail[pointOfSail] *
    (params.soloSailing ? params.soloHassleMultiplier : 1);

  return params.minWorthwhileDurationMin[toConfig] * hassleMultiplier;
}
