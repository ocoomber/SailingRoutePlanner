// Collapse/expand for the floating map panels.

import { refreshMapSize } from './map/map-core.js';

export function initPanels() {
  const buttons = document.querySelectorAll('.panel-collapse');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.dataset.panel);
      if (!panel) return;
      const collapsed = panel.classList.toggle('collapsed');
      btn.textContent = collapsed ? '+' : '−';
      refreshMapSize();
    });
  });
}
