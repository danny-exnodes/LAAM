import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { MonitoringClient } from "@/components/monitoring/MonitoringClient";

export const dynamic = "force-dynamic";

// Unified monitoring across sources (local agents, chat, workflows, external
// API/MCP). The detailed live local-agent view stays at /agents.
export default async function MonitoringPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <AppHeader current="/monitoring" role={session.user.role} />
      <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
        <MonitoringClient />
      </main>
    </div>
  );
}
