import type { Dict } from "../types";

// User-management page (/settings/users) — owner/admin only. Role change is
// owner-only; disable/enable is owner/admin. users.* namespace.
export const usersDict: Dict = {
  "users.title": { vi: "Người dùng", en: "Users", zh: "用户" },
  "users.subtitle": {
    vi: "Quản lý thành viên: vai trò và vô hiệu hoá truy cập.",
    en: "Manage members: roles and access off-boarding.",
    zh: "管理成员：角色与停用访问权限。",
  },
  "users.empty": { vi: "Chưa có người dùng nào.", en: "No users yet.", zh: "暂无用户。" },

  // table headers
  "users.col.name": { vi: "Tên", en: "Name", zh: "姓名" },
  "users.col.email": { vi: "Email", en: "Email", zh: "邮箱" },
  "users.col.role": { vi: "Vai trò", en: "Role", zh: "角色" },
  "users.col.status": { vi: "Trạng thái", en: "Status", zh: "状态" },
  "users.col.actions": { vi: "Hành động", en: "Actions", zh: "操作" },

  // roles
  "users.role.owner": { vi: "Chủ sở hữu", en: "Owner", zh: "所有者" },
  "users.role.admin": { vi: "Quản trị", en: "Admin", zh: "管理员" },
  "users.role.member": { vi: "Thành viên", en: "Member", zh: "成员" },
  "users.role.viewer": { vi: "Người xem", en: "Viewer", zh: "查看者" },

  // status
  "users.status.active": { vi: "Đang hoạt động", en: "Active", zh: "活跃" },
  "users.status.disabled": { vi: "Đã vô hiệu hoá", en: "Disabled", zh: "已停用" },
  "users.you": { vi: "(bạn)", en: "(you)", zh: "（你）" },

  // role dropdown
  "users.roleOnlyOwner": {
    vi: "Chỉ owner mới đổi được vai trò.",
    en: "Only an owner can change roles.",
    zh: "只有所有者才能更改角色。",
  },

  // disable / enable
  "users.disable": { vi: "Vô hiệu hoá", en: "Disable", zh: "停用" },
  "users.enable": { vi: "Kích hoạt lại", en: "Enable", zh: "启用" },
  "users.confirmDisable": {
    vi: "Vô hiệu hoá {name}? Mọi token sẽ bị thu hồi và họ không đăng nhập được.",
    en: "Disable {name}? All their tokens are revoked and they can no longer sign in.",
    zh: "停用 {name}？其所有令牌将被吊销，且无法再登录。",
  },
  "users.confirmEnable": {
    vi: "Kích hoạt lại {name}? Họ sẽ đăng nhập được; token cũ KHÔNG khôi phục.",
    en: "Enable {name}? They can sign in again; old tokens are NOT restored.",
    zh: "启用 {name}？他们可再次登录；旧令牌不会恢复。",
  },
  "users.confirm.yes": { vi: "Xác nhận", en: "Confirm", zh: "确认" },
  "users.confirm.cancel": { vi: "Huỷ", en: "Cancel", zh: "取消" },

  // toasts / errors
  "users.err.generic": { vi: "Có lỗi xảy ra.", en: "Something went wrong.", zh: "出错了。" },
  "users.ok.role": { vi: "Đã cập nhật vai trò.", en: "Role updated.", zh: "角色已更新。" },
  "users.ok.disabled": { vi: "Đã vô hiệu hoá người dùng.", en: "User disabled.", zh: "用户已停用。" },
  "users.ok.enabled": { vi: "Đã kích hoạt lại người dùng.", en: "User enabled.", zh: "用户已启用。" },

  // per-user access keys (owner/admin provisions a key FOR this user)
  "users.keys.expand": { vi: "Khoá truy cập", en: "Access keys", zh: "访问密钥" },
  "users.keys.hide": { vi: "Ẩn", en: "Hide", zh: "隐藏" },
  "users.keys.loading": { vi: "Đang tải…", en: "Loading…", zh: "加载中…" },
  "users.keys.empty": { vi: "Chưa có khoá api/mcp.", en: "No api/mcp keys.", zh: "暂无 api/mcp 密钥。" },
  "users.keys.col.name": { vi: "Tên", en: "Name", zh: "名称" },
  "users.keys.col.kind": { vi: "Loại", en: "Kind", zh: "类型" },
  "users.keys.col.lastUsed": { vi: "Dùng lần cuối", en: "Last used", zh: "上次使用" },
  "users.keys.never": { vi: "chưa dùng", en: "never", zh: "从未" },
  "users.keys.provisionedBy": { vi: "cấp bởi {admin}", en: "provisioned by {admin}", zh: "由 {admin} 发放" },
  "users.keys.namePh": { vi: "Tên khoá (vd: agent CI)", en: "Key name (e.g. CI agent)", zh: "密钥名称（例如：CI agent）" },
  "users.keys.provision": { vi: "Cấp khoá", en: "Provision key", zh: "发放密钥" },
  "users.keys.revoke": { vi: "Thu hồi", en: "Revoke", zh: "吊销" },
  "users.keys.confirmRevokeOther": {
    vi: "Thu hồi khoá này của {name}? Không thể hoàn tác.",
    en: "Revoke this key of {name}? This cannot be undone.",
    zh: "吊销 {name} 的此密钥？此操作无法撤销。",
  },
  // Load-bearing honest warning shown at provision time. Accurate to the shipped
  // scope: the key reads ORG-SHARED agent monitoring read-only AS the target (it is
  // NOT limited to that user's private data, and — after the audit-scope fix — it can
  // only read that principal's own audit rows).
  "users.keys.warning": {
    vi: "Khoá này đọc dữ liệu giám sát agent (chia sẻ trong tổ chức, chỉ đọc) dưới danh nghĩa {name} — KHÔNG giới hạn ở dữ liệu riêng của họ. Bàn giao qua kênh an toàn; chỉ hiện 1 lần; hành động được ghi nhật ký.",
    en: "This key reads agent-monitoring data (org-shared, read-only) on behalf of {name} — it is NOT limited to their private data. Hand it off over a secure channel; shown once; this action is audited.",
    zh: "此密钥以 {name} 的名义读取 agent 监控数据（组织共享，只读）——并不限于其私有数据。请通过安全渠道交付；仅显示一次；此操作将被记录。",
  },
  "users.keys.modalTitle": {
    vi: "Đã cấp khoá “{name}” — chỉ hiện 1 lần, copy ngay:",
    en: "Key “{name}” provisioned — shown once, copy it now:",
    zh: "已发放密钥“{name}”——仅显示一次，请立即复制：",
  },
  "users.keys.copy": { vi: "Sao chép", en: "Copy", zh: "复制" },
  "users.keys.copied": { vi: "Đã sao chép", en: "Copied", zh: "已复制" },
  "users.keys.selfHint": {
    vi: "Tự tạo khoá của bạn ở trang Token truy cập.",
    en: "Create your own keys on the Access tokens page.",
    zh: "在“访问令牌”页面创建您自己的密钥。",
  },
  "users.ok.provisioned": { vi: "Đã cấp khoá.", en: "Key provisioned.", zh: "已发放密钥。" },
};
