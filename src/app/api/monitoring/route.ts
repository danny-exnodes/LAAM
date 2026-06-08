import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getMonitoredRuns,
  type MonitoredSource,
  type MonitoringQuery,
} from "@/lib/monitoring/read-model";

const SOURCES: MonitoredSource[] = ["local", "claude", "chat", "workflow", "api", "mcp"];

// GET /api/monitoring?source=&limit= — unified "monitored runs" across local,
// chat, workflow and external (api/mcp). Results are already visibility-filtered
// for the caller (Q2: org-shared vs per-user, per source).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const sourceParam = url.searchParams.get("source");
  const limitParam = Number(url.searchParams.get("limit"));

  const q: MonitoringQuery = {};
  if (sourceParam && SOURCES.includes(sourceParam as MonitoredSource)) {
    q.source = sourceParam as MonitoredSource;
  }
  if (Number.isFinite(limitParam) && limitParam > 0) q.limit = limitParam;

  const runs = await getMonitoredRuns(
    { userId: session.user.id as string, role: session.user.role as string },
    q,
  );
  return NextResponse.json({ runs });
}
