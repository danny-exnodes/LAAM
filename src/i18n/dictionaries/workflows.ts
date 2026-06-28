// Workflows page strings — vi/en/zh.
// Namespace: wf.* (used via useT(workflows)).
import type { Dict } from "../types";

export const workflows: Dict = {
  // Page
  "wf.title": { vi: "Workflows — LAAM", en: "Workflows — LAAM", zh: "工作流 — LAAM" },
  "wf.heading": { vi: "Workflows", en: "Workflows", zh: "工作流" },
  "wf.sub": {
    vi: "Tự động hóa các tác vụ lặp lại bằng chuỗi bước connector + agent.",
    en: "Automate repetitive tasks with connector + agent step chains.",
    zh: "通过连接器与 Agent 步骤链自动化重复任务。",
  },

  // Table columns
  "wf.col.name": { vi: "Tên", en: "Name", zh: "名称" },
  "wf.col.status": { vi: "Trạng thái", en: "Status", zh: "状态" },
  "wf.col.lastRun": { vi: "Lần chạy cuối", en: "Last run", zh: "最近运行" },
  "wf.col.lastRunStatus": { vi: "Kết quả", en: "Result", zh: "结果" },
  "wf.col.created": { vi: "Tạo lúc", en: "Created", zh: "创建时间" },
  "wf.col.actions": { vi: "Thao tác", en: "Actions", zh: "操作" },

  // Actions
  "wf.newBlank": { vi: "Workflow mới", en: "New workflow", zh: "新建工作流" },
  "wf.newFromTemplate": { vi: "Từ mẫu", en: "From template", zh: "从模板新建" },
  "wf.runNow": { vi: "Chạy ngay", en: "Run now", zh: "立即运行" },
  "wf.view": { vi: "Xem chi tiết", en: "View details", zh: "查看详情" },
  "wf.edit": { vi: "Chỉnh sửa", en: "Edit", zh: "编辑" },
  "wf.rename": { vi: "Đổi tên", en: "Rename", zh: "重命名" },
  "wf.renameLabel": { vi: "Tên workflow", en: "Workflow name", zh: "工作流名称" },
  "wf.clone": { vi: "Nhân bản", en: "Clone", zh: "克隆" },
  "wf.delete": { vi: "Xoá", en: "Delete", zh: "删除" },
  "wf.cancel": { vi: "Đóng", en: "Close", zh: "关闭" },
  "wf.deleteConfirm": {
    vi: "Xoá workflow này? Toàn bộ lịch sử chạy và lịch tự động sẽ bị xoá theo.",
    en: "Delete this workflow? All run history and schedules will also be deleted.",
    zh: "删除此工作流？所有运行历史和定时计划也将一并删除。",
  },
  "wf.deleteFailed": { vi: "Xoá thất bại.", en: "Delete failed.", zh: "删除失败。" },
  "wf.runFailed": { vi: "Chạy thất bại", en: "Run failed", zh: "运行失败" },
  "wf.cloneFailed": { vi: "Nhân bản thất bại.", en: "Clone failed.", zh: "克隆失败。" },
  "wf.actionErr": { vi: "Thao tác thất bại.", en: "Action failed.", zh: "操作失败。" },

  // Workflow status badges
  "wf.wfStatus.active": { vi: "Đang hoạt động", en: "Active", zh: "活跃" },
  "wf.wfStatus.draft": { vi: "Nháp", en: "Draft", zh: "草稿" },
  "wf.wfStatus.disabled": { vi: "Đã tắt", en: "Disabled", zh: "已禁用" },

  // Run status badges
  "wf.runStatus.succeeded": { vi: "Thành công", en: "Succeeded", zh: "成功" },
  "wf.runStatus.failed": { vi: "Thất bại", en: "Failed", zh: "失败" },
  "wf.runStatus.running": { vi: "Đang chạy", en: "Running", zh: "运行中" },
  "wf.runStatus.queued": { vi: "Đang chờ", en: "Queued", zh: "排队中" },
  "wf.runStatus.cancelled": { vi: "Đã hủy", en: "Cancelled", zh: "已取消" },

  // Cancel run (W4)
  "wf.run.cancel": { vi: "Huỷ run", en: "Cancel run", zh: "取消运行" },
  "wf.run.cancelFailed": { vi: "Huỷ run thất bại.", en: "Cancel run failed.", zh: "取消运行失败。" },

  // Run-finish toast (W4)
  "wf.toast.succeeded": { vi: "Run hoàn tất thành công.", en: "Run completed successfully.", zh: "运行已成功完成。" },
  "wf.toast.failed": { vi: "Run thất bại.", en: "Run failed.", zh: "运行失败。" },
  "wf.toast.cancelled": { vi: "Run đã bị huỷ.", en: "Run was cancelled.", zh: "运行已取消。" },

  // Empty + error states
  "wf.emptyNone": { vi: "Chưa có workflow nào", en: "No workflows yet", zh: "暂无工作流" },
  "wf.emptyNoneSub": {
    vi: "Tạo workflow đầu tiên hoặc chọn từ mẫu để bắt đầu.",
    en: "Create your first workflow or start from a template.",
    zh: "创建第一个工作流或从模板开始。",
  },
  "wf.loadErr": {
    vi: "Không tải được danh sách workflow.",
    en: "Could not load workflows.",
    zh: "无法加载工作流列表。",
  },
  "wf.needsAttention": { vi: "Cần xem lại", en: "Needs attention", zh: "需要关注" },

  // Template modal
  "wf.templateModal.title": { vi: "Chọn mẫu workflow", en: "Choose a template", zh: "选择模板" },
  "wf.templateModal.empty": { vi: "Không có mẫu nào.", en: "No templates available.", zh: "暂无模板。" },
  "wf.templateModal.use": { vi: "Dùng mẫu này", en: "Use this", zh: "使用此模板" },

  // Detail page
  "wf.detail.heading": { vi: "Chi tiết Workflow", en: "Workflow detail", zh: "工作流详情" },
  "wf.detail.runs": { vi: "Lịch sử chạy", en: "Run history", zh: "运行历史" },
  "wf.detail.schedule": { vi: "Lịch chạy tự động", en: "Schedule", zh: "定时计划" },
  "wf.detail.noRuns": { vi: "Chưa có lần chạy nào.", en: "No runs yet.", zh: "暂无运行记录。" },
  "wf.detail.noSchedule": { vi: "Chưa có lịch nào.", en: "No schedule set.", zh: "未设置定时计划。" },
  "wf.detail.runNow": { vi: "Chạy ngay", en: "Run now", zh: "立即运行" },
  "wf.detail.addSchedule": { vi: "Thêm lịch", en: "Add schedule", zh: "添加计划" },
  "wf.detail.cronLabel": { vi: "Cron (5 trường)", en: "Cron (5 fields)", zh: "Cron（5字段）" },
  "wf.detail.cronSave": { vi: "Lưu lịch", en: "Save schedule", zh: "保存计划" },
  "wf.detail.cronErr": { vi: "Cron không hợp lệ.", en: "Invalid cron expression.", zh: "无效 Cron 表达式。" },
  "wf.detail.scheduleSaved": { vi: "Đã lưu lịch chạy.", en: "Schedule saved.", zh: "已保存定时计划。" },
  "wf.detail.loadErr": { vi: "Không tải được workflow.", en: "Could not load workflow.", zh: "无法加载工作流。" },
  "wf.detail.notFound": { vi: "Không tìm thấy workflow.", en: "Workflow not found.", zh: "未找到工作流。" },

  // Run-log step kinds
  "wf.step.connector": { vi: "Connector", en: "Connector", zh: "连接器" },
  "wf.step.agent": { vi: "Agent", en: "Agent", zh: "Agent" },

  // Step status (inline badges in detail)
  "wf.step.running": { vi: "Đang chạy", en: "Running", zh: "运行中" },
  "wf.step.succeeded": { vi: "Thành công", en: "Succeeded", zh: "成功" },
  "wf.step.failed": { vi: "Thất bại", en: "Failed", zh: "失败" },
  "wf.step.skipped": { vi: "Bỏ qua", en: "Skipped", zh: "已跳过" },

  // Run cols
  "wf.run.col.trigger": { vi: "Kích hoạt", en: "Trigger", zh: "触发方式" },
  "wf.run.col.status": { vi: "Kết quả", en: "Status", zh: "状态" },
  "wf.run.col.started": { vi: "Bắt đầu", en: "Started", zh: "开始时间" },
  "wf.run.col.duration": { vi: "Thời lượng", en: "Duration", zh: "耗时" },
  "wf.run.trigger.manual": { vi: "Thủ công", en: "Manual", zh: "手动" },
  "wf.run.trigger.schedule": { vi: "Lịch", en: "Schedule", zh: "计划" },
  "wf.waterfall.title": { vi: "Dòng thời gian", en: "Timeline", zh: "时间线" },

  // Schedule table
  "wf.schedule.col.cron": { vi: "Cron", en: "Cron", zh: "Cron" },
  "wf.schedule.col.next": { vi: "Lần tiếp theo", en: "Next run", zh: "下次运行" },
  "wf.schedule.col.tz": { vi: "Múi giờ", en: "Timezone", zh: "时区" },
  "wf.schedule.col.enabled": { vi: "Bật", en: "Enabled", zh: "启用" },
  "wf.schedule.enabled": { vi: "Đang bật", en: "Enabled", zh: "已启用" },
  "wf.schedule.disabled": { vi: "Đã tắt", en: "Disabled", zh: "已停用" },
  "wf.schedule.delete": { vi: "Xoá lịch", en: "Delete schedule", zh: "删除计划" },
  "wf.schedule.deleteConfirm": {
    vi: "Xoá lịch chạy này?",
    en: "Delete this schedule?",
    zh: "删除此定时计划？",
  },
  "wf.schedule.deleteFailed": { vi: "Xoá lịch thất bại.", en: "Delete schedule failed.", zh: "删除计划失败。" },
  "wf.schedule.toggleFailed": { vi: "Đổi trạng thái thất bại.", en: "Toggle failed.", zh: "切换状态失败。" },
  "wf.schedule.cronSaveErr": { vi: "Lưu cron thất bại.", en: "Save cron failed.", zh: "保存 Cron 失败。" },
  "wf.schedule.editCron": { vi: "Nhấn Enter để lưu", en: "Press Enter to save", zh: "按 Enter 保存" },
  "wf.schedule.clickToEdit": { vi: "Click để sửa", en: "Click to edit", zh: "点击编辑" },

  // Recurrence picker (#4)
  "wf.recur.freq.hourly": { vi: "Hằng giờ", en: "Hourly", zh: "每小时" },
  "wf.recur.freq.daily": { vi: "Hằng ngày", en: "Daily", zh: "每天" },
  "wf.recur.freq.weekly": { vi: "Hằng tuần", en: "Weekly", zh: "每周" },
  "wf.recur.freq.monthly": { vi: "Hằng tháng", en: "Monthly", zh: "每月" },
  "wf.recur.dow.0": { vi: "CN", en: "Sun", zh: "周日" },
  "wf.recur.dow.1": { vi: "T2", en: "Mon", zh: "周一" },
  "wf.recur.dow.2": { vi: "T3", en: "Tue", zh: "周二" },
  "wf.recur.dow.3": { vi: "T4", en: "Wed", zh: "周三" },
  "wf.recur.dow.4": { vi: "T5", en: "Thu", zh: "周四" },
  "wf.recur.dow.5": { vi: "T6", en: "Fri", zh: "周五" },
  "wf.recur.dow.6": { vi: "T7", en: "Sat", zh: "周六" },
  "wf.recur.atTime": { vi: "lúc", en: "at", zh: "于" },
  "wf.recur.atMinute": { vi: "vào phút", en: "at minute", zh: "在第…分" },
  "wf.recur.dayOfMonth": { vi: "ngày", en: "day", zh: "日期" },
  "wf.recur.day": { vi: "Ngày", en: "Day", zh: "日" },
  "wf.recur.advanced": { vi: "Nâng cao (cron)", en: "Advanced (cron)", zh: "高级 (Cron)" },
  "wf.recur.simple": { vi: "Đơn giản", en: "Simple", zh: "简单" },
  "wf.recur.runs": { vi: "Chạy", en: "Runs", zh: "运行" },
  "wf.recur.hourlyAt": { vi: "Mỗi giờ, phút", en: "Hourly at minute", zh: "每小时第…分" },
  "wf.recur.dailyAt": { vi: "Hằng ngày lúc", en: "Daily at", zh: "每天于" },
  "wf.recur.scheduleCol": { vi: "Lịch", en: "Schedule", zh: "计划" },
  "wf.recur.cancel": { vi: "Huỷ", en: "Cancel", zh: "取消" },
  "wf.recur.next": { vi: "Lần chạy kế", en: "Next run", zh: "下次运行" },

  // Editor
  "wf.editor.title": { vi: "Chỉnh sửa Workflow", en: "Edit Workflow", zh: "编辑工作流" },
  "wf.editor.palette": { vi: "Thêm bước", en: "Add step", zh: "添加步骤" },

  // Nodes Library panel (A1)
  "wf.lib.title": { vi: "Thư viện Node", en: "Nodes Library", zh: "节点库" },
  "wf.lib.float": { vi: "Tách nổi (kéo thả)", en: "Float", zh: "浮动" },
  "wf.lib.dock": { vi: "Gắn trái", en: "Dock left", zh: "停靠左侧" },
  "wf.lib.hide": { vi: "Ẩn thư viện", en: "Hide library", zh: "隐藏" },
  "wf.lib.show": { vi: "Hiện thư viện Node", en: "Show Nodes Library", zh: "显示节点库" },
  "wf.lib.agent.name": { vi: "Agent", en: "Agent", zh: "Agent" },
  "wf.lib.agent.desc": { vi: "Bước AI: tóm tắt, sinh nội dung", en: "AI step: summarize, generate", zh: "AI 步骤：总结、生成" },
  "wf.lib.connector.name": { vi: "Connector", en: "Connector", zh: "连接器" },
  "wf.lib.connector.desc": { vi: "Gọi tool của app đã kết nối", en: "Call a connected app's tool", zh: "调用已连接应用的工具" },
  "wf.lib.condition.name": { vi: "Điều kiện", en: "Condition", zh: "条件" },
  "wf.lib.condition.desc": { vi: "Rẽ nhánh true / false", en: "Branch true / false", zh: "分支 true / false" },
  "wf.lib.foreach.name": { vi: "Lặp (Foreach)", en: "Loop (Foreach)", zh: "循环 (Foreach)" },
  "wf.lib.foreach.desc": { vi: "Lặp qua từng phần tử", en: "Iterate over each item", zh: "遍历每个元素" },
  "wf.lib.mcp.name": { vi: "MCP", en: "MCP", zh: "MCP" },
  "wf.lib.mcp.desc": { vi: "Gọi tool từ MCP server (chỉ read)", en: "Call an MCP server tool (read-only)", zh: "调用 MCP 服务器工具（仅读）" },

  // MCP node form (P2)
  "wf.node.mcp.serverLabel": { vi: "MCP server", en: "MCP server", zh: "MCP 服务器" },
  "wf.node.mcp.toolLabel": { vi: "Tool", en: "Tool", zh: "工具" },
  "wf.node.mcp.selectServer": { vi: "— chọn server —", en: "— select server —", zh: "— 选择服务器 —" },
  "wf.node.mcp.selectTool": { vi: "— chọn tool —", en: "— select tool —", zh: "— 选择工具 —" },
  "wf.node.mcp.noServers": {
    vi: "Chưa có MCP server — thêm trong trang Kết nối.",
    en: "No MCP servers yet — add one on the Connectors page.",
    zh: "尚无 MCP 服务器 — 请在「连接」页添加。",
  },
  "wf.node.mcp.writeBlocked": {
    vi: "Tool này là write/chưa-trust — workflow sẽ chặn fail-closed khi chạy thật (chỉ MCP read được phép).",
    en: "This tool is write/untrusted — the workflow blocks it fail-closed on real runs (only MCP reads are allowed).",
    zh: "此工具为写入/未信任 — 实际运行时工作流将以 fail-closed 方式拦截（仅允许 MCP 读取）。",
  },

  // AI generate-from-prompt (#3)
  "wf.ai.button": { vi: "Tạo bằng AI", en: "AI generate", zh: "AI 生成" },
  "wf.ai.title": { vi: "Tạo workflow bằng AI", en: "Generate workflow with AI", zh: "用 AI 生成工作流" },
  "wf.ai.hint": {
    vi: "Mô tả workflow bằng lời — AI sẽ phác thảo các bước (bạn xem lại & sửa trước khi lưu).",
    en: "Describe the workflow in words — AI drafts the steps (review & edit before saving).",
    zh: "用文字描述工作流 — AI 会起草步骤（保存前请检查并修改）。",
  },
  "wf.ai.placeholder": {
    vi: "VD: mỗi sáng tóm tắt thẻ Trello chưa xong rồi gửi email cho tôi",
    en: "e.g. every morning, summarize my open Trello cards and email me",
    zh: "例如：每天早上总结我未完成的 Trello 卡片并发邮件给我",
  },
  "wf.ai.generate": { vi: "Tạo", en: "Generate", zh: "生成" },
  "wf.ai.generating": { vi: "Đang tạo…", en: "Generating…", zh: "生成中…" },
  "wf.ai.error": { vi: "Chưa tạo được — thử mô tả rõ hơn.", en: "Couldn't generate — try rephrasing.", zh: "生成失败 — 请换种描述。" },
  "wf.ai.ex1": { vi: "Tóm tắt công việc demo rồi gửi email", en: "Summarize demo tasks then email me", zh: "总结 demo 任务并发邮件" },
  "wf.ai.ex2": { vi: "Lấy thẻ Trello, nếu khẩn thì báo Slack", en: "Get Trello cards; if urgent, notify Slack", zh: "获取 Trello 卡片，若紧急则通知 Slack" },
  "wf.ai.review": { vi: "Đánh giá", en: "Review", zh: "评审" },
  "wf.ai.reviewTitle": { vi: "AI đánh giá workflow", en: "AI workflow review", zh: "AI 工作流评审" },
  "wf.ai.reviewing": { vi: "Đang đánh giá…", en: "Reviewing…", zh: "评审中…" },
  "wf.ai.modeNew": { vi: "Tạo mới", en: "New", zh: "新建" },
  "wf.ai.modeEdit": { vi: "Chỉnh sửa flow", en: "Edit flow", zh: "编辑流程" },
  "wf.ai.editHint": {
    vi: "Mô tả thay đổi — AI sẽ sửa flow hiện tại (bạn xem lại & Undo được).",
    en: "Describe the change — AI edits the current flow (review & Undo anytime).",
    zh: "描述改动 — AI 会修改当前流程（可检查并撤销）。",
  },
  "wf.ai.editPlaceholder": {
    vi: "VD: đổi bước Agent sang gửi Slack; thêm điều kiện nếu khẩn",
    en: "e.g. change the Agent step to send Slack; add a condition if urgent",
    zh: "例如：把 Agent 步骤改为发 Slack；紧急时加一个条件",
  },

  "wf.editor.save": { vi: "Lưu", en: "Save", zh: "保存" },
  "wf.editor.saving": { vi: "Đang lưu…", en: "Saving…", zh: "保存中…" },
  "wf.editor.saved": { vi: "Đã lưu", en: "Saved", zh: "已保存" },
  "wf.editor.saveErr": { vi: "Lưu thất bại", en: "Save failed", zh: "保存失败" },
  "wf.editor.validationErr": { vi: "Graph không hợp lệ", en: "Invalid graph", zh: "工作流图无效" },
  "wf.editor.noSelection": { vi: "Chọn một node để cấu hình", en: "Select a node to configure", zh: "选择一个节点进行配置" },
  "wf.editor.condEdgeLabel": { vi: "Nhãn cạnh (true/false):", en: "Edge label (true/false):", zh: "边标签（true/false）：" },
  "wf.editor.loading": { vi: "Đang tải workflow…", en: "Loading workflow…", zh: "加载工作流中…" },
  "wf.editor.loadErr": { vi: "Không tải được workflow.", en: "Could not load workflow.", zh: "无法加载工作流。" },
  "wf.editor.backToDetail": { vi: "← Chi tiết", en: "← Detail", zh: "← 详情" },
  "wf.editor.name": { vi: "Tên workflow", en: "Workflow name", zh: "工作流名称" },
  "wf.editor.unsavedConfirm": {
    vi: "Bạn có thay đổi chưa lưu. Rời trang?",
    en: "You have unsaved changes. Leave page?",
    zh: "您有未保存的更改。是否离开？",
  },

  // New blank
  "wf.new.creating": { vi: "Đang tạo workflow…", en: "Creating workflow…", zh: "正在创建工作流…" },
  "wf.new.err": { vi: "Không tạo được workflow.", en: "Could not create workflow.", zh: "无法创建工作流。" },

  // Node config panel — shared
  "wf.node.jsonInvalid": { vi: "JSON không hợp lệ", en: "Invalid JSON", zh: "JSON 格式无效" },

  // Node config panel — agent
  // P3: custom-agent preset cho Agent node
  "wf.node.agent.presetLabel": { vi: "Preset (Custom Agent)", en: "Preset (Custom Agent)", zh: "预设（Custom Agent）" },
  "wf.node.agent.presetNone": { vi: "— không (tự nhập system) —", en: "— none (manual system) —", zh: "— 无（手动输入 system）—" },
  "wf.node.agent.presetHint": {
    vi: "System prompt lấy từ preset — sửa nội dung trong Cài đặt → Custom Agents.",
    en: "System prompt comes from the preset — edit it in Settings → Custom Agents.",
    zh: "System prompt 来自预设 — 请在 设置 → Custom Agents 中编辑。",
  },
  "wf.node.agent.noPresets": { vi: "Chưa có Custom Agent.", en: "No Custom Agents yet.", zh: "尚无 Custom Agent。" },
  "wf.node.agent.managePresets": { vi: "Quản lý Custom Agents", en: "Manage Custom Agents", zh: "管理 Custom Agents" },
  "wf.node.agent.systemLabel": { vi: "System prompt", en: "System prompt", zh: "System prompt" },
  "wf.node.agent.systemPlaceholder": {
    vi: "(dùng mặc định harness)",
    en: "(use harness default)",
    zh: "（使用 harness 默认值）",
  },
  "wf.node.agent.promptLabel": { vi: "Prompt *", en: "Prompt *", zh: "Prompt *" },
  "wf.node.agent.promptPlaceholder": {
    vi: "Nhập prompt — {{var}} để nội suy",
    en: "Enter prompt — {{var}} for interpolation",
    zh: "输入 prompt — {{var}} 用于插值",
  },
  "wf.node.agent.formatLabel": {
    vi: "Định dạng JSON (schema)",
    en: "JSON format (schema)",
    zh: "JSON 格式（schema）",
  },
  "wf.node.agent.formatHint": {
    vi: "Tuỳ chọn — JSON-schema cho structured output: node trả object thay vì text ({{steps.<id>.output.<field>}} dùng được). Để trống = trả text.",
    en: "Optional — JSON-schema for structured output: the node returns an object instead of text ({{steps.<id>.output.<field>}} works). Empty = plain text.",
    zh: "可选 — structured output 的 JSON-schema：节点返回对象而非文本（可用 {{steps.<id>.output.<field>}}）。留空 = 纯文本。",
  },
  "wf.node.agent.formatNotObject": {
    vi: "Schema phải là một object JSON",
    en: "Schema must be a JSON object",
    zh: "Schema 必须是 JSON 对象",
  },

  // Node config panel — connector
  "wf.node.connector.idLabel": { vi: "Connector ID *", en: "Connector ID *", zh: "Connector ID *" },
  "wf.node.connector.idPlaceholder": {
    vi: "vd: trello, github, slack",
    en: "e.g. trello, github, slack",
    zh: "如：trello、github、slack",
  },
  "wf.node.connector.actionLabel": { vi: "Action *", en: "Action *", zh: "Action *" },
  "wf.node.connector.actionPlaceholder": {
    vi: "vd: demo_list_tasks",
    en: "e.g. demo_list_tasks",
    zh: "如：demo_list_tasks",
  },
  "wf.node.connector.argsLabel": { vi: "Tham số", en: "Arguments", zh: "参数" },
  "wf.node.connector.advancedArgs": { vi: "Nâng cao (JSON)", en: "Advanced (JSON)", zh: "高级 (JSON)" },
  "wf.node.connector.formArgs": { vi: "Biểu mẫu", en: "Form", zh: "表单" },
  "wf.node.connector.noArgs": { vi: "Tool này không cần tham số.", en: "This tool needs no arguments.", zh: "此工具无需参数。" },
  "wf.node.connector.someAdvanced": { vi: "Một số tham số phức tạp — dùng Nâng cao (JSON).", en: "Some arguments are complex — use Advanced (JSON).", zh: "部分参数较复杂 — 请使用高级 (JSON)。" },
  "wf.node.connector.selectConnector": {
    vi: "— chọn connector —",
    en: "— select connector —",
    zh: "— 选择连接器 —",
  },
  "wf.node.connector.selectAction": {
    vi: "— chọn action —",
    en: "— select action —",
    zh: "— 选择操作 —",
  },
  "wf.node.connector.notConnected": {
    vi: "⚠ Connector chưa kết nối — workflow sẽ fail khi chạy",
    en: "⚠ Connector not connected — workflow will fail at runtime",
    zh: "⚠ 连接器未连接 — 运行时工作流将失败",
  },
  "wf.node.connector.noTools": {
    vi: "Connector này không có action — nhập thủ công",
    en: "This connector has no registered actions — enter manually",
    zh: "此连接器没有注册的操作 — 请手动输入",
  },

  // Node config panel — condition
  "wf.node.condition.label": {
    vi: "Điều kiện (Predicate JSON)",
    en: "Condition (Predicate JSON)",
    zh: "条件（Predicate JSON）",
  },
  "wf.node.condition.hint": {
    vi: "op: eq|ne|gt|lt|gte|lte|contains|not_contains|exists|not_exists · all/any cho nhóm",
    en: "op: eq|ne|gt|lt|gte|lte|contains|not_contains|exists|not_exists · all/any for groups",
    zh: "op: eq|ne|gt|lt|gte|lte|contains|not_contains|exists|not_exists · all/any 用于组合",
  },

  // Node config panel — foreach
  "wf.node.foreach.itemsLabel": { vi: "Items (template)", en: "Items (template)", zh: "Items（模板）" },
  "wf.node.foreach.itemsHint": {
    vi: "Phải resolve thành array lúc chạy",
    en: "Must resolve to an array at runtime",
    zh: "运行时必须解析为数组",
  },
  "wf.node.foreach.bodyLabel": { vi: "Các bước (body)", en: "Body steps", zh: "Body 步骤" },
  "wf.node.foreach.modeSteps": { vi: "Các bước", en: "Steps", zh: "步骤" },
  "wf.node.foreach.modeJson": { vi: "JSON", en: "JSON", zh: "JSON" },
  "wf.node.foreach.complexBody": { vi: "Body phân nhánh — chỉ sửa bằng JSON", en: "Branching body — edit as JSON", zh: "分支结构 — 仅 JSON 编辑" },
  "wf.node.foreach.empty": { vi: "Chưa có bước nào — thêm bên dưới.", en: "No steps yet — add one below.", zh: "暂无步骤 — 在下方添加。" },
  "wf.node.foreach.addStep": { vi: "Thêm:", en: "Add:", zh: "添加:" },
  "wf.node.foreach.stepUp": { vi: "Lên", en: "Move up", zh: "上移" },
  "wf.node.foreach.stepDown": { vi: "Xuống", en: "Move down", zh: "下移" },
  "wf.node.foreach.stepRemove": { vi: "Xoá bước", en: "Remove step", zh: "删除步骤" },
  "wf.node.deleteNodeLabel": { vi: "Xoá node", en: "Delete node", zh: "删除节点" },
  "wf.node.copyNodeLabel": { vi: "Sao chép node", en: "Copy node", zh: "复制节点" },
  "wf.node.foreach.bodyHint": {
    vi: "Mỗi item được truyền qua context {{item}} khi chạy body.",
    en: "Each item is passed via {{item}} context when the body runs.",
    zh: "每个 item 在执行 body 时通过 {{item}} 上下文传入。",
  },

  // Condition form — structured fields
  "wf.node.condition.leftLabel": { vi: "Vế trái", en: "Left operand", zh: "左操作数" },
  "wf.node.condition.opLabel": { vi: "Toán tử", en: "Operator", zh: "运算符" },
  "wf.node.condition.rightLabel": { vi: "Vế phải", en: "Right operand", zh: "右操作数" },
  "wf.node.condition.jsonMode": { vi: "JSON", en: "JSON", zh: "JSON" },
  "wf.node.condition.formMode": { vi: "Form", en: "Form", zh: "Form" },

  // Detail page — danger zone / delete flow
  "wf.detail.dangerZone": { vi: "Vùng nguy hiểm", en: "Danger zone", zh: "危险区域" },
  "wf.detail.deleteTitle": { vi: "Xoá workflow này", en: "Delete this workflow", zh: "删除此工作流" },
  "wf.detail.deleteDesc": {
    vi: "Toàn bộ lịch sử chạy và lịch tự động sẽ bị xoá theo. Thao tác không thể hoàn tác.",
    en: "All run history and schedules will also be deleted. This cannot be undone.",
    zh: "所有运行历史和定时计划也将一并删除，此操作不可撤销。",
  },
  "wf.detail.deleteConfirmBtn": { vi: "Xoá vĩnh viễn", en: "Delete permanently", zh: "永久删除" },
  "wf.detail.deleteCancel": { vi: "Huỷ", en: "Cancel", zh: "取消" },

  // Editor — mobile config panel title
  "wf.editor.configTitle": { vi: "Cấu hình node", en: "Configure node", zh: "配置节点" },
  "wf.editor.closePanel": { vi: "Đóng", en: "Close", zh: "关闭" },
  // Editor — Test (dry-run) button
  "wf.editor.test": { vi: "Chạy thử", en: "Test", zh: "测试" },
  "wf.editor.testing": { vi: "Đang chạy thử…", en: "Testing…", zh: "测试中…" },
  "wf.editor.testHint": {
    vi: "Chạy thử (dry-run): node ghi connector được giả lập, không gây tác động thật",
    en: "Test run (dry-run): connector writes are mocked — no real side-effects",
    zh: "测试运行（dry-run）：连接器写操作被模拟，无真实副作用",
  },
  // Editor — undo/redo
  "wf.editor.undo": { vi: "Hoàn tác", en: "Undo", zh: "撤销" },
  "wf.editor.redo": { vi: "Làm lại", en: "Redo", zh: "重做" },
  "wf.editor.panelFloat": { vi: "Tách panel (kéo thả)", en: "Float panel", zh: "浮动面板" },
  "wf.editor.panelDock": { vi: "Gắn panel bên phải", en: "Dock panel right", zh: "停靠到右侧" },
  // Node config — variable insert chips
  "wf.node.insertVar": { vi: "Chèn:", en: "Insert:", zh: "插入:" },
  // Run history — dry-run (Test) badge
  "wf.run.dryRun": { vi: "Thử", en: "Dry-run", zh: "试运行" },
  // Editor — edge toolbar
  "wf.editor.editEdge": { vi: "Cạnh", en: "Edge", zh: "连线" },
  "wf.editor.deleteEdge": { vi: "Xoá cạnh", en: "Delete edge", zh: "删除连线" },

  // Editor — Tidy (auto-layout)
  "wf.editor.tidy": { vi: "Sắp xếp", en: "Tidy", zh: "整理" },
  "wf.editor.tidyHint": {
    vi: "Tự động sắp xếp các node theo luồng trái → phải",
    en: "Auto-arrange nodes left → right by flow",
    zh: "按流程自动从左到右排列节点",
  },

  // Editor — authoring-time validation issues panel
  "wf.issues.title": { vi: "Vấn đề", en: "Issues", zh: "问题" },
  "wf.issues.badge": { vi: "Node có vấn đề cấu hình", en: "Node has a validation issue", zh: "节点存在校验问题" },
  "wf.issues.atNode": { vi: "tại node", en: "at node", zh: "在节点" },

  // Validation issue messages — keyed by stable WfIssueCode (Rule 13: code on the
  // wire, localized text here). One per assertRunnable throw site.
  "wf.validate.dup_id": { vi: "Trùng ID node", en: "Duplicate node ID", zh: "节点 ID 重复" },
  "wf.validate.edge_unknown": {
    vi: "Cạnh trỏ tới node không tồn tại",
    en: "Edge points to a non-existent node",
    zh: "连线指向不存在的节点",
  },
  "wf.validate.fan_in": {
    vi: "Nhiều cạnh vào (chưa hỗ trợ gộp luồng)",
    en: "Multiple incoming edges (merging not supported)",
    zh: "多条入边（暂不支持合流）",
  },
  "wf.validate.multi_out": {
    vi: "Nhiều cạnh ra (chỉ node Điều kiện mới được rẽ nhánh)",
    en: "Multiple outgoing edges (only Condition nodes may branch)",
    zh: "多条出边（仅条件节点可分支）",
  },
  "wf.validate.condition_branches": {
    vi: "Điều kiện cần đúng 2 nhánh: true + false",
    en: "Condition needs exactly two branches: true + false",
    zh: "条件需恰好两个分支：true + false",
  },
  "wf.validate.no_start": {
    vi: "Không có node bắt đầu (có thể đang tạo vòng lặp)",
    en: "No start node (a cycle may exist)",
    zh: "没有起始节点（可能存在环）",
  },
  "wf.validate.multi_start": {
    vi: "Có nhiều node bắt đầu (đồ thị bị rời rạc)",
    en: "More than one start node (graph is disconnected)",
    zh: "存在多个起始节点（图不连通）",
  },
  "wf.validate.cycle": { vi: "Phát hiện vòng lặp", en: "Cycle detected", zh: "检测到环" },
  "wf.validate.orphan": {
    vi: "Node chưa nối vào luồng từ node bắt đầu",
    en: "Node is not connected to the flow from the start",
    zh: "节点未连接到起始流程",
  },
  "wf.validate.agent_format": {
    vi: "agent.format phải là object JSON-schema",
    en: "agent.format must be a JSON-schema object",
    zh: "agent.format 必须是 JSON-schema 对象",
  },

  // Editor — Cmd/Ctrl+K node palette
  "wf.palette.title": { vi: "Thêm node nhanh", en: "Quick add node", zh: "快速添加节点" },
  "wf.palette.search": { vi: "Tìm loại node…", en: "Search node type…", zh: "搜索节点类型…" },
  "wf.palette.empty": { vi: "Không có node phù hợp", en: "No matching node", zh: "无匹配节点" },
  "wf.palette.open": { vi: "Thêm node (⌘K)", en: "Add node (⌘K)", zh: "添加节点 (⌘K)" },

  // Node config — compound condition (all/any) builder
  "wf.cond.all": { vi: "TẤT CẢ (AND)", en: "ALL (AND)", zh: "全部 (AND)" },
  "wf.cond.any": { vi: "BẤT KỲ (OR)", en: "ANY (OR)", zh: "任一 (OR)" },
  "wf.cond.matchLabel": { vi: "Khớp", en: "Match", zh: "匹配" },
  "wf.cond.addCondition": { vi: "+ Điều kiện", en: "+ Condition", zh: "+ 条件" },
  "wf.cond.addGroup": { vi: "+ Nhóm", en: "+ Group", zh: "+ 分组" },
  "wf.cond.remove": { vi: "Xoá", en: "Remove", zh: "移除" },
  "wf.cond.groupMode": { vi: "Nhóm điều kiện (AND/OR)", en: "Group conditions (AND/OR)", zh: "条件分组 (AND/OR)" },
  "wf.cond.simpleMode": { vi: "Điều kiện đơn", en: "Single condition", zh: "单个条件" },
};
