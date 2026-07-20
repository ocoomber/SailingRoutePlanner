// Dev-only (debug.html): assembles the full passage-debug JSON on demand and
// downloads it. This replaced the old auto-POST-on-every-run behaviour — the
// heavy sailing-pass log is only produced when the developer asks for it, from
// the material stashed by passage-run.js on the last run.

import { buildRouteLog } from '../core/route-log.js';
import { renderState } from './app-state.js';
import { download } from './download.js';

export function initPassageLogButton() {
  const btn = document.getElementById('download-passage-log');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (!renderState.lastRun) {
      btn.textContent = 'Create a plan first';
      setTimeout(() => { btn.textContent = 'Download passage log'; }, 1800);
      return;
    }
    const log = buildRouteLog(renderState.lastRun);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    download(`passage-${stamp}.json`, JSON.stringify(log, null, 2), 'application/json');
  });
}
