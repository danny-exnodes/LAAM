// Demo connector — canned data, no credentials. Always "connected" so the chat
// tool-calling loop can be exercised offline (proves the framework end-to-end).
const TASKS = [
  { id: 'T-101', title: 'Chuẩn bị slide họp khách hàng', status: 'doing', due: '2026-06-04', assignee: 'me' },
  { id: 'T-102', title: 'Review hợp đồng nhà cung cấp', status: 'todo', due: '2026-06-05', assignee: 'me' },
  { id: 'T-103', title: 'Gửi báo cáo doanh thu Q2', status: 'todo', due: '2026-06-06', assignee: 'an' },
  { id: 'T-104', title: 'Đặt vé công tác Đà Nẵng', status: 'done', due: '2026-06-01', assignee: 'me' },
];

export default {
  id: 'demo',
  name: 'Demo (dữ liệu mẫu)',
  icon: 'database',
  blurb: 'Connector mẫu để thử tool-calling — không cần credential',
  auth: { type: 'none', help: 'Connector demo dùng dữ liệu mẫu cố định để minh hoạ luồng tool-calling.' },
  tools: [
    { type: 'function', function: { name: 'demo_list_tasks', description: 'Liệt kê công việc/đầu việc mẫu của người dùng. Lọc theo trạng thái nếu cần.', parameters: { type: 'object', properties: { status: { type: 'string', description: 'todo | doing | done (tuỳ chọn)' } } } } },
  ],
  handlers: {
    async demo_list_tasks(args) {
      const st = args && args.status;
      const tasks = st ? TASKS.filter((t) => t.status === st) : TASKS;
      return { tasks };
    },
  },
};
