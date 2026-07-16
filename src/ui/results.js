import { classifyTransition, classifyInitial, summarizeTransitions } from '../core/classify-transition.js';
import { formatTransition, formatInitial, formatConfigDecision } from '../core/explain.js';

function formatTime(date) {
  return date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function formatDuration(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function renderTransitionPanel(transition) {
  const div = document.createElement('div');
  const isManeuver = transition.isManeuver;
  const isCondensed = !isManeuver && transition.sameCategory;

  if (isManeuver) {
    div.className = 'transition-panel transition-maneuver';
  } else if (isCondensed) {
    div.className = 'transition-panel transition-condensed';
  } else {
    div.className = 'transition-panel transition-category-change';
  }

  if (isManeuver) {
    const badge = document.createElement('span');
    badge.className = `transition-badge badge-${transition.category}`;
    badge.textContent = transition.category.toUpperCase();
    div.appendChild(badge);
    div.appendChild(document.createElement('br'));
  }

  const statLine = document.createElement('div');
  statLine.className = 'transition-statline';
  statLine.textContent = transition.statLine;
  div.appendChild(statLine);

  const text = document.createElement('div');
  text.className = 'transition-text';
  text.textContent = transition.explanation;
  div.appendChild(text);

  return div;
}

export function renderConfigChangePanel(rec) {
  const div = document.createElement('div');
  div.className = `transition-panel transition-config-change transition-config-${rec.accepted ? 'accepted' : 'rejected'}`;

  const badge = document.createElement('span');
  badge.className = `transition-badge badge-config-${rec.to}`;
  badge.textContent = `${rec.from.toUpperCase()} → ${rec.to.toUpperCase()}${rec.accepted ? '' : ' (rejected)'}`;
  div.appendChild(badge);
  div.appendChild(document.createElement('br'));

  const text = document.createElement('div');
  text.className = 'transition-text';
  text.textContent = formatConfigDecision(rec);
  div.appendChild(text);

  return div;
}

function renderInitialPanel(initial) {
  const div = document.createElement('div');
  div.className = 'transition-panel transition-initial';
  const text = document.createElement('div');
  text.className = 'transition-text';
  text.textContent = formatInitial(initial);
  div.appendChild(text);
  return div;
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

  const planSummary = document.createElement('p');
  planSummary.className = 'plan-summary';
  const transitionSummary = summarizeTransitions(legs);

  if (transitionSummary && transitionSummary !== 'No course changes') {
    planSummary.textContent = `Course changes: ${transitionSummary}.`;
  } else {
    planSummary.textContent = 'No course changes — direct passage.';
  }

  if (legs.length > 1 && legs.some(l => l.windSpeed > 0)) {
    const dest = legs[legs.length - 1].endWaypoint;
    const initial = legs[0].windSpeed > 0 ? classifyInitial(legs[0], dest) : null;
    if (initial) {
      planSummary.textContent += ` ${formatInitial(initial)}`;
    }
  }

  warnings.appendChild(planSummary);

  legList.innerHTML = '';

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const li = document.createElement('li');
    li.className = 'leg-item';

    if (leg.maneuver) {
      li.classList.add(`leg-${leg.maneuver}`);
    }

    const lonDir = leg.waypoint.lon < 0 ? 'W' : 'E';
    const endLonDir = leg.endWaypoint.lon < 0 ? 'W' : 'E';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'leg-header';

    const maneuverSpan = document.createElement('span');
    maneuverSpan.className = 'leg-maneuver-badge';
    if (leg.maneuver === 'tack') {
      maneuverSpan.textContent = 'TACK';
      maneuverSpan.classList.add('badge-tack');
    } else if (leg.maneuver === 'gybe') {
      maneuverSpan.textContent = 'GYBE';
      maneuverSpan.classList.add('badge-gybe');
    }

    headerDiv.textContent = `Leg ${i + 1}: ${leg.heading}\u00B0T `;
    if (leg.maneuver) {
      headerDiv.appendChild(maneuverSpan);
    }

    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'leg-details';

    const fields = [
      { label: 'From', value: `${leg.waypoint.lat.toFixed(4)}\u00B0N, ${Math.abs(leg.waypoint.lon).toFixed(4)}\u00B0${lonDir}` },
      { label: 'To', value: `${leg.endWaypoint.lat.toFixed(4)}\u00B0N, ${Math.abs(leg.endWaypoint.lon).toFixed(4)}\u00B0${endLonDir}` },
      { label: 'Distance', value: `${leg.distance.toFixed(1)} NM` },
      { label: 'SoG', value: `${leg.sog.toFixed(1)} kn` },
      { label: 'Time', value: formatDuration(leg.duration) },
      { label: 'Wind', value: `${leg.windSpeed} kn from ${leg.windDir}\u00B0 TWA ${leg.windAngle}\u00B0` },
      { label: 'Point of sail', value: leg.windDescription }
    ];

    for (const field of fields) {
      const row = document.createElement('div');
      row.className = 'leg-field';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'leg-field-label';
      labelSpan.textContent = `${field.label}: `;
      const valueSpan = document.createElement('span');
      valueSpan.className = 'leg-field-value';
      valueSpan.textContent = field.value;
      row.appendChild(labelSpan);
      row.appendChild(valueSpan);
      detailsDiv.appendChild(row);
    }

    li.appendChild(headerDiv);
    li.appendChild(detailsDiv);
    legList.appendChild(li);

    if (i < legs.length - 1 && leg.windSpeed > 0) {
      const dest = legs[legs.length - 1].endWaypoint;
      const transition = classifyTransition(leg, legs[i + 1], dest);
      const panel = renderTransitionPanel(transition);
      legList.appendChild(panel);
    }
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
