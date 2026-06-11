import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { SearchClient } from "@/components/search/SearchClient";

export const dynamic = "force-dynamic";

// Global search (W7 — port of v1 public/search.*): agent sessions (org-shared),
// the caller's chat conversations and workflows, via GET /api/search.
export default async function SearchPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <AppHeader current="/search" role={session.user.role} />
      <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
        <SearchClient />
      </main>
    </div>
  );
}
