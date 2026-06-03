import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { DashboardClient } from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";

// Thin server shell: auth guard + header. The dashboard body is client-driven
// (DashboardClient fetches /api/stats and composes the Wave 2 widgets).
export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <AppHeader current="/dashboard" role={session.user.role} />
      <DashboardClient />
    </div>
  );
}
