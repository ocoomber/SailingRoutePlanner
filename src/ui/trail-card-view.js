// Builds the DOM for one Decision -> Leg card. Card models come from
// trail-cards.js; the prose comes from the engine's own explain.js formatters.

import { formatTransition, formatInitial, formatConfigDecision } from '../core/explain.js';
import { labelForConfig, colourForConfig } from './map/leg-styles.js';
import { setSelected } from './selection.js';

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function formatDuration(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function decisionSection(card) {
  const wrap = el('div', 'card-decision');
  wrap.appendChild(el('div', 'card-section-label', 'Decision'));

  if (card.initial) {
    wrap.appendChild(el('p', 'decision-text', formatInitial(card.initial)));
  }

  if (card.transition) {
    wrap.appendChild(el('span', `decision-badge badge-${card.transition.category}`,
      card.transition.category.toUpperCase()));
    wrap.appendChild(el('div', 'decision-statline', card.transition.statLine));
    wrap.appendChild(el('p', 'decision-text', card.transition.explanation));
  }

  if (card.configDecision) {
    const rec = card.configDecision;
    const cfg = el('div', `decision-config ${rec.accepted ? 'config-accepted' : 'config-rejected'}`);
    cfg.appendChild(el('div', 'decision-config-head',
      `${labelForConfig(rec.from)} → ${labelForConfig(rec.to)}${rec.accepted ? '' : ' (refused)'}`));
    cfg.appendChild(el('p', 'decision-text', formatConfigDecision(rec)));

    // The actual "is the juice worth the squeeze" arithmetic.
    if (rec.trigger === 'wind-window' || rec.trigger === 'wind-above-reef') {
      cfg.appendChild(el('div', 'decision-maths',
        `Window ${Math.round(rec.windowMin)} min ${rec.windowMin >= rec.thresholdMin ? '≥' : '<'} threshold ${Math.round(rec.thresholdMin)} min`));
    }
    wrap.appendChild(cfg);
  }

  if (card.unexplainedConfigChange) {
    wrap.appendChild(el('p', 'decision-anomaly',
      'Sail config changed here but no decision record explains it — likely an engine bug.'));
  }

  return wrap;
}

function resultSection(card) {
  const leg = card.leg;
  const wrap = el('div', 'card-result');
  wrap.appendChild(el('div', 'card-section-label', `Result — Leg ${card.legIndex + 1}`));

  const fields = [
    ['Heading', `${leg.heading}°T`],
    ['Distance', `${leg.distance.toFixed(1)} NM`],
    ['Duration', formatDuration(leg.duration)],
    ['SoG', `${leg.sog.toFixed(1)} kn`],
    ['Wind', `${leg.windSpeed} kn from ${leg.windDir}°`],
    ['TWA', `${leg.windAngle}°${leg.tackSide ? ` (${leg.tackSide})` : ''}`],
    ['Point of sail', leg.windDescription]
  ];

  const grid = el('div', 'result-grid');
  for (const [label, value] of fields) {
    const row = el('div', 'result-field');
    row.appendChild(el('span', 'result-label', `${label}: `));
    row.appendChild(el('span', 'result-value', value));
    grid.appendChild(row);
  }
  wrap.appendChild(grid);

  if (card.maneuverAtEnd) {
    wrap.appendChild(el('div', `card-maneuver badge-${card.maneuverAtEnd}`,
      `Ends with a ${card.maneuverAtEnd.toUpperCase()}`));
  }
  if (card.comfortExceeded) {
    wrap.appendChild(el('div', 'card-comfort-warn', 'Above your max comfort wind'));
  }
  return wrap;
}

export function renderCard(card) {
  const node = el('article', 'trail-card');
  node.dataset.legIndex = String(card.legIndex);

  const header = el('div', 'card-header');
  const swatch = el('span', 'card-swatch');
  swatch.style.background = colourForConfig(card.config);
  header.appendChild(swatch);
  header.appendChild(el('span', 'card-title', `Leg ${card.legIndex + 1}`));
  header.appendChild(el('span', 'card-config', labelForConfig(card.config)));
  node.appendChild(header);

  node.appendChild(decisionSection(card));
  node.appendChild(resultSection(card));
  node.addEventListener('click', () => setSelected(card.legIndex, 'trail'));
  return node;
}
