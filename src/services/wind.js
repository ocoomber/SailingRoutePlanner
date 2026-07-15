const API_BASE = 'https://api.open-meteo.com/v1/forecast';

export async function fetchWindGrid(area, startTime, endTime) {
  const points = samplePoints(area, 4);
  const lats = points.map(p => p.lat).join(',');
  const lons = points.map(p => p.lon).join(',');

  const params = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    hourly: 'wind_speed_10m,wind_direction_10m',
    start_date: startTime.slice(0, 10),
    end_date: endTime.slice(0, 10),
    wind_speed_unit: 'kn',
    timezone: 'UTC'
  });

  const response = await fetch(`${API_BASE}?${params}`);
  if (!response.ok) {
    throw new Error(`Wind API error: ${response.status}`);
  }

  const data = await response.json();
  return parseWindResponse(data, points);
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

function parseWindResponse(data, points) {
  const hourly = Array.isArray(data) ? data[0].hourly : data.hourly;
  const times = hourly.time;

  const grid = [];

  const windData = Array.isArray(data) ? data : [data];

  for (let t = 0; t < times.length; t++) {
    const timeEntry = { time: times[t], points: [] };

    for (let p = 0; p < points.length; p++) {
      const windSpeed = windData[p].hourly.wind_speed_10m[t];
      const windDir = windData[p].hourly.wind_direction_10m[t];

      timeEntry.points.push({
        lat: points[p].lat,
        lon: points[p].lon,
        speed: windSpeed,
        direction: windDir
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
