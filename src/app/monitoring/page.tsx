import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { MonitoringClient } from "@/components/monitoring/MonitoringClient";

export const dynamic = "force-dynamic";

// Unified monitoring home (F3). ONE entry point with three tabs: "Agents"
// (default — the rich live AgentsClient, subsuming the old Local + External
// api/mcp source tabs), "Chat", and "Workflow" (read-model tables). The Agents
// LIST page (/agents) redirects here; the /agents/[id] waterfall detail stays.
// `?tab=agents|chat|workflow` deep-links a tab.
export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { tab } = await searchParams;

  return (
    <div>
      <AppHeader current="/monitoring" role={session.user.role} />
      <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
        <MonitoringClient initialTab={tab} />
      </main>
    </div>
  );
}
