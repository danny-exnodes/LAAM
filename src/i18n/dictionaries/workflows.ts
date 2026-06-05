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
  "wf.cancel": { vi: "Đóng", en: "Close", zh: "关闭" },

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

  // New blank
  "wf.new.creating": { vi: "Đang tạo workflow…", en: "Creating workflow…", zh: "正在创建工作流…" },
  "wf.new.err": { vi: "Không tạo được workflow.", en: "Could not create workflow.", zh: "无法创建工作流。" },
};
