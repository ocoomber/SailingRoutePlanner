// Renders the Layers panel straight from the registry definitions, so a layer's
// toggle, swatch and explanation always match what it actually draws.

import { getDefs, setLayerVisible, isVisible } from './map/layer-registry.js';

let onToggle = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function swatchNode(swatch) {
  if (Array.isArray(swatch)) {
    const wrap = el('span', 'layer-swatch-legend');
    for (const entry of swatch) {
      const dot = el('span', 'layer-swatch-dot');
      dot.style.background = entry.colour;
      dot.title = entry.label;
      wrap.appendChild(dot);
    }
    return wrap;
  }
  const dot = el('span', 'layer-swatch');
  dot.style.background = swatch;
  return dot;
}

function legendNode(swatch) {
  if (!Array.isArray(swatch)) return null;
  const list = el('div', 'layer-legend');
  for (const entry of swatch) {
    const row = el('div', 'layer-legend-row');
    const dot = el('span', 'layer-swatch');
    dot.style.background = entry.colour;
    row.appendChild(dot);
    row.appendChild(el('span', 'layer-legend-label', entry.label));
    list.appendChild(row);
  }
  return list;
}

function buildLayerRow(def) {
  const row = el('div', 'layer-row');

  const head = el('label', 'layer-head');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = isVisible(def.id);
  box.addEventListener('change', () => {
    setLayerVisible(def.id, box.checked, onToggle ? onToggle() : null);
  });
  head.appendChild(box);
  head.appendChild(swatchNode(def.swatch));
  head.appendChild(el('span', 'layer-label', def.label));
  row.appendChild(head);

  row.appendChild(el('p', 'layer-description', def.description));
  const legend = legendNode(def.swatch);
  if (legend) row.appendChild(legend);

  return row;
}

export function renderLayersPanel(getState) {
  onToggle = getState;
  const container = document.getElementById('layers-content');
  if (!container) return;
  container.innerHTML = '';

  const groups = [];
  for (const def of getDefs()) {
    let group = groups.find(g => g.name === def.group);
    if (!group) { group = { name: def.group, defs: [] }; groups.push(group); }
    group.defs.push(def);
  }

  for (const group of groups) {
    const section = el('section', 'layer-group');
    section.appendChild(el('h3', 'layer-group-title', group.name));
    for (const def of group.defs) section.appendChild(buildLayerRow(def));
    container.appendChild(section);
  }
}
