import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Node, Edge } from "@xyflow/react";
import { auth } from "@/auth";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { GraphCanvas } from "@/components/graph-canvas";
import { shortModel } from "@/lib/format";
import { resolve } from "@/i18n";
import { common } from "@/i18n/dictionaries/common";
import { LANG_COOKIE } from "@/i18n/cookie";
import type { Lang } from "@/i18n/types";

export const dynamic = "force-dynamic";

const ROW = 64;
const GAP = 40;
const COL = 380;

function nodeStyle(status: string | null): React.CSSProperties {
  const color =
    status === "running" ? "#16a34a" : status === "idle" ? "#d97706" : "#64748b";
  return {
    background: "var(--bg, #fff)",
    border: `1px solid ${color}`,
    borderLeft: `4px solid ${color}`,
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 11,
    whiteSpace: "pre-line",
    width: 200,
    color: "#1a1d21",
  };
}

export default async function GraphPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Server component: read the persisted language like the root layout does
  // (LangSelect calls router.refresh() so this re-renders on switch).
  const rawLang = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = rawLang === "en" || rawLang === "zh" ? rawLang : "vi";

  const sessions = await db.select().from(agentSessions);
  const orchestrators = sessions.filter((s) => (s.subAgents?.length ?? 0) > 0);

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let cursor = 0;
  for (const s of orchestrators) {
    const subs = s.subAgents ?? [];
    const blockH = Math.max(1, subs.length) * ROW;
    const sessionY = cursor + blockH / 2 - ROW / 2;
    nodes.push({
      id: s.id,
      position: { x: 0, y: sessionY },
      data: { label: `${shortModel(s.model)}\n${s.id.slice(0, 8)}` },
      style: nodeStyle(s.status),
    });
    subs.forEach((sub, j) => {
      const subId = `${s.id}:${sub.id}`;
      nodes.push({
        id: subId,
        position: { x: COL, y: cursor + j * ROW },
        data: {
          label: `${sub.type}\n${(sub.description || "").slice(0, 30)}`,
        },
        style: nodeStyle(sub.status === "running" ? "running" : "done"),
      });
      edges.push({
        id: `${s.id}->${subId}`,
        source: s.id,
        target: subId,
        animated: sub.status === "running",
      });
    });
    cursor += blockH + GAP;
  }

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader current="/graph" role={session.user.role} />
      {orchestrators.length === 0 ? (
        <main className="w-full p-6">
          <h1 className="text-xl font-bold tracking-tight">Graph</h1>
          <p className="mt-3 text-sm text-neutral-500">{resolve(common, lang, "graph.empty")}</p>
        </main>
      ) : (
        <div className="min-h-0 flex-1">
          <GraphCanvas nodes={nodes} edges={edges} />
        </div>
      )}
    </div>
  );
}
