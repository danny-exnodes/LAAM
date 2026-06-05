import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { evalRuns } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { buildEvalDashboard } from "@/lib/eval-stats";
import { EvalClient } from "@/components/eval/EvalClient";

export const dynamic = "force-dynamic";

export default async function EvalPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const rows = await db.select().from(evalRuns).orderBy(desc(evalRuns.ranAt)).limit(50);
  const dashboard = buildEvalDashboard(rows);

  return (
    <div>
      <AppHeader current="/eval" role={session.user.role} />
      <EvalClient dashboard={dashboard} />
    </div>
  );
}
