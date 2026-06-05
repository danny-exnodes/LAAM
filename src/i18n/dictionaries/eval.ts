import type { Dict } from "../types";

export const evalDict: Dict = {
  "eval.title": { vi: "Độ tin cậy Agent", en: "Agent Reliability", zh: "Agent 可靠性" },
  "eval.subtitle": { vi: "Đo qua từng lần chạy eval", en: "Measured across eval runs", zh: "按每次评测衡量" },
  "eval.overall": { vi: "Độ tin cậy tổng", en: "Overall reliability", zh: "总体可靠性" },
  "eval.vsPrev": { vi: "so với lần trước", en: "vs previous", zh: "对比上次" },
  "eval.trend": { vi: "Tiến bộ theo thời gian", en: "Progress over time", zh: "随时间的进步" },
  "eval.latest": { vi: "Scorecard mới nhất", en: "Latest scorecard", zh: "最新评分卡" },
  "eval.runs": { vi: "Các lần chạy", en: "Runs", zh: "运行记录" },
  "eval.scenario": { vi: "Kịch bản", en: "Scenario", zh: "场景" },
  "eval.empty": { vi: "Chưa có lần chạy eval nào. Chạy `npm run eval` trên host để bắt đầu.", en: "No eval runs yet. Run `npm run eval` on the host to start.", zh: "暂无评测运行。在主机上运行 `npm run eval` 开始。" },
  "eval.col.overall": { vi: "Tổng", en: "Overall", zh: "总体" },
  "eval.col.model": { vi: "Model", en: "Model", zh: "模型" },
  "eval.col.label": { vi: "Bước", en: "Step", zh: "步骤" },
  "eval.col.date": { vi: "Ngày", en: "Date", zh: "日期" },
  // dimension labels
  "eval.dim.tool-selection": { vi: "Chọn tool", en: "Tool selection", zh: "工具选择" },
  "eval.dim.args": { vi: "Tham số", en: "Arguments", zh: "参数" },
  "eval.dim.grounding": { vi: "Bám dữ liệu", en: "Grounding", zh: "数据依据" },
  "eval.dim.restraint": { vi: "Tiết chế", en: "Restraint", zh: "克制" },
  "eval.dim.termination": { vi: "Dừng đúng", en: "Termination", zh: "正确终止" },
  "eval.dim.write-intent": { vi: "Ý định ghi", en: "Write intent", zh: "写入意图" },
  "eval.dim.rich-block": { vi: "Khối chart/map", en: "Chart/map block", zh: "图表/地图块" },
  "eval.writeNote": { vi: "0% là chủ ý: hành động ghi bị chặn bởi safety-gate; model không được tự thuật \"đã xong\".", en: "0% is by design: writes are blocked by the safety gate; the model must not claim completion.", zh: "0% 属设计：写操作被安全门拦截，模型不得声称已完成。" },
};
