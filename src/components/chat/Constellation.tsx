"use client";

// Constellation command-center — a radial "map" of the user's local AI surface:
// custom agents on an inner ring, connector / MCP / internal tool groups on an
// outer ring, around a central assistant orb. Purely PRESENTATIONAL: it renders
// data passed in and calls back the SAME dispatch paths the composer/settings
// already use (Rule 13 — node.ref carries ground-truth objects, never strings).
//
// Visuals are dependency-light: one inline <svg> (a SINGLE shared <defs> glow
// filter for all beams), HTML overlay buttons positioned by percentage (avoids
// foreignObject focus quirks), and the existing Bloom + --accent tokens. All
// motion is opacity/transform only and the shared .anim-glow keyframe is already
// disabled under prefers-reduced-motion.

import { useRef, useState } from "react";
import { X, Mic, AudioLines } from "lucide-react";
import type { Translator } from "@/i18n/types";
import { Bloom } from "@/components/ui/bloom";
import { layoutConstellation, type ConstellationNode } from "./constellationLayout";
import type { CatalogGroup, CatalogTool } from "@/lib/chat/toolCatalog";

// origin-centered (-50..50) → percentage for an absolutely-positioned overlay.
const pct = (v: number) => `${50 + v}%`;

function dotColor(node: ConstellationNode, active: boolean): string {
  if (node.kind === "agent") return active ? "var(--accent)" : "var(--accent)";
  if ("group" in node.ref) {
    const hasWrite = node.ref.group.tools.some((t) => t.kind === "write");
    return hasWrite ? "#d97706" : "var(--accent)";
  }
  return "var(--accent)";
}

export function Constellation({
  groups,
  agents,
  activeAgentId,
  onFocusTool,
  onFocusAgent,
  onClose,
  t,
  voiceSupported = false,
  voiceOn = false,
  listening = false,
  speaking = false,
  onToggleVoice,
  onMic,
}: {
  groups: CatalogGroup[];
  agents: { id: string; name: string }[];
  activeAgentId?: string;
  onFocusTool: (group: CatalogGroup, tool?: CatalogTool) => void;
  onFocusAgent: (id: string) => void;
  onClose: () => void;
  t: Translator;
  voiceSupported?: boolean;
  voiceOn?: boolean;
  listening?: boolean;
  speaking?: boolean;
  onToggleVoice?: () => void;
  onMic?: () => void;
}) {
  const nodes = layoutConstellation(groups, agents);
  const [focus, setFocus] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      if (nodes.length) setFocus((f) => (f + 1) % nodes.length);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      if (nodes.length) setFocus((f) => (f - 1 + nodes.length) % nodes.length);
    }
  }

  const activate = (node: ConstellationNode) => {
    if ("agentId" in node.ref) onFocusAgent(node.ref.agentId);
    else onFocusTool(node.ref.group, node.ref.tool);
  };

  const orbActive = listening || speaking;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={t("chat.constellationRegionAria")}
      onKeyDown={onKeyDown}
      className="relative mx-auto w-full max-w-[min(78vh,40rem)]"
    >
      {/* Header: title + legend + close */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-bold tracking-tight">{t("chat.constellationTitle")}</h3>
          <span className="hidden text-[11px] text-neutral-400 sm:inline">
            <span className="text-[var(--accent)]">●</span> {t("chat.constellationLegendAgents")} ·{" "}
            <span className="opacity-60">●</span> {t("chat.constellationLegendConnectors")}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("chat.constellationCloseAria")}
          className="rounded-full p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="relative aspect-square w-full">
        {/* Beams + rings + orb glow (one shared glow filter for all beams). */}
        <svg viewBox="-50 -50 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <filter id="cst-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="0.8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="cst-orb">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
              <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* faint guide rings */}
          <circle cx="0" cy="0" r="22" fill="none" stroke="var(--accent)" strokeOpacity="0.08" strokeWidth="0.3" />
          <circle cx="0" cy="0" r="40" fill="none" stroke="var(--accent)" strokeOpacity="0.06" strokeWidth="0.3" />
          {/* beams from orb to each node */}
          {nodes.map((n) => {
            const cx = n.x * 0.5 - n.y * 0.12;
            const cy = n.y * 0.5 + n.x * 0.12;
            return (
              <path
                key={`beam-${n.id}`}
                d={`M0,0 Q${cx.toFixed(2)},${cy.toFixed(2)} ${n.x},${n.y}`}
                fill="none"
                stroke="var(--accent)"
                strokeOpacity={activeAgentId && "agentId" in n.ref && n.ref.agentId === activeAgentId ? 0.6 : 0.22}
                strokeWidth="0.4"
                filter="url(#cst-glow)"
              />
            );
          })}
          {/* central orb */}
          <circle
            cx="0"
            cy="0"
            r={orbActive ? 13 : 11}
            fill="url(#cst-orb)"
            filter="url(#cst-glow)"
            className="anim-glow"
            style={{ transition: "r 200ms ease" }}
          />
          <circle cx="0" cy="0" r="6.5" fill="none" stroke="var(--accent)" strokeOpacity="0.7" strokeWidth="0.5" />
        </svg>

        {/* Decorative bloom behind the orb (matte-dark depth). */}
        <Bloom position="center" size="45%" />

        {/* Node buttons (HTML overlay positioned by %). */}
        {nodes.map((n, i) => {
          const active = "agentId" in n.ref && n.ref.agentId === activeAgentId;
          return (
            <button
              key={n.id}
              type="button"
              tabIndex={i === focus ? 0 : -1}
              onFocus={() => setFocus(i)}
              onClick={() => activate(n)}
              aria-label={t("chat.constellationNodeAria", { name: n.label, kind: n.kind })}
              style={{ left: pct(n.x), top: pct(n.y) }}
              className={
                "absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] " +
                (active
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-[var(--accent)] dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200")
              }
            >
              <span
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                style={{ background: dotColor(n, active) }}
                aria-hidden
              />
              {n.label}
            </button>
          );
        })}

        {nodes.length === 0 && (
          <p className="absolute inset-x-0 bottom-2 text-center text-xs text-neutral-400">
            {t("chat.constellationEmpty")}
          </p>
        )}
      </div>

      {/* Voice controls (Chat / Voice On + mic) — only when the browser supports it. */}
      {voiceSupported && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onToggleVoice}
            aria-pressed={voiceOn}
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition " +
              (voiceOn
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300")
            }
          >
            <AudioLines size={13} aria-hidden />
            {voiceOn ? t("chat.voiceOn") : t("chat.voiceOff")}
          </button>
          <button
            type="button"
            onClick={onMic}
            aria-pressed={listening}
            aria-label={listening ? t("chat.micStopAria") : t("chat.micStartAria")}
            className={
              "inline-flex h-9 w-9 items-center justify-center rounded-full transition " +
              (listening
                ? "bg-[var(--accent)] text-[var(--accent-fg)] anim-glow"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300")
            }
          >
            <Mic size={15} aria-hidden />
          </button>
          {listening && <span className="text-xs text-[var(--accent)]">{t("chat.listening")}</span>}
          {speaking && <span className="text-xs text-neutral-400">{t("chat.speaking")}</span>}
        </div>
      )}
    </div>
  );
}
