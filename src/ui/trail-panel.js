// The Decision trail panel: renders the cards and keeps them in step with the map.

import { formatConfigDecision, formatDecision } from '../core/explain.js';
import { labelForConfig } from './map/leg-styles.js';
import { subscribe, getSelection } from './selection.js';
import { el, renderCard } from './trail-card-view.js';

const MAX_HEADING_ENTRIES = 40;

let cardElements = new Map();

function renderRejections(rejected) {
  const wrap = el('section', 'trail-rejections');
  const details = el('details');
  details.appendChild(el('summary', null, `Refused changes (${rejected.length})`));
  details.appendChild(el('p', 'hint',
    'Considered and turned down. These sit on the coarse-pass timeline and cannot be tied to a specific leg, so they are listed here rather than guessed onto a card.'));
  for (const rec of rejected) {
    const item = el('div', 'rejection-item');
    item.appendChild(el('div', 'decision-config-head',
      `${labelForConfig(rec.from)} → ${labelForConfig(rec.to)} (refused)`));
    item.appendChild(el('p', 'decision-text', formatConfigDecision(rec)));
    details.appendChild(item);
  }
  wrap.appendChild(details);
  return wrap;
}

// Heading records fire once per router step, so they far outnumber the legs and
// deliberately are not attached to cards.
function renderHeadingLog(decisions) {
  const headings = (decisions || []).filter(d => d.kind === 'heading');
  if (headings.length === 0) return null;

  const wrap = el('section', 'trail-headings');
  const details = el('details');
  details.appendChild(el('summary', null, `Heading evaluations (${headings.length})`));
  details.appendChild(el('p', 'hint',
    'One per router step — far more of these than legs, so they are not tied to cards.'));
  for (const rec of headings.slice(0, MAX_HEADING_ENTRIES)) {
    details.appendChild(el('p', 'decision-text small', formatDecision(rec)));
  }
  if (headings.length > MAX_HEADING_ENTRIES) {
    details.appendChild(el('p', 'hint', `…${headings.length - MAX_HEADING_ENTRIES} more in the raw planner log.`));
  }
  wrap.appendChild(details);
  return wrap;
}

export function showTrail(cardModels, rejected, decisions) {
  cardElements = new Map();

  const container = document.getElementById('trail-content');
  if (!container) return;
  container.innerHTML = '';

  if (!cardModels || cardModels.length === 0) {
    container.appendChild(el('p', 'hint', 'No route yet — set a start and end, then Calculate.'));
    return;
  }

  for (const card of cardModels) {
    const node = renderCard(card);
    cardElements.set(card.legIndex, node);
    container.appendChild(node);
  }

  if (rejected && rejected.length > 0) container.appendChild(renderRejections(rejected));
  const headingLog = renderHeadingLog(decisions);
  if (headingLog) container.appendChild(headingLog);

  applySelection(getSelection(), 'init');
}

export function clearTrail() {
  cardElements = new Map();
  const container = document.getElementById('trail-content');
  if (container) container.innerHTML = '';
}

function applySelection(selection, origin) {
  cardElements.forEach((node, index) => {
    node.classList.toggle('selected', selection.selectedLegIndex === index);
    node.classList.toggle('hovered', selection.hoveredLegIndex === index);
  });

  // Only scroll when the map asked — otherwise clicking a card would scroll it
  // out from under the cursor.
  if (origin === 'map' && selection.selectedLegIndex !== null) {
    const node = cardElements.get(selection.selectedLegIndex);
    if (node) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

export function initTrailSync() {
  subscribe(applySelection);
}
