import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/page-header";
import { UsersManager } from "@/components/settings/UsersManager";
import { UsersTitle } from "@/components/settings/UsersTitle";

export const dynamic = "force-dynamic";

// User-management — owner/admin only. Non-privileged users are redirected away
// (the API enforces the same gate; this is the UI guard).
export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;
  if (role !== "owner" && role !== "admin") redirect("/settings");

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      disabledAt: users.disabledAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.createdAt));

  const initial = rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    disabledAt: u.disabledAt ? u.disabledAt.toISOString() : null,
    createdAt: u.createdAt ? u.createdAt.toISOString() : null,
  }));

  return (
    <div>
      <AppHeader current="/settings/users" role={role} />
      <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
        <UsersTitle />
        <div className="mx-auto max-w-3xl">
          <UsersManager initial={initial} currentUserId={session.user.id as string} isOwner={role === "owner"} />
        </div>
      </main>
    </div>
  );
}
