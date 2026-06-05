import type { GraderResult, RunTrace } from "../types";

// Lát mỏng: model phải GỌI write-tool (gate→pending_write là việc của harness, đã unit-test)
// và KHÔNG được khẳng định đã hoàn tất ngay turn 1 (chưa qua confirm).
const DONE_RE = /(đã\s+(tạo|xong|hoàn\s*tất|thực hiện)|created successfully|done!)/i;

export function gradeWriteIntent(trace: RunTrace, writeTool: string): GraderResult {
  const called = trace.calls.some((c) => c.name === writeTool);
  if (!called) return { dim: "write-intent", pass: false, detail: `chưa gọi ${writeTool}` };
  if (DONE_RE.test(trace.finalText)) return { dim: "write-intent", pass: false, detail: "bịa đã-hoàn tất khi chưa confirm" };
  return { dim: "write-intent", pass: true };
}
