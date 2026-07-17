// Live cursor inspector — renders the map-debug readout footer.
// Tells you, for the point under the cursor, which land source resolves
// (fine detail tile vs coarse fallback) and why.

function fmtCoord(value, posChar, negChar) {
  const dir = value >= 0 ? posChar : negChar;
  return `${Math.abs(value).toFixed(4)}°${dir}`;
}

function sourceLabel(tileInfo) {
  if (!tileInfo) return { text: 'source —', cls: 'insp-source-none' };
  if (tileInfo.inRegion === false) {
    return { text: 'out of region', cls: 'insp-source-none' };
  }
  if (tileInfo.existsInManifest === false) {
    return { text: 'open water (no land tile)', cls: 'insp-source-water' };
  }
  if (tileInfo.loaded) {
    return { text: 'source FINE', cls: 'insp-source-fine' };
  }
  return { text: 'source COARSE (loading…)', cls: 'insp-source-coarse' };
}

export function updateInspector({ lat, lon, tileInfo, containsLand }) {
  const el = document.getElementById('inspector');
  if (!el) return;

  const parts = [];
  parts.push(`<span class="insp-coord">${fmtCoord(lat, 'N', 'S')} ${fmtCoord(lon, 'E', 'W')}</span>`);

  if (tileInfo) {
    const loadedMark = tileInfo.loaded ? '✓' : (tileInfo.existsInManifest === false ? '—' : '…');
    parts.push(`<span class="insp-tile">tile ${tileInfo.key} ${loadedMark}</span>`);
  }

  const src = sourceLabel(tileInfo);
  parts.push(`<span class="insp-source ${src.cls}">${src.text}</span>`);

  if (containsLand !== null && containsLand !== undefined) {
    parts.push(`<span class="insp-land ${containsLand ? 'insp-land-yes' : 'insp-land-no'}">land: ${containsLand ? 'yes' : 'no'}</span>`);
  }

  el.innerHTML = parts.join('<span class="insp-sep">·</span>');
}

export function clearInspector() {
  const el = document.getElementById('inspector');
  if (el) el.innerHTML = '<span class="insp-hint">Move the cursor over the map to inspect land data</span>';
}
