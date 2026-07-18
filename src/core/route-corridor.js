// A corridor is the rough route's polyline plus a lateral half-width. The
// sailing pass uses it to reject candidate positions that stray too far from the
// planned course — that is what stops the fine isochrone wandering up a river.
//
// Pure: geometry only, no coastline, no side effects.

import { pointToSegmentDistNm, distanceNm } from './geometry.js';
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
  // Cumulative along-route distance to each vertex, so distanceToGoAlongRoute
  // can answer "how much course is left" in O(vertices) without re-summing.
  const cum = [0];
  const n = polyline ? polyline.length : 0;
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + distanceNm(polyline[i - 1], polyline[i]);
  }
  return { polyline, widthNm, cum };
}

// Clamped projection of p onto segment a→b: the along-segment fraction t and the
// perpendicular (lateral) distance in NM. Equirectangular, matching distanceNm.
function projectOntoSegment(p, a, b) {
  const cosMid = Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);
  const ax = a.lon * cosMid, ay = a.lat;
  const bx = b.lon * cosMid, by = b.lat;
  const px = p.lon * cosMid, py = p.lat;
  const abx = bx - ax, aby = by - ay;
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (abx * (px - ax) + aby * (py - ay)) / len2));
  const closest = { lat: ay + aby * t, lon: (ax + abx * t) / cosMid };
  return { t, distNm: distanceNm(p, closest) };
}

// "Distance to go" along the rough course: slide the point onto its nearest
// course segment, then add (course length remaining from that projection) +
// (the lateral hop back to the course). Monotonically shrinks as the boat
// progresses along the route — even where straight-line distance to the end
// grows (rounding a headland) — so it works as a router cost that follows the
// course instead of clinging to a straight-line-to-end local minimum.
export function distanceToGoAlongRoute(point, corridor) {
  const poly = corridor && corridor.polyline;
  if (!poly || poly.length === 0) return Infinity;
  if (poly.length === 1) return distanceNm(point, poly[0]);
  const cum = corridor.cum || makeCorridor(poly, corridor.widthNm).cum;
  const total = cum[cum.length - 1];

  // Anchor on the NEAREST segment (smallest lateral offset), then measure the
  // course remaining from that projection. Minimising toGo directly would let a
  // start point "project" onto a later segment and understate the distance left.
  let bestLateral = Infinity, toGo = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const proj = projectOntoSegment(point, poly[i], poly[i + 1]);
    if (proj.distNm < bestLateral) {
      bestLateral = proj.distNm;
      const alongToHere = cum[i] + (cum[i + 1] - cum[i]) * proj.t;
      toGo = (total - alongToHere) + proj.distNm;
    }
  }
  return toGo;
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
