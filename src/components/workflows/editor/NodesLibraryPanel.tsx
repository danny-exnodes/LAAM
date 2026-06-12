"use client";

// Left "Nodes Library" panel — the desktop way to add workflow steps.
// Two add gestures (user choice "Cả hai"):
//   • click a card  → append to the chain (addNode at viewport center)
//   • drag a card   → drop on the canvas → addNode at the drop position
// Three layout modes (show/hide/float), mirroring the config panel's dock/float.
// Desktop-only; on mobile the toolbar keeps its compact palette row.

import { Bot, Plug, GitBranch, Repeat, Server, Move, PanelLeftClose, GripVertical } from "lucide-react";
import type { WfNodeKind } from "@/lib/workflow/types";
import type { Translator } from "@/i18n/types";

export type LibraryMode = "docked" | "float" | "hidden";

// MIME for drag-to-add; WorkflowEditor's canvas onDrop reads this key.
export const NODE_KIND_MIME = "application/wf-node-kind";

// Exported (P4): the mobile palette row derives from the SAME list so a new node
// kind shows up on both desktop library and mobile palette automatically.
export const NODE_TYPES: { kind: WfNodeKind; Icon: typeof Bot; color: string }[] = [
  { kind: "agent", Icon: Bot, color: "#a855f7" },
  { kind: "connector", Icon: Plug, color: "#06b6d4" },
  { kind: "mcp", Icon: Server, color: "#c026d3" },
  { kind: "condition", Icon: GitBranch, color: "#f59e0b" },
  { kind: "foreach", Icon: Repeat, color: "#10b981" },
];

export function NodesLibraryPanel({
  onAdd,
  t,
  mode,
  onSetMode,
  onFloatDragStart,
}: {
  onAdd: (kind: WfNodeKind) => void;
  t: Translator;
  mode: LibraryMode;
  onSetMode: (m: LibraryMode) => void;
  /** mousedown on the float header → start dragging (only used in float mode) */
  onFloatDragStart?: (e: React.MouseEvent) => void;
}) {
  const floating = mode === "float";
  return (
    <div
      className={
        "flex w-60 flex-col gap-2 bg-white p-2.5 dark:bg-neutral-900 " +
        (floating
          ? "rounded-xl border border-neutral-200 shadow-2xl dark:border-neutral-700"
          : "h-full border-r border-neutral-200 dark:border-neutral-800")
      }
      data-testid="nodes-library"
    >
      <header className="flex items-center justify-between gap-2">
        <div
          className={"flex items-center gap-1.5 " + (floating ? "cursor-grab active:cursor-grabbing" : "")}
          onMouseDown={floating ? onFloatDragStart : undefined}
        >
          {floating && <GripVertical size={13} className="text-neutral-400" aria-hidden />}
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{t("wf.lib.title")}</span>
        </div>
        {/* Control cluster: float/dock + hide — grouped together (not scattered) */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onSetMode(floating ? "docked" : "float")}
            aria-label={floating ? t("wf.lib.dock") : t("wf.lib.float")}
            title={floating ? t("wf.lib.dock") : t("wf.lib.float")}
            className="rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <Move size={14} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onSetMode("hidden")}
            aria-label={t("wf.lib.hide")}
            title={t("wf.lib.hide")}
            className="rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <PanelLeftClose size={14} aria-hidden />
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-1.5 overflow-y-auto">
        {NODE_TYPES.map(({ kind, Icon, color }) => (
          <button
            key={kind}
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(NODE_KIND_MIME, kind);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onAdd(kind)}
            className="flex cursor-grab items-center gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-left transition hover:border-[var(--color-accent)] active:cursor-grabbing dark:border-neutral-700 dark:bg-neutral-800"
          >
            <span className="shrink-0" style={{ color }} aria-hidden>
              <Icon size={18} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-neutral-800 dark:text-neutral-100">{t(`wf.lib.${kind}.name`)}</span>
              <span className="block truncate text-xs text-neutral-400">{t(`wf.lib.${kind}.desc`)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
