// Wind-speed colour gradient. The field is sampled on a coarse offscreen
// raster (one sample per RASTER_STEP screen pixels), pushed through the
// colormap LUT, then drawn scaled up with image smoothing on — the browser's
// bilinear upscale is what makes the gradient look continuous, for the cost of
// a few thousand samples instead of a million pixels.

import { CanvasOverlay } from './canvas-overlay.js';
import { COLORMAP_LUT, lutIndexForSpeed, colormapLegend } from '../wind-colormap.js';
import * as weatherStore from '../../weather/weather-store.js';

const RASTER_STEP = 6;   // CSS px between field samples
const OPACITY = 0.55;

const WindHeatmap = CanvasOverlay.extend({
  options: { pane: 'weather-heatmap', paneZIndex: 350 },

  _onAdded() {
    this._canvas.style.opacity = OPACITY;
  },

  setData() {
    this.requestRepaint();
  },

  _draw(ctx, size, map) {
    const field = weatherStore.getField();
    if (!field) return;
    const t = weatherStore.getTimeCursor();

    const gw = Math.ceil(size.x / RASTER_STEP) + 1;
    const gh = Math.ceil(size.y / RASTER_STEP) + 1;

    if (!this._off || this._off.width !== gw || this._off.height !== gh) {
      this._off = document.createElement('canvas');
      this._off.width = gw;
      this._off.height = gh;
      this._offCtx = this._off.getContext('2d');
      this._img = this._offCtx.createImageData(gw, gh);
    }

    // Web Mercator: longitude is linear in x and latitude constant per row, so
    // unproject once per row/column rather than per sample.
    const lons = new Float64Array(gw);
    for (let j = 0; j < gw; j++) {
      lons[j] = map.containerPointToLatLng([j * RASTER_STEP, 0]).lng;
    }
    const lats = new Float64Array(gh);
    for (let i = 0; i < gh; i++) {
      lats[i] = map.containerPointToLatLng([0, i * RASTER_STEP]).lat;
    }

    if (!this._speeds || this._speeds.length !== gw * gh) {
      this._speeds = new Float32Array(gw * gh);
    }
    weatherStore.sampleSpeedRaster(lats, lons, t, this._speeds);

    const data = this._img.data;
    for (let k = 0, p = 0; k < this._speeds.length; k++, p += 4) {
      const li = lutIndexForSpeed(this._speeds[k]) * 4;
      data[p] = COLORMAP_LUT[li];
      data[p + 1] = COLORMAP_LUT[li + 1];
      data[p + 2] = COLORMAP_LUT[li + 2];
      data[p + 3] = 255;
    }

    this._offCtx.putImageData(this._img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this._off, 0, 0, gw, gh, 0, 0, gw * RASTER_STEP, gh * RASTER_STEP);
  }
});

let instance = null;

// Singleton: the registry clears and re-adds the group on rebuild, but the
// canvas element and its offscreen buffers survive across data refreshes.
export function buildWindHeatmap(state) {
  if (!instance) instance = new WindHeatmap();
  instance.setData(state.weatherGrid);
  return [instance];
}

export { colormapLegend };
