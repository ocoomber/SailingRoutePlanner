import { bearing } from './geometry.js';
import { lookupSpeed, findNoGoAngle } from './polar.js';

const DEG_TO_RAD = Math.PI / 180;
const EVALUATION_STEP = 5;

function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360;
}

function computeTwa(heading, windDir) {
  const raw = heading - windDir;
  return ((raw % 360) + 540) % 360 - 180;
}

function tackLabel(twa) {
  return twa > 0 ? 'port' : twa < 0 ? 'starboard' : 'direct';
}

function vmgToward(heading, boatSpeed, bearingToDest) {
  const angleRad = (heading - bearingToDest) * DEG_TO_RAD;
  return boatSpeed * Math.cos(angleRad);
}

function evaluateAlternatives(polars, windSpeed, windDir, bearingToDest) {
  const noGoAngle = findNoGoAngle(polars, windSpeed);
  const maxSailable = 180 - noGoAngle;

  let bestPort = null;
  let bestStarboard = null;

  for (let h = 0; h < 360; h += EVALUATION_STEP) {
    const twa = computeTwa(h, windDir);
    const absTwa = Math.abs(twa);

    if (absTwa < noGoAngle || absTwa > maxSailable) continue;

    const boatSpeed = lookupSpeed(polars, absTwa, windSpeed);
    if (boatSpeed <= 0) continue;

    const vmg = vmgToward(h, boatSpeed, bearingToDest);

    const alt = {
      heading: Math.round(h),
      boatSpeed: round1(boatSpeed),
      twa: Math.round(twa),
      vmg: round1(vmg)
    };

    if (twa > 0 && (!bestPort || vmg > bestPort.vmg)) {
      bestPort = alt;
    } else if (twa < 0 && (!bestStarboard || vmg > bestStarboard.vmg)) {
      bestStarboard = alt;
    }
  }

  return { bestPort, bestStarboard, noGoAngle };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

export function evaluateDecision(node, end, polars) {
  const bearingToDest = bearing(node.point, end);

  const windSpeed = node.windSpeed;
  const windDir = node.windDir;

  const directTwa = computeTwa(bearingToDest, windDir);
  const alt = evaluateAlternatives(polars, windSpeed, windDir, bearingToDest);
  const absDirectTwa = Math.abs(directTwa);
  const directSailable = absDirectTwa >= alt.noGoAngle && absDirectTwa <= 180 - alt.noGoAngle;

  const nodeTwa = node.twa;
  const nodeBoatSpeed = lookupSpeed(polars, Math.abs(nodeTwa), windSpeed);
  const nodeVmg = vmgToward(node.heading, nodeBoatSpeed, bearingToDest);
  const nodeTack = tackLabel(nodeTwa);

  const alternatives = [];
  if (directSailable) {
    const directSpeed = lookupSpeed(polars, absDirectTwa, windSpeed);
    const directVmg = vmgToward(bearingToDest, directSpeed, bearingToDest);
    alternatives.push({
      heading: Math.round(bearingToDest),
      tack: 'direct',
      boatSpeed: round1(directSpeed),
      twa: Math.round(directTwa),
      vmg: round1(directVmg)
    });
  }
  if (alt.bestPort) alternatives.push({ ...alt.bestPort, tack: 'port' });
  if (alt.bestStarboard) alternatives.push({ ...alt.bestStarboard, tack: 'starboard' });

  let recommended = null;
  let reason = '';
  if (directSailable && alt.bestPort && alt.bestStarboard) {
    const best = [alt.bestPort, alt.bestStarboard].sort((a, b) => b.vmg - a.vmg)[0];
    recommended = best.tack === alt.bestPort.tack ? 'port' : 'starboard';
    reason = 'sailing direct course is feasible, but tack with higher VMG is the optimal choice';
  } else if (directSailable) {
    recommended = 'direct';
    reason = 'direct course is sailable and provides adequate VMG toward destination';
  } else if (alt.bestPort && alt.bestStarboard) {
    const best = [alt.bestPort, alt.bestStarboard].sort((a, b) => b.vmg - a.vmg)[0];
    recommended = best.tack === alt.bestPort.tack ? 'port' : 'starboard';
    reason = `higher VMG toward destination (${best.vmg}kn vs ${(best.tack === alt.bestPort.tack ? alt.bestStarboard : alt.bestPort).vmg}kn)`;
  } else if (alt.bestPort) {
    recommended = 'port';
    reason = 'only port tack is viable at this position';
  } else if (alt.bestStarboard) {
    recommended = 'starboard';
    reason = 'only starboard tack is viable at this position';
  } else {
    recommended = null;
    reason = 'no viable heading found';
  }

  return {
    step: 0,
    position: { lat: round1(node.point.lat), lon: round1(node.point.lon) },
    time: node.time,
    wind: {
      speed: Math.round(windSpeed),
      direction: Math.round(windDir)
    },
    bearingToDest: Math.round(bearingToDest),
    directCourse: {
      twa: Math.round(directTwa),
      sailable: directSailable,
      noGoAngle: alt.noGoAngle
    },
    alternatives,
    chosen: {
      heading: Math.round(node.heading),
      tack: nodeTack,
      boatSpeed: round1(nodeBoatSpeed),
      twa: Math.round(nodeTwa),
      vmg: round1(nodeVmg)
    },
    recommended,
    reason
  };
}

export function analyzeRoute(rawNodes, end, polars) {
  if (!rawNodes || rawNodes.length < 2) return [];

  const decisions = [];
  for (let i = 0; i < rawNodes.length; i++) {
    const node = rawNodes[i];
    if (node.heading === null) continue;

    const rec = evaluateDecision(node, end, polars);
    rec.step = i;
    decisions.push(rec);
  }

  return decisions;
}
