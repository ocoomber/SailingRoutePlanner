export function showResults(legs, totalTime) {
  const results = document.getElementById('results');
  const summary = document.getElementById('route-summary');
  const warnings = document.getElementById('route-warnings');
  const legList = document.getElementById('leg-list');

  results.classList.remove('hidden');

  const hours = Math.floor(totalTime);
  const mins = Math.round((totalTime - hours) * 60);
  summary.textContent = `${legs.length} legs, approximately ${hours}h ${mins}m total`;

  warnings.innerHTML = `
    <strong>Warnings:</strong> Tidal stream not modelled. This plan is based on
    forecast data which can be wrong. Always cross-check against your chart
    and pilot book before departure.
  `;

  legList.innerHTML = '';

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const li = document.createElement('li');

    const legHours = Math.floor(leg.duration);
    const legMins = Math.round((leg.duration - legHours) * 60);
    const durationStr = legHours > 0 ? `${legHours}h ${legMins}m` : `${legMins}m`;

    li.innerHTML = `
      <span class="leg-heading">Leg ${i + 1}: ${leg.heading}°T</span>
      <span class="leg-detail">
        → ${leg.waypoint.lat.toFixed(4)}°N, ${Math.abs(leg.waypoint.lon).toFixed(4)}°W
        (${durationStr})
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
