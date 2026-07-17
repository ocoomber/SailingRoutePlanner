// Shared leg selection/hover state. No DOM, no Leaflet — the map and the
// decision trail both subscribe here so neither has to import the other.
//
// Every change carries an `origin`. Subscribers use it to avoid fighting each
// other: the map only pans when the change came from the trail, and the trail
// only scrolls when the change came from the map. Without that guard the two
// panels chase each other in a feedback loop.

let state = { selectedLegIndex: null, hoveredLegIndex: null };
const subscribers = [];

export function subscribe(fn) {
  subscribers.push(fn);
  return function unsubscribe() {
    const i = subscribers.indexOf(fn);
    if (i >= 0) subscribers.splice(i, 1);
  };
}

export function getSelection() {
  return { ...state };
}

function notify(origin) {
  const snapshot = { ...state };
  for (const fn of subscribers) fn(snapshot, origin);
}

export function setSelected(index, origin = 'unknown') {
  if (state.selectedLegIndex === index) return;
  state = { ...state, selectedLegIndex: index };
  notify(origin);
}

export function setHovered(index, origin = 'unknown') {
  if (state.hoveredLegIndex === index) return;
  state = { ...state, hoveredLegIndex: index };
  notify(origin);
}

export function clearSelection(origin = 'clear') {
  if (state.selectedLegIndex === null && state.hoveredLegIndex === null) return;
  state = { selectedLegIndex: null, hoveredLegIndex: null };
  notify(origin);
}
