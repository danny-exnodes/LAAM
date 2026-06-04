import { redirect } from "next/navigation";
import { Settings as SettingsIcon } from "lucide-react";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <AppHeader current="/settings" />
      <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
        <PageHeader title="Cài đặt" subtitle="Tuỳ chỉnh LAAM theo ý bạn." />
        <div className="grid place-items-center rounded-2xl border border-dashed border-neutral-300 p-16 text-center dark:border-neutral-700">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
            <SettingsIcon size={26} aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-bold tracking-tight">Sắp ra mắt</h2>
          <p className="mt-1 max-w-sm text-sm text-neutral-500">
            Trang Cài đặt đang được xây dựng — hồ sơ, ảnh đại diện, thông báo, ngưỡng cảnh
            báo agent… sẽ xuất hiện ở đây.
          </p>
        </div>
      </main>
    </div>
  );
}
