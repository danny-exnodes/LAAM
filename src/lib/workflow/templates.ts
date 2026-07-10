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
            "Gọi tool `laam_metrics_digest` để lấy số liệu GROUND-TRUTH. Chèn NGUYÊN VĂN block `summary` của nó vào ĐẦU digest (KHÔNG sửa bất kỳ con số nào). Bên dưới, liệt kê các agent đáng chú ý (kẹt/đốt token) và viết phần phân tích ngắn gọn bằng tiếng Việt.",
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
            "Gọi tool `laam_metrics_digest` để lấy số liệu GROUND-TRUTH (code tính, không bịa). " +
            "Chèn NGUYÊN VĂN block `summary` vào digest (KHÔNG sửa số), rồi thêm nhận xét ngắn gọn " +
            "về agent kẹt / token bất thường bằng tiếng Việt.",
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
  // ── P (2026-07-10): Template SONG SONG — báo cáo đa nguồn → gửi mail ──────────
  // Kim cương: brief → fan-out 3 nhánh CHẠY SONG SONG (research_laam / research_web /
  // fetch_tasks) → fan-in synthesis (đọc CẢ 3) → gmail_send (recipient TĨNH, gated).
  // parallel:true → engine dùng scheduleGraph (validator nới lỏng fan-in/fan-out).
  // Chạy offline $0 qua dry-run: gmail_send trả mock TRƯỚC gate recipient; 3 nhánh read
  // chạy thật. Live send: connect Gmail + thêm domain vào WORKFLOW_RECIPIENT_ALLOWLIST.
  // Rule 13: khối số liệu LAAM đi MỘT hop — body nối {{steps.research_laam.output}} thẳng,
  // độc lập synthesis (8B không được đổi/bịa số).
  {
    id: "multi-source-report-email",
    name: "Soạn báo cáo đa nguồn → gửi mail (song song)",
    description:
      "DAG song song: 1 brief → 3 nhánh research chạy ĐỒNG THỜI (số liệu LAAM · web · công việc) " +
      "→ tổng hợp → gửi email. Chạy thử offline $0 bằng dry-run (gmail_send được mock). " +
      "Gửi thật: kết nối Gmail, thêm địa chỉ/ domain vào WORKFLOW_RECIPIENT_ALLOWLIST, sửa `to`, chạy không dry-run.",
    moatLeaning: true,
    graph: {
      parallel: true,
      nodes: [
        {
          id: "brief",
          kind: "agent",
          system: "Bạn lập kế hoạch báo cáo vận hành ngắn gọn.",
          prompt:
            "Xác định phạm vi một báo cáo vận hành ngắn gồm: (1) sức khoẻ agent LAAM, " +
            "(2) một tham chiếu/tin tức web liên quan, (3) công việc đang mở. Trả 2-3 câu định hướng.",
        },
        // ── FAN-OUT: 3 nhánh chạy SONG SONG ──
        {
          id: "research_laam",
          kind: "agent",
          system: "Trợ lý vận hành nội bộ. Dùng tool LAAM để đọc số liệu ground-truth.",
          prompt:
            "Định hướng: {{steps.brief.output}}\n" +
            "Gọi tool `laam_metrics_digest`. Trả về NGUYÊN VĂN trường `summary` của kết quả — " +
            "KHÔNG sửa bất kỳ con số nào, không thêm câu nào khác.",
        },
        {
          id: "research_web",
          kind: "agent",
          system: "Bạn tra cứu web ngắn gọn.",
          prompt:
            "Định hướng: {{steps.brief.output}}\n" +
            "Dùng `web_search` tìm 3-5 kết quả liên quan. Liệt kê tiêu đề + URL + trích đoạn ngắn. " +
            "CHỈ dùng URL trả về từ tool, TUYỆT ĐỐI không bịa link.",
        },
        {
          id: "fetch_tasks",
          kind: "connector",
          connectorId: "demo",
          action: "demo_list_tasks",
          args: {},
        },
        // ── FAN-IN: synthesis đọc CẢ 3 nhánh ──
        {
          id: "synthesis",
          kind: "agent",
          system: "Bạn tổng hợp báo cáo tiếng Việt mạch lạc, trung thực với dữ liệu nguồn.",
          prompt:
            "Soạn một báo cáo tiếng Việt từ 3 nguồn dưới đây.\n\n" +
            "[NGUỒN 1 — Số liệu LAAM — CHÉP NGUYÊN VĂN, KHÔNG sửa/không tính lại bất kỳ con số nào]:\n" +
            "{{steps.research_laam.output}}\n\n" +
            "[NGUỒN 2 — Web — chỉ dùng URL có thật ở đây]:\n" +
            "{{steps.research_web.output}}\n\n" +
            "[NGUỒN 3 — Công việc đang mở]:\n" +
            "{{steps.fetch_tasks.output}}\n\n" +
            "Cấu trúc: (a) tóm tắt điều hành, (b) sức khoẻ hệ thống (giữ nguyên block số liệu), " +
            "(c) điểm tin web, (d) việc cần làm.",
        },
        // ── SINK: gửi mail (recipient TĨNH, gated; KHÔNG nội suy từ output model) ──
        {
          id: "send",
          kind: "connector",
          connectorId: "gmail",
          action: "gmail_send",
          args: {
            // PHẢI có trong WORKFLOW_RECIPIENT_ALLOWLIST (full-address HOẶC domain). Đổi thành
            // địa chỉ thật của bạn trước khi gửi live. TUYỆT ĐỐI không lấy `to` từ {{steps.*}}.
            to: "reports@exnodes.vn",
            subject: "Báo cáo đa nguồn LAAM",
            // Rule 13: nối khối số liệu ground-truth NGUYÊN VĂN vào cuối body — đi một hop,
            // độc lập với synthesis (phòng 8B đổi/bịa số).
            body:
              "{{steps.synthesis.output}}\n\n---\n📊 Số liệu ground-truth (nguyên văn):\n{{steps.research_laam.output}}",
          },
        },
      ],
      edges: [
        { from: "brief", to: "research_laam" },
        { from: "brief", to: "research_web" },
        { from: "brief", to: "fetch_tasks" }, // fan-out — cần parallel:true
        { from: "research_laam", to: "synthesis" },
        { from: "research_web", to: "synthesis" },
        { from: "fetch_tasks", to: "synthesis" }, // fan-in — cần parallel:true
        { from: "synthesis", to: "send" },
      ],
      positions: {
        brief: { x: 0, y: 160 },
        research_laam: { x: 260, y: 0 },
        research_web: { x: 260, y: 160 },
        fetch_tasks: { x: 260, y: 320 },
        synthesis: { x: 520, y: 160 },
        send: { x: 780, y: 160 },
      },
    },
  },
];

export function getTemplate(id: string): WorkflowTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
