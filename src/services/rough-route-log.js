// Sends a rough-route correction to the local server, which writes a readable
// Markdown file and appends the record to the JSONL dataset. Best-effort: on the
// static (GitHub Pages) deploy there is no server, so the caller falls back to a
// browser download of the same Markdown.

export async function postRoughRouteLog({ markdown, record }) {
  try {
    const resp = await fetch('/rough-route-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown, record })
    });
    if (!resp.ok) return false;
    const body = await resp.json().catch(() => ({}));
    return body.ok === true ? (body.file || true) : false;
  } catch (err) {
    console.warn('Rough-route correction not saved to server (run start.cmd to capture):', err);
    return false;
  }
}
