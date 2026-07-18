// Collapse/expand for the floating map panels.
//
// On a phone the panels would blanket the map, so they start collapsed as
// tappable chips and open one at a time as a drawer over the map.

import { refreshMapSize } from './map/map-core.js';

const isMobile = () => window.matchMedia('(max-width: 640px)').matches;

function setCollapsed(panel, btn, collapsed) {
  panel.classList.toggle('collapsed', collapsed);
  btn.textContent = collapsed ? '+' : '−';
  btn.setAttribute('aria-label', collapsed ? 'Expand panel' : 'Collapse panel');
}

export function initPanels() {
  const entries = [...document.querySelectorAll('.panel-collapse')]
    .map(btn => ({ btn, panel: document.getElementById(btn.dataset.panel) }))
    .filter(e => e.panel);

  for (const { btn, panel } of entries) {
    btn.addEventListener('click', () => {
      const willCollapse = !panel.classList.contains('collapsed');
      // On a phone an open panel covers the map, so only one is open at a time.
      if (!willCollapse && isMobile()) {
        for (const other of entries) {
          if (other.panel !== panel) setCollapsed(other.panel, other.btn, true);
        }
      }
      setCollapsed(panel, btn, willCollapse);
      refreshMapSize();
    });
  }

  // Start collapsed on small screens so the map is usable on load; each panel's
  // header stays as a chip ("Layers +") to reopen it.
  if (isMobile()) {
    for (const { btn, panel } of entries) setCollapsed(panel, btn, true);
  }
}
