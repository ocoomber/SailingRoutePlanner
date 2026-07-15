import { distanceNm, destination, addVectors } from './geometry.js';
import { lookupSpeed } from './polar.js';
import { crossesLand } from './coastline.js';
import { interpolateWind } from './wind-interpolation.js';

const HEADINGS_PER_STEP = 36;
const HEADING_STEP = 360 / HEADINGS_PER_STEP;

export function calculateRoute(params) {
  const {
    start, end, departureTime, polars, coastline, windGrid,
    timeStepMinutes, headingThreshold, tidalCurrent
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
  log.push(`Wind grid points: ${windGrid.points.length}`);
  log.push(`Wind grid times: ${windGrid.grid.length} hours`);
  log.push(`---`);

  let isochrone = [{ point: start, heading: null, parent: null, time: departureTime }];
  const history = [isochrone];

  const maxSteps = 500;
  let landBlocked = 0;
  let zeroSpeed = 0;

  for (let step = 0; step < maxSteps; step++) {
    const nextIsochrone = [];

    for (const node of isochrone) {
      for (let h = 0; h < 360; h += HEADING_STEP) {
        const wind = interpolateWind(windGrid, node.point.lat, node.point.lon, node.time);
        const raw = h - wind.direction;
        const twa = ((raw % 360) + 540) % 360 - 180;
        const boatSpeed = lookupSpeed(polars, Math.abs(twa), wind.speed);

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

        if (crossesLand(coastline, node.point, newPoint)) {
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
          distToEnd
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
      const route = buildRoute(closest, history, headingThreshold);
      log.push(`Legs: ${route.length}`);
      for (let i = 0; i < route.length; i++) {
        const leg = route[i];
        const lonDir = leg.waypoint.lon < 0 ? 'W' : 'E';
        log.push(`  Leg ${i + 1}: ${leg.heading}°T → ${leg.waypoint.lat.toFixed(4)}°N ${Math.abs(leg.waypoint.lon).toFixed(4)}°${lonDir} (${leg.duration.toFixed(1)}h)`);
      }
      return { route, log: log.join('\n') };
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

  return { route: null, log: log.join('\n') };
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

function buildRoute(endNode, history, headingThreshold) {
  const path = [];
  let node = endNode;

  while (node) {
    path.unshift(node);
    node = node.parent;
  }

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
  let legStart = path[firstRealIdx];
  let lastHeading = path[firstRealIdx].heading;

  for (let i = firstRealIdx + 1; i < path.length; i++) {
    const headingDiff = Math.abs(normalizeAngle(path[i].heading - lastHeading));

    if (headingDiff >= threshold) {
      const durationMs = new Date(path[i].time) - new Date(legStart.time);
      legs.push({
        heading: Math.round(lastHeading),
        waypoint: { ...legStart.point },
        duration: durationMs / 3600000
      });
      legStart = path[i - 1];
      lastHeading = path[i].heading;
    } else {
      lastHeading = path[i].heading;
    }
  }

  const lastNode = path[path.length - 1];
  const durationMs = new Date(lastNode.time) - new Date(legStart.time);
  legs.push({
    heading: Math.round(lastHeading),
    waypoint: { ...lastNode.point },
    duration: durationMs / 3600000
  });

  return legs;
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
