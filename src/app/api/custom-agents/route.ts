// P3: Custom Agent presets (per-user) — list + create.
// GET  /api/custom-agents  → { agents }
// POST /api/custom-agents  → { ok, agent } (viewer 403; name/system bắt buộc)
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { customAgents } from "@/db/schema";
import { listCustomAgents } from "@/lib/customAgents";
import { requireMutator } from "@/lib/auth/rbac";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ agents: await listCustomAgents(session.user.id) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gate = requireMutator(session); // viewer is read-only
  if (gate instanceof Response) return gate;

  const body = (await req.json().catch(() => null)) as { name?: unknown; system?: unknown; description?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const system = typeof body?.system === "string" ? body.system.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 500) : "";
  if (!name || !system) {
    return NextResponse.json({ error: "cần name và system" }, { status: 400 });
  }

  const rows = await db
    .insert(customAgents)
    .values({ userId: session.user.id, name, system, ...(description ? { description } : {}) })
    .returning();
  return NextResponse.json({ ok: true, agent: rows[0] });
}
