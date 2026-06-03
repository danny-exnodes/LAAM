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
};

// v1 default stuck threshold (minutes); v2 has no /api/config yet.
const STUCK_THRESHOLD_MIN = 10;

export function useLiveSessions(): {
  sessions: LiveSession[];
  connected: boolean;
  stuckIds: string[];
} {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [connected, setConnected] = useState(false);
  const [stuckIds, setStuckIds] = useState<string[]>([]);
  // Ids we've already alerted on, so re-renders don't re-notify the same agent.
  const notifiedRef = useRef<Set<string>>(new Set());

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

      const stuck = next.filter((s) => isStuck(s, STUCK_THRESHOLD_MIN));
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
              body: `${s.model ?? s.id} không hoạt động > ${STUCK_THRESHOLD_MIN} phút`,
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
    });

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    return () => es.close();
  }, []);

  return { sessions, connected, stuckIds };
}
