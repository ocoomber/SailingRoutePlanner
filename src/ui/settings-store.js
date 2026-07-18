// Persists ONLY the values you have changed, keyed by schema path:
//   { "engineOffWindKn": 7, "minWorthwhileDurationMin.headsail": 30 }
//
// Sparse, not a full snapshot: anything you have not touched keeps following the
// engine defaults, so tuning a default in code still reaches you. It also makes
// "changed from default" a one-line check and per-field reset a delete.

import { DEFAULT_COMFORT_PARAMS } from '../core/comfort-params.js';
import { ROUTING_DEFAULTS, allFields } from './settings-schema.js';

const STORAGE_KEY = 'srp.settings.v1';

let overrides = {};

function knownPaths() {
  return new Set(allFields().map(f => f.path));
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { overrides = {}; return overrides; }
    const parsed = JSON.parse(raw);
    const known = knownPaths();
    overrides = {};
    for (const [path, value] of Object.entries(parsed)) {
      if (known.has(path)) overrides[path] = value; // drop paths the schema no longer has
    }
  } catch (err) {
    console.warn('Could not read saved settings, starting from defaults:', err);
    overrides = {};
  }
  return overrides;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch (err) {
    console.warn('Could not save settings:', err);
  }
}

function readPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function writePath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur[keys[i]] = cur[keys[i]] || {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

export function defaultFor(path) {
  const routing = readPath(ROUTING_DEFAULTS, path);
  if (routing !== undefined) return routing;
  return readPath(DEFAULT_COMFORT_PARAMS, path);
}

export function getValue(path) {
  return path in overrides ? overrides[path] : defaultFor(path);
}

export function setValue(path, value) {
  const def = defaultFor(path);
  if (value === def || (value === null && def === null)) {
    delete overrides[path];
  } else {
    overrides[path] = value;
  }
  persist();
}

export function isChanged(path) {
  return path in overrides;
}

export function resetField(path) {
  delete overrides[path];
  persist();
}

export function resetAll() {
  overrides = {};
  persist();
}

export function changedCount() {
  return Object.keys(overrides).length;
}

// Sparse overrides -> the nested object mergeComfortParams expects.
export function toComfortParams() {
  const out = {};
  for (const field of allFields()) {
    if (field.section !== 'comfort') continue;
    writePath(out, field.path, getValue(field.path));
  }
  return out;
}

export function toRoutingOpts() {
  return {
    timeStep: getValue('timeStep'),
    headingThreshold: getValue('headingThreshold'),
    clearanceMargin: getValue('clearanceMargin'),
    harbourClearanceMargin: getValue('harbourClearanceMargin'),
    harbourZoneNm: getValue('harbourZoneNm'),
    corridorWidthNm: getValue('corridorWidthNm'),
    headingsPerStep: getValue('headingsPerStep')
  };
}
