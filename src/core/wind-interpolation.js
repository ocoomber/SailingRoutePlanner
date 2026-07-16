export function interpolateWind(windGrid, lat, lon, time) {
  const grid = windGrid.grid;
  if (grid.length === 0) return { speed: 0, direction: 0 };

  const { i0, i1, frac } = findTimeBracket(grid, time);
  const pointIdx = nearestPointIndex(grid[i0].points, lat, lon);

  const p0 = grid[i0].points[pointIdx];
  const p1 = grid[i1].points[pointIdx];

  return {
    speed: p0.speed + (p1.speed - p0.speed) * frac,
    direction: interpolateDirection(p0.direction, p1.direction, frac)
  };
}

function findTimeBracket(grid, time) {
  const t = new Date(time).getTime();

  if (grid.length === 1) return { i0: 0, i1: 0, frac: 0 };

  for (let i = 0; i < grid.length - 1; i++) {
    const t0 = new Date(grid[i].time).getTime();
    const t1 = new Date(grid[i + 1].time).getTime();

    if (t >= t0 && t <= t1) {
      const frac = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return { i0: i, i1: i + 1, frac };
    }
  }

  const firstT = new Date(grid[0].time).getTime();
  if (t < firstT) return { i0: 0, i1: 0, frac: 0 };

  return { i0: grid.length - 1, i1: grid.length - 1, frac: 0 };
}

function interpolateDirection(dir0, dir1, frac) {
  const d = ((dir1 - dir0 + 540) % 360) - 180;
  return (dir0 + d * frac + 360) % 360;
}

function nearestPointIndex(points, lat, lon) {
  let bestDist = Infinity;
  let bestIdx = 0;

  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].lat - lat, points[i].lon - lon);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  return bestIdx;
}
