import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The Agents LIST is now the default "Agents" tab of the unified Monitoring home
// (F3). This route redirects there. The rich live view lives in AgentsClient,
// mounted by /monitoring; the per-session waterfall stays at /agents/[id].
export default function AgentsPage() {
  redirect("/monitoring?tab=agents");
}
