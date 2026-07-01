"use client";
import type { Placed } from "@/lib/constellation/field";
import type { ConstNode } from "@/lib/constellation/nodeModel";
import type { Translator } from "@/i18n/types";

const pct = (v: number) => `${50 + v}%`;
const dot: Record<string, string> = { active: "#ffce7a", linked: "#5bd6ff", idle: "#3d6480" };

export function ConstellationNodes({ placed, onPick, t }: { placed: Placed[]; onPick: (n: ConstNode) => void; t: Translator }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {placed.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onPick(n)}
          aria-label={t("constellation.nodeAria", { name: n.label })}
          style={{ left: pct(n.x), top: pct(n.y) }}
          className={
            "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] transition " +
            (n.state === "idle" ? "text-[#6f9bb5] opacity-80" : "text-[#a9e9ff]")
          }
        >
          <span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: dot[n.state], boxShadow: n.state !== "idle" ? `0 0 10px ${dot[n.state]}` : undefined }} aria-hidden />
          {n.label}
        </button>
      ))}
    </div>
  );
}
