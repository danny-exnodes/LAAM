import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { accessTokens } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { AccessTokensManager } from "@/components/settings/AccessTokensManager";
import { AccessTitle } from "@/components/settings/AccessTitle";

export const dynamic = "force-dynamic";

// Self-service access tokens — every logged-in user manages their OWN api/mcp
// tokens. Same data the /api/access-tokens GET returns (caller-scoped, masked).
export default async function AccessPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const rows = await db
    .select({
      id: accessTokens.id,
      kind: accessTokens.kind,
      name: accessTokens.name,
      prefix: accessTokens.prefix,
      last4: accessTokens.last4,
      lastUsedAt: accessTokens.lastUsedAt,
      revokedAt: accessTokens.revokedAt,
      createdAt: accessTokens.createdAt,
      createdByUserId: accessTokens.createdByUserId,
    })
    .from(accessTokens)
    .where(eq(accessTokens.userId, session.user.id as string))
    .orderBy(desc(accessTokens.createdAt));

  // Only the personal kinds belong here; collector tokens live under /machines.
  const initial = rows
    .filter((r) => r.kind === "api" || r.kind === "mcp")
    .map((r) => ({
      id: r.id,
      kind: r.kind as "api" | "mcp",
      name: r.name,
      prefix: r.prefix,
      last4: r.last4,
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      createdByUserId: r.createdByUserId,
    }));

  return (
    <div>
      <AppHeader current="/settings/access" role={session.user.role} />
      <main className="w-full px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:pb-8">
        <AccessTitle />
        <div className="mx-auto max-w-3xl">
          <AccessTokensManager initial={initial} />
        </div>
      </main>
    </div>
  );
}
