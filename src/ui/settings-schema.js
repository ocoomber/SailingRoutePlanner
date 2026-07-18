// Every tunable number, with a plain-English account of what it ACTUALLY does.
//
// These descriptions are written against the real engine behaviour, not the
// parameter's name — where a knob has a narrower effect than it sounds like
// (several only bite on the main-hoist path), the description says so. If you
// change the engine, change the description in the same edit.
//
// Longer than the usual file ceiling on purpose: it is one coherent data table.

export const SETTINGS_GROUPS = [
  {
    id: 'wind-thresholds',
    section: 'comfort',
    title: 'Wind thresholds',
    blurb: 'The wind speeds at which the boat changes what it is doing.',
    fields: [
      {
        path: 'minSailableWindKn',
        label: 'Min sailable wind',
        unit: 'kn',
        step: 0.5,
        description: 'Below this, motoring becomes the preferred configuration. The skipper\'s "there is only 1.9 knots of breeze, I can\'t sail in it anyway" case. Note this only sets the PREFERENCE — the engine-on threshold below decides when the switch actually happens.'
      },
      {
        path: 'engineOnWindKn',
        label: 'Engine on at or below',
        unit: 'kn',
        step: 0.5,
        description: 'Sailing stops and the engine starts once wind drops to this. Together with "engine off" it forms a dead band: between the two figures the boat keeps doing whatever it is already doing rather than flip-flopping in marginal air. The default (4kn) is also the lowest wind the boat\'s polar has data for, so below it the boat genuinely cannot sail. Dropping sail for arrival ignores this band.'
      },
      {
        path: 'engineOffWindKn',
        label: 'Engine off at or above',
        unit: 'kn',
        step: 0.5,
        description: 'The engine stops and sail goes up once wind builds to this. Must be above "engine on" — the gap between them is the anti-flip-flop band.'
      },
      {
        path: 'reefWindKn',
        label: 'Reef above',
        unit: 'kn',
        step: 1,
        description: 'Above this wind speed the reefed configuration becomes preferred instead of full sail.'
      },
      {
        path: 'maxComfortWindKn',
        label: 'Max comfort wind',
        unit: 'kn',
        step: 1,
        description: 'Your comfort ceiling. Legs forecast above this are flagged on the map and raise a passage warning. This is ADVISORY — it never changes the route, it only tells you that you would not enjoy it.'
      },
      {
        path: 'headsailPreferenceBandKn',
        label: 'Headsail preference band',
        unit: 'kn',
        step: 0.5,
        description: 'How far above "min sailable wind" the headsail alone stays preferred before the main is considered. Wind up to (min sailable + this) picks headsail; above it, full sail.'
      }
    ]
  },
  {
    id: 'worth-it',
    section: 'comfort',
    title: 'Is it worth the hassle?',
    blurb: 'How long a wind window has to last before a sail change earns its keep.',
    fields: [
      {
        path: 'minWorthwhileDurationMin.headsail',
        label: 'Worth it: headsail',
        unit: 'min',
        step: 5,
        description: 'How long the wind must hold to bother unfurling the headsail. Rolls out easily, so this is low. Unlike the main, this figure is used flat — point of sail and sailing solo do NOT affect it.'
      },
      {
        path: 'minWorthwhileDurationMin.full',
        label: 'Worth it: full sail',
        unit: 'min',
        step: 5,
        description: 'How long the wind must hold to justify hoisting the main. This is the base figure — it then gets multiplied by the point-of-sail difficulty below, and again by the solo multiplier if you are single-handed. "Don\'t bother putting the main out because you\'re only going to have it up 30 minutes."'
      },
      {
        path: 'minWorthwhileDurationMin.reefed',
        label: 'Worth it: reefed',
        unit: 'min',
        step: 5,
        description: 'How long conditions must hold to justify reefing. Used flat for shaking a reef in or out while already under sail — no difficulty or solo multiplier is applied to that path.'
      }
    ]
  },
  {
    id: 'main-hoist',
    section: 'comfort',
    title: 'Main hoist difficulty',
    blurb: 'Multipliers on the "worth it: full sail" time. These ONLY apply to getting the main up from motor or headsail — never to reefing.',
    fields: [
      {
        path: 'mainHoistDifficultyByPointOfSail.upwind',
        label: 'Difficulty × upwind',
        step: 0.1,
        description: 'Multiplier when you would be upwind at the moment of hoisting. "Upwind I can put the main up much more easily" — so this is normally 1.0, the easy baseline.'
      },
      {
        path: 'mainHoistDifficultyByPointOfSail.reach',
        label: 'Difficulty × reaching',
        step: 0.1,
        description: 'Multiplier when reaching at the moment of hoisting. Slightly harder than upwind.'
      },
      {
        path: 'mainHoistDifficultyByPointOfSail.downwind',
        label: 'Difficulty × downwind',
        step: 0.1,
        description: 'Multiplier when running downwind at the moment of hoisting — the hardest case, because you have to round up into the wind first, which is worse in a breeze. At the default 1.8 a downwind hoist needs nearly twice the wind window an upwind one does.'
      }
    ]
  },
  {
    id: 'solo',
    section: 'comfort',
    title: 'Sailing solo',
    blurb: 'Single-handed sailing makes the main harder to manage.',
    fields: [
      {
        path: 'soloSailing',
        label: 'Sailing solo',
        type: 'checkbox',
        description: 'Turn on if you are single-handed. This multiplies the main-hoist "worth it" time by the figure below, making the tool reluctant to hoist for short windows. It has no effect on the headsail or on reefing.'
      },
      {
        path: 'soloHassleMultiplier',
        label: 'Solo hassle ×',
        step: 0.1,
        description: 'How much harder everything is alone. Applied on top of the point-of-sail difficulty, and only when "sailing solo" is on. Solo downwind at defaults: 120 min × 1.8 × 1.5 = 324 min of wind needed before hoisting the main is worth it.'
      }
    ]
  },
  {
    id: 'speeds',
    section: 'comfort',
    title: 'Speeds',
    blurb: 'How fast each configuration goes.',
    fields: [
      {
        path: 'motorCruiseSpeedKn',
        label: 'Motor cruise speed',
        unit: 'kn',
        step: 0.5,
        description: 'Your cruising speed under engine. Motoring uses this as a flat speed at every wind angle, which is also why motoring can point straight into wind when sailing cannot.'
      },
      {
        path: 'headsailSpeedFactor',
        label: 'Headsail speed factor',
        step: 0.05,
        description: 'Headsail-only speed as a fraction of full-sail polar speed. 0.6 means you make 60% of full-sail speed at the same wind and angle.'
      },
      {
        path: 'reefedSpeedFactor',
        label: 'Reefed speed factor',
        step: 0.05,
        description: 'Reefed speed as a fraction of full-sail polar speed. 0.85 means reefing costs you about 15%.'
      }
    ]
  },
  {
    id: 'approach',
    section: 'comfort',
    title: 'Arrival & steering',
    blurb: 'Behaviour near the destination, and how the router picks headings.',
    fields: [
      {
        path: 'finalApproachBufferMin',
        label: 'Final approach buffer',
        unit: 'min',
        step: 5,
        description: 'Within this long of arriving, sails come down and the boat motors in regardless of wind — standard practice before arrival or anchoring. This deliberately overrides the engine-on/off band.'
      },
      {
        path: 'tackPenaltyKn',
        label: 'Tack penalty',
        unit: 'kn',
        step: 0.1,
        description: 'A speed cost the router charges for changing tack. Raise it to discourage the plan from tacking back and forth for small gains; drop it to zero to let the router tack freely.'
      },
      {
        path: 'noGoAngleDeg',
        label: 'No-go angle',
        unit: '°',
        step: 1,
        nullable: true,
        description: 'How close to the wind the boat refuses to sail. Leave BLANK to work it out from the boat\'s polar automatically (recommended). Set a number only to force a specific angle.'
      }
    ]
  },
  {
    id: 'routing',
    section: 'routing',
    title: 'Router',
    blurb: 'How finely the route is computed. These affect run time and detail, not seamanship.',
    fields: [
      {
        path: 'timeStep',
        label: 'Time step',
        unit: 'min',
        step: 5,
        min: 5,
        max: 60,
        description: 'How often the router re-decides a heading. Smaller means a more detailed, slower search; larger is faster and coarser.'
      },
      {
        path: 'headingThreshold',
        label: 'Min heading change',
        unit: '°',
        step: 5,
        min: 5,
        max: 45,
        description: 'Heading changes smaller than this are merged into the previous leg rather than creating a new one. Raise it for fewer, longer legs.'
      },
      {
        path: 'clearanceMargin',
        label: 'Coastal clearance',
        unit: 'NM',
        step: 0.05,
        min: 0,
        max: 2,
        description: 'How far offshore the route stays out at sea in open water. Near the start and destination it eases to the "Harbour clearance" below, since you con the boat in and out of port yourself. 0 disables the offshore margin (the route still won\'t cross land).'
      },
      {
        path: 'harbourClearanceMargin',
        label: 'Harbour / approach clearance',
        unit: 'NM',
        step: 0.05,
        min: 0,
        max: 1,
        description: 'Clearance used near the start and destination — leaving and entering port, marina or anchorage. This tool is a planning aid, not an autopilot: the skipper steers and judges clearance in pilotage waters, so keep this very low or 0. The boat still will not plan a course across land; it just hugs the shore as close as you allow while you con it in. The zone this applies to auto-sizes to at least the coastal clearance so you can always get clear of your own berth.'
      }
    ]
  }
];

export const ROUTING_DEFAULTS = {
  timeStep: 15,
  headingThreshold: 15,
  clearanceMargin: 0.25,
  harbourClearanceMargin: 0
};

export function allFields() {
  return SETTINGS_GROUPS.flatMap(group => group.fields.map(f => ({ ...f, section: group.section })));
}

export function groupsForSection(section) {
  return SETTINGS_GROUPS.filter(group => group.section === section);
}
