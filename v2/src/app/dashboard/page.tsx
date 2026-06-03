import { redirect } from "next/navigation";
import { count, eq, sql, desc } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/db";
import { agentSessions, projects } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { CostChart } from "@/components/cost-chart";
import { usd, num, shortModel } from "@/lib/format";

export const dynamic = "force-dynamic";

const DAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [
    totalRows,
    runningRows,
    costRows,
    projRows,
    statusRows,
    modelRows,
    projectRows,
    detail,
  ] = await Promise.all([
    db.select({ v: count() }).from(agentSessions),
    db
      .select({ v: count() })
      .from(agentSessions)
      .where(eq(agentSessions.status, "running")),
    db
      .select({ v: sql<number>`coalesce(sum(${agentSessions.costUsd}), 0)` })
      .from(agentSessions),
    db.select({ v: count() }).from(projects),
    db
      .select({ k: agentSessions.status, v: count() })
      .from(agentSessions)
      .groupBy(agentSessions.status),
    db
      .select({ k: agentSessions.model, v: count() })
      .from(agentSessions)
      .groupBy(agentSessions.model)
      .orderBy(desc(count()))
      .limit(6),
    db
      .select({ k: projects.name, v: count() })
      .from(agentSessions)
      .leftJoin(projects, eq(agentSessions.projectId, projects.id))
      .groupBy(projects.name)
      .orderBy(desc(count()))
      .limit(6),
    db
      .select({
        histo: agentSessions.histo,
        tools: agentSessions.tools,
        costUsd: agentSessions.costUsd,
        startedAt: agentSessions.startedAt,
      })
      .from(agentSessions),
  ]);

  const total = Number(totalRows[0]?.v ?? 0);
  const running = Number(runningRows[0]?.v ?? 0);
  const cost = Number(costRows[0]?.v ?? 0);
  const projectCount = Number(projRows[0]?.v ?? 0);

  const statusData = statusRows.map((r) => ({ label: r.k ?? "—", value: Number(r.v) }));
  const modelData = modelRows.map((r) => ({ label: shortModel(r.k), value: Number(r.v) }));
  const projectData = projectRows.map((r) => ({ label: r.k ?? "Khác", value: Number(r.v) }));

  // --- heatmap (day-of-week × hour) ---
  const heat = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const r of detail) {
    const h = r.histo ?? {};
    for (const key of Object.keys(h)) {
      const [d, hr] = key.split("_").map(Number);
      if (d >= 0 && d < 7 && hr >= 0 && hr < 24) heat[d][hr] += h[key] ?? 0;
    }
  }
  const heatMax = Math.max(1, ...heat.flat());

  // --- tool leaderboard ---
  const toolMap = new Map<string, { count: number; errors: number }>();
  for (const r of detail) {
    for (const t of r.tools ?? []) {
      const a = toolMap.get(t.name) ?? { count: 0, errors: 0 };
      a.count += t.count ?? 0;
      a.errors += t.errors ?? 0;
      toolMap.set(t.name, a);
    }
  }
  const leaderboard = [...toolMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const toolMaxCount = Math.max(1, ...leaderboard.map((t) => t.count));

  // --- cost over time (last 14 active days) ---
  const byDay = new Map<string, number>();
  for (const r of detail) {
    if (!r.startedAt) continue;
    const day = new Date(r.startedAt).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + (r.costUsd ?? 0));
  }
  const costSeries = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([day, c]) => ({ day: day.slice(5), cost: Math.round(c * 100) / 100 }));

  return (
    <div>
      <AppHeader current="/dashboard" role={session.user.role} />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="mb-1 text-xl font-bold tracking-tight">
          Xin chào, {session.user.name ?? session.user.email}
        </h1>
        <p className="mb-6 text-sm text-neutral-500">
          Tổng quan giám sát (đồng bộ từ <code>~/.claude/projects</code> + local-logs).
        </p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Kpi label="Tổng session" value={num(total)} />
          <Kpi label="Đang chạy" value={num(running)} accent />
          <Kpi label="Project" value={num(projectCount)} />
          <Kpi label="Chi phí (USD)" value={usd(cost)} />
        </div>

        {total === 0 ? (
          <p className="mt-6 text-sm text-neutral-500">
            Chưa có dữ liệu — bấm <b>Đồng bộ</b> ở góc trên, rồi xem{" "}
            <Link href="/agents" className="font-medium text-[var(--color-accent)] hover:underline">
              Agents
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card title="Chi phí theo ngày (USD)">
                <CostChart data={costSeries} />
              </Card>
              <Card title="Hoạt động (giờ × thứ)">
                <Heatmap heat={heat} max={heatMax} />
              </Card>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <BarCard title="Trạng thái" data={statusData} />
              <BarCard title="Top model" data={modelData} />
              <BarCard title="Top project" data={projectData} />
            </div>

            <Card title="Tool leaderboard" className="mt-4">
              {leaderboard.length === 0 ? (
                <p className="text-xs text-neutral-400">Chưa có tool call nào.</p>
              ) : (
                <ul className="space-y-2">
                  {leaderboard.map((t) => (
                    <li key={t.name}>
                      <div className="mb-0.5 flex justify-between text-xs">
                        <span className="font-mono font-medium text-neutral-700 dark:text-neutral-300">
                          {t.name}
                        </span>
                        <span className="tabular-nums text-neutral-400">
                          {t.count}
                          {t.errors > 0 && (
                            <span className="text-red-500"> · {t.errors} err</span>
                          )}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                        <div
                          className="h-full rounded-full bg-[var(--color-accent)]"
                          style={{ width: `${(t.count / toolMaxCount) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      <div
        className={
          "mt-2 text-2xl font-extrabold tabular-nums " +
          (accent ? "text-[var(--color-accent)]" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 " +
        className
      }
    >
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      {children}
    </div>
  );
}

function BarCard({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <Card title={title}>
      {data.length === 0 ? (
        <p className="text-xs text-neutral-400">—</p>
      ) : (
        <ul className="space-y-2">
          {data.map((d) => (
            <li key={d.label}>
              <div className="mb-0.5 flex justify-between text-xs">
                <span className="truncate pr-2 text-neutral-600 dark:text-neutral-300">
                  {d.label}
                </span>
                <span className="tabular-nums text-neutral-400">{d.value}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)]"
                  style={{ width: `${(d.value / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Heatmap({ heat, max }: { heat: number[][]; max: number }) {
  return (
    <div className="overflow-x-auto">
      <div className="flex flex-col gap-1">
        {heat.map((row, d) => (
          <div key={d} className="flex items-center gap-1">
            <span className="w-7 shrink-0 text-[10px] text-neutral-400">
              {DAY_LABELS[d]}
            </span>
            <div className="flex gap-[2px]">
              {row.map((v, h) => (
                <div
                  key={h}
                  title={`${DAY_LABELS[d]} ${h}h: ${v}`}
                  className="h-3.5 w-3.5 rounded-[3px] bg-[var(--color-accent)]"
                  style={{ opacity: v === 0 ? 0.07 : 0.18 + (v / max) * 0.82 }}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="flex gap-[2px] pl-8 text-[9px] text-neutral-400">
          {[0, 6, 12, 18].map((h) => (
            <span key={h} style={{ width: 4 * 16 }}>
              {h}h
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
