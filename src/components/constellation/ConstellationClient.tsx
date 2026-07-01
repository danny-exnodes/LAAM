"use client";
import { useT } from "@/i18n/provider";
import { constellation } from "@/i18n/dictionaries/constellation";
import type { Lang } from "@/i18n/types";
import Link from "next/link";

export function ConstellationClient({ greetingName, lang }: { greetingName: string; lang: Lang }) {
  const t = useT(constellation);
  return (
    <div
      className="relative h-dvh w-screen overflow-hidden bg-[radial-gradient(135%_115%_at_50%_52%,#1d527e_0%,#0e3559_36%,#08233f_64%,#041426_100%)] text-[#eaf6ff]"
      style={{ fontFamily: "var(--font-chakra), sans-serif" }}
      role="application"
      aria-label={t("constellation.regionAria")}
    >
      <Link href="/chat" className="absolute right-4 top-4 z-10 rounded-full border border-[#5bd6ff]/30 bg-[#0a1e34]/60 px-4 py-2 text-sm text-[#a9e9ff]">
        {t("constellation.back")}
      </Link>
      <h1 className="absolute left-1/2 top-6 z-10 -translate-x-1/2 text-sm tracking-[0.3em] text-[#a9e9ff]">
        {t("constellation.title")}
      </h1>
      {/* Canvas, nodes, sysinfo, command dock added in later tasks. greetingName={greetingName} lang={lang} */}
    </div>
  );
}
