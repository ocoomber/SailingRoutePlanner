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
    lines.push(`[Step ${rec.step}] ${rec.position.lat.toFixed(3)},${rec.position.lon.toFixed(3)} at ${rec.time.slice(11, 16)}Z`);
    lines.push(`  ${rec.kind === 'landDeviation' ? formatLandDeviation(rec) : formatDecision(rec)}`);
    lines.push(``);
  }

  return lines.join('\n');
}
