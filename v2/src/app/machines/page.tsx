import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { machines } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { MachinesManager } from "@/components/machines-manager";

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
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-1 text-xl font-bold tracking-tight">Machines</h1>
        <p className="mb-5 text-sm text-neutral-500">
          Mỗi máy dev chạy collector để đẩy session về đây (giám sát đa máy). Máy
          chủ nội bộ chạy LAAM tự quét bằng nút <b>Đồng bộ</b> — không cần token.
        </p>
        <MachinesManager initial={list} canManage={canManage} />
      </main>
    </div>
  );
}
