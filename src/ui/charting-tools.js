import { distanceNm, bearing } from '../core/geometry.js';

// A draggable handle. Uses L.marker (not L.circleMarker — Leaflet ignores
// `draggable` on circle markers, which is why the old bar endpoints never
// moved). bubblingMouseEvents:false keeps a handle drag from also panning the
// map or dropping a waypoint.
function makeHandle(lat, lng, fill) {
  return L.marker([lat, lng], {
    draggable: true,
    bubblingMouseEvents: false,
    keyboard: false,
    icon: L.divIcon({
      className: 'chart-handle',
      html: `<span style="background:${fill}"></span>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    })
  });
}

export function addChartingTools(map) {
  const state = {
    activeTool: null,
    ruler: { vertices: [] },
    bars: []
  };

  // Bottom-right: the top-right corner is the Decision-trail panel's lane.
  const container = L.control({ position: 'bottomright' });

  container.onAdd = function(map) {
    const div = L.DomUtil.create('div', 'charting-tools');
    div.style.cssText = 'background:white;border-radius:6px;box-shadow:0 1px 5px rgba(0,0,0,0.2);padding:8px 10px;font-size:13px;line-height:1.4;min-width:150px;user-select:none;';
    div.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;font-weight:700;color:#1a6fb5;font-size:12px;letter-spacing:0.03em;">
        <span>CHARTING</span>
        <button id="charting-clearall" title="Clear all" style="background:none;border:none;cursor:pointer;font-size:14px;color:#6b7280;padding:0 4px;line-height:1;">✕</button>
      </div>
      <div style="display:flex;gap:4px;margin-bottom:4px;">
        <button id="btn-ruler" class="chart-btn">Ruler</button>
        <button id="btn-bar" class="chart-btn">Add Bar</button>
      </div>
      <div id="charting-info" style="font-size:11px;color:#6b7280;min-height:16px;font-family:monospace;white-space:pre-wrap;"></div>
    `;

    const btns = div.querySelectorAll('.chart-btn');
    btns.forEach(b => {
      b.style.cssText = 'flex:1;padding:5px 8px;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:11px;font-weight:500;background:#f9fafb;color:#374151;';
      b.addEventListener('mouseenter', () => { if (!b.classList.contains('active')) b.style.background = '#e5e7eb'; });
      b.addEventListener('mouseleave', () => { if (!b.classList.contains('active')) b.style.background = '#f9fafb'; });
    });

    div.querySelector('#btn-ruler').addEventListener('click', function() { toggleRuler(this); });
    div.querySelector('#btn-bar').addEventListener('click', addBar);
    div.querySelector('#charting-clearall').addEventListener('click', clearAll);
    L.DomEvent.disableClickPropagation(div);

    return div;
  };

  container.addTo(map);

  function setBtnActive(btn, active) {
    if (active) {
      btn.classList.add('active');
      btn.style.background = '#dbeafe';
      btn.style.borderColor = '#3b82f6';
      btn.style.color = '#1d4ed8';
    } else {
      btn.classList.remove('active');
      btn.style.background = '#f9fafb';
      btn.style.borderColor = '#d1d5db';
      btn.style.color = '#374151';
    }
  }

  function clearAll() {
    if (state.activeTool === 'ruler') deactivateRuler();
    clearRuler();
    while (state.bars.length) removeBar(state.bars[0]);
    updateInfo();
  }

  function clearRuler() {
    for (const v of state.ruler.vertices) {
      map.removeLayer(v.marker);
      if (v.line) map.removeLayer(v.line);
      if (v.tooltip) map.removeLayer(v.tooltip);
    }
    state.ruler.vertices = [];
    updateInfo();
  }

  function calcTotalDist() {
    let total = 0;
    const verts = state.ruler.vertices;
    for (let i = 1; i < verts.length; i++) {
      total += distanceNm(
        { lat: verts[i - 1].latlng.lat, lon: verts[i - 1].latlng.lng },
        { lat: verts[i].latlng.lat, lon: verts[i].latlng.lng }
      );
    }
    return total;
  }

  function updateInfo() {
    const el = document.querySelector('#charting-info');
    if (!el) return;

    if (state.activeTool === 'ruler') {
      el.textContent = 'Click to place points · Right-click/Backspace to undo · Double-click/Esc to finish';
      return;
    }

    const parts = [];

    if (state.ruler.vertices.length > 0) {
      const total = calcTotalDist();
      parts.push(`${state.ruler.vertices.length} pts · Total: ${total.toFixed(2)}NM`);
      parts.push('<a href="#" id="ruler-clear-link" style="color:#dc2626;text-decoration:none;font-weight:700;font-size:13px;" title="Clear ruler">×</a>');
    }

    if (state.bars.length > 0) {
      parts.push(`${state.bars.length} bar${state.bars.length > 1 ? 's' : ''}`);
    }

    el.innerHTML = parts.join(' · ') || '';

    const clearLink = el.querySelector('#ruler-clear-link');
    if (clearLink) {
      clearLink.addEventListener('click', (e) => {
        e.preventDefault();
        clearRuler();
      });
    }
  }

  function activateRuler() {
    state.activeTool = 'ruler';
    updateInfo();
    map.getContainer().style.cursor = 'crosshair';
    map.doubleClickZoom.disable();
  }

  function deactivateRuler() {
    state.activeTool = null;
    map.getContainer().style.cursor = '';
    map.doubleClickZoom.enable();
    const btn = document.querySelector('#btn-ruler');
    if (btn) setBtnActive(btn, false);
    if (state.ruler.vertices.length === 1) clearRuler();
    updateInfo();
  }

  function toggleRuler(btn) {
    if (state.activeTool === 'ruler') {
      deactivateRuler();
      setBtnActive(btn, false);
    } else {
      activateRuler();
      setBtnActive(btn, true);
    }
  }

  function undoLastPoint() {
    const verts = state.ruler.vertices;
    if (verts.length === 0) return;
    const last = verts.pop();
    map.removeLayer(last.marker);
    if (last.line) map.removeLayer(last.line);
    if (last.tooltip) map.removeLayer(last.tooltip);
    updateInfo();
  }

  function onMapClick(e) {
    if (state.activeTool !== 'ruler') return;

    const ll = e.latlng;
    const vertex = { latlng: ll };

    vertex.marker = L.circleMarker([ll.lat, ll.lng], {
      radius: 5, color: '#3b82f6', fillColor: '#60a5fa', fillOpacity: 0.9, weight: 2
    }).addTo(map);

    const prev = state.ruler.vertices.length > 0 ? state.ruler.vertices[state.ruler.vertices.length - 1] : null;

    if (prev) {
      const segDist = distanceNm(
        { lat: prev.latlng.lat, lon: prev.latlng.lng },
        { lat: ll.lat, lon: ll.lng }
      );
      const segBrg = bearing(
        { lat: prev.latlng.lat, lon: prev.latlng.lng },
        { lat: ll.lat, lon: ll.lng }
      );

      vertex.line = L.polyline([[prev.latlng.lat, prev.latlng.lng], [ll.lat, ll.lng]], {
        color: '#3b82f6', weight: 2, dashArray: '6,4', opacity: 0.7
      }).addTo(map);

      const mid = { lat: (prev.latlng.lat + ll.lat) / 2, lon: (prev.latlng.lng + ll.lng) / 2 };
      vertex.tooltip = L.tooltip({ permanent: true, direction: 'top', offset: [0, -5], className: 'chart-tooltip' })
        .setLatLng([mid.lat, mid.lon])
        .setContent(`${segBrg.toFixed(0)}° ${segDist.toFixed(2)}NM`)
        .addTo(map);
    }

    state.ruler.vertices.push(vertex);
    updateInfo();
  }

  function onMapDblClick(e) {
    if (state.activeTool !== 'ruler') return;
    deactivateRuler();
    const btn = document.querySelector('#btn-ruler');
    if (btn) setBtnActive(btn, false);
  }

  function onKeyDown(e) {
    if (state.activeTool === 'ruler') {
      if (e.key === 'Escape') {
        clearRuler();
        deactivateRuler();
        const btn = document.querySelector('#btn-ruler');
        if (btn) setBtnActive(btn, false);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        undoLastPoint();
      }
    }
  }

  function onContextMenu(e) {
    if (state.activeTool === 'ruler') {
      L.DomEvent.stopPropagation(e);
      e.originalEvent.preventDefault();
      undoLastPoint();
      return false;
    }
  }

  map.on('click', onMapClick);
  map.on('dblclick', onMapDblClick);
  map.on('contextmenu', onContextMenu);
  document.addEventListener('keydown', onKeyDown);

  function updateBarLabel(bar) {
    const a = bar.markerA.getLatLng();
    const b = bar.markerB.getLatLng();
    const d = distanceNm({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng });
    const brg = bearing({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng });
    bar.tooltip.setContent(`${d.toFixed(2)}NM ${brg.toFixed(0)}°`);
  }

  function updateBar(bar) {
    const a = bar.markerA.getLatLng();
    const b = bar.markerB.getLatLng();
    const cx = (a.lat + b.lat) / 2;
    const cy = (a.lng + b.lng) / 2;

    bar.line.setLatLngs([[a.lat, a.lng], [b.lat, b.lng]]);
    bar.centerHandle.setLatLng([cx, cy]);
    bar.deleteMarker.setLatLng([cx + 0.002, cy + 0.002]);
    bar.tooltip.setLatLng([cx, cy]);

    bar.offsetA = { lat: a.lat - cx, lng: a.lng - cy };
    bar.offsetB = { lat: b.lat - cx, lng: b.lng - cy };

    updateBarLabel(bar);
  }

  function removeBar(bar) {
    map.removeLayer(bar.markerA);
    map.removeLayer(bar.markerB);
    map.removeLayer(bar.centerHandle);
    map.removeLayer(bar.line);
    map.removeLayer(bar.tooltip);
    map.removeLayer(bar.deleteMarker);
    const idx = state.bars.indexOf(bar);
    if (idx !== -1) state.bars.splice(idx, 1);
    updateInfo();
  }

  function addBar() {
    const center = map.getCenter();
    const targetNm = 2;
    const latOffset = targetNm / 60;
    const cosLat = Math.cos(center.lat * Math.PI / 180);
    const lonOffset = targetNm / 60 / cosLat;

    const ptA = { lat: center.lat - latOffset * 0.5, lng: center.lng - lonOffset * 0.3 };
    const ptB = { lat: center.lat + latOffset * 0.5, lng: center.lng + lonOffset * 0.3 };

    const markerA = makeHandle(ptA.lat, ptA.lng, '#fbbf24').addTo(map);
    const markerB = makeHandle(ptB.lat, ptB.lng, '#fbbf24').addTo(map);

    const line = L.polyline([[ptA.lat, ptA.lng], [ptB.lat, ptB.lng]], {
      color: '#f59e0b', weight: 3, opacity: 0.8
    }).addTo(map);

    const cx = (ptA.lat + ptB.lat) / 2;
    const cy = (ptA.lng + ptB.lng) / 2;

    const tooltip = L.tooltip({ permanent: true, direction: 'top', offset: [0, -8], className: 'bar-tooltip' })
      .setLatLng([cx, cy])
      .setContent('')
      .addTo(map);

    const centerHandle = makeHandle(cx, cy, '#fff').addTo(map);

    const deleteMarker = L.marker([cx + 0.002, cy + 0.002], {
      icon: L.divIcon({
        html: '✕',
        className: 'bar-delete-icon',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      }),
      interactive: true
    }).addTo(map);

    const offsetA = { lat: ptA.lat - cx, lng: ptA.lng - cy };
    const offsetB = { lat: ptB.lat - cx, lng: ptB.lng - cy };

    const bar = { markerA, markerB, centerHandle, line, tooltip, deleteMarker, offsetA, offsetB };
    state.bars.push(bar);
    updateBarLabel(bar);

    markerA.on('drag', () => updateBar(bar));
    markerB.on('drag', () => updateBar(bar));

    centerHandle.on('drag', () => {
      const c = centerHandle.getLatLng();
      markerA.setLatLng([c.lat + bar.offsetA.lat, c.lng + bar.offsetA.lng]);
      markerB.setLatLng([c.lat + bar.offsetB.lat, c.lng + bar.offsetB.lng]);
      updateBar(bar);
    });

    deleteMarker.on('click', () => removeBar(bar));

    updateInfo();
    return bar;
  }

  return {
    clearAll,
    isRulerActive: () => state.activeTool === 'ruler',
    isToolActive: () => state.activeTool !== null
  };
}
