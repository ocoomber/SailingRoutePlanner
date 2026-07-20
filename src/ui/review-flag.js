// Dev-only (debug.html): flag the current rough-route + sailing-plan combo for
// review with a note. For the "the plan sailed over land" case — capture the
// course you were happy with, the plan it produced, and why it's wrong, so it
// can become a regression fixture. Saves to the server (logs/review/<ts>.md +
// review-flags.jsonl) or downloads as a fallback.

import { buildReviewLog } from '../core/review-log.js';
import { renderState } from './app-state.js';
import { postDevLog } from '../services/dev-log.js';
import { download } from './download.js';

let editor = null;

function setStatus(el, msg) {
  if (el) el.textContent = msg || '';
}

export function initReviewFlag(deps = {}) {
  const btn = document.getElementById('flag-review');
  if (!btn) return;
  editor = deps.editor;
  const note = document.getElementById('review-note');
  const status = document.getElementById('review-status');

  btn.addEventListener('click', async () => {
    if (!renderState.lastRun) {
      setStatus(status, 'Create a sailing plan first, then flag it.');
      return;
    }
    const { markdown, record } = buildReviewLog({
      note: note?.value?.trim() || null,
      lastRun: renderState.lastRun,
      route: editor?.getRoute?.()
    });
    const saved = await postDevLog('/review-log', { markdown, record });
    if (saved) {
      setStatus(status, `Flagged ${typeof saved === 'string' ? saved : 'to the server'} (+ dataset row).`);
    } else {
      const stamp = record.at.replace(/[:.]/g, '-');
      download(`plan-review-${stamp}.md`, markdown, 'text/markdown');
      setStatus(status, 'No server — downloaded the review as Markdown instead.');
    }
  });
}
