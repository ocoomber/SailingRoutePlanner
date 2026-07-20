// Sends a dev log ({ markdown, record }) to a local-server endpoint, which writes
// a readable Markdown file and appends the record to its JSONL dataset. Shared by
// the rough-route correction tool and the plan-over-land review flag. Best-effort:
// on the static (GitHub Pages) deploy there is no server, so the caller falls back
// to a browser download of the same Markdown.

export async function postDevLog(endpoint, { markdown, record }) {
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown, record })
    });
    if (!resp.ok) return false;
    const body = await resp.json().catch(() => ({}));
    return body.ok === true ? (body.file || true) : false;
  } catch (err) {
    console.warn(`Dev log not saved to server (${endpoint} — run start.cmd to capture):`, err);
    return false;
  }
}
