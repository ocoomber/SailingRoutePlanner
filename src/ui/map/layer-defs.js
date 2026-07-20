// Every map overlay, declared once. The Layers panel renders straight from this
// list, so a layer's label/description/swatch and its drawing live together.
//
// `dependsOn` names keys of the render state; a layer only rebuilds when one of
// its own dependencies changed.

import {
  buildFineLand, buildCoarseLand, buildInnerRings, buildCoastSegments,
  FINE_LAND_STYLE, COARSE_LAND_STYLE, INNER_RING_STYLE, COAST_SEGMENT_STYLE
} from './layers/land-layers.js';
import { buildTileGrid, buildTileStates } from './layers/tile-layers.js';
import { buildRouteLegs, applyRouteSelection, buildManeuverMarkers, buildWaypoints } from './layers/route-layers.js';
import { buildWindArrows } from './layers/wind-layers.js';
import { buildTwaLabels } from './layers/sailing-layers.js';
import { buildLandDeviationMarkers, buildConfigDecisionMarkers } from './layers/decision-layers.js';
import { buildSeamarks, SEAMARK_SWATCH } from './layers/chart-layers.js';
import { configLegend } from './leg-styles.js';

export const LAYER_DEFS = [
  {
    id: 'seamarks',
    label: 'Sea marks (OpenSeaMap)',
    description: 'Buoys, lights, depth contours and traffic-separation marks from OpenSeaMap — the chart detail for judging clearance while you draw the course.',
    group: 'Charts',
    swatch: SEAMARK_SWATCH,
    defaultOn: false,
    userVisible: true,
    dependsOn: [],
    build: buildSeamarks
  },
  {
    id: 'fine-land',
    label: 'Fine land (detail tiles)',
    description: 'Land from the loaded zoom-12 detail tiles. This is what the router actually tests against wherever a tile is loaded. Turn the coarse layer off to judge this on its own.',
    group: 'Land data',
    swatch: FINE_LAND_STYLE.fillColor,
    defaultOn: true,
    dependsOn: ['coastline'],
    build: buildFineLand
  },
  {
    id: 'coarse-land',
    label: 'Coarse land (fallback)',
    description: 'The low-resolution fallback coastline, used only where no detail tile is loaded. Independent of the fine layer.',
    group: 'Land data',
    swatch: COARSE_LAND_STYLE.fillColor,
    defaultOn: false,
    dependsOn: ['coastline'],
    build: buildCoarseLand
  },
  {
    id: 'inner-rings',
    label: 'Inner rings (holes)',
    description: 'Holes inside landmasses — lakes and inlets that count as water.',
    group: 'Land data',
    swatch: INNER_RING_STYLE.color,
    defaultOn: false,
    dependsOn: ['coastline'],
    build: buildInnerRings
  },
  {
    id: 'coast-segments',
    label: 'Coastline segments',
    description: 'The raw line segments used for the leg-crossing test, as opposed to the filled polygons used for the inside-land test.',
    group: 'Land data',
    swatch: COAST_SEGMENT_STYLE.color,
    defaultOn: false,
    dependsOn: ['coastline'],
    build: buildCoastSegments
  },
  {
    id: 'tile-grid',
    label: 'Tile grid',
    description: 'The zoom-12 tile boundaries with their z/x/y keys.',
    group: 'Tiles',
    swatch: '#6b7280',
    defaultOn: false,
    dependsOn: ['bounds', 'tileZoom'],
    build: buildTileGrid
  },
  {
    id: 'tile-states',
    label: 'Tile status',
    description: 'Colour-codes each tile: loaded, open water (no tile exists), or exists but not loaded.',
    group: 'Tiles',
    swatch: '#22c55e',
    defaultOn: false,
    dependsOn: ['bounds', 'tileZoom', 'tileEpoch'],
    build: buildTileStates
  },
  {
    id: 'route-legs',
    label: 'Route legs',
    description: 'One line per leg, coloured by sail configuration. Hover for the numbers, click to open its card.',
    group: 'Route',
    swatch: configLegend(),
    defaultOn: true,
    userVisible: true,
    dependsOn: ['legs', 'colourBy'],
    build: buildRouteLegs,
    applySelection: applyRouteSelection
  },
  {
    id: 'maneuver-markers',
    label: 'Tacks & gybes',
    description: 'Marks where the boat tacks or gybes — drawn at the END of the leg that finishes with the manoeuvre.',
    group: 'Route',
    swatch: '#2563eb',
    defaultOn: true,
    userVisible: true,
    dependsOn: ['legs'],
    build: buildManeuverMarkers
  },
  {
    id: 'waypoints',
    label: 'Waypoints',
    description: 'The turning points between legs.',
    group: 'Route',
    swatch: '#1a1a2e',
    defaultOn: false,
    dependsOn: ['legs'],
    build: buildWaypoints
  },
  {
    id: 'wind-arrows',
    label: 'Wind arrows',
    description: 'Forecast wind on each leg, drawn pointing the way the wind is blowing.',
    group: 'Route',
    swatch: '#6b21a8',
    defaultOn: true,
    userVisible: true,
    dependsOn: ['legs'],
    build: buildWindArrows
  },
  {
    id: 'twa-labels',
    label: 'TWA / tack labels',
    description: 'True wind angle and tack (P/S) at the start of each leg.',
    group: 'Route',
    swatch: '#1a1a2e',
    defaultOn: false,
    dependsOn: ['legs'],
    build: buildTwaLabels
  },
  {
    id: 'land-deviation-markers',
    label: 'Land deviations',
    description: 'Where the ideal heading was blocked by land or the clearance margin, and how much VMG that cost.',
    group: 'Decisions',
    swatch: '#dc2626',
    defaultOn: false,
    dependsOn: ['decisions'],
    build: buildLandDeviationMarkers
  },
  {
    id: 'config-decision-markers',
    label: 'Sail-config decisions',
    description: 'Where a sail-configuration change was considered — green if adopted, grey if refused.',
    group: 'Decisions',
    swatch: '#16a34a',
    defaultOn: false,
    dependsOn: ['decisions'],
    build: buildConfigDecisionMarkers
  }
];
