// Entry point: loads data and wires the pieces together.
// Route running lives in passage-run.js, tile/inspector work in viewport.js.

import { loadPolars } from '../core/polar.js';
import { CoastlineManager } from '../data/coastline/index.js';

import { initMap, getViewportBounds, panToLeg, clearMarkers, clearChartingTools } from './map/map-core.js';
import { initRegistry, registerLayer, applySelection, clearAllLayers } from './map/layer-registry.js';
import { LAYER_DEFS } from './map/layer-defs.js';
import { renderLayersPanel } from './layers-panel.js';
import { showTrail, clearTrail, initTrailSync } from './trail-panel.js';
import { subscribe, clearSelection } from './selection.js';
import { setCoordinates, clearCoordinates, setupTimeModeToggle, setDefaultDateTime } from './controls.js';
import { showError, hideError, hideLog, showWarnings } from './status.js';
import { clearInspector } from './inspector.js';
import { loadSettings } from './settings-store.js';
import { renderSettings } from './settings-view.js';
import { initViews } from './views.js';
import { initPanels } from './panels.js';
import { renderState, setPolars, setCoastlineManager, getCoastlineManager, redraw } from './app-state.js';
import { onViewportChanged, onCursorMove } from './viewport.js';
import { onCalculate } from './passage-run.js';

async function loadData() {
  const calcBtn = document.getElementById('calculate-btn');
  calcBtn.disabled = true;
  calcBtn.textContent = 'Loading data…';

  try {
    const [polarsResp, coarseResp] = await Promise.all([
      fetch('src/data/polars/oceanis393.json'),
      fetch('src/data/coastline/sw-england-coarse.json')
    ]);
    if (!polarsResp.ok) throw new Error('Failed to load polar data');
    if (!coarseResp.ok) throw new Error('Failed to load coastline data');

    setPolars(loadPolars(await polarsResp.json()));

    const manager = new CoastlineManager();
    await manager.init(await coarseResp.json());
    setCoastlineManager(manager);

    renderState.tileZoom = manager.tileZoom;
    renderState.coastline = manager.getCoarseCoastline();
  } finally {
    calcBtn.disabled = false;
    calcBtn.textContent = 'Calculate Route';
  }
}

function onPointSelected(field, lat, lon) {
  setCoordinates(field, lat, lon);
}

function onClear() {
  clearMarkers();
  clearChartingTools();
  clearAllLayers();
  clearTrail();
  clearSelection();
  hideError();
  hideLog();
  showWarnings(null);
  clearCoordinates();
  renderState.legs = null;
  renderState.decisions = null;
  showTrail([], [], null);
  redraw();
}

// Pan only when the trail asked, so clicking a leg never yanks the map.
function onSelectionChange(selection, origin) {
  applySelection(selection);
  if (origin === 'trail' && selection.selectedLegIndex !== null && renderState.legs) {
    panToLeg(renderState.legs[selection.selectedLegIndex]);
  }
}

async function init() {
  loadSettings();

  const map = initMap(onPointSelected, { onViewportChanged, onCursorMove });
  initRegistry(map);
  for (const def of LAYER_DEFS) registerLayer(def);
  renderLayersPanel(() => renderState);
  clearInspector();

  setupTimeModeToggle();
  setDefaultDateTime();

  document.getElementById('calculate-btn').addEventListener('click', onCalculate);
  document.getElementById('clear-btn').addEventListener('click', onClear);

  const colourBy = document.getElementById('colour-by');
  if (colourBy) {
    colourBy.addEventListener('change', () => {
      renderState.colourBy = colourBy.value;
      redraw();
    });
  }

  subscribe(onSelectionChange);
  initTrailSync();
  initPanels();
  initViews({ onEnterSettings: renderSettings });
  showTrail([], [], null);

  try {
    await loadData();
    const bounds = getViewportBounds();
    if (bounds) await onViewportChanged(bounds);
  } catch (err) {
    console.error('Failed to load data:', err);
    showError('Failed to load application data. Check the console for details.');
  }
}

init();
