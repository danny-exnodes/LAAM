// Connectors page strings — ported from public/i18n.connectors.js (conn.* ns).
// NOTE: these conn.* keys are the connectors-PAGE namespace; they are distinct
// from the conn.connecting/live/lost connection-status keys in `common`.
// Each dict is consumed via its own useT(namespace), so the shared prefix never
// collides. Wave 4 (Connectors page) must use `connectors`, not `common`.
import type { Dict } from '../types';

export const connectors: Dict = {
  'conn.title': { vi: 'Kết nối — LAAM', en: 'Connectors — LAAM', zh: '连接器 — LAAM' },
  'conn.heading': { vi: 'Kết nối ứng dụng', en: 'App connectors', zh: '应用连接器' },
  'conn.sub': {
    vi: 'Kết nối các dịch vụ bạn dùng để trợ lý gọi được dữ liệu thật qua trò chuyện. Token bạn nhập chỉ lưu trên máy chủ của bạn, không gửi đi đâu khác.',
    en: 'Connect the services you use so the assistant can pull real data through chat. Tokens you enter are stored only on your server and sent nowhere else.',
    zh: '连接你常用的服务，助手即可通过对话获取真实数据。你输入的令牌仅保存在你的服务器上，不会发送到其他地方。',
  },
  'conn.connected': { vi: 'Đã kết nối', en: 'Connected', zh: '已连接' },
  'conn.notConnected': { vi: 'Chưa kết nối', en: 'Not connected', zh: '未连接' },
  'conn.toolsLabel': { vi: 'Công cụ', en: 'Tools', zh: '工具' },
  'conn.connect': { vi: 'Kết nối', en: 'Connect', zh: '连接' },
  'conn.enable': { vi: 'Bật', en: 'Enable', zh: '启用' },
  'conn.disconnect': { vi: 'Ngắt', en: 'Disconnect', zh: '断开' },
  'conn.test': { vi: 'Kiểm tra', en: 'Test', zh: '测试' },
  'conn.saving': { vi: 'Đang lưu…', en: 'Saving…', zh: '保存中…' },
  'conn.testing': { vi: 'Đang kiểm tra…', en: 'Testing…', zh: '测试中…' },
  'conn.testOk': { vi: 'Kết nối OK', en: 'Connection OK', zh: '连接正常' },
  'conn.testErr': { vi: 'Kiểm tra thất bại', en: 'Test failed', zh: '测试失败' },
  'conn.saveErr': { vi: 'Không lưu được credential', en: 'Could not save credentials', zh: '无法保存凭据' },
  'conn.loadErr': { vi: 'Không tải được danh sách kết nối.', en: 'Could not load connectors.', zh: '无法加载连接器。' },
  'conn.oauthNeeded': { vi: 'Cần OAuth — sắp có', en: 'OAuth needed — coming soon', zh: '需要 OAuth — 即将推出' },
};
