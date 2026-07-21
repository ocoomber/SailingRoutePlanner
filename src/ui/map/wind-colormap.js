// Wind-speed colour ramp for the heatmap and its legend, Windy-style: cool
// blues in light airs through greens and ambers into the reds and purples a
// sailor reads as "reef" and "stay in harbour".

const STOPS = [
  [0,  0x62, 0x71, 0xB7],
  [5,  0x4B, 0x7B, 0xB0],
  [10, 0x4A, 0x94, 0xA9],
  [15, 0x4D, 0x8D, 0x7B],
  [20, 0x53, 0xA5, 0x53],
  [25, 0xA3, 0xA0, 0x2C],
  [30, 0xB9, 0x81, 0x36],
  [35, 0xBB, 0x5F, 0x3D],
  [40, 0xA3, 0x3E, 0x5C],
  [50, 0x7F, 0x2A, 0x68],
  [60, 0x52, 0x24, 0x5B]
];

export const MAX_SPEED = 60;   // knots; everything above clamps to the last stop

// 256-entry RGBA lookup table: index = speed / MAX_SPEED * 255, clamped.
export const COLORMAP_LUT = buildLut();

function buildLut() {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const speed = (i / 255) * MAX_SPEED;
    const [r, g, b] = interpolateStops(speed);
    lut[i * 4] = r;
    lut[i * 4 + 1] = g;
    lut[i * 4 + 2] = b;
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

function interpolateStops(speed) {
  if (speed <= STOPS[0][0]) return [STOPS[0][1], STOPS[0][2], STOPS[0][3]];
  for (let s = 0; s < STOPS.length - 1; s++) {
    const [v0, r0, g0, b0] = STOPS[s];
    const [v1, r1, g1, b1] = STOPS[s + 1];
    if (speed <= v1) {
      const f = (speed - v0) / (v1 - v0);
      return [
        Math.round(r0 + (r1 - r0) * f),
        Math.round(g0 + (g1 - g0) * f),
        Math.round(b0 + (b1 - b0) * f)
      ];
    }
  }
  const last = STOPS[STOPS.length - 1];
  return [last[1], last[2], last[3]];
}

export function lutIndexForSpeed(speed) {
  const i = Math.round((speed / MAX_SPEED) * 255);
  return i < 0 ? 0 : i > 255 ? 255 : i;
}

export function speedToColor(speed) {
  const i = lutIndexForSpeed(speed) * 4;
  return `rgb(${COLORMAP_LUT[i]}, ${COLORMAP_LUT[i + 1]}, ${COLORMAP_LUT[i + 2]})`;
}

// Legend entries for the Layers panel (it renders array swatches automatically).
export function colormapLegend() {
  const bands = [
    [0, '0–5 kn'], [5, '5–10 kn'], [10, '10–15 kn'], [15, '15–20 kn'],
    [20, '20–25 kn'], [25, '25–30 kn'], [30, '30–35 kn'], [35, '35–40 kn'],
    [40, '40–50 kn'], [50, '50+ kn']
  ];
  return bands.map(([speed, label]) => ({ colour: speedToColor(speed + 2), label }));
}
