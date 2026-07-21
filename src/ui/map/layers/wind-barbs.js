// Meteorological wind barbs on a screen-space grid: one barb per cell of
// CELL_PX pixels, so density stays constant across zoom levels. Standard
// glyphs — pennant 50 kn, full barb 10, half barb 5, speed rounded to the
// nearest 5; a small circle for near-calm. Barbs fly with the staff pointing
// INTO the wind (the feathers sit on the windward end), the convention on
// every synoptic chart.

import { CanvasOverlay } from './canvas-overlay.js';
import * as weatherStore from '../../weather/weather-store.js';

const CELL_PX = 72;
const STAFF_LEN = 26;
const BARB_LEN = 10;
const HALF_LEN = 5.5;
const BARB_SPACING = 4.5;
const CALM_RADIUS = 3;

const WindBarbs = CanvasOverlay.extend({
  options: { pane: 'weather-lines', paneZIndex: 360 },

  setData() {
    this.requestRepaint();
  },

  _draw(ctx, size, map) {
    const field = weatherStore.getField();
    if (!field) return;
    const t = weatherStore.getTimeCursor();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const cols = Math.ceil(size.x / CELL_PX);
    const rows = Math.ceil(size.y / CELL_PX);

    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const x = (j + 0.5) * CELL_PX;
        const y = (i + 0.5) * CELL_PX;
        const ll = map.containerPointToLatLng([x, y]);
        const s = weatherStore.sampleField(ll.lat, ll.lng, t);
        if (!s) continue;
        drawBarb(ctx, x, y, s.speed, s.direction);
      }
    }
  }
});

function drawBarb(ctx, x, y, speed, direction) {
  // White halo first, dark glyph on top, for readability over the heatmap.
  for (const [style, width] of [['rgba(255,255,255,0.85)', 3.5], ['#1f2937', 1.4]]) {
    ctx.strokeStyle = style;
    ctx.fillStyle = style;
    ctx.lineWidth = width;
    strokeBarb(ctx, x, y, speed, direction, width);
  }
}

function strokeBarb(ctx, x, y, speed, direction, width) {
  const rounded = Math.round(speed / 5) * 5;

  if (rounded < 5) {
    ctx.beginPath();
    ctx.arc(x, y, CALM_RADIUS + (width > 2 ? 1 : 0), 0, Math.PI * 2);
    ctx.stroke();
    return;
  }

  ctx.save();
  ctx.translate(x, y);
  // Canvas y is down; a met barb's staff extends toward where the wind comes
  // FROM. direction is "from" in degrees clockwise from north.
  ctx.rotate((direction + 180) * Math.PI / 180);

  // Staff from the site (origin) upward-in-local-space to the feather end.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, STAFF_LEN);
  ctx.stroke();

  let remaining = rounded;
  let pos = STAFF_LEN;

  // Pennants (50 kn): filled triangles at the staff tip.
  while (remaining >= 50) {
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(BARB_LEN, pos - 2);
    ctx.lineTo(0, pos - 6);
    ctx.closePath();
    ctx.fill();
    pos -= 7;
    remaining -= 50;
  }

  // Full barbs (10 kn) and the half barb (5 kn), slanted like feathers.
  while (remaining >= 10) {
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(BARB_LEN, pos + 3.5);
    ctx.stroke();
    pos -= BARB_SPACING;
    remaining -= 10;
  }
  if (remaining >= 5) {
    // A lone half barb sits one spacing down from the tip, never at the very end.
    if (rounded === 5) pos -= BARB_SPACING;
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(HALF_LEN, pos + 2);
    ctx.stroke();
  }

  ctx.restore();
}

let instance = null;

export function buildWindBarbs(state) {
  if (!instance) instance = new WindBarbs();
  instance.setData(state.weatherGrid);
  return [instance];
}
