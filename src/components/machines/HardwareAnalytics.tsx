"use client";

import { Cpu, Microchip, MemoryStick, HardDrive } from "lucide-react";
import { useHostMetrics } from "@/hooks/useHostMetrics";
import { useT } from "@/i18n/provider";
import { machinesDict } from "@/i18n/dictionaries/machines";
import { METRIC_COLORS } from "@/lib/metric-colors";
import { gb, pct } from "@/lib/host-metrics.types";
import { MetricCard } from "./MetricCard";
import { MetricSparkline } from "./MetricSparkline";

// Realtime hardware analytics for the host server: 4 gauge cards
// (CPU/GPU/VRAM/RAM) + 2 trend charts (compute / memory). Polls every ~2s.
export function HardwareAnalytics() {
  const t = useT(machinesDict);
  const { current, history, status } = useHostMetrics();

  if (status === "unavailable") {
    return (
      <div className="chart-card mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        {t("machines.hw.unavailable")}
      </div>
    );
  }
  if (!current) {
    return (
      <div className="chart-card mb-6 text-sm text-neutral-400">
        {t("machines.hw.loading")}
      </div>
    );
  }

  const g = current.gpus[0];
  const ramPct = pct(current.ram.usedBytes, current.ram.totalBytes);
  const vramPct = g ? pct(g.memUsedBytes, g.memTotalBytes) : 0;

  const trend = history.map((m) => {
    const gg = m.gpus[0];
    return {
      t: m.ts,
      cpu: m.cpu.usagePct,
      gpu: gg?.utilPct ?? 0,
      ram: pct(m.ram.usedBytes, m.ram.totalBytes),
      vram: gg ? pct(gg.memUsedBytes, gg.memTotalBytes) : 0,
    };
  });

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {t("machines.hw.title")}
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label={t("machines.hw.cpu")}
          color={METRIC_COLORS.cpu}
          valuePct={current.cpu.usagePct}
          primary={`${current.cpu.usagePct}%`}
          sub={t("machines.hw.cores", { n: current.cpu.cores })}
          icon={<Cpu size={16} />}
        />
        <MetricCard
          label={t("machines.hw.gpu")}
          color={METRIC_COLORS.gpu}
          valuePct={g?.utilPct ?? 0}
          primary={g ? `${g.utilPct}%` : "—"}
          sub={g ? `${g.tempC}°C` : t("machines.hw.noGpu")}
          icon={<Microchip size={16} />}
        />
        <MetricCard
          label={t("machines.hw.vram")}
          color={METRIC_COLORS.vram}
          valuePct={vramPct}
          primary={g ? `${gb(g.memUsedBytes)}/${gb(g.memTotalBytes)} GB` : "—"}
          sub={g ? `${vramPct}%` : t("machines.hw.noGpu")}
          icon={<HardDrive size={16} />}
        />
        <MetricCard
          label={t("machines.hw.ram")}
          color={METRIC_COLORS.ram}
          valuePct={ramPct}
          primary={`${gb(current.ram.usedBytes)}/${gb(current.ram.totalBytes)} GB`}
          sub={`${ramPct}%`}
          icon={<MemoryStick size={16} />}
        />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <MetricSparkline
          title={t("machines.hw.utilization")}
          data={trend}
          series={[
            { key: "gpu", name: t("machines.hw.gpu"), color: METRIC_COLORS.gpu },
            { key: "cpu", name: t("machines.hw.cpu"), color: METRIC_COLORS.cpu },
          ]}
        />
        <MetricSparkline
          title={t("machines.hw.memory")}
          data={trend}
          series={[
            { key: "vram", name: t("machines.hw.vram"), color: METRIC_COLORS.vram },
            { key: "ram", name: t("machines.hw.ram"), color: METRIC_COLORS.ram },
          ]}
        />
      </div>
    </section>
  );
}
