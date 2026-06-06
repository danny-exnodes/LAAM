import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import type { Tool } from "../../types";

export type AuditRow = { action: string; target: string | null; createdAt: Date | null };

export function shapeAudit(rows: AuditRow[]) {
  return rows.map((r) => ({
    action: r.action,
    target: r.target,
    at: r.createdAt ? r.createdAt.toISOString() : null,
  }));
}

export const queryAudit: Tool = {
  name: "laam_query_audit",
  description:
    "Đọc nhật ký kiểm toán (audit log) gần nhất: hành động đã thực hiện trong hệ thống " +
    "(vd ghi qua connector, duyệt write). Lọc theo tên action tuỳ chọn.",
  kind: "read",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", description: "lọc theo tên action (tuỳ chọn)" },
      limit: { type: "number", description: "số tối đa, mặc định 20" },
    },
  },
  async handler(args) {
    const limit = Math.min(Number(args.limit) || 20, 50);
    const action = typeof args.action === "string" ? args.action.trim() : "";
    const rows = await db
      .select({ action: auditLog.action, target: auditLog.target, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(action ? eq(auditLog.action, action) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
    return { entries: shapeAudit(rows as AuditRow[]) };
  },
};
