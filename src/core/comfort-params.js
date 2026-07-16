export const DEFAULT_COMFORT_PARAMS = {
  minSailableWindKn: 5,
  engineOnWindKn: 4,
  engineOffWindKn: 6,
  reefWindKn: 18,
  maxComfortWindKn: 25,
  minWorthwhileDurationMin: { headsail: 45, full: 120, reefed: 120 },
  soloSailing: false,
  soloHassleMultiplier: 1.5,
  mainHoistDifficultyByPointOfSail: { upwind: 1.0, reach: 1.2, downwind: 1.8 },
  finalApproachBufferMin: 45,
  motorCruiseSpeedKn: 6,
  headsailSpeedFactor: 0.6,
  reefedSpeedFactor: 0.85,
  headsailPreferenceBandKn: 3,
  noGoAngleDeg: null
};

const POSITIVE_NUMBER_FIELDS = [
  'minSailableWindKn', 'engineOnWindKn', 'engineOffWindKn',
  'reefWindKn', 'maxComfortWindKn', 'soloHassleMultiplier',
  'finalApproachBufferMin', 'motorCruiseSpeedKn', 'headsailSpeedFactor',
  'reefedSpeedFactor', 'headsailPreferenceBandKn'
];

const DURATION_CONFIGS = ['headsail', 'full', 'reefed'];
const POINTS_OF_SAIL = ['upwind', 'reach', 'downwind'];

export function mergeComfortParams(overrides = {}) {
  const merged = {
    ...DEFAULT_COMFORT_PARAMS,
    ...overrides,
    minWorthwhileDurationMin: {
      ...DEFAULT_COMFORT_PARAMS.minWorthwhileDurationMin,
      ...(overrides.minWorthwhileDurationMin || {})
    },
    mainHoistDifficultyByPointOfSail: {
      ...DEFAULT_COMFORT_PARAMS.mainHoistDifficultyByPointOfSail,
      ...(overrides.mainHoistDifficultyByPointOfSail || {})
    }
  };

  const errors = validate(merged);
  if (errors.length > 0) {
    throw new Error(`Invalid comfort parameters: ${errors.join('; ')}`);
  }

  return merged;
}

function validate(params) {
  const errors = [];

  for (const field of POSITIVE_NUMBER_FIELDS) {
    const value = params[field];
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) {
      errors.push(`${field} must be a positive number, got ${JSON.stringify(value)}`);
    }
  }

  if (params.noGoAngleDeg !== null) {
    if (typeof params.noGoAngleDeg !== 'number' || params.noGoAngleDeg <= 0 || params.noGoAngleDeg >= 90) {
      errors.push(`noGoAngleDeg must be null or a number between 0 and 90, got ${JSON.stringify(params.noGoAngleDeg)}`);
    }
  }

  if (typeof params.soloSailing !== 'boolean') {
    errors.push(`soloSailing must be a boolean, got ${JSON.stringify(params.soloSailing)}`);
  }

  for (const config of DURATION_CONFIGS) {
    const value = params.minWorthwhileDurationMin?.[config];
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) {
      errors.push(`minWorthwhileDurationMin.${config} must be a positive number, got ${JSON.stringify(value)}`);
    }
  }

  for (const pos of POINTS_OF_SAIL) {
    const value = params.mainHoistDifficultyByPointOfSail?.[pos];
    if (typeof value !== 'number' || !isFinite(value) || value <= 0) {
      errors.push(`mainHoistDifficultyByPointOfSail.${pos} must be a positive number, got ${JSON.stringify(value)}`);
    }
  }

  if (typeof params.engineOnWindKn === 'number' && typeof params.engineOffWindKn === 'number' &&
      params.engineOnWindKn >= params.engineOffWindKn) {
    errors.push(`engineOnWindKn (${params.engineOnWindKn}) must be less than engineOffWindKn (${params.engineOffWindKn})`);
  }

  if (typeof params.minSailableWindKn === 'number' && typeof params.engineOffWindKn === 'number' &&
      params.minSailableWindKn > params.engineOffWindKn) {
    errors.push(`minSailableWindKn (${params.minSailableWindKn}) must be <= engineOffWindKn (${params.engineOffWindKn})`);
  }

  return errors;
}
