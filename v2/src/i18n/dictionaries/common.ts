// Shared strings (nav / brand / connection / theme / language / status / time /
// generic buttons) — ported from the shared register() block in public/i18n.js.
import type { Dict } from '../types';

export const common: Dict = {
  'nav.dashboard': { vi: 'Tổng quan', en: 'Dashboard', zh: '仪表盘' },
  'nav.agents': { vi: 'Agent', en: 'Agents', zh: '智能体' },
  'nav.graph': { vi: 'Sơ đồ', en: 'Graph', zh: '关系图' },
  'nav.search': { vi: 'Tìm kiếm', en: 'Search', zh: '搜索' },
  'nav.office': { vi: 'Văn phòng', en: 'Office', zh: '办公室' },
  'nav.chat': { vi: 'Trò chuyện', en: 'Chat', zh: '对话' },
  'nav.connectors': { vi: 'Kết nối', en: 'Connectors', zh: '连接器' },

  'brand.sub': { vi: 'Giám sát AI Agent cục bộ', en: 'Local AI Agent Monitoring', zh: '本地 AI 智能体监控' },

  'conn.connecting': { vi: 'Đang kết nối…', en: 'Connecting…', zh: '连接中…' },
  'conn.live': { vi: 'Trực tiếp', en: 'Live', zh: '实时' },
  'conn.lost': { vi: 'Mất kết nối', en: 'Disconnected', zh: '已断开' },

  'theme.toggle': { vi: 'Đổi giao diện sáng/tối', en: 'Toggle light/dark theme', zh: '切换浅色/深色主题' },

  'lang.label': { vi: 'Ngôn ngữ', en: 'Language', zh: '语言' },

  'status.running': { vi: 'Đang chạy', en: 'Running', zh: '运行中' },
  'status.idle': { vi: 'Tạm dừng', en: 'Idle', zh: '空闲' },
  'status.done': { vi: 'Hoàn tất', en: 'Done', zh: '完成' },
  'status.stuck': { vi: 'Nghi kẹt', en: 'Stuck', zh: '疑似卡住' },

  'time.justNow': { vi: 'vừa xong', en: 'just now', zh: '刚刚' },
  'time.minAgo': { vi: '{n} phút trước', en: '{n} min ago', zh: '{n} 分钟前' },
  'time.hourAgo': { vi: '{n} giờ trước', en: '{n} h ago', zh: '{n} 小时前' },
  'time.dayAgo': { vi: '{n} ngày trước', en: '{n} d ago', zh: '{n} 天前' },
  'time.none': { vi: '—', en: '—', zh: '—' },

  'common.export': { vi: 'Xuất', en: 'Export', zh: '导出' },
  'common.retry': { vi: 'Thử lại', en: 'Retry', zh: '重试' },
  'common.loading': { vi: 'Đang tải…', en: 'Loading…', zh: '加载中…' },
  'common.search': { vi: 'Tìm kiếm', en: 'Search', zh: '搜索' },
  'common.close': { vi: 'Đóng', en: 'Close', zh: '关闭' },
  'common.cancel': { vi: 'Huỷ', en: 'Cancel', zh: '取消' },
  'common.save': { vi: 'Lưu', en: 'Save', zh: '保存' },
  'common.delete': { vi: 'Xoá', en: 'Delete', zh: '删除' },
  'common.all': { vi: 'Tất cả', en: 'All', zh: '全部' },
  'common.none': { vi: '—', en: '—', zh: '—' },
  'common.copy': { vi: 'Chép', en: 'Copy', zh: '复制' },
  'common.copied': { vi: 'Đã chép', en: 'Copied', zh: '已复制' },
};
