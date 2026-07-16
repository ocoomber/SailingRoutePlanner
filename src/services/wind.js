const API_BASE = 'https://api.open-meteo.com/v1/forecast';
const RATE_LIMIT_MS = 150;

export async function fetchWindGrid(area, startTime, endTime) {
  const points = samplePoints(area, 4);
  const startDate = startTime.slice(0, 10);
  const endDate = endTime.slice(0, 10);

  const results = [];
  for (const p of points) {
    const params = new URLSearchParams({
      latitude: p.lat,
      longitude: p.lon,
      hourly: 'wind_speed_10m,wind_direction_10m',
      start_date: startDate,
      end_date: endDate,
      wind_speed_unit: 'kn',
      timezone: 'UTC'
    });

    const resp = await fetch(`${API_BASE}?${params}`);
    if (!resp.ok) {
      throw new Error(`Wind API error: ${resp.status} for ${p.lat.toFixed(4)},${p.lon.toFixed(4)}`);
    }

    const data = await resp.json();
    if (data.error) {
      throw new Error(`Wind API error: ${data.reason}`);
    }

    results.push(data);
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
  }

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
