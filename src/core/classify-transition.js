import { bearing } from './geometry.js';

export function pointOfSailCategory(windAngle) {
  if (windAngle < 30) return 'into wind';
  if (windAngle < 60) return 'close hauled';
  if (windAngle < 100) return 'close reach';
  if (windAngle < 140) return 'beam reach';
  if (windAngle < 160) return 'broad reach';
  return 'dead downwind';
}

function deltaDeg(a, b) {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function fmtDelta(d) {
  const sign = d >= 0 ? '+' : '';
  return `${sign}${Math.round(d)}\u00B0`;
}

export function classifyTransition(prevLeg, nextLeg, destination) {
  const prevBearing = bearing(prevLeg.waypoint, destination);
  const nextBearing = bearing(nextLeg.waypoint, destination);
  const dHeading = deltaDeg(prevLeg.heading, nextLeg.heading);
  const dWindDir = deltaDeg(prevLeg.windDir, nextLeg.windDir);
  const dWindSpeed = nextLeg.windSpeed - prevLeg.windSpeed;
  const dBearing = deltaDeg(prevBearing, nextBearing);

  let category;
  let isManeuver = false;
  let sameCategory = false;

  if (nextLeg.maneuver === 'tack') {
    category = 'tack';
    isManeuver = true;
  } else if (nextLeg.maneuver === 'gybe') {
    category = 'gybe';
    isManeuver = true;
  } else if (Math.abs(dWindDir) >= 5 || Math.abs(dWindSpeed) >= 2) {
    category = 'wind-shift';
  } else {
    category = 'bearing-shift';
  }

  const prevCat = pointOfSailCategory(prevLeg.windAngle);
  const nextCat = pointOfSailCategory(nextLeg.windAngle);
  sameCategory = prevCat === nextCat;

  const statLine = `Wind: ${prevLeg.windDir}\u00B0\u2192${nextLeg.windDir}\u00B0 (${fmtDelta(dWindDir)}) \u00B7 Heading: ${prevLeg.heading}\u00B0\u2192${nextLeg.heading}\u00B0 (${fmtDelta(dHeading)})`;

  let explanation = '';

  if (category === 'bearing-shift') {
    const angle = pointOfSailCategory(nextLeg.windAngle);
    explanation = `Wind unchanged. As the boat made progress, the bearing to the destination shifted ${Math.abs(dBearing).toFixed(0)}\u00B0 — heading adjusted from ${prevLeg.heading}\u00B0 to ${nextLeg.heading}\u00B0 to hold the same ${angle} angle toward the new course.`;
  } else if (category === 'wind-shift') {
    const dirDesc = dWindDir > 0 ? 'veered' : dWindDir < 0 ? 'backed' : 'shifted';
    explanation = `Wind ${dirDesc} from ${prevLeg.windSpeed}kn/${prevLeg.windDir}\u00B0 to ${nextLeg.windSpeed}kn/${nextLeg.windDir}\u00B0 — a ${Math.abs(dWindDir)}\u00B0 shift. Heading adjusted from ${prevLeg.heading}\u00B0 to ${nextLeg.heading}\u00B0 to hold the optimal ${nextCat} angle on the new wind, staying on ${prevLeg.tackSide === nextLeg.tackSide ? 'the same tack' : 'the other side'}.`;
  } else if (category === 'tack') {
    if (Math.abs(dWindDir) >= 5) {
      explanation = `Wind shifted ${Math.abs(dWindDir).toFixed(0)}\u00B0 as the boat progressed, moving the optimal course across the wind. Tacked from ${prevLeg.tackSide || '?'} to ${nextLeg.tackSide || '?'} to keep making progress toward the destination.`;
    } else {
      explanation = `Bearing to the destination shifted as the boat progressed. Tacked from ${prevLeg.tackSide || '?'} to ${nextLeg.tackSide || '?'} — continuing on the previous tack would have taken the boat away from the destination.`;
    }
  } else if (category === 'gybe') {
    if (Math.abs(dWindDir) >= 5) {
      explanation = `Wind shifted ${Math.abs(dWindDir).toFixed(0)}\u00B0 as the boat progressed, moving the optimal course across the wind. Gybed from ${prevLeg.tackSide || '?'} to ${nextLeg.tackSide || '?'} to keep making progress toward the destination.`;
    } else {
      explanation = `Bearing to the destination shifted as the boat progressed. Gybed from ${prevLeg.tackSide || '?'} to ${nextLeg.tackSide || '?'} — continuing on the previous gybe would have taken the boat away from the destination.`;
    }
  }

  return {
    category,
    sameCategory,
    isManeuver,
    statLine,
    explanation,
    prevBearing: Math.round(prevBearing),
    nextBearing: Math.round(nextBearing),
    deltaHeading: Math.round(dHeading),
    deltaWindDir: Math.round(dWindDir),
    deltaWindSpeed: Math.round(dWindSpeed),
    deltaBearing: Math.round(dBearing),
    prevPointOfSail: prevCat,
    nextPointOfSail: nextCat
  };
}

export function classifyInitial(leg, destination) {
  const brg = bearing(leg.waypoint, destination);
  const cat = pointOfSailCategory(leg.windAngle);
  return {
    heading: leg.heading,
    bearing: Math.round(brg),
    windDir: leg.windDir,
    windSpeed: leg.windSpeed,
    pointOfSail: cat,
    tackSide: leg.tackSide
  };
}

export function summarizeTransitions(legs) {
  const counts = { 'bearing-shift': 0, 'wind-shift': 0, tack: 0, gybe: 0 };
  for (let i = 1; i < legs.length; i++) {
    const cat = legs[i].maneuver || (Math.abs((legs[i].windDir || 0) - (legs[i - 1].windDir || 0)) >= 5 ? 'wind-shift' : 'bearing-shift');
    if (cat === 'tack' || cat === 'gybe') counts[cat]++;
    else if (cat === 'wind-shift') counts['wind-shift']++;
    else counts['bearing-shift']++;
  }
  const parts = [];
  if (counts['bearing-shift']) parts.push(`${counts['bearing-shift']} bearing adjustment${counts['bearing-shift'] > 1 ? 's' : ''}`);
  if (counts['wind-shift']) parts.push(`${counts['wind-shift']} wind shift${counts['wind-shift'] > 1 ? 's' : ''}`);
  if (counts.tack) parts.push(`${counts.tack} tack${counts.tack > 1 ? 's' : ''}`);
  if (counts.gybe) parts.push(`${counts.gybe} gybe${counts.gybe > 1 ? 's' : ''}`);
  return parts.join(', ') || 'No course changes';
}
