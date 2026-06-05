import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import type { WorkflowGraph } from "@/lib/workflow/types";

export const dynamic = "force-dynamic";

/**
 * /workflows/new — creates a minimal starter workflow and redirects to
 * /workflows/[id]/edit. Resolves the "dead link" from the list page.
 *
 * Starter graph: one agent node (empty prompt) — valid for assertRunnable
 * (single node, 0 edges — no start-node violation because the rule only
 * applies when nodes.length > 0 and we need exactly 1 start; a single
 * node with no edges trivially satisfies that).
 */
export default async function NewWorkflowPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const starterGraph: WorkflowGraph = {
    nodes: [{ id: "n1", kind: "agent", prompt: "" }],
    edges: [],
  };

  const id = crypto.randomUUID();
  await db.insert(workflows).values({
    id,
    userId: session.user.id,
    name: "Workflow mới",
    graph: starterGraph,
    status: "draft",
  });

  redirect(`/workflows/${encodeURIComponent(id)}/edit`);
}
