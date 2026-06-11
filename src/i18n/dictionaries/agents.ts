// Agents page + Session detail strings — ported from public/i18n.agents.js
// (agents.* and session.* namespaces).
import type { Dict } from '../types';

export const agents: Dict = {
  // --- agents.* (filter bar) ---
  'agents.searchPh': { vi: 'Tìm project / agent / task…', en: 'Search project / agent / task…', zh: '搜索 项目 / 智能体 / 任务…' },
  'agents.srcAll': { vi: 'Mọi nguồn', en: 'All sources', zh: '所有来源' },
  'agents.srcLocal': { vi: 'Local (Ollama)', en: 'Local (Ollama)', zh: '本地 (Ollama)' },
  'agents.projAll': { vi: 'Mọi project', en: 'All projects', zh: '所有项目' },
  'agents.modelAll': { vi: 'Mọi model', en: 'All models', zh: '所有模型' },
  'agents.statusAll': { vi: 'Mọi trạng thái', en: 'All statuses', zh: '所有状态' },
  'agents.statusStuck': { vi: 'Nghi kẹt', en: 'Stuck', zh: '疑似卡住' },
  'agents.branchAll': { vi: 'Mọi branch', en: 'All branches', zh: '所有分支' },
  'agents.timeAll': { vi: 'Mọi thời điểm', en: 'Any time', zh: '任意时间' },
  'agents.time1h': { vi: '1 giờ qua', en: 'Last 1 hour', zh: '最近 1 小时' },
  'agents.time6h': { vi: '6 giờ qua', en: 'Last 6 hours', zh: '最近 6 小时' },
  'agents.time24h': { vi: '24 giờ qua', en: 'Last 24 hours', zh: '最近 24 小时' },
  'agents.time7d': { vi: '7 ngày qua', en: 'Last 7 days', zh: '最近 7 天' },
  'agents.clear': { vi: 'Xoá lọc', en: 'Clear filters', zh: '清除筛选' },
  'agents.exportCsv': { vi: 'CSV', en: 'CSV', zh: 'CSV' },
  'agents.exportTitle': { vi: 'Xuất CSV các session đang hiển thị', en: 'Export the visible sessions as CSV', zh: '将当前显示的会话导出为 CSV' },
  'agents.count': { vi: '{shown}/{total} session', en: '{shown}/{total} sessions', zh: '{shown}/{total} 个会话' },
  // loading / empty / error
  'agents.loading': { vi: 'Đang tải dữ liệu agents…', en: 'Loading agent data…', zh: '正在加载智能体数据…' },
  'agents.errTitle': { vi: 'Không đọc được dữ liệu', en: 'Could not read data', zh: '无法读取数据' },
  'agents.emptyMatch': { vi: 'Không khớp bộ lọc', en: 'No matches', zh: '无匹配结果' },
  'agents.emptyNone': { vi: 'Chưa có agent nào', en: 'No agents yet', zh: '暂无智能体' },
  'agents.emptyMatchSub': { vi: 'Thử điều chỉnh bộ lọc hoặc từ khoá.', en: 'Try adjusting the filters or search terms.', zh: '尝试调整筛选条件或关键词。' },
  'agents.emptyNoneSub': { vi: 'Bắt đầu một phiên Claude Code, dữ liệu sẽ xuất hiện ở đây.', en: 'Start a Claude Code session and data will appear here.', zh: '启动一个 Claude Code 会话，数据将显示在这里。' },
  'agents.watching': { vi: 'Đang theo dõi:', en: 'Watching:', zh: '正在监控：' },
  // card task labels
  'agents.taskUser': { vi: 'Yêu cầu mới nhất', en: 'Latest request', zh: '最新请求' },
  'agents.taskTool': { vi: 'Đang thao tác', en: 'Working', zh: '操作中' },
  'agents.taskThinking': { vi: 'Trạng thái', en: 'Status', zh: '状态' },
  'agents.taskLatest': { vi: 'Hoạt động mới nhất', en: 'Latest activity', zh: '最新活动' },
  // badges
  'agents.badgeLocal': { vi: 'LOCAL', en: 'LOCAL', zh: '本地' },
  'agents.badgeLocalTitle': { vi: 'Model local chạy qua Ollama (miễn phí)', en: 'Local model running via Ollama (free)', zh: '通过 Ollama 运行的本地模型（免费）' },
  'agents.badgeStuck': { vi: 'Nghi kẹt', en: 'Stuck', zh: '疑似卡住' },
  'agents.badgeStuckTitle': { vi: 'Chưa hoàn tất nhưng đã lâu không ghi transcript', en: 'Not finished but no transcript written for a while', zh: '尚未完成，但已较长时间未写入转录' },
  // card meta
  'agents.msgUnit': { vi: 'msg', en: 'msg', zh: '条' },
  'agents.toolUnit': { vi: 'tool', en: 'tool', zh: '工具' },
  'agents.tokInOut': { vi: '{in} vào · {out} ra tok', en: '{in} in · {out} out tok', zh: '{in} 入 · {out} 出 tok' },
  'agents.tokTitle': { vi: 'Tokens vào / ra', en: 'Tokens in / out', zh: '输入 / 输出 tokens' },
  'agents.costTitle': { vi: 'Chi phí ước tính (USD)', en: 'Estimated cost (USD)', zh: '预计费用（USD）' },
  // sub-agents
  'agents.subs': { vi: 'Sub-agents ({n})', en: 'Sub-agents ({n})', zh: '子智能体 ({n})' },
  'agents.subNoDesc': { vi: '(không mô tả)', en: '(no description)', zh: '（无描述）' },
  // project header
  'agents.sessionUnit': { vi: 'session', en: 'sessions', zh: '个会话' },
  'agents.runningPill': { vi: '{n} chạy', en: '{n} running', zh: '{n} 个运行中' },
  'agents.groupOther': { vi: 'Khác', en: 'Other', zh: '其他' },
  // notifications
  'agents.notifyTitle': { vi: 'Agent nghi bị kẹt', en: 'Agent may be stuck', zh: '智能体疑似卡住' },
  'agents.notifyBody': { vi: '{project} · {model} — {ago} chưa ghi transcript.', en: '{project} · {model} — no transcript for {ago}.', zh: '{project} · {model} — 已 {ago} 未写入转录。' },
  // drawer
  'agents.drawerLoading': { vi: 'Đang tải timeline…', en: 'Loading timeline…', zh: '正在加载时间线…' },
  'agents.drawerErr': { vi: 'Lỗi tải dữ liệu.', en: 'Failed to load data.', zh: '加载数据失败。' },
  'agents.totalLabel': { vi: 'tổng', en: 'total', zh: '总计' },
  'agents.tokensUnit': { vi: 'tokens', en: 'tokens', zh: 'token' },
  'agents.costEstTitle': { vi: 'Chi phí ước tính', en: 'Estimated cost', zh: '预计费用' },
  'agents.openDetail': { vi: 'Mở trang chi tiết (waterfall tool-call)', en: 'Open detail page (tool-call waterfall)', zh: '打开详情页（工具调用瀑布图）' },
  'agents.timelineEmpty': { vi: 'Chưa có hoạt động.', en: 'No activity yet.', zh: '暂无活动。' },

  // --- session.* (session detail page) ---
  'session.loading': { vi: 'Đang tải phiên…', en: 'Loading session…', zh: '正在加载会话…' },
  'session.noId': { vi: 'Không có session id', en: 'No session id', zh: '缺少会话 id' },
  'session.noIdSub': { vi: 'Mở một phiên từ trang Agents để xem chi tiết.', en: 'Open a session from the Agents page to view details.', zh: '从智能体页面打开一个会话以查看详情。' },
  'session.notFound': { vi: 'Không tìm thấy phiên', en: 'Session not found', zh: '未找到会话' },
  'session.loadErr': { vi: 'Lỗi tải phiên', en: 'Failed to load session', zh: '加载会话失败' },
  'session.back': { vi: '← Agents', en: '← Agents', zh: '← 智能体' },
  'session.noProject': { vi: '(no project)', en: '(no project)', zh: '（无项目）' },
  // meta keys
  'session.mModel': { vi: 'model', en: 'model', zh: '模型' },
  'session.mBranch': { vi: 'branch', en: 'branch', zh: '分支' },
  'session.mDuration': { vi: 'thời lượng', en: 'duration', zh: '时长' },
  'session.mMessages': { vi: 'tin nhắn', en: 'messages', zh: '消息' },
  'session.mTool': { vi: 'tool', en: 'tool', zh: '工具' },
  'session.mTokens': { vi: 'tokens', en: 'tokens', zh: 'token' },
  'session.mCost': { vi: 'chi phí', en: 'cost', zh: '费用' },
  'session.mActivity': { vi: 'hoạt động', en: 'activity', zh: '活动' },
  // waterfall
  'session.noToolCall': { vi: 'Phiên này chưa có tool call.', en: 'This session has no tool calls yet.', zh: '该会话暂无工具调用。' },
  'session.wfTitle': { vi: 'Tool-call waterfall', en: 'Tool-call waterfall', zh: '工具调用瀑布图' },
  'session.wfSpan': { vi: 'Tổng span:', en: 'Total span:', zh: '总跨度：' },
  // sub-agents (shared shape with agents page)
  'session.subs': { vi: 'Sub-agents ({n})', en: 'Sub-agents ({n})', zh: '子智能体 ({n})' },
  'session.subNoDesc': { vi: '(không mô tả)', en: '(no description)', zh: '（无描述）' },
};
