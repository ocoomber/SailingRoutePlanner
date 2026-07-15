export function interpolateWind(windGrid, lat, lon, time) {
  const tIdx = findTimeIndex(windGrid.grid, time);
  const entry = windGrid.grid[tIdx];

  let bestDist = Infinity;
  let bestWind = { speed: 0, direction: 0 };

  for (const p of entry.points) {
    const d = Math.hypot(p.lat - lat, p.lon - lon);
    if (d < bestDist) {
      bestDist = d;
      bestWind = { speed: p.speed, direction: p.direction };
    }
  }

  return bestWind;
}

function findTimeIndex(grid, time) {
  const t = new Date(time).getTime();

  for (let i = 0; i < grid.length - 1; i++) {
    const t0 = new Date(grid[i].time).getTime();
    const t1 = new Date(grid[i + 1].time).getTime();

    if (t >= t0 && t <= t1) {
      const frac = (t - t0) / (t1 - t0);
      return frac < 0.5 ? i : i + 1;
    }
  }

  return grid.length - 1;
}
