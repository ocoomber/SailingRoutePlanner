// Sends the structured route log to the local server, which writes it to
// logs/route-latest.json. Best-effort: if the plain static server is used
// instead of the node server, this quietly no-ops.

export async function postDebugLog(log) {
  try {
    const resp = await fetch('/debug-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log)
    });
    return resp.ok;
  } catch (err) {
    console.warn('Route log not saved (run start.cmd for the logging server):', err);
    return false;
  }
}
