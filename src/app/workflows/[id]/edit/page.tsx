import { redirect } from "next/navigation";
import nextDynamic from "next/dynamic";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";

export const dynamic = "force-dynamic";

// WorkflowEditor uses @xyflow/react — must NOT render server-side.
const WorkflowEditor = nextDynamic(
  () =>
    import("@/components/workflows/editor/WorkflowEditor").then(
      (m) => m.WorkflowEditor,
    ),
  { ssr: false },
);

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
        <WorkflowEditor workflowId={id} />
      </div>
    </div>
  );
}
