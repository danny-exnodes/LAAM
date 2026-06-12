// P3: Custom Agent preset (per-user) — đọc chung cho API routes + workflow runtime.
// getCustomAgent filter THEO CẢ userId: preset của user khác = không tồn tại
// (ownership ở tầng query, không chỉ ở route).
import { db } from "@/db";
import { customAgents, type CustomAgent } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export type { CustomAgent };

export async function listCustomAgents(userId: string): Promise<CustomAgent[]> {
  return db.select().from(customAgents).where(eq(customAgents.userId, userId)).orderBy(desc(customAgents.updatedAt));
}

export async function getCustomAgent(userId: string, id: string): Promise<CustomAgent | null> {
  const rows = await db
    .select()
    .from(customAgents)
    .where(and(eq(customAgents.id, id), eq(customAgents.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}
