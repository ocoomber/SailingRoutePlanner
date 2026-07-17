// Shared UI state: the loaded data and the render state the layers draw from.
//
// Layers rebuild only when their declared dependencies change identity, so
// always REPLACE a key on renderState — never mutate the object it points at.

import { render } from './map/layer-registry.js';

export const renderState = {
  legs: null,
  decisions: null,
  coastline: null,
  coastlineManager: null,
  bounds: null,
  tileZoom: 12,
  tileEpoch: 0,
  colourBy: 'config'
};

let polars = null;
let coastlineManager = null;

export function setPolars(value) { polars = value; }
export function getPolars() { return polars; }

export function setCoastlineManager(value) {
  coastlineManager = value;
  renderState.coastlineManager = value;
}
export function getCoastlineManager() { return coastlineManager; }

export function redraw() {
  render(renderState);
}
