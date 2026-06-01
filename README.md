# LAAM — Local AI Agent Monitoring

Công cụ web nội bộ giúp team developer theo dõi hoạt động của các **Claude AI agent** đang chạy trên máy local — theo thời gian thực, không cần chỉnh sửa agent.

LAAM đọc trực tiếp các file transcript JSONL mà Claude Code / Agent SDK ghi ra ở `~/.claude/projects/`, gom nhóm theo **project**, và hiển thị từng agent: thuộc orchestrator nào, trạng thái, thời gian đã chạy, và nội dung công việc đang làm.

## Cài đặt & chạy

```bash
npm install
npm start
```

Mở http://localhost:4317

> Yêu cầu Node.js ≥ 18. Không cần build, không cần database.

## Các trang

| Route | Trang | Mô tả |
|-------|-------|-------|
| `/` | **Dashboard** | Thống kê tổng hợp: tokens, messages, tool calls, thời lượng; biểu đồ trạng thái / model / branch, tokens & tool theo project, timeline hoạt động, top session. (Chart.js) |
| `/agents` | **Agents** | Theo dõi agent thời gian thực, gom theo project, kèm ô tìm kiếm và bộ lọc project / model / trạng thái / branch / khoảng thời gian. |
| `/graph` | **Graph** | Sơ đồ kết nối orchestrator → sub-agents; click node để xem chi tiết. (vis-network) |

## Tính năng

- **Đọc dữ liệu thật** từ `~/.claude/projects/` — chạy là thấy ngay session đang diễn ra.
- **Live update** qua SSE + file watcher: agent vừa thao tác gì, các trang cập nhật tức thì.
- **Dashboard thống kê** với biểu đồ (line / bar / doughnut) qua Chart.js — không cần build step.
- **Bộ lọc & tìm kiếm** ở trang Agents: theo project, model, trạng thái, branch, khoảng thời gian.
- **Sơ đồ quan hệ** ở trang Graph: project → orchestrator → sub-agents, click xem chi tiết.
- **Gom nhóm theo project** (dựa trên `cwd`), mỗi project có thể thu gọn.
- **Orchestrator → sub-agents**: mỗi lần agent gọi `Task` được hiển thị như một sub-agent, kèm loại agent, mô tả, trạng thái (đang chạy / hoàn tất) và thời lượng.
- **Trạng thái** mỗi session: `Đang chạy` (file vừa đổi < 60s), `Tạm dừng` (< 15 phút), `Hoàn tất`.
- **Thời gian chạy** đếm live cho session đang hoạt động.
- **Drawer chi tiết**: click vào card để xem timeline gần nhất (text, tool call, kết quả, sub-agent).
- **Theme sáng/tối**, lưu lựa chọn.

## Tuỳ chỉnh

| Cách | Mô tả |
|------|-------|
| `npm start -- --port 8080` | Đổi cổng (mặc định 4317) |
| `npm start -- --dir /đường/dẫn` | Đổi thư mục projects cần theo dõi |
| `LAAM_PROJECTS_DIR=... npm start` | Tương đương `--dir` qua biến môi trường |
| `LAAM_PORT=... npm start` | Tương đương `--port` |

## Cách hoạt động

```
~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl
        │
        ▼
  lib/parser.js   ──►  gom nhóm project, dò Task/sub-agent, tính trạng thái & thời lượng
        │
        ▼
  bin/laam.js     ──►  Express API + SSE,  chokidar watch file thay đổi
        │
        ▼
  lib/stats.js    ──►  tổng hợp số liệu cho /api/stats và trang Dashboard
        │
        ▼
  public/         ──►  3 trang vanilla JS (Dashboard / Agents / Graph), không build step
```

**Phát hiện sub-agent:** mỗi lời gọi tool `Task` trong transcript là một sub-agent. LAAM ghép nó với `tool_result` tương ứng — nếu chưa có kết quả nghĩa là sub-agent vẫn đang chạy.

## API

| Endpoint | Mô tả |
|----------|-------|
| `GET /api/sessions` | Toàn bộ session, gom theo project |
| `GET /api/session/:id` | Chi tiết 1 session + timeline |
| `GET /api/stats` | Số liệu tổng hợp cho Dashboard |
| `GET /api/events` | SSE stream (snapshot mỗi khi có thay đổi) |
| `GET /api/health` | Kiểm tra thư mục theo dõi |

## Cấu trúc

```
bin/laam.js       server + watcher + SSE + page routes
lib/parser.js     đọc & phân tích JSONL
lib/stats.js      tổng hợp số liệu thống kê
public/           index.html (Dashboard) · agents.html · graph.html
                  common.js · dashboard.js · agents.js · graph.js · styles.css
test/run.mjs      kiểm thử parser + stats  (npm test)
```

## Giới hạn (MVP)

- Trạng thái dựa trên thời gian sửa file, nên không phân biệt được tuyệt đối "agent đang nghĩ" với "đang chờ người dùng".
- Chỉ đọc (one-directional) — LAAM không can thiệp vào agent.
- Chạy trên một máy local; chưa hỗ trợ tổng hợp nhiều máy.
