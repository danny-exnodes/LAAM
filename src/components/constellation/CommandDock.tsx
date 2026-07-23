"use client";
import type { Translator } from "@/i18n/types";

/**
 * CommandDock — caption strip + (when `open`) a controlled command input.
 *
 * The Chat / Voice toggles now live in the ConstellationClient control bar,
 * so this component no longer positions its own toggle button (that stacking
 * at the same bottom-centre point was the cause of the overlap). It renders
 * only the caption and, when the command panel is open, the input row.
 */
export function CommandDock({
  t,
  caption,
  open,
  value,
  onChange,
  onSend,
}: {
  t: Translator;
  caption: string;
  open: boolean;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <>
      {/* Caption strip — streaming reply text, above the input/bar */}
      {caption && (
        <div
          className="pointer-events-none absolute bottom-14 left-1/2 z-10 max-w-[80vw] -translate-x-1/2 text-center text-[14px] text-[#eaf9ff]"
          style={{ textShadow: "0 0 16px rgba(150,225,255,.85), 0 0 34px rgba(91,214,255,.5)" }}
        >
          {caption}
        </div>
      )}

      {/* Command input panel — shown when open, above the control bar */}
      {open && (
        <div className="absolute bottom-24 right-4 z-20 flex w-[min(540px,86vw)] items-center gap-2 rounded-3xl border border-[#5bd6ff]/30 bg-[#08182a]/90 px-4 py-1 backdrop-blur-sm">
          <input
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSend()}
            placeholder={t("constellation.commandPlaceholder")}
            className="flex-1 bg-transparent py-3 text-white outline-none"
          />
          <button
            type="button"
            onClick={onSend}
            className="rounded-2xl bg-[#5bd6ff]/20 px-3 py-2 text-xs text-[#a9e9ff]"
          >
            {t("constellation.send")}
          </button>
        </div>
      )}
    </>
  );
}
