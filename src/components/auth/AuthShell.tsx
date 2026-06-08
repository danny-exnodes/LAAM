"use client";

// Shared auth layout: a split screen with a futuristic animated hero (grid +
// floating gradient orbs + a pointer-tilt 3D glass card) on lg+, and the form
// (children) on the right. On mobile the hero is hidden and a compact brand mark
// shows above the form.

import { useRef } from "react";
import { Activity, Bot, MessageSquare, Plug } from "lucide-react";

const FEATURES = [
  { Icon: Bot, label: "Agents", v: "thời gian thực", c: "bg-green-400" },
  { Icon: MessageSquare, label: "Chat cục bộ", v: "miễn phí · $0", c: "bg-blue-400" },
  { Icon: Plug, label: "Connectors", v: "7 dịch vụ", c: "bg-cyan-400" },
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent<HTMLElement>) {
    const el = cardRef.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateY(${px * 14}deg) rotateX(${-py * 14}deg)`;
  }
  function onLeave() {
    if (cardRef.current) cardRef.current.style.transform = "rotateY(0deg) rotateX(0deg)";
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      {/* Hero — futuristic animated panel (lg+) */}
      <section
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        className="relative hidden overflow-hidden bg-gradient-to-br from-[#0a1020] via-[#0d1b3e] to-[#14225a] p-12 text-white lg:flex lg:flex-col lg:justify-between"
        style={{ perspective: "1000px" }}
      >
        {/* perspective grid (edge-faded) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.12) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            maskImage: "radial-gradient(70% 70% at 50% 40%, #000, transparent)",
            WebkitMaskImage: "radial-gradient(70% 70% at 50% 40%, #000, transparent)",
          }}
        />
        {/* floating gradient orbs */}
        <div aria-hidden className="anim-float pointer-events-none absolute -left-16 top-24 h-64 w-64 rounded-full bg-blue-500/30 blur-3xl" />
        <div aria-hidden className="anim-float-2 pointer-events-none absolute -right-10 bottom-10 h-72 w-72 rounded-full bg-cyan-500/25 blur-3xl" />
        <div aria-hidden className="anim-glow pointer-events-none absolute right-24 top-1/3 h-40 w-40 rounded-full bg-cyan-400/20 blur-2xl" />

        <div className="relative z-10 flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <Activity size={18} aria-hidden />
          </span>
          LAAM <span className="text-sm font-normal text-white/50">v2</span>
        </div>

        {/* pointer-tilt 3D glass card */}
        <div className="relative z-10 my-auto flex justify-center" style={{ transformStyle: "preserve-3d" }}>
          <div
            ref={cardRef}
            className="w-full max-w-sm rounded-3xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-md transition-transform duration-200 ease-out"
            style={{ transformStyle: "preserve-3d" }}
          >
            <p className="text-xs tracking-[0.2em] text-white/50 uppercase">Local AI Agent Monitoring</p>
            <h2 className="mt-2 text-2xl leading-snug font-bold">
              Theo dõi đội Agent AI của bạn theo thời gian thực.
            </h2>
            <div className="mt-5 space-y-2" style={{ transform: "translateZ(40px)" }}>
              {FEATURES.map(({ Icon, label, v, c }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10">
                    <Icon size={15} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-white/50">{v}</div>
                  </div>
                  <span className={"h-2 w-2 rounded-full " + c} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="relative z-10 text-sm text-white/40">
          Chạy hoàn toàn cục bộ · Dữ liệu của bạn không rời máy.
        </p>
      </section>

      {/* Form side */}
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--color-accent)]/15 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20">
              <Activity size={18} aria-hidden />
            </span>
            <span className="text-lg font-bold tracking-tight">
              LAAM <span className="text-sm font-normal text-neutral-400">v2</span>
            </span>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
