// Pure: turns a passage result into "Decision -> resulting Leg" card models.
// No DOM. trail-panel.js renders these.
//
// Pairing is done STRUCTURALLY, by index — never by timestamp. decision.time
// comes from the coarse-pass timeline while leg.startTime is a cumulative sum of
// fine-pass durations, so the two clocks drift and near-boundary records would be
// attributed to the wrong leg.

import { classifyTransition, classifyInitial } from '../core/classify-transition.js';

export function buildTrailCards(legs, configBlocksRaw, dest) {
  if (!legs || legs.length === 0) return [];

  // A block's decision belongs to the leg the block starts at.
  const blockByLegStart = new Map();
  for (const block of (configBlocksRaw || [])) {
    if (block.legStartIndex != null) blockByLegStart.set(block.legStartIndex, block);
  }

  return legs.map((leg, i) => {
    const block = blockByLegStart.get(i);
    const configDecision = block ? block.decision : null;
    const configChanged = i > 0 && leg.config !== legs[i - 1].config;

    return {
      legIndex: i,
      leg,
      config: leg.config ?? null,
      // Leg 0 has no predecessor to transition from.
      initial: i === 0 && leg.windSpeed > 0 ? classifyInitial(leg, dest) : null,
      transition: i > 0 && legs[i - 1].windSpeed > 0
        ? classifyTransition(legs[i - 1], leg, dest)
        : null,
      configDecision,
      configChanged,
      // The config changed but no decision record explains it: an engine bug.
      // Surface it rather than hide it — that is what this tool is for.
      unexplainedConfigChange: configChanged && !configDecision,
      maneuverAtEnd: leg.maneuver || null,
      comfortExceeded: !!leg.comfortExceeded
    };
  });
}

export function destinationOf(legs) {
  if (!legs || legs.length === 0) return null;
  return legs[legs.length - 1].endWaypoint;
}

// Rejected changes live on the coarse-pass timeline and have no leg linkage, so
// they are listed separately rather than guessed onto a card.
export function collectRejectedDecisions(decisions) {
  if (!decisions) return [];
  return decisions.filter(rec => rec.kind === 'config' && !rec.accepted);
}
