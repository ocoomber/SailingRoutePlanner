const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS_NM = 3440.065;

export function toRadians(deg) {
  return deg * DEG_TO_RAD;
}

export function toDegrees(rad) {
  return rad * RAD_TO_DEG;
}

export function normalizeBearing(deg) {
  return ((deg % 360) + 360) % 360;
}

export function distanceNm(a, b) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRadians(b.lon - a.lon);

  const x = dLon * Math.cos((lat1 + lat2) / 2);
  const y = dLat;

  return Math.sqrt(x * x + y * y) * EARTH_RADIUS_NM;
}

export function bearing(a, b) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLon = toRadians(b.lon - a.lon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return normalizeBearing(toDegrees(Math.atan2(y, x)));
}

export function destination(start, bearingDeg, distanceNm) {
  const angDist = distanceNm / EARTH_RADIUS_NM;
  const lat1 = toRadians(start.lat);
  const lon1 = toRadians(start.lon);
  const brng = toRadians(bearingDeg);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) +
    Math.cos(lat1) * Math.sin(angDist) * Math.cos(brng)
  );

  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(angDist) * Math.cos(lat1),
    Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
  );

  return { lat: toDegrees(lat2), lon: toDegrees(lon2) };
}

export function addVectors(a, b) {
  const aRad = toRadians(a.direction);
  const bRad = toRadians(b.direction);

  const ax = a.speed * Math.sin(aRad);
  const ay = a.speed * Math.cos(aRad);
  const bx = b.speed * Math.sin(bRad);
  const by = b.speed * Math.cos(bRad);

  const rx = ax + bx;
  const ry = ay + by;

  return {
    direction: normalizeBearing(toDegrees(Math.atan2(rx, ry))),
    speed: Math.sqrt(rx * rx + ry * ry)
  };
}

export function pointToSegmentDistNm(p, a, b) {
  const midLat = (a.lat + b.lat) / 2;
  const cosMid = Math.cos(midLat * DEG_TO_RAD);

  const ax = a.lon * cosMid, ay = a.lat;
  const bx = b.lon * cosMid, by = b.lat;
  const px = p.lon * cosMid, py = p.lat;

  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;

  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return distanceNm(p, a);

  const t = Math.max(0, Math.min(1, (abx * apx + aby * apy) / len2));

  const closest = {
    lat: ay + aby * t,
    lon: (ax + abx * t) / cosMid
  };

  return distanceNm(p, closest);
}

export function interpolatePoint(a, b, t) {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t
  };
}

export function segmentsCross(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;

  return false;
}

function orientation(p, q, r) {
  const val = (q.lat - p.lat) * (r.lon - q.lon) -
              (q.lon - p.lon) * (r.lat - q.lat);

  if (Math.abs(val) < 1e-10) return 0;
  return val > 0 ? 1 : 2;
}

function onSegment(p, q, r) {
  return q.lat <= Math.max(p.lat, r.lat) &&
         q.lat >= Math.min(p.lat, r.lat) &&
         q.lon <= Math.max(p.lon, r.lon) &&
         q.lon >= Math.min(p.lon, r.lon);
}

export function pointInPolygon(point, polygon) {
  if (!polygon) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lon, yi = polygon[i].lat;
    const xj = polygon[j].lon, yj = polygon[j].lat;
    const intersect = ((yi > point.lat) !== (yj > point.lat))
      && (point.lon < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
