// Nautical chart overlays. OpenSeaMap's seamark tiles show buoys, lights, depth
// contours and traffic-separation marks — what a skipper needs to judge
// clearance and lane crossings while drawing the rough course. It is a passive
// tile layer, so it lives in the registry (dependsOn: [] — never rebuilds) and
// toggles from the Layers panel like any other overlay.

export const SEAMARK_SWATCH = '#c026d3';

export function buildSeamarks() {
  return [
    L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
      maxZoom: 18,
      opacity: 0.9,
      attribution: '&copy; OpenSeaMap contributors'
    })
  ];
}
