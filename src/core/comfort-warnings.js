// Advisory only: maxComfortWindKn never changes the route, it just flags legs
// whose forecast wind is above the skipper's comfort ceiling.

export function findUncomfortableLegs(legs, params) {
  if (!legs || !params || typeof params.maxComfortWindKn !== 'number') return [];
  return legs
    .map((leg, index) => ({ index, windSpeed: leg.windSpeed }))
    .filter(entry => entry.windSpeed > params.maxComfortWindKn);
}

export function markUncomfortableLegs(legs, uncomfortableLegs) {
  for (const entry of uncomfortableLegs) {
    legs[entry.index].comfortExceeded = true;
  }
}
