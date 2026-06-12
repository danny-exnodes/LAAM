import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { CustomAgentsClient } from "@/components/settings/CustomAgentsClient";
import { listCustomAgents } from "@/lib/customAgents";

export const dynamic = "force-dynamic";

// P3: Custom Agent presets (per-user) — quản lý ở Settings; node Agent trong
// workflow tham chiếu qua customAgentId.
export default async function CustomAgentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const rows = await listCustomAgents(session.user.id as string);
  const initial = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    system: r.system,
  }));

  return (
    <div>
      <AppHeader current="/settings/custom-agents" role={session.user.role} />
      <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
        <CustomAgentsClient initial={initial} />
      </main>
    </div>
  );
}
