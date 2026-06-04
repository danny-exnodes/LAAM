import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { AgentsClient } from "@/components/agents/AgentsClient";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <AppHeader current="/agents" role={session.user.role} />
      <AgentsClient />
    </div>
  );
}
