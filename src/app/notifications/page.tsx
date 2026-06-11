import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { listForUser } from "@/lib/notifications";
import { NotificationsList } from "@/components/notifications-list";
import type { BellNotification } from "@/components/notification-bell";

export const dynamic = "force-dynamic";

// Full notifications list — the caller's OWN notifications (listForUser is scoped to
// session.user.id). Mark-read happens client-side via the scoped API routes.
export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const rows = await listForUser(session.user.id, { limit: 100 });
  const initial: BellNotification[] = rows.map((n) => ({
    id: n.id,
    type: n.type,
    severity: n.severity as BellNotification["severity"],
    title: n.title,
    body: n.body,
    link: n.link,
    source: n.source,
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div>
      <AppHeader current="/notifications" role={session.user.role} />
      <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
        <div className="mx-auto max-w-3xl">
          <NotificationsList initial={initial} />
        </div>
      </main>
    </div>
  );
}
