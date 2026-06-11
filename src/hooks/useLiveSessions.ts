"use client";

// useLiveSessions — subscribe to /api/events (SSE) and expose the live session
// list plus derived connection + stuck state. Port of the v1 connectSSE +
// isStuck + notify wiring (public/common.js), as a React hook.

import { useEffect, useRef, useState } from "react";
import { isStuck } from "@/lib/stuck";
import type { SubAgentJson } from "@/db/schema";

// JSON-friendly session shape pushed by the /api/events route (Dates → epoch ms).
export type LiveSession = {
  id: string;
  projectId: string | null;
  projectName: string | null;
  source: string;
  model: string | null;
  gitBranch: string | null;
  status: string;
  startedAt: number | null;
  lastActivity: number | null;
  messageCount: number;
  toolCount: number;
  subAgentCount: number;
  subAgents: SubAgentJson[] | null;
  costUsd: number;
  latestActivity: string | null;
  tokensIn: number;
  tokensOut: number;
  // Additive (W6): originating machine, for the Agents machine filter.
  machineId?: string | null;
};

// Default stuck threshold (minutes), used until /api/config answers (and as
// the fallback when it fails). The server reads LAAM_STUCK_MIN.
const DEFAULT_STUCK_MIN = 10;

export function useLiveSessions(): {
  sessions: LiveSession[];
  connected: boolean;
  stuckIds: string[];
  stuckMin: number;
} {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [connected, setConnected] = useState(false);
  const [stuckIds, setStuckIds] = useState<string[]>([]);
  const [stuckMin, setStuckMin] = useState(DEFAULT_STUCK_MIN);
  // Ids we've already alerted on, so re-renders don't re-notify the same agent.
  const notifiedRef = useRef<Set<string>>(new Set());

  // Fetch the configured stuck threshold once on mount (v1 /api/config parity).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg: { stuckMin?: unknown } | null) => {
        const n = cfg?.stuckMin;
        if (!cancelled && typeof n === "number" && Number.isFinite(n) && n > 0) {
          setStuckMin(n);
        }
      })
      .catch(() => {
        // Keep the default; stuck detection must survive a config outage.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.addEventListener("sessions", (e) => {
      setConnected(true);
      let next: LiveSession[];
      try {
        next = (JSON.parse((e as MessageEvent).data).sessions ?? []) as LiveSession[];
      } catch {
        return;
      }
      setSessions(next);
    });

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  // Derive stuck state (and notify) whenever the list OR the threshold changes,
  // so a late /api/config answer re-evaluates the current sessions.
  useEffect(() => {
    const stuck = sessions.filter((s) => isStuck(s, stuckMin));
    setStuckIds(stuck.map((s) => s.id));

    // Notify only on NEWLY-stuck sessions, and only if the user granted it.
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      for (const s of stuck) {
        if (notifiedRef.current.has(s.id)) continue;
        notifiedRef.current.add(s.id);
        try {
          new Notification("Agent có thể bị treo", {
            body: `${s.model ?? s.id} không hoạt động > ${stuckMin} phút`,
            tag: `stuck:${s.id}`,
          });
        } catch {
          // Notification can throw in some environments; never break the stream.
        }
      }
    }
    // Forget ids that recovered, so a future stuck event re-alerts.
    const stuckSet = new Set(stuck.map((s) => s.id));
    for (const id of [...notifiedRef.current]) {
      if (!stuckSet.has(id)) notifiedRef.current.delete(id);
    }
  }, [sessions, stuckMin]);

  // Expose stuckMin so list-level filters (e.g. the Agents "stuck" dropdown) use the
  // SAME configured threshold as this hook's badge — no second source of truth.
  return { sessions, connected, stuckIds, stuckMin };
}
