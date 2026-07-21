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
    departTick: root.querySelector('.wt-depart-tick')
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

  refresh();
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
  syncCursor(weatherStore.getTimeCursor());
}

function syncCursor(t) {
  if (!els) return;
  els.slider.value = t;
  els.label.textContent = formatTime(t);
}

function formatTime(t) {
  const d = new Date(t);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

// A small marker over the slider at the planned departure time, when the
// departure inputs hold one that falls inside the forecast window.
function positionDepartTick(range) {
  const tick = els.departTick;
  const date = document.getElementById('departure-date');
  const time = document.getElementById('departure-time');
  tick.classList.add('hidden');
  if (!date || !time || !date.value || !time.value) return;

  const t = new Date(`${date.value}T${time.value}`).getTime();
  if (!Number.isFinite(t) || t < range.start || t > range.end) return;

  const frac = (t - range.start) / (range.end - range.start);
  tick.style.left = `${(frac * 100).toFixed(2)}%`;
  tick.title = `Departure ${formatTime(t)}`;
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
