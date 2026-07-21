// Entry point: loads data and wires the pieces together.
// Route running lives in passage-run.js, tile/inspector work in viewport.js,
// the drawn-route editor in route-editor.js.

import { loadPolars } from '../core/polar.js';
import { CoastlineManager } from '../data/coastline/index.js';
import { computeRoughRoute } from '../core/rough-route.js';
import {
  createRoute, addWaypoint, setWaypointNote, setMagneticVariation,
  reverseRoute, toWaypoints, isPlannable
} from '../core/route-model.js';
import { routeToGpx, routeToCsv, gpxToRoute, csvToRoute } from '../core/route-io.js';
import { loadRoute, saveRoute, clearRoute } from '../services/route-store.js';

import { initMap, getViewportBounds, panToLeg, clearChartingTools } from './map/map-core.js';
import { initRegistry, registerLayer, applySelection, clearAllLayers } from './map/layer-registry.js';
import { LAYER_DEFS } from './map/layer-defs.js';
import { renderLayersPanel } from './layers-panel.js';
import { showTrail, clearTrail, initTrailSync } from './trail-panel.js';
import { subscribe, clearSelection } from './selection.js';
import { setupTimeModeToggle, setDefaultDateTime } from './controls.js';
import { showError, hideError, showWarnings } from './status.js';
import { clearInspector } from './inspector.js';
import { loadSettings, toRoutingOpts } from './settings-store.js';
import { renderSettings } from './settings-view.js';
import { initViews } from './views.js';
import { initPanels } from './panels.js';
import { renderState, setPolars, setCoastlineManager, getCoastlineManager, redraw } from './app-state.js';
import { onViewportChanged, onCursorMove } from './viewport.js';
import { onCreateSailingPlan } from './passage-run.js';
import { initRouteEditor } from './route-editor.js';
import { initRoutePanel, renderRoutePanel } from './route-panel.js';
import { isDev } from './mode.js';
import { download } from './download.js';
import { initRoughRouteLab, refreshRoughRouteDiff } from './rough-route-lab.js';
import { initPassageLogButton } from './passage-log-button.js';
import { initReviewFlag } from './review-flag.js';
import { initTimeline } from './weather/timeline.js';
import '../services/weather-service.js';   // wires weather fetching to the layer toggles

let editor = null;

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
    calcBtn.textContent = 'Create Sailing Plan';
  }
}

// Every edit to the drawn route flows through here: persist it and refresh the
// panel. The editor owns its own map markers, so we don't redraw those.
function afterRouteChange(route) {
  saveRoute(route);
  renderRoutePanel(route);
  if (isDev()) refreshRoughRouteDiff();
}

// "Clear plan" wipes the computed result and the trail, but NOT the drawn route —
// losing a hand-drawn course must be a deliberate act (the Route panel's "Clear
// route"), never a side effect of clearing results.
function onClearPlan() {
  clearChartingTools();
  clearAllLayers();
  clearTrail();
  clearSelection();
  hideError();
  showWarnings(null);
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

// Seed the editor with an auto-generated rough course between the route's current
// endpoints, which the skipper then edits. Needs a start and an end to aim at.
function onSuggestRoute() {
  const current = editor.getRoute();
  if (!isPlannable(current)) {
    showError('Drop a start and an end waypoint first, then press Suggest to draw a course between them.');
    return;
  }
  const manager = getCoastlineManager();
  if (!manager) { showError('Data not loaded yet.'); return; }
  const wps = toWaypoints(current);
  const routing = toRoutingOpts();
  const rough = computeRoughRoute(wps[0], wps[wps.length - 1], manager.getCoarseCoastline(), {
    clearanceNm: routing.clearanceMargin,
    harbourClearanceNm: routing.harbourClearanceMargin,
    harbourZoneNm: routing.harbourZoneNm
  });
  const suggested = createRoute({ magneticVariationDeg: current.magneticVariationDeg });
  for (const p of rough.waypoints) addWaypoint(suggested, p);
  suggested.history.push({ at: new Date().toISOString(), op: 'suggest', legCount: rough.legCount });
  editor.setRoute(suggested);
  afterRouteChange(suggested);
  hideError();
}

function onExport(kind) {
  const route = editor.getRoute();
  if (!isPlannable(route)) { showError('Draw a route before exporting.'); return; }
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === 'gpx') download(`route-${stamp}.gpx`, routeToGpx(route), 'application/gpx+xml');
  else download(`route-${stamp}.csv`, routeToCsv(route), 'text/csv');
}

async function onImportFile(file) {
  try {
    const text = await file.text();
    const imported = file.name.toLowerCase().endsWith('.csv')
      ? csvToRoute(text)
      : gpxToRoute(text);
    if (!isPlannable(imported)) {
      showError(`Could not read a route with 2+ points from ${file.name}.`);
      return;
    }
    if (isPlannable(editor.getRoute()) &&
        !confirm('Importing replaces the route you have drawn. Continue?')) return;
    editor.setRoute(imported);
    afterRouteChange(imported);
    hideError();
  } catch (err) {
    showError(`Import failed: ${err.message}`);
  }
}

function routePanelHandlers() {
  return {
    onDeleteWaypoint: (id) => editor.removeWaypoint(id),
    onSetWaypointNote: (id, note) => {
      setWaypointNote(editor.getRoute(), id, note);
      afterRouteChange(editor.getRoute());
    },
    onSetVariation: (deg) => {
      setMagneticVariation(editor.getRoute(), deg);
      editor.redraw();
      afterRouteChange(editor.getRoute());
    },
    onReverse: () => {
      reverseRoute(editor.getRoute());
      editor.redraw();
      afterRouteChange(editor.getRoute());
    },
    onClearRoute: () => { clearRoute(); editor.clear(); },
    onSuggestRoute,
    onExport,
    onImportFile
  };
}

async function init() {
  loadSettings();

  const map = initMap({ onViewportChanged, onCursorMove, onMapClick: (latlng) => editor.addWaypointAt(latlng) });
  editor = initRouteEditor(map, { onRouteChanged: afterRouteChange });
  initRegistry(map);
  // The skipper UI carries only the layers a sailor needs (charts + route);
  // every diagnostic overlay is dev-only. The panel then renders from whatever
  // was registered, so it stays in step automatically.
  for (const def of LAYER_DEFS) {
    if (isDev() || def.userVisible) registerLayer(def);
  }
  renderLayersPanel(() => renderState);
  clearInspector();

  setupTimeModeToggle();
  setDefaultDateTime();
  initTimeline();

  document.getElementById('calculate-btn').addEventListener('click', onCreateSailingPlan);
  document.getElementById('clear-btn').addEventListener('click', onClearPlan);

  initRoutePanel(routePanelHandlers());

  // Restore the last drawn route, if any.
  const saved = loadRoute();
  editor.setRoute(saved || createRoute());
  renderRoutePanel(editor.getRoute());

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

  // Dev-only tooling (debug.html): the rough-route correction capture tool and
  // the on-demand passage-log download. Both no-op if their DOM is absent.
  if (isDev()) {
    initRoughRouteLab({ editor, afterRouteChange });
    initPassageLogButton();
    initReviewFlag({ editor });
  }

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
