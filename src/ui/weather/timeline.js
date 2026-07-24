// The weather timeline: a scrubber and play control over the forecast window.
// It only drives weatherStore.setTimeCursor — the canvas layers subscribe to
// the cursor and repaint themselves, so playback never touches the registry.
//
// Appears when there is a weather grid AND at least one weather layer is on;
// disappears (and stops playing) when the last weather layer is switched off.

import * as weatherStore from './weather-store.js';

const STEP_MS = 15 * 60 * 1000;               // scrub resolution
const PLAY_RATE = 20 * 60 * 1000;             // forecast ms advanced per real second at 1x
const SPEEDS = [1, 2, 4];

let els = null;
let playing = false;
let speedIdx = 0;
let rafId = null;
let lastTick = 0;

export function initTimeline() {
  const root = document.getElementById('weather-timeline');
  if (!root) return;

  els = {
    root,
    play: root.querySelector('.wt-play'),
    slider: root.querySelector('.wt-slider'),
    label: root.querySelector('.wt-label'),
    speed: root.querySelector('.wt-speed'),
    departTick: root.querySelector('.wt-depart-tick'),
    nowTick: root.querySelector('.wt-now-tick')
  };

  els.play.addEventListener('click', () => (playing ? pause() : play()));
  els.speed.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    els.speed.textContent = `${SPEEDS[speedIdx]}×`;
  });
  els.slider.addEventListener('input', () => {
    pause();
    weatherStore.setTimeCursor(Number(els.slider.value));
  });

  weatherStore.onGridChange(refresh);
  weatherStore.onConsumersChange(refresh);
  weatherStore.onTimeCursor(syncCursor);

  // The depart tick and the label's "departure" tag both read the departure
  // inputs live, but only redraw on demand — without this they'd go stale
  // the moment the user edits departure date/time after the timeline first
  // renders (e.g. it stays put, or the label keeps calling an old time
  // "departure", until some unrelated grid/consumer change forces a refresh).
  const depDate = document.getElementById('departure-date');
  const depTime = document.getElementById('departure-time');
  depDate?.addEventListener('input', onDepartureChanged);
  depTime?.addEventListener('input', onDepartureChanged);

  refresh();
}

function onDepartureChanged() {
  const range = weatherStore.getTimeRange();
  if (!range) return;
  positionDepartTick(range);
  syncCursor(weatherStore.getTimeCursor());
}

function refresh() {
  const range = weatherStore.getTimeRange();
  const active = weatherStore.hasActiveConsumers();
  const show = !!range && active;
  els.root.classList.toggle('hidden', !show);
  if (!show) { pause(); return; }

  els.slider.min = range.start;
  els.slider.max = range.end;
  els.slider.step = STEP_MS;
  positionDepartTick(range);
  positionNowTick(range);
  syncCursor(weatherStore.getTimeCursor());
}

function syncCursor(t) {
  if (!els) return;
  els.slider.value = t;
  const rel = relativeLabel(t);
  els.label.textContent = rel ? `${formatTime(t)} · ${rel}` : formatTime(t);
}

function formatTime(t) {
  const d = new Date(t);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

// Reads the planned departure timestamp from the command bar inputs, or
// null if they're empty/invalid. Shared by the depart tick and the label's
// "departure" tag so both agree on what counts as "at departure".
function getDepartureTime() {
  const date = document.getElementById('departure-date');
  const time = document.getElementById('departure-time');
  if (!date || !time || !date.value || !time.value) return null;
  const t = new Date(`${date.value}T${time.value}`).getTime();
  return Number.isFinite(t) ? t : null;
}

// Tags the scrubbed time relative to "now" and the planned departure, since
// a bare clock time doesn't say whether you're looking at current conditions
// or a forecast hours/days out.
function relativeLabel(t) {
  const departTime = getDepartureTime();
  if (departTime !== null && Math.abs(t - departTime) < STEP_MS / 2) return 'departure';

  const diffMs = t - Date.now();
  if (Math.abs(diffMs) < STEP_MS / 2) return 'now';

  const hours = diffMs / (60 * 60 * 1000);
  if (Math.abs(hours) < 48) {
    const h = Math.round(Math.abs(hours));
    return diffMs > 0 ? `in ${h}h` : `${h}h ago`;
  }
  const days = Math.round(Math.abs(diffMs) / (24 * 60 * 60 * 1000));
  return diffMs > 0 ? `in ${days}d` : `${days}d ago`;
}

// A small marker over the slider at the planned departure time, when the
// departure inputs hold one that falls inside the forecast window.
function positionDepartTick(range) {
  const tick = els.departTick;
  tick.classList.add('hidden');
  const t = getDepartureTime();
  if (t === null || t < range.start || t > range.end) return;

  const frac = (t - range.start) / (range.end - range.start);
  tick.style.left = `${(frac * 100).toFixed(2)}%`;
  tick.title = `Departure ${formatTime(t)}`;
  tick.classList.remove('hidden');
}

// A small marker over the slider at the current real-world time, so it's
// visually obvious where "now" sits relative to the forecast being scrubbed.
function positionNowTick(range) {
  const tick = els.nowTick;
  tick.classList.add('hidden');
  const t = Date.now();
  if (t < range.start || t > range.end) return;

  const frac = (t - range.start) / (range.end - range.start);
  tick.style.left = `${(frac * 100).toFixed(2)}%`;
  tick.title = `Now · ${formatTime(t)}`;
  tick.classList.remove('hidden');
}

function play() {
  const range = weatherStore.getTimeRange();
  if (!range) return;
  playing = true;
  els.play.textContent = '⏸';
  lastTick = performance.now();
  rafId = requestAnimationFrame(tick);
}

function pause() {
  playing = false;
  if (els) els.play.textContent = '▶';
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

function tick(now) {
  if (!playing) return;
  const dt = now - lastTick;
  lastTick = now;

  const range = weatherStore.getTimeRange();
  if (!range) { pause(); return; }

  let t = weatherStore.getTimeCursor() + (dt / 1000) * PLAY_RATE * SPEEDS[speedIdx];
  if (t >= range.end) t = range.start;   // loop the playback
  weatherStore.setTimeCursor(t);

  rafId = requestAnimationFrame(tick);
}
