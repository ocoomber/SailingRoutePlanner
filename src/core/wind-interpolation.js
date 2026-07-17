// Samples the forecast wind field at a position and time.
//
// SPACE is bilinear on the wind's VECTOR COMPONENTS (u/v). It used to be
// nearest-neighbour, which turned the 4x4 forecast grid into four hard Voronoi
// cells: crossing an invisible boundary snapped the wind by up to ~120° in a
// single step, flipping TWA sign and making the router fire off spurious tacks
// and gybes — routes came out as a tangle. Keep this bilinear. Working in u/v
// also handles the 0°/360° wrap for free, and lets opposing light airs blend
// toward calm, which is what physically happens where two airstreams meet.
//
// TIME stays polar — speed linearly, direction along the shortest arc. A
// forecast frame is a state evolving, not a vector to average: 10kn veering to
// 20kn should pass through ~15kn, and a wind reversing over an hour must not
// vector-average to a flat calm at the halfway point.

export function interpolateWind(windGrid, lat, lon, time) {
  const grid = windGrid.grid;
  if (!grid || grid.length === 0) return { speed: 0, direction: 0 };

  const lattice = getLattice(windGrid);
  const { i0, i1, frac } = findTimeBracket(grid, time);

  const a = sampleFrameWind(grid[i0], lattice, lat, lon);
  if (i1 === i0) return a;
  const b = sampleFrameWind(grid[i1], lattice, lat, lon);

  return {
    speed: a.speed + (b.speed - a.speed) * frac,
    direction: interpolateDirection(a.direction, b.direction, frac)
  };
}

function sampleFrameWind(frame, lattice, lat, lon) {
  const { u, v } = sampleFrame(frame, lattice, lat, lon);
  return fromUV(u, v);
}

function interpolateDirection(dir0, dir1, frac) {
  const d = ((dir1 - dir0 + 540) % 360) - 180;
  return (dir0 + d * frac + 360) % 360;
}

function toUV(speed, direction) {
  const r = direction * Math.PI / 180;
  return { u: speed * Math.sin(r), v: speed * Math.cos(r) };
}

function fromUV(u, v) {
  return {
    speed: Math.hypot(u, v),
    direction: (Math.atan2(u, v) * 180 / Math.PI + 360) % 360
  };
}

// Derived once per grid object and cached on it: the forecast lattice is a
// regular lat/lon mesh, but we read it off the points rather than assuming a
// size, so an irregular or single-point grid still works.
const latticeCache = new WeakMap();

function getLattice(windGrid) {
  const cached = latticeCache.get(windGrid);
  if (cached) return cached;

  const points = windGrid.points || (windGrid.grid[0] && windGrid.grid[0].points) || [];
  const lats = [...new Set(points.map(p => p.lat))].sort((x, y) => y - x); // north -> south
  const lons = [...new Set(points.map(p => p.lon))].sort((x, y) => x - y); // west -> east

  const indexByCell = new Map();
  points.forEach((p, idx) => indexByCell.set(`${p.lat},${p.lon}`, idx));

  const regular = lats.length * lons.length === points.length &&
    lats.every(la => lons.every(lo => indexByCell.has(`${la},${lo}`)));

  const lattice = { lats, lons, indexByCell, regular, pointCount: points.length };
  latticeCache.set(windGrid, lattice);
  return lattice;
}

// Index of the cell containing `value`, plus the blend fraction. Clamped at the
// edges — the forecast is not extrapolated beyond the area it covers.
function bracket(axis, value) {
  if (axis.length === 1) return { i0: 0, i1: 0, frac: 0 };

  const ascending = axis[axis.length - 1] > axis[0];
  for (let i = 0; i < axis.length - 1; i++) {
    const a = axis[i];
    const b = axis[i + 1];
    const within = ascending ? (value >= a && value <= b) : (value <= a && value >= b);
    if (within) return { i0: i, i1: i + 1, frac: b === a ? 0 : (value - a) / (b - a) };
  }

  const beyondStart = ascending ? value < axis[0] : value > axis[0];
  if (beyondStart) return { i0: 0, i1: 0, frac: 0 };
  return { i0: axis.length - 1, i1: axis.length - 1, frac: 0 };
}

function uvAt(frame, lattice, latIdx, lonIdx) {
  const idx = lattice.indexByCell.get(`${lattice.lats[latIdx]},${lattice.lons[lonIdx]}`);
  const p = frame.points[idx];
  if (!p) return { u: 0, v: 0 };
  return toUV(p.speed, p.direction);
}

function sampleFrame(frame, lattice, lat, lon) {
  if (!lattice.regular) return nearestUV(frame, lat, lon);

  const la = bracket(lattice.lats, lat);
  const lo = bracket(lattice.lons, lon);

  const q00 = uvAt(frame, lattice, la.i0, lo.i0);
  const q01 = uvAt(frame, lattice, la.i0, lo.i1);
  const q10 = uvAt(frame, lattice, la.i1, lo.i0);
  const q11 = uvAt(frame, lattice, la.i1, lo.i1);

  const top = { u: q00.u + (q01.u - q00.u) * lo.frac, v: q00.v + (q01.v - q00.v) * lo.frac };
  const bot = { u: q10.u + (q11.u - q10.u) * lo.frac, v: q10.v + (q11.v - q10.v) * lo.frac };

  return { u: top.u + (bot.u - top.u) * la.frac, v: top.v + (bot.v - top.v) * la.frac };
}

function nearestUV(frame, lat, lon) {
  let best = null;
  let bestDist = Infinity;
  for (const p of frame.points) {
    const d = Math.hypot(p.lat - lat, p.lon - lon);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best ? toUV(best.speed, best.direction) : { u: 0, v: 0 };
}

function findTimeBracket(grid, time) {
  const t = new Date(time).getTime();
  if (grid.length === 1) return { i0: 0, i1: 0, frac: 0 };

  for (let i = 0; i < grid.length - 1; i++) {
    const t0 = new Date(grid[i].time).getTime();
    const t1 = new Date(grid[i + 1].time).getTime();
    if (t >= t0 && t <= t1) {
      return { i0: i, i1: i + 1, frac: t1 === t0 ? 0 : (t - t0) / (t1 - t0) };
    }
  }

  if (t < new Date(grid[0].time).getTime()) return { i0: 0, i1: 0, frac: 0 };
  return { i0: grid.length - 1, i1: grid.length - 1, frac: 0 };
}
