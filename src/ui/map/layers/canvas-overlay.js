// Base class for full-viewport canvas overlays (heatmap, barbs, isobars).
//
// The canvas is a single screen-sized element repositioned on every move — the
// weather layers redraw from the compiled field each repaint, so nothing is
// cached in map space. During a zoom animation the previous frame is stretched
// with a CSS transform (as Windy does) and repainted crisply on moveend.
//
// Subclasses implement _draw(ctx, size, map) in CSS-pixel coordinates (the
// devicePixelRatio scaling is applied here) and may override _onAdded/_onRemoved.
// Every instance registers as a weather-store consumer while on the map, which
// is what gates API fetching, and repaints whenever the time cursor moves.

import * as weatherStore from '../../weather/weather-store.js';

export const CanvasOverlay = L.Layer.extend({
  initialize(options) {
    L.setOptions(this, options);
    this._raf = null;
    this._unsubTime = null;
  },

  onAdd(map) {
    this._map = map;
    if (!this._canvas) {
      this._canvas = L.DomUtil.create('canvas', 'weather-canvas');
      this._canvas.style.pointerEvents = 'none';
      this._ctx = this._canvas.getContext('2d');
    }
    // Weather canvases live in their own panes BELOW overlayPane (z 400), so
    // the route and other SVG overlays always draw on top of the weather.
    const paneName = this.options.pane || 'weather-lines';
    let pane = map.getPane(paneName);
    if (!pane) {
      pane = map.createPane(paneName);
      pane.style.zIndex = this.options.paneZIndex || 360;
      pane.style.pointerEvents = 'none';
    }
    pane.appendChild(this._canvas);

    map.on('moveend', this._reset, this);
    map.on('resize', this._reset, this);
    map.on('zoomanim', this._onZoomAnim, this);

    weatherStore.addConsumer(this);
    this._unsubTime = weatherStore.onTimeCursor(() => this.requestRepaint());

    this._reset();
    if (this._onAdded) this._onAdded(map);
  },

  onRemove(map) {
    map.off('moveend', this._reset, this);
    map.off('resize', this._reset, this);
    map.off('zoomanim', this._onZoomAnim, this);

    if (this._unsubTime) { this._unsubTime(); this._unsubTime = null; }
    weatherStore.removeConsumer(this);

    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    if (this._canvas && this._canvas.parentNode) {
      this._canvas.parentNode.removeChild(this._canvas);
    }
    if (this._onRemoved) this._onRemoved(map);
    this._map = null;
  },

  // Reposition + resize the canvas over the current viewport, then repaint.
  _reset() {
    const map = this._map;
    if (!map) return;
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
    this._canvas.style.width = `${size.x}px`;
    this._canvas.style.height = `${size.y}px`;
    if (this._canvas.width !== size.x * dpr || this._canvas.height !== size.y * dpr) {
      this._canvas.width = size.x * dpr;
      this._canvas.height = size.y * dpr;
    }
    this._zoomScale = null;
    this.requestRepaint();
  },

  // Stretch the existing frame during the zoom gesture so the layer tracks the
  // basemap instead of freezing; moveend repaints it properly.
  _onZoomAnim(e) {
    const map = this._map;
    if (!map) return;
    const scale = map.getZoomScale(e.zoom);
    const offset = map._latLngBoundsToNewLayerBounds(map.getBounds(), e.zoom, e.center).min;
    L.DomUtil.setTransform(this._canvas, offset, scale);
  },

  requestRepaint() {
    if (this._raf || !this._map) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._paint();
    });
  },

  _paint() {
    const map = this._map;
    if (!map) return;
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    const ctx = this._ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);
    this._draw(ctx, size, map);
  },

  _draw(_ctx, _size, _map) {}   // subclass hook, CSS-pixel coordinates
});
