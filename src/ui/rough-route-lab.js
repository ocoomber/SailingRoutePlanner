// Dev-only (debug.html): the rough-route correction capture tool.
//
// Flow: drop a start + end, press "Generate rough route" (runs computeRoughRoute
// and loads it into the editor as the BASELINE), then edit the course and say
// why, then "Save log". We diff the baseline against the edited route and write
// a readable Markdown correction + a JSONL dataset row (server), so real skipper
// corrections become a corpus for hardening computeRoughRoute.
//
// It reuses the same generator, editor and route model as the everyday flow —
// the only new thing here is snapshotting the baseline and diffing against it.

import { computeRoughRoute } from '../core/rough-route.js';
import { buildRoughRouteLog } from '../core/rough-route-log.js';
import { createRoute, addWaypoint, toWaypoints, isPlannable } from '../core/route-model.js';
import { getCoastlineManager } from './app-state.js';
import { toRoutingOpts } from './settings-store.js';
import { postDevLog } from '../services/dev-log.js';
import { download } from './download.js';

let editor = null;
let afterRouteChange = () => {};
let baseline = null;
let els = null;

function collectEls() {
  const generate = document.getElementById('rrlab-generate');
  if (!generate) return null;
  return {
    generate,
    baseline: document.getElementById('rrlab-baseline'),
    diff: document.getElementById('rrlab-diff'),
    reason: document.getElementById('rrlab-reason'),
    save: document.getElementById('rrlab-save'),
    status: document.getElementById('rrlab-status')
  };
}

function setStatus(msg) {
  if (els?.status) els.status.textContent = msg || '';
}

function renderBaseline() {
  if (!els?.baseline) return;
  if (!baseline) { els.baseline.textContent = 'No baseline yet — set a start + end, then Generate.'; return; }
  const r = baseline.rough;
  els.baseline.textContent =
    `Baseline: ${r.legCount} leg(s), ${r.totalDistanceNm.toFixed(2)} NM, ` +
    `clean: ${r.reachedCleanly ? 'yes' : 'no'}, nodes: ${r.nodeCount}.`;
  if (els.save) els.save.disabled = false;
}

function distanceOf(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dLat = (b.lat - a.lat), dLon = (b.lon - a.lon) * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);
    sum += Math.hypot(dLat, dLon) * 60;
  }
  return sum;
}

export function refreshRoughRouteDiff() {
  if (!els?.diff || !baseline || !editor) return;
  const wps = toWaypoints(editor.getRoute());
  const dist = distanceOf(wps);
  const wpDelta = wps.length - baseline.rough.waypoints.length;
  const distDelta = dist - baseline.rough.totalDistanceNm;
  const sign = (n, dp) => (n > 0 ? '+' : '') + n.toFixed(dp);
  els.diff.textContent =
    `Edited: ${wps.length} waypoints (${sign(wpDelta, 0)}), ` +
    `${dist.toFixed(2)} NM (${sign(distDelta, 2)}).`;
}

function onGenerate() {
  const current = editor.getRoute();
  if (!isPlannable(current)) { setStatus('Drop a start and an end waypoint first.'); return; }
  const manager = getCoastlineManager();
  if (!manager) { setStatus('Data not loaded yet.'); return; }

  const wps = toWaypoints(current);
  const start = wps[0], end = wps[wps.length - 1];
  const routing = toRoutingOpts();
  const opts = {
    clearanceNm: routing.clearanceMargin,
    harbourClearanceNm: routing.harbourClearanceMargin,
    harbourZoneNm: routing.harbourZoneNm
  };
  const rough = computeRoughRoute(start, end, manager.getCoarseCoastline(), opts);

  const suggested = createRoute({ magneticVariationDeg: current.magneticVariationDeg });
  for (const p of rough.waypoints) addWaypoint(suggested, p);
  suggested.history.push({ at: new Date().toISOString(), op: 'suggest', legCount: rough.legCount });
  editor.setRoute(suggested);
  afterRouteChange(suggested);

  baseline = {
    inputs: {
      start: { lat: start.lat, lon: start.lon },
      end: { lat: end.lat, lon: end.lon },
      clearanceNm: opts.clearanceNm,
      harbourClearanceNm: opts.harbourClearanceNm,
      harbourZoneNm: opts.harbourZoneNm
    },
    rough,
    historyMark: suggested.history.length
  };
  renderBaseline();
  refreshRoughRouteDiff();
  setStatus('Baseline generated — now edit the course, give a reason, and Save log.');
}

async function onSave() {
  if (!baseline) { setStatus('Generate a baseline first.'); return; }
  const { markdown, record } = buildRoughRouteLog({
    baseline,
    finalRoute: editor.getRoute(),
    reason: els?.reason?.value?.trim() || null
  });
  const saved = await postDevLog('/rough-route-log', { markdown, record });
  if (saved) {
    setStatus(`Saved ${typeof saved === 'string' ? saved : 'to the server'} (+ dataset row).`);
  } else {
    const stamp = record.at.replace(/[:.]/g, '-');
    download(`rough-route-correction-${stamp}.md`, markdown, 'text/markdown');
    setStatus('No server — downloaded the correction as Markdown instead.');
  }
}

export function initRoughRouteLab(deps = {}) {
  els = collectEls();
  if (!els) return;
  editor = deps.editor;
  if (deps.afterRouteChange) afterRouteChange = deps.afterRouteChange;
  if (els.save) els.save.disabled = true;
  renderBaseline();
  els.generate.addEventListener('click', onGenerate);
  els.save?.addEventListener('click', onSave);
}
