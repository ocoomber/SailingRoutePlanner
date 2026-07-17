// Pure builders for the land-data overlays. Each returns L.Layer[] and never
// touches the map.
//
// These used to be one function drawing fine + coarse into a single group behind
// one checkbox, which made it impossible to judge the fine coastline on its own.
// They are now four independent layers.

export const FINE_LAND_STYLE = {
  color: '#dc2626',
  fillColor: '#dc2626',
  fillOpacity: 0.35,
  weight: 1,
  opacity: 0.5
};

export const COARSE_LAND_STYLE = {
  color: '#ea580c',
  fillColor: '#ea580c',
  fillOpacity: 0.12,
  weight: 1.5,
  opacity: 0.7,
  dashArray: '6 4'
};

export const INNER_RING_STYLE = {
  color: '#2563eb',
  fill: false,
  weight: 1,
  opacity: 0.6
};

export const COAST_SEGMENT_STYLE = {
  color: '#f59e0b',
  weight: 1,
  opacity: 0.4
};

function ringsToPolygons(rings, style) {
  if (!rings) return [];
  return rings.map(ring => L.polygon(ring.map(p => [p.lat, p.lon]), style));
}

// The SmartCoastline exposes .fine/.coarse; a plain coarse-only coastline does not.
function fineOf(coastline) {
  if (!coastline) return null;
  return coastline.fine || null;
}

function coarseOf(coastline) {
  if (!coastline) return null;
  return coastline.coarse || coastline;
}

export function buildFineLand(state) {
  const fine = fineOf(state.coastline);
  if (!fine) return [];
  return ringsToPolygons(fine.outerRings, FINE_LAND_STYLE);
}

export function buildCoarseLand(state) {
  const coarse = coarseOf(state.coastline);
  if (!coarse) return [];
  return ringsToPolygons(coarse.outerRings, COARSE_LAND_STYLE);
}

export function buildInnerRings(state) {
  const coastline = state.coastline;
  if (!coastline || !coastline.innerRings) return [];
  return ringsToPolygons(coastline.innerRings, INNER_RING_STYLE);
}

export function buildCoastSegments(state) {
  const coastline = state.coastline;
  if (!coastline || !coastline.segments) return [];
  return coastline.segments.map(seg =>
    L.polyline([[seg.a.lat, seg.a.lon], [seg.b.lat, seg.b.lon]], COAST_SEGMENT_STYLE)
  );
}
