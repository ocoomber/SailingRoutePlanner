// Owns every Leaflet mutation for overlays. Layer builders stay pure and never
// touch the map; this module is the only place layers are added or removed.
//
// Two rules keep it fast and non-janky:
//  1. Visibility is addLayer/removeLayer on a persistent group — NEVER a rebuild.
//     Toggling stays instant and never loses selection.
//  2. Selection restyles existing handles — NEVER triggers render(). Rebuilding
//     every polyline on hover would flicker and drop Leaflet event bindings.

const defs = [];
const groups = new Map();
const handles = new Map();
const visible = new Map();
const dirty = new Set();
const lastDeps = new Map();

let mapRef = null;

export function initRegistry(map) {
  mapRef = map;
}

export function registerLayer(def) {
  defs.push(def);
  groups.set(def.id, L.layerGroup());
  visible.set(def.id, !!def.defaultOn);
  dirty.add(def.id);
}

export function getDefs() {
  return defs.slice();
}

export function isVisible(id) {
  return !!visible.get(id);
}

function findDef(id) {
  return defs.find(d => d.id === id);
}

export function setLayerVisible(id, show, state) {
  const group = groups.get(id);
  if (!group || !mapRef) return;
  visible.set(id, show);

  if (!show) {
    mapRef.removeLayer(group);
    return;
  }

  // Hidden layers skip rebuilds; catch up lazily the first time they're shown.
  if (dirty.has(id) && state) rebuild(findDef(id), state);
  mapRef.addLayer(group);
}

function depsChanged(def, state) {
  const prev = lastDeps.get(def.id);
  const next = (def.dependsOn || []).map(key => state[key]);
  if (!prev || prev.length !== next.length) return true;
  return next.some((value, i) => value !== prev[i]);
}

function rebuild(def, state) {
  const group = groups.get(def.id);
  group.clearLayers();
  handles.delete(def.id);

  const built = def.build(state) || [];
  const layers = Array.isArray(built) ? built : built.layers || [];
  if (!Array.isArray(built) && built.handles) handles.set(def.id, built.handles);

  for (const layer of layers) group.addLayer(layer);

  lastDeps.set(def.id, (def.dependsOn || []).map(key => state[key]));
  dirty.delete(def.id);
}

// Rebuilds only the layers whose declared state dependencies actually changed.
export function render(state) {
  if (!mapRef) return;
  for (const def of defs) {
    const changed = depsChanged(def, state);
    if (changed) dirty.add(def.id);

    if (!visible.get(def.id)) {
      mapRef.removeLayer(groups.get(def.id));
      continue;
    }

    if (dirty.has(def.id)) rebuild(def, state);
    mapRef.addLayer(groups.get(def.id));
  }
}

export function applySelection(selection) {
  for (const def of defs) {
    if (!def.applySelection) continue;
    const layerHandles = handles.get(def.id);
    if (layerHandles) def.applySelection(layerHandles, selection);
  }
}

export function getHandles(id) {
  return handles.get(id);
}

export function clearAllLayers() {
  for (const def of defs) {
    groups.get(def.id).clearLayers();
    dirty.add(def.id);
  }
  handles.clear();
  lastDeps.clear();
}
