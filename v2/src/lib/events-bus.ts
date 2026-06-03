// events-bus.ts — in-process pub/sub backing the SSE stream (/api/events).
//
// A module singleton: every importer shares one set of subscribers. The SSE
// route subscribes a callback that writes to its ReadableStream; whoever
// changes session data (wired in a later Wave, e.g. /api/sync) calls publish()
// to fan the change out to all connected clients.
//
// Next dev/HMR can re-evaluate modules, so the subscriber set is pinned on
// globalThis to survive module reloads in the same process.

export type BusEvent = { type: string; [key: string]: unknown };
export type BusCallback = (evt: BusEvent) => void;

const GLOBAL_KEY = Symbol.for("laam.events-bus.subscribers");

type GlobalWithBus = typeof globalThis & { [GLOBAL_KEY]?: Set<BusCallback> };
const g = globalThis as GlobalWithBus;
const subscribers: Set<BusCallback> = g[GLOBAL_KEY] ?? (g[GLOBAL_KEY] = new Set());

/** Register a callback. Returns an unsubscribe fn for convenience. */
export function subscribe(cb: BusCallback): () => void {
  subscribers.add(cb);
  return () => unsubscribe(cb);
}

export function unsubscribe(cb: BusCallback): void {
  subscribers.delete(cb);
}

/** Fan an event out to every current subscriber. One throwing callback must
 *  not stop the others from receiving the event. */
export function publish(evt: BusEvent): void {
  for (const cb of [...subscribers]) {
    try {
      cb(evt);
    } catch {
      // a broken subscriber (e.g. a closed stream) shouldn't break the fan-out
    }
  }
}

/** Current subscriber count — for tests / diagnostics. */
export function subscriberCount(): number {
  return subscribers.size;
}
