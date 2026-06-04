import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { ConnectorsClient } from "@/components/connectors/ConnectorsClient";

export const dynamic = "force-dynamic";

export default async function ConnectorsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <AppHeader current="/connectors" role={session.user.role} />
      <ConnectorsClient />
    </div>
  );
}
