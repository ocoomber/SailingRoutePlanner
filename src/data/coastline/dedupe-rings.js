function ringSignature(ring) {
  const first = ring[0];
  return `${ring.length}:${first.lat}:${first.lon}`;
}

export function dedupeRings(rings) {
  const seen = new Set();
  const deduped = [];
  for (const ring of rings) {
    const sig = ringSignature(ring);
    if (seen.has(sig)) continue;
    seen.add(sig);
    deduped.push(ring);
  }
  return deduped;
}
