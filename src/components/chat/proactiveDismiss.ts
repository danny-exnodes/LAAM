// S2 — remember which proactive alerts the user dismissed, so the card stays gone
// across turns/reloads (was ephemeral). Persisted per-browser (localStorage) and
// keyed by the alert's stable key (e.g. "stuck:<id>"). Dismissals EXPIRE after 24h
// so a still-active alert can resurface later. `now` is injected for testability.

const KEY = "laam_proactive_dismissed";
const TTL_MS = 24 * 3600 * 1000;

type Store = Record<string, number>; // alert key -> dismissedAt (epoch ms)

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const o = raw ? (JSON.parse(raw) as unknown) : {};
    return o && typeof o === "object" ? (o as Store) : {};
  } catch {
    return {};
  }
}

function write(s: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore (private mode / quota) */
  }
}

// The set of alert keys still considered dismissed at `now` (within the TTL).
export function loadDismissed(now: number): Set<string> {
  const s = read();
  const live = new Set<string>();
  for (const [k, ts] of Object.entries(s)) {
    if (typeof ts === "number" && now - ts < TTL_MS) live.add(k);
  }
  return live;
}

// Record `keys` as dismissed at `now`, pruning anything past the TTL.
export function dismissAlerts(keys: string[], now: number): void {
  const s = read();
  for (const [k, ts] of Object.entries(s)) {
    if (typeof ts !== "number" || now - ts >= TTL_MS) delete s[k];
  }
  for (const k of keys) s[k] = now;
  write(s);
}
