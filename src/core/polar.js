export function loadPolars(data) {
  return {
    twaSteps: data.twa,
    twsSteps: data.tws,
    speeds: data.speeds
  };
}

export function lookupSpeed(polars, twa, tws) {
  const twaAbs = Math.abs(twa);
  const angleIdx = findClosestIndex(polars.twaSteps, twaAbs);
  const speedIdx = findClosestIndex(polars.twsSteps, tws);

  const a0 = polars.twaSteps[angleIdx[0]];
  const a1 = polars.twaSteps[angleIdx[1]];
  const s0 = polars.twsSteps[speedIdx[0]];
  const s1 = polars.twsSteps[speedIdx[1]];

  const fA = angleIdx[1] === angleIdx[0] ? 0 :
             (twaAbs - a0) / (a1 - a0);
  const fS = speedIdx[1] === speedIdx[0] ? 0 :
             (tws - s0) / (s1 - s0);

  const v00 = polars.speeds[angleIdx[0]][speedIdx[0]];
  const v01 = polars.speeds[angleIdx[0]][speedIdx[1]];
  const v10 = polars.speeds[angleIdx[1]][speedIdx[0]];
  const v11 = polars.speeds[angleIdx[1]][speedIdx[1]];

  const v0 = v00 + (v01 - v00) * fS;
  const v1 = v10 + (v11 - v10) * fS;

  return v0 + (v1 - v0) * fA;
}

export function maxSpeed(polars) {
  let max = 0;
  for (const row of polars.speeds) {
    for (const v of row) {
      if (v > max) max = v;
    }
  }
  return max;
}

export function findNoGoAngle(polars, windSpeed) {
  for (const twa of polars.twaSteps) {
    if (lookupSpeed(polars, twa, windSpeed) > 0) {
      return twa;
    }
  }
  return 45;
}

function findClosestIndex(steps, value) {
  if (value <= steps[0]) return [0, 0];
  if (value >= steps[steps.length - 1]) {
    return [steps.length - 1, steps.length - 1];
  }

  for (let i = 0; i < steps.length - 1; i++) {
    if (value >= steps[i] && value <= steps[i + 1]) {
      return [i, i + 1];
    }
  }

  return [steps.length - 1, steps.length - 1];
}
