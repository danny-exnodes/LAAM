import { and, desc, eq } from "drizzle-orm";
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
    "Đọc nhật ký kiểm toán (audit log) CỦA RIÊNG LAAM: hành động agent này đã thực hiện " +
    "trong chính hệ thống LAAM (vd ghi qua connector, duyệt write). KHÔNG chứa dữ liệu " +
    "nghiệp vụ của bất kỳ data source/connector nào đã kết nối (DAAB, database khách hàng…) " +
    "— câu hỏi về hoạt động nghiệp vụ (giao dịch, override ngoài giờ, audit trail của khách " +
    "hàng…) phải dùng tool truy vấn data source tương ứng, không dùng tool này. Lọc theo tên action tuỳ chọn.",
  kind: "read",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", description: "lọc theo tên action (tuỳ chọn)" },
      limit: { type: "number", description: "số tối đa, mặc định 20" },
    },
  },
  async handler(args, ctx) {
    const limit = Math.min(Number(args.limit) || 20, 50);
    const action = typeof args.action === "string" ? args.action.trim() : "";
    // Principal-scope: a token / chat session reads ONLY its own actor rows. The
    // audit log holds {actor, subject} ids for role_change / token_issued_for /
    // user_disabled — unscoped, ANY api/mcp token holder could enumerate org admin
    // actions and provisioning relationships. Org-wide reading is a session-only
    // admin capability, never via this tool. No principal (orphaned token whose owner
    // was deleted → ctx.userId "") → return nothing rather than fall back to org-wide.
    // NOTE: this closes the audit-log leak only; the broader org-shared MCP read
    // (search-sessions/get-timeline/list-agents/find-stuck) stays backlog.
    const principal = ctx?.userId;
    if (!principal) return { entries: [] };
    const rows = await db
      .select({ action: auditLog.action, target: auditLog.target, createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(and(eq(auditLog.userId, principal), action ? eq(auditLog.action, action) : undefined))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
    return { entries: shapeAudit(rows as AuditRow[]) };
  },
};
