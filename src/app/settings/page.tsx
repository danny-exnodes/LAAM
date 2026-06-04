import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { gravatarUrl } from "@/lib/gravatar";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/page-header";
import { SettingsMenu } from "@/components/settings/SettingsMenu";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = {
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    role: session.user.role,
    avatarUrl: gravatarUrl(session.user.email),
  };

  return (
    <div>
      <AppHeader current="/settings" role={session.user.role} />
      <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
        <PageHeader title="Cài đặt" subtitle="Tài khoản, máy chủ và tuỳ chỉnh hiển thị." />
        <SettingsMenu user={user} />
      </main>
    </div>
  );
}
