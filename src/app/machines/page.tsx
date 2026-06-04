import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { machines } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/page-header";
import { MachinesManager } from "@/components/machines-manager";
import { HardwareAnalytics } from "@/components/machines/HardwareAnalytics";

export const dynamic = "force-dynamic";

export default async function MachinesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const rows = await db
    .select({
      id: machines.id,
      name: machines.name,
      hostname: machines.hostname,
      lastSeen: machines.lastSeen,
      tokenHash: machines.tokenHash,
    })
    .from(machines)
    .orderBy(desc(machines.lastSeen));

  const list = rows.map((m) => ({
    id: m.id,
    name: m.name,
    hostname: m.hostname,
    lastSeen: m.lastSeen ? m.lastSeen.toISOString() : null,
    hasToken: !!m.tokenHash,
  }));

  const canManage =
    session.user.role === "owner" || session.user.role === "admin";

  return (
    <div>
      <AppHeader current="/machines" role={session.user.role} />
      <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
        <PageHeader
          title="Machines"
          subtitle="Mỗi máy dev chạy collector để đẩy session về đây (giám sát đa máy). Máy chủ nội bộ tự quét bằng nút Đồng bộ — không cần token."
        />
        <HardwareAnalytics />
        <MachinesManager initial={list} canManage={canManage} />
      </main>
    </div>
  );
}
