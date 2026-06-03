import { redirect } from "next/navigation";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { agentSessions, projects, type AgentSession } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { ago, usd, num, shortModel } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  running: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  idle: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  done: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export default async function AgentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [allProjects, sessions] = await Promise.all([
    db.select().from(projects),
    db.select().from(agentSessions).orderBy(desc(agentSessions.lastActivity)),
  ]);

  const groups = new Map<string, { name: string; items: AgentSession[] }>();
  for (const p of allProjects) groups.set(p.id, { name: p.name, items: [] });
  const ungrouped: AgentSession[] = [];
  for (const s of sessions) {
    const g = s.projectId ? groups.get(s.projectId) : undefined;
    if (g) g.items.push(s);
    else ungrouped.push(s);
  }
  if (ungrouped.length) groups.set("__other", { name: "Khác", items: ungrouped });

  const visible = [...groups.values()].filter((g) => g.items.length > 0);

  return (
    <div>
      <AppHeader current="/agents" role={session.user.role} />
      <main className="mx-auto max-w-6xl p-6">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Agents</h1>
          <span className="text-sm text-neutral-500">{sessions.length} session</span>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-neutral-300 p-12 text-center dark:border-neutral-700">
            <p className="font-medium">Chưa có dữ liệu giám sát.</p>
            <p className="mt-1 text-sm text-neutral-500">
              Bấm <b>Đồng bộ</b> ở góc trên để quét{" "}
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                ~/.claude/projects
              </code>{" "}
              vào Postgres.
            </p>
          </div>
        ) : (
          visible.map((g) => (
            <section key={g.name} className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
                {g.name}
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 dark:bg-neutral-800">
                  {g.items.length}
                </span>
              </h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
                {g.items.map((s) => (
                  <SessionCard key={s.id} s={s} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

function SessionCard({ s }: { s: AgentSession }) {
  const status = s.status ?? "done";
  return (
    <Link
      href={`/agents/${s.id}`}
      className="block rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={
            "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide " +
            (STATUS_STYLES[status] ?? STATUS_STYLES.done)
          }
        >
          {status}
        </span>
        <div className="text-right">
          <div className="font-mono text-[11px] text-neutral-500">
            {shortModel(s.model)}
          </div>
          {s.source === "local" && (
            <span className="text-[10px] font-semibold text-sky-500">⬡ LOCAL</span>
          )}
        </div>
      </div>

      {s.latestActivity && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          {s.latestActivity}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        <span>{ago(s.lastActivity)}</span>
        <span>{num(s.messageCount)} msg</span>
        <span>{num(s.toolCount)} tool</span>
        {s.subAgentCount > 0 && <span>{s.subAgentCount} sub</span>}
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          {usd(s.costUsd)}
        </span>
        {s.gitBranch && <span className="font-mono">⎇ {s.gitBranch}</span>}
      </div>
    </Link>
  );
}
