// FEAT-1 — pinned conversations, persisted client-side (localStorage). Kept off
// the server to avoid a schema migration: pins are a per-browser convenience for
// a local-first single-user tool. Fail-soft everywhere (private mode / SSR).

const KEY = "laam_chat_pins";

export function loadPins(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function savePins(pins: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...pins]));
  } catch {
    /* ignore (private mode / quota) */
  }
}

// Return a NEW set with `id` toggled, and persist it.
export function togglePin(pins: Set<string>, id: string): Set<string> {
  const next = new Set(pins);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  savePins(next);
  return next;
}
