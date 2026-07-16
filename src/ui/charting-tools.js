import { distanceNm, bearing } from '../core/geometry.js';

export function addChartingTools(map) {
  const ruler = { active: false, points: [], layers: [] };
  const bars = [];

  const container = L.control({ position: 'topright' });

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
        <button id="btn-bar" class="chart-btn">Bar</button>
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
    div.querySelector('#btn-bar').addEventListener('click', function() { addBar(); });
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

  function setInfo(text) {
    const el = document.querySelector('#charting-info');
    if (el) el.textContent = text;
  }

  function clearAll() {
    if (ruler.active) deactivateRuler();
    clearRuler();
    bars.forEach(b => removeBar(b));
    bars.length = 0;
    setInfo('');
  }

  function clearRuler() {
    ruler.layers.forEach(l => map.removeLayer(l));
    ruler.layers = [];
    ruler.points = [];
  }

  function activateRuler() {
    ruler.active = true;
    window.__chartingActive = true;
    setInfo('Click to place points · Double-click to finish');
    map.getContainer().style.cursor = 'crosshair';
    map.doubleClickZoom.disable();
  }

  function deactivateRuler() {
    ruler.active = false;
    window.__chartingActive = false;
    map.getContainer().style.cursor = '';
    map.doubleClickZoom.enable();
    const btn = document.querySelector('#btn-ruler');
    if (btn) setBtnActive(btn, false);
    if (ruler.points.length === 0) setInfo('');
  }

  function toggleRuler(btn) {
    if (ruler.active) {
      deactivateRuler();
      setBtnActive(btn, false);
    } else {
      activateRuler();
      setBtnActive(btn, true);
    }
  }

  function onMapClick(e) {
    if (!ruler.active) return;

    const pt = e.latlng;
    ruler.points.push(pt);

    const marker = L.circleMarker([pt.lat, pt.lng], {
      radius: 5, color: '#3b82f6', fillColor: '#60a5fa', fillOpacity: 0.9, weight: 2
    }).addTo(map);
    ruler.layers.push(marker);

    if (ruler.points.length >= 2) {
      const prev = ruler.points[ruler.points.length - 2];
      const segDist = distanceNm({ lat: prev.lat, lon: prev.lng }, { lat: pt.lat, lon: pt.lng });
      const segBrg = bearing({ lat: prev.lat, lon: prev.lng }, { lat: pt.lat, lon: pt.lng });

      const line = L.polyline([[prev.lat, prev.lng], [pt.lat, pt.lng]], {
        color: '#3b82f6', weight: 2, dashArray: '6,4', opacity: 0.7
      }).addTo(map);
      ruler.layers.push(line);

      const mid = { lat: (prev.lat + pt.lat) / 2, lon: (prev.lng + pt.lng) / 2 };
      const labelText = `${segBrg.toFixed(0)}° ${segDist.toFixed(2)}NM`;
      const label = L.tooltip({ permanent: true, direction: 'top', offset: [0, -5], className: 'chart-tooltip' })
        .setLatLng([mid.lat, mid.lon])
        .setContent(labelText)
        .addTo(map);
      ruler.layers.push(label);
    }

    let totalDist = 0;
    for (let i = 1; i < ruler.points.length; i++) {
      totalDist += distanceNm(
        { lat: ruler.points[i - 1].lat, lon: ruler.points[i - 1].lng },
        { lat: ruler.points[i].lat, lon: ruler.points[i].lng }
      );
    }
    setInfo(`${ruler.points.length} pts · Total: ${totalDist.toFixed(2)}NM`);
  }

  function onMapDblClick(e) {
    if (!ruler.active) return;
    deactivateRuler();
    const btn = document.querySelector('#btn-ruler');
    if (btn) setBtnActive(btn, false);
  }

  map.on('click', onMapClick);
  map.on('dblclick', onMapDblClick);

  function addBar() {
    const center = map.getCenter();
    const offset = 0.03;
    const ptA = { lat: center.lat - offset, lng: center.lng - offset * 0.6 };
    const ptB = { lat: center.lat + offset, lng: center.lng + offset * 0.6 };

    const markerA = L.circleMarker([ptA.lat, ptA.lng], {
      radius: 7, color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 0.9, weight: 2, draggable: true
    }).addTo(map);

    const markerB = L.circleMarker([ptB.lat, ptB.lng], {
      radius: 7, color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 0.9, weight: 2, draggable: true
    }).addTo(map);

    const line = L.polyline([[ptA.lat, ptA.lng], [ptB.lat, ptB.lng]], {
      color: '#f59e0b', weight: 3, opacity: 0.8
    }).addTo(map);

    const label = L.tooltip({ permanent: true, direction: 'top', offset: [0, -8], className: 'bar-tooltip' })
      .setLatLng([(ptA.lat + ptB.lat) / 2, (ptA.lng + ptB.lng) / 2])
      .setContent('')
      .addTo(map);

    const bar = { markerA, markerB, line, label };
    bars.push(bar);
    updateBarLabel(bar);

    markerA.on('drag', () => updateBar(bar));
    markerB.on('drag', () => updateBar(bar));

    return bar;
  }

  function updateBar(bar) {
    const a = bar.markerA.getLatLng();
    const b = bar.markerB.getLatLng();
    bar.line.setLatLngs([[a.lat, a.lng], [b.lat, b.lng]]);
    bar.label.setLatLng([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2]);
    updateBarLabel(bar);
  }

  function updateBarLabel(bar) {
    const a = bar.markerA.getLatLng();
    const b = bar.markerB.getLatLng();
    const d = distanceNm({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng });
    const brg = bearing({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng });
    bar.label.setContent(`${d.toFixed(2)}NM ${brg.toFixed(0)}°`);
  }

  function removeBar(bar) {
    map.removeLayer(bar.markerA);
    map.removeLayer(bar.markerB);
    map.removeLayer(bar.line);
    map.removeLayer(bar.label);
  }
}
