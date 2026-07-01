"use client";
import { useState } from "react";
import type { Translator } from "@/i18n/types";

/**
 * CommandDock — controlled input + caption display + chat toggle.
 *
 * Props:
 *   value / onChange — controlled input state (fed by useVoice onTranscript in ConstellationClient).
 *   onSend — caller handles clearing value + dispatching to useConstellationChat.
 */
export function CommandDock({
  t,
  caption,
  value,
  onChange,
  onSend,
}: {
  t: Translator;
  caption: string;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Caption strip — shows streaming reply text above the dock */}
      <div className="absolute bottom-40 left-1/2 z-10 -translate-x-1/2 text-center text-[14px] text-[#dcefff]">
        {caption}
      </div>

      {/* Command input panel — shown when open */}
      {open && (
        <div className="absolute bottom-20 left-1/2 z-20 flex w-[min(540px,86vw)] -translate-x-1/2 items-center gap-2 rounded-3xl border border-[#5bd6ff]/30 bg-[#08182a]/90 px-4 py-1">
          <input
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

      {/* Chat toggle button */}
      <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-3xl border border-[#5bd6ff]/20 bg-[#0a1e34]/60 px-4 py-3 text-[13px] text-[#a9e9ff]"
        >
          {t("constellation.chat")}
        </button>
      </div>
    </>
  );
}
