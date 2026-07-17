// Pure: builds the hover tooltip for a route leg. No DOM, no Leaflet — returns
// an HTML string the layer builder hands to Leaflet.

import { labelForConfig } from './leg-styles.js';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function formatDuration(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function row(label, value) {
  return `<div class="leg-tip-row"><span class="leg-tip-label">${escapeHtml(label)}</span>` +
    `<span class="leg-tip-value">${escapeHtml(value)}</span></div>`;
}

export function legTooltipHtml(leg, index) {
  const parts = [];
  parts.push(`<div class="leg-tip-head">Leg ${index + 1} — ${escapeHtml(labelForConfig(leg.config))}</div>`);
  parts.push(row('Heading', `${leg.heading}°T`));
  parts.push(row('Distance', `${leg.distance.toFixed(1)} NM`));
  parts.push(row('Duration', formatDuration(leg.duration)));
  parts.push(row('SoG', `${leg.sog.toFixed(1)} kn`));
  parts.push(row('Wind', `${leg.windSpeed} kn from ${leg.windDir}°`));

  // windAngle is absolute — tackSide is the only place the TWA sign survives.
  const tack = leg.tackSide ? ` (${leg.tackSide})` : '';
  parts.push(row('TWA', `${leg.windAngle}°${tack}`));
  parts.push(row('Point of sail', leg.windDescription));

  if (leg.maneuver) {
    parts.push(`<div class="leg-tip-note">Ends with a ${escapeHtml(leg.maneuver.toUpperCase())}</div>`);
  }
  if (leg.comfortExceeded) {
    parts.push('<div class="leg-tip-warn">Above your max comfort wind</div>');
  }

  return `<div class="leg-tip">${parts.join('')}</div>`;
}
