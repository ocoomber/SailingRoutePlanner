// A corridor is the rough route's polyline plus a lateral half-width. The
// sailing pass uses it to reject candidate positions that stray too far from the
// planned course — that is what stops the fine isochrone wandering up a river.
//
// Pure: geometry only, no coastline, no side effects.

import { pointToSegmentDistNm } from './geometry.js';
import { loadCoastline } from './coastline.js';

// Distance from a point to the nearest point on the rough polyline, in NM.
export function lateralOffsetNm(point, polyline) {
  if (!polyline || polyline.length === 0) return Infinity;
  if (polyline.length === 1) {
    return pointToSegmentDistNm(point, polyline[0], polyline[0]);
  }
  let min = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const d = pointToSegmentDistNm(point, polyline[i], polyline[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

export function makeCorridor(polyline, widthNm) {
  return { polyline, widthNm };
}

export function withinCorridor(point, corridor) {
  if (!corridor || !corridor.polyline || !(corridor.widthNm > 0)) return true;
  return lateralOffsetNm(point, corridor.polyline) <= corridor.widthNm;
}

// Keep only the coastline near the rough course. The sailing pass never leaves
// the corridor, so land far from it can't affect the route — dropping it turns
// the per-point land test from "scan every loaded tile ring" into "scan a
// handful", which is the difference between a route taking minutes and seconds.
// keepWidthNm must exceed the corridor half-width so land the route can actually
// touch is never pruned away.
export function pruneCoastlineToCorridor(coastline, polyline, keepWidthNm) {
  if (!coastline || !polyline || polyline.length < 2) return coastline;

  const near = (p) => lateralOffsetNm(p, polyline) <= keepWidthNm;
  const ringNear = (ring) => ring.some(near);

  return loadCoastline({
    outerRings: (coastline.outerRings || []).filter(ringNear),
    innerRings: (coastline.innerRings || []).filter(ringNear),
    segments: (coastline.segments || []).filter(s => near(s.a) || near(s.b))
  });
}
