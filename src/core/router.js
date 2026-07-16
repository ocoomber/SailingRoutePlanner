import { distanceNm, bearing, destination, addVectors } from './geometry.js';
import { lookupSpeed } from './polar.js';
import { crossesLand } from './coastline.js';
import { interpolateWind } from './wind-interpolation.js';

const DEFAULT_HEADINGS = 36;

export function calculateRoute(params) {
  const {
    start, end, departureTime, coastline,
    timeStepMinutes, headingThreshold, tidalCurrent,
    polars, windGrid,
    constantSpeedKn
  } = params;

  const timeStepHours = timeStepMinutes / 60;
  const totalDist = distanceNm(start, end);

  const log = [];
  log.push(`=== ROUTE CALCULATION LOG ===`);
  log.push(`Start: ${start.lat.toFixed(4)}, ${start.lon.toFixed(4)}`);
  log.push(`End: ${end.lat.toFixed(4)}, ${end.lon.toFixed(4)}`);
  log.push(`Total distance: ${totalDist.toFixed(1)} NM`);
  log.push(`Departure: ${departureTime}`);
  log.push(`Time step: ${timeStepMinutes} min`);
  log.push(`Heading threshold: ${headingThreshold}°`);
  log.push(`Coastline segments: ${coastline.segments.length}`);
  if (constantSpeedKn) {
    log.push(`Speed: ${constantSpeedKn} kn (constant, geometry-only mode)`);
  } else {
    log.push(`Wind grid points: ${windGrid.points.length}`);
    log.push(`Wind grid times: ${windGrid.grid.length} hours`);
  }
  log.push(`---`);

  let isochrone = [{ point: start, heading: null, parent: null, time: departureTime, sog: 0, twa: 0, windSpeed: 0, windDir: 0, distToEnd: totalDist }];
  const history = [isochrone];

  const maxSteps = params.maxSteps || 500;
  let landBlocked = 0;
  let zeroSpeed = 0;

  for (let step = 0; step < maxSteps; step++) {
    const nextIsochrone = [];

    const nHeadings = params.headingsPerStep || DEFAULT_HEADINGS;
    const headingStep = 360 / nHeadings;

    for (const node of isochrone) {
      for (let h = 0; h < 360; h += headingStep) {
        let boatSpeed;
        let twaVal = 0;
        let windSpd = 0;
        let windDirVal = 0;

        if (constantSpeedKn) {
          boatSpeed = constantSpeedKn;
        } else {
          const wind = interpolateWind(windGrid, node.point.lat, node.point.lon, node.time);
          windDirVal = wind.direction;
          windSpd = wind.speed;
          const raw = h - wind.direction;
          twaVal = ((raw % 360) + 540) % 360 - 180;
          boatSpeed = lookupSpeed(polars, Math.abs(twaVal), wind.speed);
        }

        if (boatSpeed <= 0) {
          zeroSpeed++;
          continue;
        }

        let moveVector = { direction: h, speed: boatSpeed };

        if (tidalCurrent) {
          const tidalVector = getTidalVector(tidalCurrent, node.time, departureTime);
          moveVector = addVectors(moveVector, tidalVector);
        }

        const distNm = moveVector.speed * timeStepHours;
        const newPoint = destination(node.point, moveVector.direction, distNm);

        if (crossesLand(coastline, node.point, newPoint, start)) {
          landBlocked++;
          if (step < 3) {
            log.push(`[Step ${step}] LAND BLOCKED: ${node.point.lat.toFixed(4)},${node.point.lon.toFixed(4)} → ${newPoint.lat.toFixed(4)},${newPoint.lon.toFixed(4)} hdg ${Math.round(h)}°`);
          }
          continue;
        }

        const distToEnd = distanceNm(newPoint, end);

        nextIsochrone.push({
          point: newPoint,
          heading: moveVector.direction,
          parent: node,
          time: addHours(node.time, timeStepHours),
          distToEnd,
          sog: moveVector.speed,
          twa: twaVal,
          windSpeed: windSpd,
          windDir: windDirVal
        });
      }
    }

    if (nextIsochrone.length === 0) {
      log.push(`[Step ${step}] Isochrone collapsed — no valid moves`);
      break;
    }

    nextIsochrone.sort((a, b) => a.distToEnd - b.distToEnd);

    const pruned = pruneIsochrone(nextIsochrone, 0.5);
    history.push(pruned);
    isochrone = pruned;

    const closest = isochrone[0];

    if (step % 5 === 0 || closest.distToEnd < 2) {
      log.push(`[Step ${step}] Best: ${closest.point.lat.toFixed(4)},${closest.point.lon.toFixed(4)} dist ${closest.distToEnd.toFixed(1)}NM candidates ${nextIsochrone.length}→${pruned.length}`);
    }

    const arrivalThreshold = Math.max(0.5, totalDist * 0.02);
    if (closest.distToEnd < arrivalThreshold) {
      log.push(`[Step ${step}] ROUTE FOUND — within ${arrivalThreshold.toFixed(1)}NM of destination`);
      log.push(`---`);
      log.push(`Stats: ${landBlocked} moves blocked by land, ${zeroSpeed} moves blocked by zero speed`);
      let rawNodes = collectRawNodes(closest);
      let route = buildRoute(closest, history, headingThreshold);

      if (constantSpeedKn && route.length > 1) {
        const totalPathDist = route.reduce((s, l) => s + l.distance, 0);
        if (totalPathDist > totalDist * 1.3 && !crossesLand(coastline, start, end, start, end)) {
          const hdg = Math.round(bearing(start, end));
          const duration = totalDist / constantSpeedKn;
          route = [{
            heading: hdg,
            waypoint: { ...start },
            endWaypoint: { ...end },
            duration,
            distance: totalDist,
            sog: constantSpeedKn,
            windAngle: 0,
            windSpeed: 0,
            windDir: 0,
            windDescription: 'calm',
            maneuver: null
          }];
          rawNodes = [
            { point: { ...start }, heading: null, time: departureTime, sog: 0, twa: 0, windSpeed: 0, windDir: 0, distToEnd: totalDist, parent: null },
            { point: { ...end }, heading: hdg, time: addHours(departureTime, duration), sog: constantSpeedKn, twa: 0, windSpeed: 0, windDir: 0, distToEnd: 0, parent: null }
          ];
        }
      }

      log.push(`Legs: ${route.length}`);
      for (let i = 0; i < route.length; i++) {
        const leg = route[i];
        const lonDir = leg.waypoint.lon < 0 ? 'W' : 'E';
        log.push(`  Leg ${i + 1}: ${leg.heading}°T ${leg.sog.toFixed(1)}kn ${leg.distance.toFixed(1)}NM ${leg.duration.toFixed(1)}h wind ${leg.windSpeed}kn from ${leg.windDir}° ${leg.windDescription}`);
      }
      return { route, rawNodes, log: log.join('\n') };
    }
  }

  log.push(`---`);
  log.push(`NO ROUTE FOUND after ${maxSteps} steps`);
  log.push(`Stats: ${landBlocked} moves blocked by land, ${zeroSpeed} moves blocked by zero speed`);
  const lastIso = isochrone;
  if (lastIso.length > 0) {
    const best = lastIso[0];
    log.push(`Best position reached: ${best.point.lat.toFixed(4)},${best.point.lon.toFixed(4)} (${best.distToEnd.toFixed(1)}NM from destination)`);
  }

  return { route: null, rawNodes: null, log: log.join('\n') };
}

function pruneIsochrone(points, minDistNm) {
  const sorted = [...points].sort((a, b) => a.distToEnd - b.distToEnd);
  const kept = [];

  for (const p of sorted) {
    const tooClose = kept.some(k =>
      distanceNm(k.point, p.point) < minDistNm
    );
    if (!tooClose) kept.push(p);
  }

  return kept;
}

function collectRawNodes(endNode) {
  const path = [];
  let node = endNode;
  while (node) {
    path.unshift(node);
    node = node.parent;
  }
  return path;
}

function buildRoute(endNode, history, headingThreshold) {
  const path = collectRawNodes(endNode);
  return simplifyLegs(path, headingThreshold);
}

function simplifyLegs(path, threshold) {
  if (path.length === 0) return [];

  let firstRealIdx = 0;
  while (firstRealIdx < path.length && path[firstRealIdx].heading === null) {
    firstRealIdx++;
  }

  if (firstRealIdx >= path.length) return [];

  const legs = [];
  let legStart = path[0];
  let lastHeading = path[firstRealIdx].heading;
  let totalSog = path[firstRealIdx].sog;
  let sogCount = 1;
  let totalTwa = path[firstRealIdx].twa;
  let totalWindSpeed = path[firstRealIdx].windSpeed;
  let totalWindDir = path[firstRealIdx].windDir;
  let windCount = 1;
  let prevTwaSign = Math.sign(path[firstRealIdx].twa);

  for (let i = firstRealIdx + 1; i < path.length; i++) {
    const headingDiff = Math.abs(normalizeAngle(path[i].heading - lastHeading));

    if (headingDiff >= threshold) {
      const durationMs = new Date(path[i].time) - new Date(legStart.time);
      const endNode = path[i - 1];
      const distance = distanceNm(legStart.point, endNode.point);
      const avgSog = totalSog / sogCount;
      const avgTwa = totalTwa / windCount;
      const avgWindSpeed = totalWindSpeed / windCount;
      const avgWindDir = totalWindDir / windCount;

      legs.push({
        heading: Math.round(lastHeading),
        waypoint: { ...legStart.point },
        endWaypoint: { ...endNode.point },
        duration: durationMs / 3600000,
        distance,
        sog: avgSog,
        windAngle: Math.round(Math.abs(avgTwa)),
        windSpeed: Math.round(avgWindSpeed),
        windDir: Math.round(avgWindDir),
        windDescription: describeWind(avgTwa),
        maneuver: null
      });

      const newTwaSign = Math.sign(path[i].twa);
      if (prevTwaSign !== 0 && newTwaSign !== 0 && prevTwaSign !== newTwaSign) {
        const absAvgTwa = Math.abs(avgTwa);
        const isTack = absAvgTwa > 90;
        const maneuver = isTack ? 'tack' : 'gybe';
        if (legs.length >= 2) {
          legs[legs.length - 1].maneuver = maneuver;
        }
      }

      legStart = path[i - 1];
      lastHeading = path[i].heading;
      totalSog = path[i].sog;
      sogCount = 1;
      totalTwa = path[i].twa;
      totalWindSpeed = path[i].windSpeed;
      windCount = 1;
      prevTwaSign = newTwaSign;
    } else {
      lastHeading = path[i].heading;
      totalSog += path[i].sog;
      sogCount++;
      totalTwa += path[i].twa;
      totalWindSpeed += path[i].windSpeed;
      totalWindDir += path[i].windDir;
      windCount++;
    }
  }

  const lastNode = path[path.length - 1];
  const durationMs = new Date(lastNode.time) - new Date(legStart.time);
  const distance = distanceNm(legStart.point, lastNode.point);
  const avgSog = totalSog / sogCount;
  const avgTwa = totalTwa / windCount;
  const avgWindSpeed = totalWindSpeed / windCount;
  const avgWindDir = totalWindDir / windCount;

  legs.push({
    heading: Math.round(lastHeading),
    waypoint: { ...legStart.point },
    endWaypoint: { ...lastNode.point },
    duration: durationMs / 3600000,
    distance,
    sog: avgSog,
    windAngle: Math.round(Math.abs(avgTwa)),
    windSpeed: Math.round(avgWindSpeed),
    windDir: Math.round(avgWindDir),
    windDescription: describeWind(avgTwa),
    maneuver: null
  });

  return legs;
}

function describeWind(twa) {
  const absAngle = Math.abs(twa);
  const side = twa >= 0 ? 'port' : 'starboard';

  if (absAngle < 30) return `dead downwind`;
  if (absAngle < 60) return `broad reach, wind on ${side}`;
  if (absAngle < 100) return `beam reach, wind on ${side}`;
  if (absAngle < 140) return `close reach, wind on ${side}`;
  if (absAngle < 160) return `close hauled, wind on ${side}`;
  return `into wind`;
}

function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360;
}

function addHours(time, hours) {
  const d = new Date(time);
  d.setTime(d.getTime() + hours * 3600000);
  return d.toISOString();
}

function getTidalVector(currents, time, departureTime) {
  const hoursSinceDep = (new Date(time) - new Date(departureTime)) / 3600000;
  const idx = ((Math.floor(hoursSinceDep) % currents.length) + currents.length) % currents.length;
  return currents[idx];
}
