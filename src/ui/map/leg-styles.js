// Pure styling rules for route legs. Single source of truth for what each sail
// configuration looks like — the map legend and the trail cards both read it.

// Legs from route-only/geometry mode carry no `config` at all, so UNKNOWN is a
// real case, not a defensive nicety.
export const CONFIG_COLOURS = {
  motor: '#6b7280',
  headsail: '#0ea5e9',
  full: '#16a34a',
  reefed: '#b45309'
};

export const CONFIG_LABELS = {
  motor: 'Motor',
  headsail: 'Headsail',
  full: 'Full sail',
  reefed: 'Reefed'
};

export const UNKNOWN_CONFIG_COLOUR = '#1a6fb5';
export const UNKNOWN_CONFIG_LABEL = 'No sail config (route-only mode)';

export const TACK_COLOURS = {
  port: '#059669',
  starboard: '#d97706'
};

export function colourForConfig(config) {
  return CONFIG_COLOURS[config] || UNKNOWN_CONFIG_COLOUR;
}

export function labelForConfig(config) {
  return CONFIG_LABELS[config] || UNKNOWN_CONFIG_LABEL;
}

export function colourForLeg(leg, colourBy = 'config') {
  if (colourBy === 'tack') {
    return TACK_COLOURS[leg.tackSide] || UNKNOWN_CONFIG_COLOUR;
  }
  return colourForConfig(leg.config);
}

export function styleForLeg(leg, { selected = false, hovered = false, colourBy = 'config' } = {}) {
  const colour = colourForLeg(leg, colourBy);
  if (selected) {
    return { color: colour, weight: 8, opacity: 1 };
  }
  if (hovered) {
    return { color: colour, weight: 6, opacity: 0.95 };
  }
  return { color: colour, weight: 4, opacity: 0.8 };
}

export function configLegend() {
  const entries = Object.keys(CONFIG_COLOURS).map(config => ({
    label: CONFIG_LABELS[config],
    colour: CONFIG_COLOURS[config]
  }));
  entries.push({ label: UNKNOWN_CONFIG_LABEL, colour: UNKNOWN_CONFIG_COLOUR });
  return entries;
}
