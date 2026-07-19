// The Route panel: the leg table, totals, magnetic variation, and the route
// actions (suggest, reverse, clear, import/export). It renders straight from the
// route model and calls back to the editor/app for every edit. Notes are the
// one-tap intent capture — why this waypoint, this side of the lane — kept
// optional so a bare route stays a bare route.

import { routeLegs, totalDistanceNm } from '../core/route-model.js';

let handlers = {};

export function initRoutePanel(h) {
  handlers = h || {};

  document.getElementById('route-suggest')?.addEventListener('click', () => handlers.onSuggestRoute?.());
  document.getElementById('route-reverse')?.addEventListener('click', () => handlers.onReverse?.());
  document.getElementById('route-clear')?.addEventListener('click', () => handlers.onClearRoute?.());
  document.getElementById('route-export-gpx')?.addEventListener('click', () => handlers.onExportGpx?.());
  document.getElementById('route-export-csv')?.addEventListener('click', () => handlers.onExportCsv?.());

  const importInput = document.getElementById('route-import-file');
  document.getElementById('route-import')?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handlers.onImportFile?.(file);
    e.target.value = ''; // allow re-importing the same file
  });

  const varInput = document.getElementById('route-variation');
  const varSign = document.getElementById('route-variation-sign');
  const emitVar = () => {
    const mag = Math.abs(parseFloat(varInput.value) || 0);
    handlers.onSetVariation?.(varSign.value === 'W' ? mag : -mag);
  };
  varInput?.addEventListener('change', emitVar);
  varSign?.addEventListener('change', emitVar);
}

export function renderRoutePanel(route) {
  const el = document.getElementById('route-content');
  if (!el) return;

  const wps = route.waypoints;
  if (wps.length === 0) {
    el.innerHTML = `<p class="route-empty">Click the map to drop waypoints and draw your rough course. Then press <strong>Create Sailing Plan</strong>.</p>`;
    return;
  }

  const legs = routeLegs(route);
  const varDeg = route.magneticVariationDeg || 0;

  const rows = wps.map((wp, i) => {
    const leg = legs[i]; // leg leaving this waypoint (undefined for the last)
    const kind = i === 0 ? 'Start' : i === wps.length - 1 ? 'End' : `${i + 1}`;
    const legText = leg
      ? `${leg.distanceNm.toFixed(2)} NM · ${leg.bearingTrue.toFixed(0)}°T${varDeg ? `/${leg.bearingMag.toFixed(0)}°M` : ''}`
      : '<span class="route-dim">—</span>';
    const hasNote = !!wp.note;
    return `
      <tr data-id="${wp.id}">
        <td class="route-num">${kind}</td>
        <td class="route-leg">${legText}</td>
        <td class="route-note-cell">
          <button class="route-note-btn${hasNote ? ' has-note' : ''}" data-id="${wp.id}" title="${hasNote ? 'Edit note' : 'Add a note'}">✎</button>
        </td>
        <td><button class="route-del" data-id="${wp.id}" title="Delete waypoint">✕</button></td>
      </tr>
      ${hasNote ? `<tr class="route-note-row" data-id="${wp.id}"><td colspan="4">${escapeHtml(wp.note)}</td></tr>` : ''}`;
  }).join('');

  el.innerHTML = `
    <table class="route-table">
      <thead><tr><th>#</th><th>Leg</th><th></th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="route-totals">${wps.length} waypoints · ${legs.length} legs · ${totalDistanceNm(route).toFixed(1)} NM total</p>`;

  el.querySelectorAll('.route-del').forEach(btn =>
    btn.addEventListener('click', () => handlers.onDeleteWaypoint?.(btn.dataset.id)));
  el.querySelectorAll('.route-note-btn').forEach(btn =>
    btn.addEventListener('click', () => openNoteEditor(btn.dataset.id, route)));

  // Reflect the stored variation into the inputs.
  const varInput = document.getElementById('route-variation');
  const varSign = document.getElementById('route-variation-sign');
  if (varInput && varSign) {
    varInput.value = Math.abs(varDeg) || '';
    varSign.value = varDeg < 0 ? 'E' : 'W';
  }
}

function openNoteEditor(id, route) {
  const wp = route.waypoints.find(w => w.id === id);
  if (!wp) return;
  const row = document.querySelector(`.route-table tr[data-id="${id}"]`);
  if (!row || row.nextElementSibling?.classList.contains('route-note-editor')) return;

  const editor = document.createElement('tr');
  editor.className = 'route-note-editor';
  editor.innerHTML = `<td colspan="4">
    <textarea class="route-note-input" rows="2" placeholder="Why this waypoint? (clearance, hazard, TSS…)">${escapeHtml(wp.note || '')}</textarea>
    <div class="route-note-actions"><button class="route-note-save">Save</button><button class="route-note-cancel">Cancel</button></div>
  </td>`;
  row.after(editor);

  const textarea = editor.querySelector('.route-note-input');
  textarea.focus();
  editor.querySelector('.route-note-save').addEventListener('click', () => {
    handlers.onSetWaypointNote?.(id, textarea.value);
  });
  editor.querySelector('.route-note-cancel').addEventListener('click', () => editor.remove());
}

function escapeHtml(s) {
  return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
