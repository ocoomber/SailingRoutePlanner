const API_BASE = 'https://api.open-meteo.com/v1/forecast';

export async function fetchWindGrid(area, startTime, endTime) {
  const points = samplePoints(area, 4);
  const startDate = startTime.slice(0, 10);
  const endDate = endTime.slice(0, 10);

  const fetches = points.map(p => {
    const params = new URLSearchParams({
      latitude: p.lat,
      longitude: p.lon,
      hourly: 'wind_speed_10m,wind_direction_10m',
      start_date: startDate,
      end_date: endDate,
      wind_speed_unit: 'kn',
      timezone: 'UTC'
    });
    return fetch(`${API_BASE}?${params}`).then(r => {
      if (!r.ok) throw new Error(`Wind API error: ${r.status} for ${p.lat},${p.lon}`);
      return r.json();
    });
  });

  const results = await Promise.all(fetches);
  return parseWindResponse(results, points);
}

function samplePoints(area, gridSize) {
  const points = [];
  const latStep = (area.south - area.north) / (gridSize - 1);
  const lonStep = (area.east - area.west) / (gridSize - 1);

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      points.push({
        lat: area.north + latStep * i,
        lon: area.west + lonStep * j
      });
    }
  }

  return points;
}

function parseWindResponse(results, points) {
  const times = results[0].hourly.time;

  const grid = [];

  for (let t = 0; t < times.length; t++) {
    const timeEntry = { time: times[t], points: [] };

    for (let p = 0; p < points.length; p++) {
      timeEntry.points.push({
        lat: points[p].lat,
        lon: points[p].lon,
        speed: results[p].hourly.wind_speed_10m[t],
        direction: results[p].hourly.wind_direction_10m[t]
      });
    }

    grid.push(timeEntry);
  }

  return { grid, points };
}

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
