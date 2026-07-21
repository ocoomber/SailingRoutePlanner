// Isobars: MSL pressure contoured at 2 hPa (widening automatically when the
// range is large), redrawn per time-cursor move from the lerped pressure field.
// Drawn on canvas rather than as SVG polylines so animation is a repaint, not
// a rebuild.

import { CanvasOverlay } from './canvas-overlay.js';
import { contourField } from '../../../core/contour.js';
import * as weatherStore from '../../weather/weather-store.js';

const LINE_STYLE = '#374151';
const LABEL_FONT = '11px system-ui, sans-serif';

const IsobarLayer = CanvasOverlay.extend({
  options: { pane: 'weather-lines', paneZIndex: 360 },

  setData() {
    this.requestRepaint();
  },

  _draw(ctx, size, map) {
    const p = weatherStore.pressureFieldAt(weatherStore.getTimeCursor());
    if (!p) return;
    const { values, w, h, lats, lons } = p;

    const contours = contourField(values, w, h, { factor: 6, maxLines: 12 });
    if (contours.length === 0) return;

    ctx.lineWidth = 1.2;
    ctx.strokeStyle = LINE_STYLE;
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Fractional lattice [row, col] -> screen. Rows follow the lats axis
    // (north->south), cols the lons axis (west->east); both may be non-uniform,
    // so interpolate along the axis arrays.
    const toScreen = ([r, c]) => {
      const lat = axisValue(lats, r);
      const lon = axisValue(lons, c);
      const pt = map.latLngToContainerPoint([lat, lon]);
      return [pt.x, pt.y];
    };

    for (const { level, points } of contours) {
      if (points.length < 2) continue;
      const screen = points.map(toScreen);

      ctx.beginPath();
      ctx.moveTo(screen[0][0], screen[0][1]);
      for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i][0], screen[i][1]);
      ctx.stroke();

      drawLabel(ctx, screen, String(Math.round(level)));
    }
  }
});

function axisValue(axis, frac) {
  const i0 = Math.max(0, Math.min(Math.floor(frac), axis.length - 1));
  const i1 = Math.min(i0 + 1, axis.length - 1);
  return axis[i0] + (axis[i1] - axis[i0]) * (frac - i0);
}

// One label per contour, at the middle vertex, haloed and only when that
// vertex is actually on screen.
function drawLabel(ctx, screen, text) {
  const [x, y] = screen[Math.floor(screen.length / 2)];
  if (x < 20 || y < 12 || x > ctx.canvas.clientWidth - 20 || y > ctx.canvas.clientHeight - 12) return;

  const wText = ctx.measureText(text).width;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(x - wText / 2 - 3, y - 8, wText + 6, 16);
  ctx.fillStyle = LINE_STYLE;
  ctx.fillText(text, x, y);
  ctx.restore();
}

let instance = null;

export function buildIsobars(state) {
  if (!instance) instance = new IsobarLayer();
  instance.setData(state.weatherGrid);
  return [instance];
}
