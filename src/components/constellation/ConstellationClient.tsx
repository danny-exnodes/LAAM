"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useT } from "@/i18n/provider";
import { constellation } from "@/i18n/dictionaries/constellation";
import type { Lang } from "@/i18n/types";
import Link from "next/link";
import { buildNodes, type ConstNode } from "@/lib/constellation/nodeModel";
import { placeNodes } from "@/lib/constellation/field";
import { ConstellationCanvas } from "./ConstellationCanvas";
import { ConstellationNodes } from "./ConstellationNodes";
import type { CatalogGroup } from "@/lib/chat/toolCatalog";
import type { ConnectorStatus } from "@/lib/connectors/types";

export function ConstellationClient({ greetingName, lang }: { greetingName: string; lang: Lang }) {
  const t = useT(constellation);

  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [groups, setGroups] = useState<CatalogGroup[]>([]);
  const [connectors, setConnectors] = useState<{ id: string; name: string; status: ConnectorStatus }[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(() =>
    typeof window !== "undefined" ? (localStorage.getItem("laam:chat:agent") ?? undefined) : undefined);

  useEffect(() => {
    let alive = true;
    (async () => {
      const safe = async (u: string) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
      const [a, g, c] = await Promise.all([safe("/api/custom-agents"), safe("/api/chat/tools"), safe("/api/connectors")]);
      if (!alive) return;
      setAgents(a?.agents ?? []);
      setGroups(g?.groups ?? []);
      setConnectors((c?.connectors ?? []).map((x: { id: string; name: string; status: ConnectorStatus }) => ({ id: x.id, name: x.name, status: x.status })));
    })();
    return () => { alive = false; };
  }, []);

  const placed = useMemo(
    () => placeNodes(buildNodes({ agents, groups, connectors, selectedAgentId })),
    [agents, groups, connectors, selectedAgentId]);

  const onPick = useCallback((n: ConstNode) => {
    if (n.ref.kind === "agent") {
      setSelectedAgentId(n.ref.agentId);
      localStorage.setItem("laam:chat:agent", n.ref.agentId);
    }
    // tool pick + idle-connector handling wired in Task 6 (requestedTool) / toast
  }, []);

  // Constant 0.15 level until Task 5 wires real audio analyser
  const levelRef = useRef(0.15);
  const getLevel = useCallback(() => levelRef.current, []);

  // suppress unused-var warnings for props used by later tasks
  void greetingName;
  void lang;

  return (
    <div
      className="relative h-dvh w-screen overflow-hidden bg-[radial-gradient(135%_115%_at_50%_52%,#1d527e_0%,#0e3559_36%,#08233f_64%,#041426_100%)] text-[#eaf6ff]"
      style={{ fontFamily: "var(--font-chakra), sans-serif" }}
      role="application"
      aria-label={t("constellation.regionAria")}
    >
      {/* Canvas FX layer: z-0, behind all HTML overlays */}
      <ConstellationCanvas placed={placed} getLevel={getLevel} />
      <Link href="/chat" className="absolute right-4 top-4 z-10 rounded-full border border-[#5bd6ff]/30 bg-[#0a1e34]/60 px-4 py-2 text-sm text-[#a9e9ff]">
        {t("constellation.back")}
      </Link>
      <h1 className="absolute left-1/2 top-6 z-10 -translate-x-1/2 text-sm tracking-[0.3em] text-[#a9e9ff]">
        {t("constellation.title")}
      </h1>
      <ConstellationNodes placed={placed} onPick={onPick} t={t} />
      {/* Voice, sysinfo, command dock added in later tasks. */}
    </div>
  );
}
