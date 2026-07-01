"use client";
import { useEffect, useState } from "react";
import type { Translator, Lang } from "@/i18n/types";

// Map WMO weather-code to i18n key bucket
function wxLabel(code: number): string {
  if (code === 0) return "constellation.wxClear";
  if (code <= 3) return "constellation.wxCloud";
  if (code <= 48) return "constellation.wxFog";
  if (code <= 67) return "constellation.wxRain";
  if (code <= 77) return "constellation.wxSnow";
  if (code <= 82) return "constellation.wxRain";
  return "constellation.wxStorm";
}

export function SysInfoPanel({
  greetingName,
  t,
  lang: _lang,
}: {
  greetingName: string;
  t: Translator;
  lang: Lang;
}) {
  const [wx, setWx] = useState<{ tempC: number; code: number; city: string } | null>(null);
  const [factIdx, setFactIdx] = useState(0);

  const facts = ["constellation.fact1", "constellation.fact2", "constellation.fact3"] as const;
  const hour = new Date().getHours();
  const greet =
    hour < 11
      ? "constellation.greetMorning"
      : hour < 18
        ? "constellation.greetAfternoon"
        : "constellation.greetEvening";

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Fact rotation — disabled under prefers-reduced-motion
    const reduce =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion:reduce)").matches
        : false;
    const rot = reduce
      ? undefined
      : setInterval(() => setFactIdx((i) => (i + 1) % facts.length), 11000);

    // Geo weather — fail-soft; falls back to Ho Chi Minh City
    const done = (lat: number, lng: number) => {
      fetch(`/api/weather?lat=${lat}&lng=${lng}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(async (w: { tempC: number; code: number } | null) => {
          if (!w) return;
          // /api/reverse returns { address: string; lat: number; lng: number }
          const rev = await fetch(`/api/reverse?lat=${lat}&lng=${lng}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null) as { address?: string } | null;
          setWx({ tempC: w.tempC, code: w.code, city: rev?.address ?? "" });
        })
        .catch(() => {});
    };

    navigator.geolocation?.getCurrentPosition(
      (p) => done(p.coords.latitude, p.coords.longitude),
      () => done(10.7769, 106.7009),
      { timeout: 5000 },
    );

    return () => {
      if (rot) clearInterval(rot);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute left-6 top-6 z-10 max-w-[330px] leading-relaxed">
      {wx && (
        <div className="flex items-start gap-3">
          <div className="text-3xl text-[#a9e9ff]">{wx.tempC}°</div>
          <div className="mt-2 font-mono text-[9px] uppercase tracking-[2px] text-[#6f9bb5]">
            {wx.city}
            <br />
            {t(wxLabel(wx.code))}
          </div>
        </div>
      )}
      <div className="mt-3 font-mono text-[10.5px] uppercase tracking-[3px] text-[#5bd6ff]">
        {t(greet)},<br />
        <b className="text-white">{greetingName || "—"}</b>
      </div>
      <div className="mt-3 font-mono text-[8px] uppercase tracking-[2.5px] text-[#3d6480]">
        {t("constellation.onThisDay")}
      </div>
      <div className="mt-1 text-[11.5px] text-[#bcd9ec] opacity-80">{t(facts[factIdx])}</div>
    </div>
  );
}
