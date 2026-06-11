import type { Dict } from "../types";

// In-app notification bell + /notifications page (F2). notifications.* namespace.
// Note: notification TITLE/BODY text is produced server-side (lib/notifications) in
// the app's canonical server language (vi) and rendered verbatim — only the chrome
// (labels, empty state, actions, relative time) is localized here.
export const notificationsDict: Dict = {
  "notif.title": { vi: "Thông báo", en: "Notifications", zh: "通知" },
  "notif.bell": { vi: "Thông báo", en: "Notifications", zh: "通知" },
  "notif.empty": { vi: "Chưa có thông báo nào.", en: "No notifications yet.", zh: "暂无通知。" },
  "notif.unreadCount": {
    vi: "{n} chưa đọc",
    en: "{n} unread",
    zh: "{n} 条未读",
  },
  "notif.markAllRead": { vi: "Đánh dấu đã đọc tất cả", en: "Mark all read", zh: "全部标为已读" },
  "notif.viewAll": { vi: "Xem tất cả", en: "View all", zh: "查看全部" },
  "notif.markRead": { vi: "Đánh dấu đã đọc", en: "Mark read", zh: "标为已读" },
  "notif.loadError": { vi: "Không tải được thông báo.", en: "Couldn't load notifications.", zh: "无法加载通知。" },

  // relative time (compact)
  "notif.now": { vi: "vừa xong", en: "just now", zh: "刚刚" },
  "notif.minutesAgo": { vi: "{n} phút trước", en: "{n}m ago", zh: "{n} 分钟前" },
  "notif.hoursAgo": { vi: "{n} giờ trước", en: "{n}h ago", zh: "{n} 小时前" },
  "notif.daysAgo": { vi: "{n} ngày trước", en: "{n}d ago", zh: "{n} 天前" },
};
