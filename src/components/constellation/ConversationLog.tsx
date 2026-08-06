"use client";

// In-page transcript for Larvis (/constellation). Before this, reviewing what was said
// meant hitting "Open in Chat", which leaves the page and tears down the voice session —
// the one thing a hands-free user must not have to do to re-read a number.
//
// Deliberately NOT modal and NOT a dialog: the user keeps talking while it is open, so
// there is no focus trap and no backdrop. Same reasoning as DisplayPanel (role="region").
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Turn } from "./turns";

export function ConversationLog({
  turns,
  open,
  onClose,
  title,
  emptyLabel,
  closeLabel,
  youLabel,
}: {
  turns: Turn[];
  // false = playing the exit animation while still mounted; the parent unmounts it after
  // PANEL_EXIT_MS (same pattern as DisplayPanel).
  open: boolean;
  onClose: () => void;
  title: string;
  emptyLabel: string;
  closeLabel: string;
  youLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pin to the newest turn. A transcript that keeps the user's scroll position at the top
  // would show stale content exactly when a new answer lands — the opposite of the point.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  return (
    <section
      role="region"
      aria-label={title}
      aria-hidden={!open}
      className={[
        // Left column, spanning the free band between the header row and the bottom dock.
        // z-20 keeps it UNDER DisplayPanel (z-30): when both are open the current answer
        // stays on top, the transcript is reference material behind it.
        "absolute left-6 top-[28%] bottom-28 z-20 flex w-[340px] max-w-[calc(100vw-3rem)] flex-col",
        "rounded-2xl border border-[#5bd6ff]/20 bg-[#08182a]/40 backdrop-blur-md",
        "text-[#eaf6ff]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_40px_-12px_rgba(0,0,0,0.5)]",
        open ? "pointer-events-auto anim-panel-in" : "pointer-events-none anim-panel-out",
      ].join(" ")}
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate text-[11px] uppercase tracking-[0.18em] text-[#a9e9ff]">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="rounded-full border border-[#5bd6ff]/30 p-1 text-[#a9e9ff] transition-colors hover:bg-white/5"
        >
          <X size={12} />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
        {turns.length === 0 ? (
          <p className="text-[12px] text-[#a9e9ff]/60">{emptyLabel}</p>
        ) : (
          turns.map((turn, i) => (
            <div
              key={i}
              className={[
                "rounded-xl px-3 py-2 text-[12px] leading-relaxed",
                // The user's own words sit right and warm, Larvis left and cool — the same
                // colour split the constellation already uses for "you" vs "the system".
                turn.role === "user"
                  ? "ml-6 border border-[#ffd479]/25 bg-[#ffc450]/10 text-[#ffe2a6]"
                  : "mr-6 border border-[#5bd6ff]/20 bg-white/[0.04] text-[#eaf6ff]",
              ].join(" ")}
            >
              <span className="mb-0.5 block text-[10px] uppercase tracking-wider opacity-60">
                {turn.role === "user" ? youLabel : "Larvis"}
              </span>
              {turn.text}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
