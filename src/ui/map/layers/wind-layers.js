// Pure builder for the per-leg wind arrows. Arrow is offset to the leg's
// windward side and points the way the wind is blowing (windDir is where it
// blows FROM, so the arrow draws toward windDir + 180).

const ARROW_STYLE = { color: '#6b21a8', weight: 1.5, opacity: 0.8 };
const OFFSET_DEG = 0.008;
const ARROW_LEN_DEG = 0.01;
const HEAD_LEN_DEG = 0.005;
const HEAD_SPREAD_RAD = 2.6;

export function buildWindArrows(state) {
  const legs = state.legs;
  if (!legs) return [];

  const layers = [];
  for (const leg of legs) {
    if (!leg.windDir && leg.windDir !== 0) continue;

    const midLat = (leg.waypoint.lat + leg.endWaypoint.lat) / 2;
    const midLon = (leg.waypoint.lon + leg.endWaypoint.lon) / 2;

    const legHeadingRad = leg.heading * Math.PI / 180;
    const windFromRad = leg.windDir * Math.PI / 180;

    let relWind = windFromRad - legHeadingRad;
    if (relWind > Math.PI) relWind -= 2 * Math.PI;
    if (relWind < -Math.PI) relWind += 2 * Math.PI;

    const perpRad = relWind >= 0 ? legHeadingRad + Math.PI / 2 : legHeadingRad - Math.PI / 2;
    const centerLat = midLat + OFFSET_DEG * Math.cos(perpRad);
    const centerLon = midLon + OFFSET_DEG * Math.sin(perpRad);

    const windToRad = windFromRad + Math.PI;
    const tipLat = centerLat + ARROW_LEN_DEG * Math.cos(windToRad);
    const tipLon = centerLon + ARROW_LEN_DEG * Math.sin(windToRad);

    const shaft = L.polyline([[centerLat, centerLon], [tipLat, tipLon]], ARROW_STYLE);
    shaft.bindTooltip(`${leg.windSpeed}kn from ${leg.windDir}°`, { direction: 'top' });

    const head = L.polyline([
      [tipLat + HEAD_LEN_DEG * Math.cos(windToRad + HEAD_SPREAD_RAD), tipLon + HEAD_LEN_DEG * Math.sin(windToRad + HEAD_SPREAD_RAD)],
      [tipLat, tipLon],
      [tipLat + HEAD_LEN_DEG * Math.cos(windToRad - HEAD_SPREAD_RAD), tipLon + HEAD_LEN_DEG * Math.sin(windToRad - HEAD_SPREAD_RAD)]
    ], ARROW_STYLE);

    layers.push(shaft, head);
  }
  return layers;
}
