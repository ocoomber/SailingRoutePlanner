// Assembles the structured debug record for a route. It is written to a file for
// the developer's coding assistant to read — not shown in the UI — so it is
// dense and complete rather than pretty. Pure: takes data, returns an object.

function round(v, dp = 4) {
  return typeof v === 'number' ? Number(v.toFixed(dp)) : v;
}

function legRow(leg, i) {
  return {
    i,
    config: leg.config ?? null,
    heading: leg.heading,
    from: { lat: round(leg.waypoint.lat), lon: round(leg.waypoint.lon) },
    to: { lat: round(leg.endWaypoint.lat), lon: round(leg.endWaypoint.lon) },
    distanceNm: round(leg.distance, 2),
    durationH: round(leg.duration, 3),
    sogKn: round(leg.sog, 2),
    windSpeedKn: leg.windSpeed,
    windDir: leg.windDir,
    twaAbs: leg.windAngle,
    tack: leg.tackSide ?? null,
    maneuverAtEnd: leg.maneuver ?? null,
    comfortExceeded: !!leg.comfortExceeded
  };
}

function configDecisionRow(rec) {
  return {
    from: rec.from, to: rec.to, accepted: rec.accepted, trigger: rec.trigger,
    windSpeedKn: rec.windSpeedKn, windowMin: round(rec.windowMin, 0),
    thresholdMin: round(rec.thresholdMin, 0), pointOfSail: rec.pointOfSail ?? null
  };
}

export function buildRouteLog({ mode, inputs, settings, rough, passage, elapsedMs }) {
  const log = {
    generatedAt: new Date().toISOString(),
    mode,                                   // 'route-only' | 'sailing'
    elapsedMs: round(elapsedMs, 0),
    inputs: {
      start: { lat: inputs.startLat, lon: inputs.startLon },
      end: { lat: inputs.endLat, lon: inputs.endLon },
      timeMode: inputs.timeMode,
      departureDate: inputs.departureDate,
      departureTime: inputs.departureTime
    },
    settings: settings || null
  };

  if (rough) {
    log.roughRoute = {
      legCount: rough.legCount,
      totalDistanceNm: round(rough.totalDistanceNm, 2),
      reachedCleanly: rough.reachedCleanly,
      nodeCount: rough.nodeCount,
      crossingLegIndices: rough.crossingLegIndices || [],
      waypoints: rough.waypoints.map(p => ({ lat: round(p.lat), lon: round(p.lon) }))
    };
  }

  if (passage) {
    const legs = passage.legs || [];
    const maneuvers = legs.filter(l => l.maneuver).length;
    log.result = {
      reachedDestination: passage.summary?.reachedDestination,
      shortfallNm: round(passage.summary?.shortfallNm, 2),
      clearanceUsedNm: passage.debug?.clearanceUsedNm,
      corridorWidthNm: passage.debug?.corridorWidthNm,
      legCount: legs.length,
      maneuverCount: maneuvers,
      totalDistanceNm: round(passage.summary?.totalDistanceNm, 1),
      totalDurationH: round(passage.summary?.totalDurationH, 1),
      configBlocks: (passage.configBlocks || []).map(b => ({
        config: b.config, legStartIndex: b.legStartIndex, legEndIndex: b.legEndIndex
      }))
    };
    log.warnings = passage.warnings || [];
    log.configDecisions = (passage.decisions || [])
      .filter(d => d.kind === 'config')
      .map(configDecisionRow);
    log.legs = legs.map(legRow);
    log.narration = passage.narration || null;
    if (passage.debug?.roughRoute) {
      log.roughRoute = {
        legCount: passage.debug.roughRoute.legCount,
        totalDistanceNm: round(passage.debug.roughRoute.totalDistanceNm, 2),
        reachedCleanly: passage.debug.roughRoute.reachedCleanly,
        nodeCount: passage.debug.roughRoute.nodeCount,
        waypoints: passage.debug.roughRoute.waypoints.map(p => ({ lat: round(p.lat), lon: round(p.lon) }))
      };
    }
    log.rawPlannerLog = passage.debug?.log || null;
  }

  return log;
}
