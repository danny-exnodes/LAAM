"use client";

// Polls /api/host/metrics every ~2s and keeps a rolling window of recent samples
// for the realtime trend charts. Pauses while the tab is hidden. Ephemeral — no
// persistence (v1 scope).

import { useEffect, useRef, useState } from "react";
import type { HostMetrics } from "@/lib/host-metrics.types";

const WINDOW = 60;
const INTERVAL = 2000;

export type HostStatus = "loading" | "ok" | "unavailable";

export function useHostMetrics() {
  const [current, setCurrent] = useState<HostMetrics | null>(null);
  const [history, setHistory] = useState<HostMetrics[]>([]);
  const [status, setStatus] = useState<HostStatus>("loading");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const r = await fetch("/api/host/metrics", { cache: "no-store" });
        if (!r.ok) throw new Error("unavailable");
        const m = (await r.json()) as HostMetrics;
        if (!alive) return;
        setCurrent(m);
        setHistory((h) => [...h, m].slice(-WINDOW));
        setStatus("ok");
      } catch {
        if (alive) setStatus((s) => (s === "ok" ? "ok" : "unavailable"));
      }
    }
    tick();
    timer.current = setInterval(tick, INTERVAL);
    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return { current, history, status };
}
