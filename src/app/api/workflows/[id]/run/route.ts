import { auth } from "@/auth";
import { db } from "@/db";
import { publish } from "@/lib/events-bus";
import { executeRun } from "@/lib/workflow/run";
import { buildRunNode } from "@/lib/workflow/runtime";
import { requireMutator } from "@/lib/auth/rbac";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  // viewer is read-only — a real run (dryRun=false) fires live connector writes.
  const gate = requireMutator(session);
  if (gate instanceof Response) return gate;
  const { id } = await params;
  // Optional { dryRun: true } body → Test run: connector writes are mocked (no real
  // side-effects). Body may be absent (e.g. "Run now" from the list) → real run.
  let dryRun = false;
  try {
    const body = (await req.json()) as { dryRun?: unknown } | null;
    dryRun = body?.dryRun === true;
  } catch {
    /* no/invalid body → real run */
  }
  const result = await executeRun({ workflowId: id, userId: session.user.id, trigger: "manual", dryRun }, { db, publish, buildRunNode });
  if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: result.status });
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
}
