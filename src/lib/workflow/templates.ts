import type { WorkflowGraph } from "./types";

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  moatLeaning: boolean;
  graph: WorkflowGraph;
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
];

export function getTemplate(id: string): WorkflowTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
