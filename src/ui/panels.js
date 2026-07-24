// Map panels. On desktop they float and the − button collapses their body. On a
// phone they become off-canvas drawers: hidden off-screen, slid in from their
// own edge by a tab, and slid back out by the − button or the backdrop. Only one
// is open at a time, so the map is never covered by both.

import { refreshMapSize } from './map/map-core.js';

const isMobile = () => window.matchMedia('(max-width: 640px)').matches;

const LEFT_PANELS = new Set(['route-panel', 'layers-panel']);
const RIGHT_PANELS = new Set(['trail-panel', 'rrlab-panel']);

export function initPanels() {
  const panels = ['route-panel', 'layers-panel', 'trail-panel', 'rrlab-panel']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const backdrop = document.getElementById('panel-backdrop');
  const viewMap = document.getElementById('view-map');

  function closeAll() {
    for (const p of panels) p.classList.remove('open');
    if (backdrop) backdrop.classList.remove('visible');
    if (viewMap) viewMap.classList.remove('drawer-left-open', 'drawer-right-open');
  }

  function openPanel(panel) {
    for (const p of panels) p.classList.toggle('open', p === panel);
    if (backdrop) backdrop.classList.add('visible');
    if (viewMap) {
      viewMap.classList.toggle('drawer-left-open', LEFT_PANELS.has(panel.id));
      viewMap.classList.toggle('drawer-right-open', RIGHT_PANELS.has(panel.id));
    }
  }

  // Edge tabs open their drawer (mobile only — hidden on desktop).
  document.querySelectorAll('.panel-fab').forEach(fab => {
    fab.addEventListener('click', () => {
      const panel = document.getElementById(fab.dataset.open);
      if (panel) openPanel(panel);
    });
  });

  // The − button closes the drawer on a phone, or collapses the body on desktop.
  document.querySelectorAll('.panel-collapse').forEach(btn => {
    btn.addEventListener('click', () => {
      const panel = document.getElementById(btn.dataset.panel);
      if (!panel) return;
      if (isMobile()) {
        closeAll();
      } else {
        const collapsed = panel.classList.toggle('collapsed');
        btn.textContent = collapsed ? '+' : '−';
        refreshMapSize();
      }
    });
  });

  if (backdrop) backdrop.addEventListener('click', closeAll);

  // If the phone is rotated to a wide layout, drop any open-drawer state so the
  // desktop floating layout isn't left with a stuck backdrop.
  window.addEventListener('resize', () => { if (!isMobile()) closeAll(); });
}
