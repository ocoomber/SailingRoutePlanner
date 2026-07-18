function windDescription(windDir, bearingToDest) {
  const diff = Math.abs(((bearingToDest - windDir) % 360 + 540) % 360 - 180);
  if (diff < 30) return 'dead ahead';
  if (diff < 60) return 'ahead';
  if (diff < 120) return 'abeam';
  if (diff < 150) return 'astern';
  return 'dead astern';
}

function describeTwa(twa) {
  const absAngle = Math.abs(twa);
  const side = twa >= 0 ? 'port' : 'starboard';
  if (absAngle < 30) return 'into wind';
  if (absAngle < 60) return `close hauled, wind on ${side}`;
  if (absAngle < 100) return `close reach, wind on ${side}`;
  if (absAngle < 140) return `beam reach, wind on ${side}`;
  if (absAngle < 160) return `broad reach, wind on ${side}`;
  return 'dead downwind';
}

function tackName(twa) {
  return twa > 0 ? 'port' : 'starboard';
}

function formatAlt(alt) {
  const dir = alt.tack === 'direct' ? 'the direct course' : `${alt.tack} tack`;
  return `${dir} (heading ${alt.heading}°, boat speed ${alt.boatSpeed.toFixed(1)}kn, VMG ${alt.vmg.toFixed(1)}kn toward destination)`;
}

export function formatDecision(rec) {
  const dirDesc = windDescription(rec.wind.direction, rec.bearingToDest);
  const parts = [];

  parts.push(`Wind was from ${rec.wind.direction}° at ${rec.wind.speed}kn — ${dirDesc} of the direct course to the destination (${rec.bearingToDest}°)`);

  if (!rec.directCourse.sailable) {
    parts.push(`inside the no-go zone (≤${rec.directCourse.noGoAngle}° from wind direction)`);
  } else {
    parts.push(`outside the no-go zone (${describeTwa(rec.directCourse.twa)})`);
  }

  if (rec.alternatives.length > 0) {
    const altTexts = rec.alternatives.map(a => formatAlt(a));
    parts.push(`Evaluated ${rec.alternatives.length} option${rec.alternatives.length > 1 ? 's' : ''}: ${altTexts.join('; ')}`);
  }

  if (!rec.directCourse.sailable && rec.alternatives.length >= 2) {
    const portAlt = rec.alternatives.find(a => a.tack === 'port');
    const starboardAlt = rec.alternatives.find(a => a.tack === 'starboard');
    if (portAlt && starboardAlt) {
      const better = portAlt.vmg >= starboardAlt.vmg ? portAlt : starboardAlt;
      const worse = better === portAlt ? starboardAlt : portAlt;
      parts.push(`Compared port tack (VMG ${portAlt.vmg.toFixed(1)}kn) against starboard tack (VMG ${starboardAlt.vmg.toFixed(1)}kn)`);
      parts.push(`Chose ${better.tack} — better VMG (${better.vmg.toFixed(1)}kn vs ${worse.vmg.toFixed(1)}kn)`);
    } else if (portAlt) {
      parts.push(`Only port tack viable (VMG ${portAlt.vmg.toFixed(1)}kn)`);
    } else if (starboardAlt) {
      parts.push(`Only starboard tack viable (VMG ${starboardAlt.vmg.toFixed(1)}kn)`);
    }
  } else if (rec.directCourse.sailable) {
    parts.push(`Direct course is sailable`);
  }

  parts.push(`Actual: ${rec.chosen.tack} tack heading ${rec.chosen.heading}° (${describeTwa(rec.chosen.twa)}), VMG ${rec.chosen.vmg.toFixed(1)}kn`);

  return parts.join('. ') + '.';
}

const CONFIG_LABEL = { full: 'the main', headsail: 'the headsail', reefed: 'a reef', motor: 'the motor' };
const CONFIG_VERB = { full: 'hoisting', headsail: 'unfurling', reefed: 'tucking in', motor: 'starting' };
const POINT_OF_SAIL_PHRASE = { upwind: 'a beat', reach: 'a beam reach', downwind: 'a run' };

function formatDurationMin(mins) {
  if (mins >= 60) {
    const hours = mins / 60;
    const hoursText = Number.isInteger(hours) ? hours : hours.toFixed(1);
    return `${hoursText} hour${hours === 1 ? '' : 's'}`;
  }
  const rounded = Math.round(mins);
  return `${rounded} minute${rounded === 1 ? '' : 's'}`;
}

// Accept/reject is decided FIRST: a refused change must never be narrated as
// though it happened. The trigger only supplies the reason.
export function formatConfigDecision(rec) {
  return rec.accepted ? acceptedConfigProse(rec) : rejectedConfigProse(rec);
}

function acceptedConfigProse(rec) {
  if (rec.trigger === 'final-approach') {
    return `Within ${Math.round(rec.windowMin)} minutes of destination — sails down, motoring in for arrival.`;
  }

  if (rec.trigger === 'wind-below-sailable') {
    return `Wind easing to ${rec.windSpeedKn}kn — not enough to sail, motoring.`;
  }

  if (rec.trigger === 'wind-above-reef') {
    return `Wind building to ${rec.windSpeedKn}kn — reefing down for comfort.`;
  }

  if (rec.trigger === 'router-fallback') {
    return `No sailable route found in this wind — falling back to motor.`;
  }

  const posText = POINT_OF_SAIL_PHRASE[rec.pointOfSail] || rec.pointOfSail;
  const durationText = formatDurationMin(rec.windowMin);
  return `Wind forecast to hold around ${rec.windSpeedKn}kn for the next ${durationText} on ${posText} — worth ${CONFIG_VERB[rec.to]} ${CONFIG_LABEL[rec.to]}.`;
}

function rejectedConfigProse(rec) {
  if (rec.trigger === 'hysteresis') {
    // Direction matters: the band holds off starting the engine as well as stopping it.
    return rec.to === 'motor'
      ? `Wind at ${rec.windSpeedKn}kn — still above the engine-on threshold, staying under sail rather than flip-flopping.`
      : `Wind at ${rec.windSpeedKn}kn — not yet clear of the engine-off threshold, staying under engine.`;
  }

  if (rec.trigger === 'wind-above-reef') {
    return `Wind building to ${rec.windSpeedKn}kn, but only for ~${Math.round(rec.windowMin)} minutes (needs ${Math.round(rec.thresholdMin)}) — not worth reefing down for that long.`;
  }

  return `Wind window of ~${Math.round(rec.windowMin)} minutes at ${rec.windSpeedKn}kn expected before dropping again — not worth ${CONFIG_VERB[rec.to]} ${CONFIG_LABEL[rec.to]} for that short a stretch.`;
}

export function formatLandDeviation(rec) {
  const sacrificed = (rec.rejectedVmg - rec.chosenVmg).toFixed(1);
  return `Ideal heading ${rec.rejectedHeading}° (VMG ${rec.rejectedVmg.toFixed(1)}kn) blocked by land/clearance — deviated to ${rec.chosenHeading}° (VMG ${rec.chosenVmg.toFixed(1)}kn), sacrificing ${sacrificed}kn toward the destination.`;
}

export function formatTransition(transition) {
  const lines = [transition.statLine];
  lines.push(transition.explanation);
  return lines.join('\n');
}

export function formatInitial(initial) {
  if (initial.motoring) {
    return `Under engine from departure — steering the direct bearing to the destination. Bearing ${initial.bearing}°, heading ${initial.heading}°.`;
  }
  return `Initial heading set from wind and bearing to destination at departure. Wind ${initial.windSpeed}kn from ${initial.windDir}\u00B0, bearing ${initial.bearing}\u00B0 — optimal course ${initial.heading}\u00B0 on ${initial.tackSide || '?'} tack (${initial.pointOfSail}).`;
}

export function narrateRoute(rawNodes, route, decisions) {
  const lines = [];

  if (rawNodes && rawNodes.length >= 2) {
    const start = rawNodes[0].point;
    const endPt = rawNodes[rawNodes.length - 1].point;
    lines.push(`Passage: ${start.lat.toFixed(2)},${start.lon.toFixed(2)} → ${endPt.lat.toFixed(2)},${endPt.lon.toFixed(2)}`);

    if (route) {
      lines.push(`Route: ${route.length} leg${route.length > 1 ? 's' : ''}`);
      for (let i = 0; i < route.length; i++) {
        const leg = route[i];
        lines.push(`  Leg ${i + 1}: ${leg.heading}°T for ${leg.distance.toFixed(1)}NM (${leg.duration.toFixed(1)}h) — ${leg.windDescription}${leg.maneuver ? `, then ${leg.maneuver}` : ''}`);
      }
    } else {
      lines.push(`Route: no route found`);
    }
  }

  lines.push(``);
  lines.push(`=== Decision Log ===`);

  for (let i = 0; i < decisions.length; i++) {
    const rec = decisions[i];

    if (rec.kind === 'transition') {
      lines.push(`  ${formatTransition(rec)}`);
      lines.push(``);
      continue;
    }

    const stepLabel = rec.step !== undefined ? `[Step ${rec.step}] ` : '';
    const posTime = rec.position && rec.time
      ? `${rec.position.lat.toFixed(3)},${rec.position.lon.toFixed(3)} at ${rec.time.slice(11, 16)}Z`
      : '';
    if (stepLabel || posTime) lines.push(`${stepLabel}${posTime}`);

    const formatted = rec.kind === 'landDeviation' ? formatLandDeviation(rec)
      : rec.kind === 'config' ? formatConfigDecision(rec)
      : formatDecision(rec);
    lines.push(`  ${formatted}`);
    lines.push(``);
  }

  return lines.join('\n');
}
