import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { WorkflowsClient } from "@/components/workflows/WorkflowsClient";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <AppHeader current="/workflows" role={session.user.role} />
      <WorkflowsClient />
    </div>
  );
}
