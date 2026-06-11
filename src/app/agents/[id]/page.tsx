import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import type { SubAgentJson } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { ToolWaterfall } from "@/components/agents/ToolWaterfall";
import { ago, usd, num, shortModel } from "@/lib/format";
import { getToolCalls } from "@/lib/monitoring/parser.js";

export const dynamic = "force-dynamic";

type ToolCall = {
  id: string;
  name: string;
  detail?: string;
  start?: number | null;
  end?: number | null;
  durationMs?: number | null;
  status?: string;
  isError?: boolean;
};

// Session detail = the tool-call waterfall (with a real time axis) + summary +
// sub-agents. The message log lives in the Agents drawer (v1-style split), so
// this page stays short instead of being one long scroll.
export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const rows = await db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, id))
    .limit(1);
  const s = rows[0];
  if (!s) notFound();

  let toolCalls: ToolCall[] = [];
  if (s.transcriptPath && s.source !== "local") {
    try {
      toolCalls = (getToolCalls(s.transcriptPath) as unknown as ToolCall[]).slice(-50);
    } catch {
      /* file may have moved/rotated — show summary only */
    }
  }

  return (
    <div>
      {/* The Agents list is now a Monitoring tab (F3) — highlight Monitoring in
          the nav and link back there, not to the redirect-only /agents route. */}
      <AppHeader current="/monitoring" role={session.user.role} />
      <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
        <Link
          href="/monitoring?tab=agents"
          className="text-sm text-[var(--color-accent)] hover:underline"
        >
          ← Agents
        </Link>

        <h1 className="mt-2 font-mono text-lg font-bold break-all">{s.id}</h1>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm sm:grid-cols-3 lg:grid-cols-5 dark:border-neutral-800 dark:bg-neutral-900">
          <Meta k="Trạng thái" v={s.status ?? "—"} />
          <Meta k="Model" v={shortModel(s.model)} />
          <Meta k="Nguồn" v={s.source} />
          <Meta k="Tin nhắn" v={num(s.messageCount)} />
          <Meta k="Tool" v={num(s.toolCount)} />
          <Meta k="Tokens (vào/ra)" v={`${num(s.tokensIn)} / ${num(s.tokensOut)}`} />
          <Meta k="Chi phí" v={usd(s.costUsd)} />
          <Meta k="Sub-agent" v={num(s.subAgentCount)} />
          <Meta k="Branch" v={s.gitBranch ?? "—"} />
          <Meta k="Hoạt động" v={ago(s.lastActivity)} />
        </dl>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold">
            Tool-call waterfall{" "}
            <span className="text-neutral-400">{toolCalls.length}</span>
          </h2>
          {toolCalls.length > 0 ? (
            <ToolWaterfall
              calls={toolCalls.map((t) => ({
                name: t.name,
                start: t.start ?? null,
                end: t.end ?? null,
                durationMs: t.durationMs ?? null,
                isError: t.isError,
              }))}
            />
          ) : (
            <p className="text-sm text-neutral-500">
              {s.source === "local"
                ? "Nguồn local không có waterfall tool-call."
                : "Phiên này chưa có tool call (hoặc transcript đã xoay vòng)."}
            </p>
          )}
        </section>

        {s.subAgents && s.subAgents.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-bold">
              Sub-agents{" "}
              <span className="text-neutral-400">{s.subAgents.length}</span>
            </h2>
            <ul className="space-y-1">
              {(s.subAgents as SubAgentJson[]).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs dark:border-neutral-800"
                >
                  <span
                    className={
                      "inline-block h-2 w-2 shrink-0 rounded-full " +
                      (a.status === "running" ? "bg-green-500" : "bg-neutral-400")
                    }
                  />
                  <span className="font-mono font-semibold text-[var(--color-accent)]">
                    {a.type}
                  </span>
                  <span className="flex-1 truncate text-neutral-500">
                    {a.description || "(không mô tả)"}
                  </span>
                  <span className="tabular-nums text-neutral-400">
                    {a.durationMs != null
                      ? Math.round(a.durationMs / 100) / 10 + "s"
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-6 text-xs text-neutral-400">
          Log tin nhắn hiển thị ở drawer khi mở agent từ trang{" "}
          <Link
            href="/monitoring?tab=agents"
            className="text-[var(--color-accent)] hover:underline"
          >
            Agents
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-400">{k}</dt>
      <dd className="font-medium break-all">{v}</dd>
    </div>
  );
}
