// Demo connector — canned data, no credentials. Always "connected" so the chat
// tool-calling loop can be exercised offline (proves the framework end-to-end).
import type { Connector } from "./types";

const TASKS = [
  { id: "T-101", title: "Chuẩn bị slide họp khách hàng", status: "doing", due: "2026-06-04", assignee: "me" },
  { id: "T-102", title: "Review hợp đồng nhà cung cấp", status: "todo", due: "2026-06-05", assignee: "me" },
  { id: "T-103", title: "Gửi báo cáo doanh thu Q2", status: "todo", due: "2026-06-06", assignee: "an" },
  { id: "T-104", title: "Đặt vé công tác Đà Nẵng", status: "done", due: "2026-06-01", assignee: "me" },
];

const demo: Connector = {
  id: "demo",
  name: "Demo (dữ liệu mẫu)",
  icon: "database",
  blurb: "Connector mẫu để thử tool-calling — không cần credential",
  auth: { type: "none", help: "Connector demo dùng dữ liệu mẫu cố định để minh hoạ luồng tool-calling." },
  tools: [
    {
      type: "function",
      function: {
        name: "demo_list_tasks",
        description: "Liệt kê công việc/đầu việc mẫu của người dùng. Lọc theo trạng thái nếu cần.",
        parameters: { type: "object", properties: { status: { type: "string", description: "todo | doing | done (tuỳ chọn)" } } },
      },
    },
    {
      // WRITE tool — gated by the safety layer (CONNECTOR_WRITES). Lets the
      // confirm-card → execute write-gate be demonstrated end-to-end OFFLINE,
      // with no real credentials (FEAT-5). Creates a sample task (not persisted).
      type: "function",
      function: {
        name: "demo_create_task",
        description: "Tạo một công việc/đầu việc mẫu mới. Dùng để minh hoạ luồng xác nhận trước khi ghi.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Tên công việc" },
            status: { type: "string", description: "todo | doing | done (mặc định todo)" },
          },
          required: ["title"],
        },
      },
    },
  ],
  handlers: {
    async demo_list_tasks(args) {
      const st = args && typeof args.status === "string" ? args.status : null;
      const tasks = st ? TASKS.filter((t) => t.status === st) : TASKS;
      return { tasks };
    },
    async demo_create_task(args) {
      const title = typeof args.title === "string" ? args.title.trim() : "";
      if (!title) return { error: "cần tên công việc" };
      const status = typeof args.status === "string" ? args.status : "todo";
      const created = { id: `T-${100 + TASKS.length + 1}`, title, status, due: "", assignee: "me" };
      return { created };
    },
  },
};

export default demo;
