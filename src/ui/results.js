function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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

  const warnP = document.createElement('p');
  const warnStrong = document.createElement('strong');
  warnStrong.textContent = 'Warnings: ';
  warnP.appendChild(warnStrong);
  warnP.appendChild(document.createTextNode(
    'Tidal stream not modelled. This plan is based on forecast data which can be wrong. Always cross-check against your chart and pilot book before departure.'
  ));
  warnings.innerHTML = '';
  warnings.appendChild(warnP);

  legList.innerHTML = '';

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const li = document.createElement('li');

    const lonDir = leg.waypoint.lon < 0 ? 'W' : 'E';
    const headingSpan = document.createElement('span');
    headingSpan.className = 'leg-heading';
    headingSpan.textContent = `Leg ${i + 1}: ${leg.heading}\u00B0T`;

    const detailSpan = document.createElement('span');
    detailSpan.className = 'leg-detail';
    detailSpan.textContent = ` \u2192 ${leg.waypoint.lat.toFixed(4)}\u00B0N, ${Math.abs(leg.waypoint.lon).toFixed(4)}\u00B0${lonDir} (${formatDuration(leg.duration)})`;

    li.appendChild(headingSpan);
    li.appendChild(detailSpan);
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

  warnings.innerHTML = '';
  const p = document.createElement('p');
  const strong = document.createElement('strong');
  strong.textContent = 'Error: ';
  p.appendChild(strong);
  p.appendChild(document.createTextNode(message));
  warnings.appendChild(p);
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

export function showLog(logText) {
  const panel = document.getElementById('debug-log');
  const pre = document.getElementById('debug-log-content');
  panel.classList.remove('hidden');
  pre.textContent = logText;
}

export function hideLog() {
  document.getElementById('debug-log').classList.add('hidden');
}
