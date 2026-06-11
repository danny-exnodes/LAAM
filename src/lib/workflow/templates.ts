import type { WorkflowGraph } from "./types";

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  moatLeaning: boolean;
  graph: WorkflowGraph;
};

// ── Shared format schema dùng lại cho judge node (B2) ──
const JUDGE_FORMAT = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["PASS", "FAIL"] },
    reason: { type: "string" },
  },
  required: ["verdict", "reason"],
};

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "digest-overnight-agents",
    name: "Digest agent chạy đêm qua",
    description: "Tóm tắt các agent đã chạy trong 24h, flag con kẹt/đốt token (đọc dữ liệu LAAM).",
    moatLeaning: true,
    graph: {
      nodes: [
        {
          id: "summarize",
          kind: "agent",
          system: "Bạn là trợ lý vận hành nội bộ. Dùng các tool LAAM để đọc dữ liệu agent.",
          prompt:
            "Liệt kê các agent đã chạy trong 24h qua; chỉ ra con nào đang kẹt (stuck) hoặc tốn token bất thường; tóm tắt thành một digest ngắn gọn bằng tiếng Việt.",
        },
      ],
      edges: [],
    },
  },
  {
    id: "flag-stuck-agents",
    name: "Cảnh báo agent đang kẹt",
    description: "Tìm các agent kẹt lâu và liệt kê (đọc dữ liệu LAAM).",
    moatLeaning: true,
    graph: {
      nodes: [
        {
          id: "stuck",
          kind: "agent",
          system: "Bạn giám sát agent.",
          prompt:
            "Dùng tool để tìm các agent đang kẹt (stuck) lâu hơn 10 phút. Nếu có, liệt kê tên + thời lượng kẹt. Nếu không có, trả lời đúng câu: 'Không có agent kẹt.'",
        },
      ],
      edges: [],
    },
  },
  {
    id: "summarize-demo-tasks",
    name: "Tóm tắt công việc (demo)",
    description: "Lấy danh sách công việc từ connector Demo rồi tóm tắt — mẫu connector→agent.",
    moatLeaning: false,
    graph: {
      nodes: [
        { id: "fetch", kind: "connector", connectorId: "demo", action: "demo_list_tasks", args: {} },
        {
          id: "summarize",
          kind: "agent",
          system: "Bạn tóm tắt danh sách công việc.",
          prompt: "Tóm tắt danh sách công việc sau bằng 1-2 câu tiếng Việt: {{steps.fetch.output}}",
        },
      ],
      edges: [{ from: "fetch", to: "summarize" }],
    },
  },
  // ── B2: Template 1 — Digest có kiểm chứng (judge-verify) ──────────────────
  // Luồng: agent tóm tắt → agent judge (format JSON) → condition eq(verdict,PASS)
  //   → true:  connector Demo demo_create_task (PIN: không hardcode write thật)
  //   → false: agent thông báo bỏ qua (không tạo task)
  {
    id: "digest-judge-verify",
    name: "Digest có kiểm chứng (judge-verify)",
    description:
      "Tóm tắt phiên agent hôm qua, đưa qua judge có structured output (verdict PASS/FAIL), " +
      "chỉ tạo task Demo khi judge PASS — mẫu judge-verify dùng condition eq trên field enum.",
    moatLeaning: true,
    graph: {
      nodes: [
        {
          id: "summarize",
          kind: "agent",
          system: "Bạn là trợ lý vận hành nội bộ. Dùng các tool LAAM để đọc dữ liệu agent.",
          prompt:
            "Dùng tool LAAM để lấy danh sách các agent đã chạy trong 24h qua. " +
            "Tóm tắt: số lượng session, tổng token, session kẹt (stuck), token bất thường. " +
            "Trả kết quả bằng tiếng Việt, ngắn gọn.",
        },
        {
          id: "judge",
          kind: "agent",
          system: "Bạn là evaluator phiên làm việc của team dev. Đánh giá digest và quyết định có nên tạo task theo dõi không.",
          prompt:
            "Dựa trên digest sau, đánh giá xem có điểm bất thường cần tạo task theo dõi không:\n{{steps.summarize.output}}\n\n" +
            "PASS = có ít nhất 1 vấn đề đáng chú ý (agent kẹt, token bất thường, lỗi).\n" +
            "FAIL = mọi thứ bình thường, không cần tạo task.",
          format: JUDGE_FORMAT,
        },
        {
          id: "check",
          kind: "condition",
          when: { left: "{{steps.judge.output.verdict}}", op: "eq", right: "PASS" },
        },
        // Nhánh true: tạo task Demo (PIN: Demo connector, không hardcode write thật)
        {
          id: "create-task",
          kind: "connector",
          connectorId: "demo",
          action: "demo_create_task",
          args: {
            // KHÔNG dùng {{trigger.date}} — trigger payload thật chỉ có {source} (run.ts emptyContext).
            title: "Digest agent — cần xem lại",
            description: "{{steps.summarize.output}}\n\nLý do: {{steps.judge.output.reason}}",
          },
        },
        // Nhánh false: bỏ qua (không cần tạo task)
        {
          id: "skip",
          kind: "agent",
          prompt:
            "Digest hôm nay không có vấn đề bất thường. Lý do judge: {{steps.judge.output.reason}}. Không tạo task.",
        },
      ],
      edges: [
        { from: "summarize", to: "judge" },
        { from: "judge", to: "check" },
        { from: "check", to: "create-task", label: "true" },
        { from: "check", to: "skip", label: "false" },
      ],
    },
  },
  // ── B2: Template 2 — Triage theo lịch ────────────────────────────────────
  // Luồng: agent guard kiểm tra session stuck → condition (có stuck không?)
  //   → true:  agent tóm tắt vấn đề → connector Demo demo_create_task
  //   → false: agent thông báo không có gì cần triage
  // Ghi chú schedule: template này thiết kế cho schedule recurrence (vd cron "0 9 * * 1-5"
  // = mỗi sáng thứ 2-6); cài trong Workflows → Schedules sau khi instantiate.
  {
    id: "scheduled-triage",
    name: "Triage theo lịch",
    description:
      "Guard kiểm tra session stuck qua tool LAAM, nếu có → tóm tắt + tạo task Demo để triage. " +
      "Dùng với schedule recurrence (vd: cron '0 9 * * 1-5' = 9h sáng thứ 2-6).",
    moatLeaning: true,
    graph: {
      nodes: [
        // Guard: structured output (B1) thay vì eq trên text tự do — 8B hay kèm reasoning text.
        {
          id: "guard",
          kind: "agent",
          system: "Bạn kiểm tra trạng thái agent qua tool LAAM.",
          prompt:
            "Dùng tool LAAM kiểm tra xem hiện có session agent nào đang kẹt (stuck > 10 phút) không. " +
            "Trả về status='stuck' nếu có ít nhất 1 session kẹt, status='clear' nếu không.",
          format: {
            type: "object",
            properties: { status: { type: "string", enum: ["stuck", "clear"] } },
            required: ["status"],
          },
        },
        {
          id: "has-stuck",
          kind: "condition",
          when: { left: "{{steps.guard.output.status}}", op: "eq", right: "stuck" },
        },
        // Nhánh true: có stuck → tóm tắt → tạo task
        {
          id: "summarize",
          kind: "agent",
          system: "Bạn là trợ lý vận hành. Dùng tool LAAM để đọc dữ liệu agent kẹt.",
          prompt:
            "Liệt kê các agent đang kẹt (stuck > 10 phút): tên session, project, thời gian kẹt, token tiêu thụ. " +
            "Tóm tắt ngắn gọn để tạo task triage.",
        },
        {
          id: "create-task",
          kind: "connector",
          connectorId: "demo",
          action: "demo_create_task",
          args: {
            title: "Triage agent kẹt",
            description: "{{steps.summarize.output}}",
          },
        },
        // Nhánh false: không có stuck → kết thúc bình thường
        {
          id: "all-clear",
          kind: "agent",
          prompt: "Không có agent kẹt tại thời điểm kiểm tra. Không cần triage.",
        },
      ],
      edges: [
        { from: "guard", to: "has-stuck" },
        { from: "has-stuck", to: "summarize", label: "true" },
        { from: "has-stuck", to: "all-clear", label: "false" },
        { from: "summarize", to: "create-task" },
      ],
    },
  },
];

export function getTemplate(id: string): WorkflowTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
