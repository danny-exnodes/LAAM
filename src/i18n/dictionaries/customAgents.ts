// P3: Custom Agents management UI (/settings/custom-agents) — vi/en/zh.
import type { Dict } from "../types";

export const customAgentsDict: Dict = {
  "ca.title": { vi: "Custom Agents", en: "Custom Agents", zh: "Custom Agents" },
  "ca.subtitle": {
    vi: "Preset agent (system prompt tái dùng) cho node Agent trong workflow.",
    en: "Agent presets (reusable system prompts) for workflow Agent nodes.",
    zh: "工作流 Agent 节点的预设（可复用 system prompt）。",
  },
  "ca.create": { vi: "Tạo Custom Agent", en: "Create Custom Agent", zh: "创建 Custom Agent" },
  "ca.nameLabel": { vi: "Tên", en: "Name", zh: "名称" },
  "ca.namePh": { vi: "vd: Người tóm tắt", en: "e.g. Summarizer", zh: "例如：摘要专家" },
  "ca.descLabel": { vi: "Mô tả (tuỳ chọn)", en: "Description (optional)", zh: "描述（可选）" },
  "ca.systemLabel": { vi: "System prompt", en: "System prompt", zh: "System prompt" },
  "ca.systemPh": {
    vi: "Bạn là … Trả lời ngắn gọn, đúng yêu cầu của bước.",
    en: "You are … Answer concisely, exactly as the step requires.",
    zh: "你是 … 简洁回答，严格按步骤要求。",
  },
  "ca.save": { vi: "Lưu", en: "Save", zh: "保存" },
  "ca.cancel": { vi: "Huỷ", en: "Cancel", zh: "取消" },
  "ca.edit": { vi: "Sửa", en: "Edit", zh: "编辑" },
  "ca.delete": { vi: "Xoá", en: "Delete", zh: "删除" },
  "ca.clone": { vi: "Nhân bản", en: "Clone", zh: "克隆" },
  "ca.useInChat": { vi: "Dùng trong Chat", en: "Use in Chat", zh: "在 Chat 中使用" },
  "ca.confirmDelete": {
    vi: "Xoá preset này? Node Agent đang tham chiếu sẽ fail khi chạy (fail-loud).",
    en: "Delete this preset? Agent nodes referencing it will fail at run time (fail-loud).",
    zh: "删除此预设？引用它的 Agent 节点运行时将失败（fail-loud）。",
  },
  "ca.empty": {
    vi: "Chưa có Custom Agent nào — tạo mới hoặc dùng mẫu bên dưới.",
    en: "No Custom Agents yet — create one or start from a template below.",
    zh: "尚无 Custom Agent — 新建或从下方模板开始。",
  },
  "ca.templates": { vi: "Mẫu nhanh:", en: "Quick templates:", zh: "快速模板：" },
  "ca.error": { vi: "Lỗi máy chủ — thử lại.", en: "Server error — try again.", zh: "服务器错误 — 请重试。" },

  // 3 starter templates — quick-fill form (user còn sửa trước khi lưu).
  "ca.tpl.summarizer.name": { vi: "Người tóm tắt", en: "Summarizer", zh: "摘要专家" },
  "ca.tpl.summarizer.system": {
    vi: "Bạn là chuyên gia tóm tắt. Tóm tắt nội dung đầu vào thành các ý chính ngắn gọn (tối đa 5 gạch đầu dòng), giữ số liệu quan trọng, không thêm thông tin ngoài đầu vào.",
    en: "You are a summarization expert. Summarize the input into at most 5 concise bullet points, keep key figures, add nothing beyond the input.",
    zh: "你是摘要专家。将输入内容总结为最多 5 个要点，保留关键数据，不要添加输入之外的信息。",
  },
  "ca.tpl.triage.name": { vi: "Người phân loại", en: "Triage", zh: "分类专家" },
  "ca.tpl.triage.system": {
    vi: "Bạn là bước phân loại/đánh giá trong workflow. Đọc đầu vào và trả về kết luận ngắn gọn theo đúng format bước yêu cầu (vd PASS/FAIL kèm 1 câu lý do). Không suy diễn ngoài dữ liệu.",
    en: "You are a triage/judging step in a workflow. Read the input and return a terse verdict exactly in the requested format (e.g. PASS/FAIL with a one-line reason). Do not speculate beyond the data.",
    zh: "你是工作流中的分类/评审步骤。阅读输入并严格按要求格式返回简短结论（如 PASS/FAIL 加一句理由）。不要超出数据进行推测。",
  },
  "ca.tpl.writer.name": { vi: "Người soạn nội dung", en: "Writer", zh: "内容撰写" },
  "ca.tpl.writer.system": {
    vi: "Bạn là người soạn nội dung. Viết văn bản rõ ràng, đúng giọng điệu chuyên nghiệp, dựa HOÀN TOÀN trên dữ liệu đầu vào của bước; nêu rõ chỗ thiếu dữ liệu thay vì bịa.",
    en: "You are a content writer. Write clear, professional text based ENTIRELY on the step's input data; call out missing data instead of inventing it.",
    zh: "你是内容撰写者。完全基于该步骤的输入数据撰写清晰、专业的文本；缺少数据时明确指出，不要编造。",
  },
};
