import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { agentSessions } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { ago, usd, num, shortModel } from "@/lib/format";
import { getTimeline, getToolCalls } from "@/lib/monitoring/parser.js";
import { getLocalTimeline } from "@/lib/monitoring/localParser.js";

export const dynamic = "force-dynamic";

type TimelineItem = {
  ts: number | null;
  role: string;
  kind?: string;
  text?: string;
  isError?: boolean;
};
type ToolCall = {
  id: string;
  name: string;
  detail?: string;
  durationMs?: number | null;
  status?: string;
  isError?: boolean;
};

const ROLE_STYLES: Record<string, string> = {
  assistant: "text-[var(--color-accent)]",
  user: "text-green-600 dark:text-green-400",
  tool: "text-amber-600 dark:text-amber-400",
};

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

  let timeline: TimelineItem[] = [];
  let toolCalls: ToolCall[] = [];
  if (s.transcriptPath) {
    try {
      if (s.source === "local") {
        timeline = getLocalTimeline(s.transcriptPath) as unknown as TimelineItem[];
      } else {
        timeline = getTimeline(s.transcriptPath) as unknown as TimelineItem[];
        toolCalls = (getToolCalls(s.transcriptPath) as unknown as ToolCall[]).slice(-12);
      }
    } catch {
      /* file may have moved/rotated — show summary only */
    }
  }

  return (
    <div>
      <AppHeader current="/agents" role={session.user.role} />
      <main className="mx-auto max-w-4xl p-6">
        <Link href="/agents" className="text-sm text-[var(--color-accent)] hover:underline">
          ← Agents
        </Link>

        <h1 className="mt-2 font-mono text-lg font-bold break-all">{s.id}</h1>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm sm:grid-cols-3 dark:border-neutral-800 dark:bg-neutral-900">
          <Meta k="Trạng thái" v={s.status ?? "—"} />
          <Meta k="Model" v={shortModel(s.model)} />
          <Meta k="Nguồn" v={s.source} />
          <Meta k="Tin nhắn" v={num(s.messageCount)} />
          <Meta k="Tool" v={num(s.toolCount)} />
          <Meta k="Chi phí" v={usd(s.costUsd)} />
          <Meta k="Sub-agent" v={num(s.subAgentCount)} />
          <Meta k="Branch" v={s.gitBranch ?? "—"} />
          <Meta k="Hoạt động" v={ago(s.lastActivity)} />
        </dl>

        {toolCalls.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-bold">Tool calls gần đây</h2>
            <ul className="space-y-1">
              {toolCalls.map((t, i) => (
                <li
                  key={t.id ?? i}
                  className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs dark:border-neutral-800"
                >
                  <span className="font-mono font-semibold text-[var(--color-accent)]">
                    {t.name}
                  </span>
                  <span className="flex-1 truncate text-neutral-500">{t.detail}</span>
                  {t.durationMs != null && (
                    <span className="tabular-nums text-neutral-400">
                      {Math.round(t.durationMs / 100) / 10}s
                    </span>
                  )}
                  {t.isError && <span className="text-red-500">err</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold">Timeline</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-neutral-500">
              Không đọc được timeline (file có thể đã xoay vòng, hoặc nguồn ở máy khác — sẽ có khi collector đẩy events ở Phase 3).
            </p>
          ) : (
            <ol className="space-y-3">
              {timeline.map((it, i) => (
                <li key={i} className="flex gap-3 border-b border-neutral-100 pb-3 dark:border-neutral-800/60">
                  <span
                    className={
                      "w-20 shrink-0 text-[11px] font-bold uppercase tracking-wide " +
                      (ROLE_STYLES[it.role] ?? "text-neutral-400")
                    }
                  >
                    {it.role}
                  </span>
                  <p
                    className={
                      "min-w-0 flex-1 whitespace-pre-wrap break-words text-sm " +
                      (it.isError ? "text-red-600 dark:text-red-400" : "")
                    }
                  >
                    {(it.text ?? "").slice(0, 2000)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
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
