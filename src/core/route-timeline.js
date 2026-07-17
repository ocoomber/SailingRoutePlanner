// Builds the wind/time timeline the config planner needs by WALKING the rough
// route, instead of running a greedy isochrone that could wander off it.
//
// It steps along the rough polyline at the boat's full-sail speed for the local
// wind, sampling the forecast at each step. The output is the same shape
// buildTimeline produced from raw router nodes: { time, position, windSpeed,
// windDir, bearingToDest, remainingMin }. Pure (read-only wind/polar lookups).

import { interpolateWind } from './wind-interpolation.js';
import { lookupSpeed } from './polar.js';
import { bearing, distanceNm, interpolatePoint } from './geometry.js';

const GHOST_SPEED_KN = 2;   // keep the clock moving through calms/no-go
const MAX_STEPS = 5000;

function signedTwa(headingDeg, windDirDeg) {
  return ((headingDeg - windDirDeg + 540) % 360) - 180;
}

export function buildTimelineAlongRoute({ waypoints, windGrid, polars, departureTime, end, stepMinutes }) {
  const timeline = [];
  if (!waypoints || waypoints.length < 2) return timeline;

  const stepHours = stepMinutes / 60;
  let t = new Date(departureTime).getTime();
  let segIdx = 0;
  let pos = { ...waypoints[0] };
  let steps = 0;

  while (segIdx < waypoints.length - 1 && steps++ < MAX_STEPS) {
    const wind = interpolateWind(windGrid, pos.lat, pos.lon, new Date(t).toISOString());
    const courseBrg = bearing(pos, waypoints[segIdx + 1]);
    const twaAbs = Math.abs(signedTwa(courseBrg, wind.direction));
    const polarSpeed = lookupSpeed(polars, twaAbs, wind.speed);
    const speed = polarSpeed > 0 ? polarSpeed : GHOST_SPEED_KN;

    timeline.push({
      time: new Date(t).toISOString(),
      position: { ...pos },
      windSpeed: wind.speed,
      windDir: wind.direction,
      bearingToDest: bearing(pos, end),
      remainingMin: 0
    });

    // Advance along the polyline by this step's distance, crossing waypoints.
    let remainingNm = speed * stepHours;
    while (remainingNm > 0 && segIdx < waypoints.length - 1) {
      const target = waypoints[segIdx + 1];
      const legLeft = distanceNm(pos, target);
      if (legLeft <= remainingNm) {
        pos = { ...target };
        remainingNm -= legLeft;
        segIdx++;
      } else {
        pos = interpolatePoint(pos, target, remainingNm / legLeft);
        remainingNm = 0;
      }
    }
    t += stepMinutes * 60000;
  }

  // Final entry at the destination, then fill remainingMin from the arrival time.
  timeline.push({
    time: new Date(t).toISOString(),
    position: { ...waypoints[waypoints.length - 1] },
    windSpeed: 0, windDir: 0,
    bearingToDest: 0,
    remainingMin: 0
  });

  const arrival = t;
  for (const entry of timeline) {
    entry.remainingMin = (arrival - new Date(entry.time).getTime()) / 60000;
  }
  return timeline;
}
