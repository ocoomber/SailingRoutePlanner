function formatTime(date) {
  return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function formatDuration(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function showResults(legs, totalTime, timeMode, computedDeparture, targetTime) {
  const results = document.getElementById('results');
  const summary = document.getElementById('route-summary');
  const warnings = document.getElementById('route-warnings');
  const legList = document.getElementById('leg-list');

  results.classList.remove('hidden');

  let summaryText = `${legs.length} legs, approximately ${formatDuration(totalTime)} sailing`;

  if (timeMode === 'arrival' && computedDeparture) {
    summaryText += `. To arrive by ${formatTime(targetTime)}, leave by ${formatTime(computedDeparture)}`;
  } else {
    summaryText += `. Departing ${formatTime(targetTime)}`;
  }

  summary.textContent = summaryText;

  warnings.innerHTML = `
    <strong>Warnings:</strong> Tidal stream not modelled. This plan is based on
    forecast data which can be wrong. Always cross-check against your chart
    and pilot book before departure.
  `;

  legList.innerHTML = '';

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const li = document.createElement('li');

    const lonDir = leg.waypoint.lon < 0 ? 'W' : 'E';

    li.innerHTML = `
      <span class="leg-heading">Leg ${i + 1}: ${leg.heading}°T</span>
      <span class="leg-detail">
        → ${leg.waypoint.lat.toFixed(4)}°N, ${Math.abs(leg.waypoint.lon).toFixed(4)}°${lonDir}
        (${formatDuration(leg.duration)})
      </span>
    `;

    legList.appendChild(li);
  }
}

export function showError(message) {
  const results = document.getElementById('results');
  const summary = document.getElementById('route-summary');
  const warnings = document.getElementById('route-warnings');
  const legList = document.getElementById('leg-list');

  results.classList.remove('hidden');
  summary.textContent = '';
  legList.innerHTML = '';

  warnings.innerHTML = `<strong>Error:</strong> ${message}`;
}

export function hideResults() {
  document.getElementById('results').classList.add('hidden');
}

export function showLoading() {
  const mapEl = document.getElementById('map');
  const overlay = document.createElement('div');
  overlay.className = 'loading-overlay';
  overlay.id = 'loading-overlay';
  overlay.textContent = 'Calculating route...';
  mapEl.appendChild(overlay);
}

export function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.remove();
}
