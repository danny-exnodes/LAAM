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

  // Editor
  "wf.editor.title": { vi: "Chỉnh sửa Workflow", en: "Edit Workflow", zh: "编辑工作流" },
  "wf.editor.palette": { vi: "Thêm bước", en: "Add step", zh: "添加步骤" },
  "wf.editor.addAgent": { vi: "+ Agent", en: "+ Agent", zh: "+ Agent" },
  "wf.editor.addConnector": { vi: "+ Connector", en: "+ Connector", zh: "+ 连接器" },
  "wf.editor.addCondition": { vi: "+ Condition", en: "+ Condition", zh: "+ 条件" },
  "wf.editor.addForeach": { vi: "+ Foreach", en: "+ Foreach", zh: "+ 循环" },
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
  "wf.node.connector.argsLabel": { vi: "Args (JSON)", en: "Args (JSON)", zh: "Args (JSON)" },
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
  "wf.node.foreach.bodyLabel": { vi: "Body graph (JSON)", en: "Body graph (JSON)", zh: "Body graph (JSON)" },
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
};
