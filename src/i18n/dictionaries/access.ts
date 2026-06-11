import type { Dict } from "../types";

// Self-service access tokens page (/settings/access) — every user manages their
// OWN api/mcp tokens. access.* namespace.
export const accessDict: Dict = {
  "access.title": { vi: "Token truy cập", en: "Access tokens", zh: "访问令牌" },
  "access.subtitle": {
    vi: "Token cá nhân cho API / MCP. Token chỉ hiện 1 lần khi tạo — hãy copy ngay.",
    en: "Personal tokens for API / MCP. A token is shown once on creation — copy it now.",
    zh: "用于 API / MCP 的个人令牌。令牌仅在创建时显示一次，请立即复制。",
  },

  // create form
  "access.create": { vi: "Tạo token", en: "Create token", zh: "创建令牌" },
  "access.namePh": { vi: "Tên token (vd: agent của tôi)", en: "Token name (e.g. my agent)", zh: "令牌名称（例如：我的 agent）" },
  "access.kind": { vi: "Loại", en: "Kind", zh: "类型" },
  "access.kind.api": { vi: "API", en: "API", zh: "API" },
  "access.kind.mcp": { vi: "MCP", en: "MCP", zh: "MCP" },
  "access.scopeNote": {
    vi: "Phạm vi: chỉ đọc (read).",
    en: "Scope: read-only.",
    zh: "范围：只读。",
  },

  // issued token reveal
  "access.issued": {
    vi: "Token “{name}” — chỉ hiện 1 lần, hãy copy ngay:",
    en: "Token “{name}” — shown once, copy it now:",
    zh: "令牌“{name}”——仅显示一次，请立即复制：",
  },
  "access.copy": { vi: "Sao chép", en: "Copy", zh: "复制" },
  "access.copied": { vi: "Đã sao chép", en: "Copied", zh: "已复制" },

  // list
  "access.empty": { vi: "Chưa có token nào.", en: "No tokens yet.", zh: "暂无令牌。" },
  "access.col.kind": { vi: "Loại", en: "Kind", zh: "类型" },
  "access.col.token": { vi: "Token", en: "Token", zh: "令牌" },
  "access.col.created": { vi: "Tạo lúc", en: "Created", zh: "创建时间" },
  "access.col.lastUsed": { vi: "Dùng lần cuối", en: "Last used", zh: "上次使用" },
  "access.never": { vi: "chưa dùng", en: "never", zh: "从未" },
  "access.revoke": { vi: "Thu hồi", en: "Revoke", zh: "吊销" },
  "access.confirmRevoke": {
    vi: "Thu hồi token này? Không thể hoàn tác.",
    en: "Revoke this token? This cannot be undone.",
    zh: "吊销此令牌？此操作无法撤销。",
  },
  "access.revoked": { vi: "đã thu hồi", en: "revoked", zh: "已吊销" },

  // errors
  "access.err.generic": { vi: "Có lỗi xảy ra.", en: "Something went wrong.", zh: "出错了。" },
};
