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
};
