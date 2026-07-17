// Pure builder for the TWA / tack labels along the route.
// windAngle is absolute, so tackSide is the only thing that tells you which
// side the wind is on.

const TACK_INITIAL = { port: 'P', starboard: 'S' };

export function buildTwaLabels(state) {
  const legs = state.legs;
  if (!legs) return [];

  return legs.map((leg) => {
    const tack = TACK_INITIAL[leg.tackSide] || '–';
    return L.marker([leg.waypoint.lat, leg.waypoint.lon], {
      icon: L.divIcon({
        className: 'twa-label',
        html: `<span>${leg.windAngle}° ${tack}</span>`,
        iconSize: [46, 14],
        iconAnchor: [23, 7]
      }),
      interactive: false
    });
  });
}
