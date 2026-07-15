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

  let isochrone = [{ point: start, heading: null, parent: null, time: departureTime }];
  const history = [isochrone];

  const maxSteps = 500;

  for (let step = 0; step < maxSteps; step++) {
    const nextIsochrone = [];

    for (const node of isochrone) {
      for (let h = 0; h < 360; h += HEADING_STEP) {
        const wind = interpolateWind(windGrid, node.point.lat, node.point.lon, node.time);
        const raw = h - wind.direction;
        const twa = ((raw % 360) + 540) % 360 - 180;
        const boatSpeed = lookupSpeed(polars, Math.abs(twa), wind.speed);

        if (boatSpeed <= 0) continue;

        let moveVector = { direction: h, speed: boatSpeed };

        if (tidalCurrent) {
          const tidalVector = getTidalVector(tidalCurrent, node.time, departureTime);
          moveVector = addVectors(moveVector, tidalVector);
        }

        const distNm = moveVector.speed * timeStepHours;
        const newPoint = destination(node.point, moveVector.direction, distNm);

        if (crossesLand(coastline, node.point, newPoint)) continue;

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

    if (nextIsochrone.length === 0) break;

    nextIsochrone.sort((a, b) => a.distToEnd - b.distToEnd);

    const pruned = pruneIsochrone(nextIsochrone, 0.5);
    history.push(pruned);
    isochrone = pruned;

    const closest = isochrone[0];
    const arrivalThreshold = Math.max(0.5, totalDist * 0.02);
    if (closest.distToEnd < arrivalThreshold) {
      return buildRoute(closest, history, headingThreshold);
    }
  }

  return null;
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
