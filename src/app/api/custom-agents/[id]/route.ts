// P3: Custom Agent presets — sửa/xoá (owner only; ownership ở tầng query
// qua getCustomAgent per-user filter).
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { customAgents } from "@/db/schema";
import { getCustomAgent } from "@/lib/customAgents";
import { requireMutator } from "@/lib/auth/rbac";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gate = requireMutator(session); // viewer is read-only
  if (gate instanceof Response) return gate;
  const { id } = await params;
  const agent = await getCustomAgent(session.user.id, id);
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { name?: unknown; system?: unknown; description?: unknown } | null;
  const patch: { name?: string; system?: string; description?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  // Field được GỬI thì phải hợp lệ — rỗng tường minh = 400 (không ghi đè rác).
  if (body && "name" in body) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) return NextResponse.json({ error: "name rỗng" }, { status: 400 });
    patch.name = name;
  }
  if (body && "system" in body) {
    const system = typeof body.system === "string" ? body.system.trim() : "";
    if (!system) return NextResponse.json({ error: "system rỗng" }, { status: 400 });
    patch.system = system;
  }
  if (body && "description" in body) {
    patch.description = typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 500) : null;
  }

  await db.update(customAgents).set(patch).where(eq(customAgents.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const gate = requireMutator(session); // viewer is read-only
  if (gate instanceof Response) return gate;
  const { id } = await params;
  const agent = await getCustomAgent(session.user.id, id);
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.delete(customAgents).where(eq(customAgents.id, id));
  return NextResponse.json({ ok: true });
}
