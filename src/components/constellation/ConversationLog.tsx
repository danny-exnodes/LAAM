"use client";

// In-page transcript for Larvis (/constellation). Before this, reviewing what was said
// meant hitting "Open in Chat", which leaves the page and tears down the voice session —
// the one thing a hands-free user must not have to do to re-read a number.
//
// Chromeless by design: no frame, no header, no close button — just bubbles floating over
// the starfield, stacked directly above the command input and shown/hidden with it. The
// framed left-hand panel it replaced read as a second window bolted onto the page.
//
// Deliberately NOT modal and NOT a dialog: the user keeps talking while it is open, so
// there is no focus trap and no backdrop. Same reasoning as DisplayPanel (role="region").
import { useEffect, useRef } from "react";
import { ChatMarkdown } from "@/components/render/ChatMarkdown";
import type { Turn } from "./turns";

export function ConversationLog({
  turns,
  open,
  title,
  youLabel,
}: {
  turns: Turn[];
  // false = playing the exit animation while still mounted; the parent unmounts it after
  // PANEL_EXIT_MS (same pattern as DisplayPanel).
  open: boolean;
  // Not rendered — there is no visible header any more. Kept as the region's accessible
  // name so the landmark is still announced with something meaningful.
  title: string;
  youLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pin to the newest turn. A transcript that keeps the user's scroll position at the top
  // would show stale content exactly when a new answer lands — the opposite of the point.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  if (turns.length === 0) return null; // nothing to say yet — don't float an empty box

  return (
    <section
      role="region"
      aria-label={title}
      aria-hidden={!open}
      ref={scrollRef}
      className={[
        // Sits directly above CommandDock's input (bottom-24, right-4) and matches its
        // right edge, so the two read as one stack rather than two floating widgets.
        "absolute bottom-36 right-4 z-20 flex w-[min(400px,86vw)] max-h-[46vh] flex-col gap-2 overflow-y-auto",
        open ? "pointer-events-auto anim-panel-in" : "pointer-events-none anim-panel-out",
      ].join(" ")}
    >
      {turns.map((turn, i) => (
        <div
          key={i}
          className={[
            "rounded-2xl px-3 py-2 text-[12px] leading-relaxed",
            // Each bubble carries its own opaque background: with the wrapper gone there is
            // nothing else between the text and the moving starfield.
            // Solid rgba, NOT backdrop-blur — one blurred surface over the WebGL canvas was
            // already costly (see DisplayPanel); N of them per turn would be far worse.
            turn.role === "user"
              ? "ml-8 self-end border border-[#ffd479]/30 bg-[#3a2c12]/85 text-[#ffe2a6]"
              : "mr-8 border border-[#5bd6ff]/20 bg-[#08182a]/85 text-[#eaf6ff]",
          ].join(" ")}
        >
          <span className="mb-0.5 block text-[10px] uppercase tracking-wider opacity-60">
            {turn.role === "user" ? youLabel : "Larvis"}
          </span>
          {/* Assistant replies go through the SAME renderer as /chat so both surfaces
              format identically. The user's own message is plain text there too — it is
              typed/spoken input, not markup, and rendering it would let a stray asterisk
              silently reflow what the user actually said. */}
          {turn.role === "assistant" ? (
            <ChatMarkdown source={turn.text} className="chat-md" />
          ) : (
            turn.text
          )}
        </div>
      ))}
    </section>
  );
}
