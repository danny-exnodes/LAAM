import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { WorkflowEditorLive } from "@/components/workflows/editor/WorkflowEditorLive";

export const dynamic = "force-dynamic";

export default async function WorkflowEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader current="/workflows" role={session.user.role} />
      <div className="min-h-0 flex-1">
        <WorkflowEditorLive workflowId={id} />
      </div>
    </div>
  );
}
