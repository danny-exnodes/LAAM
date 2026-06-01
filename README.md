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
| `/` | **Dashboard** | Thống kê tổng hợp + biểu đồ: trạng thái / model / branch, tokens & tool theo project, timeline, top session, **chi phí USD & đốt token**, **heatmap giờ × thứ**, **bảng xếp hạng tool**, **so sánh model**. (Chart.js) |
| `/agents` | **Agents** | Theo dõi agent thời gian thực, gom theo project; tìm kiếm + bộ lọc project / model / trạng thái / branch / thời gian; **badge cảnh báo agent kẹt**; chi phí mỗi session; xuất CSV. |
| `/graph` | **Graph** | Sơ đồ kết nối orchestrator → sub-agents; click node để xem chi tiết. (vis-network) |
| `/search` | **Search** | Tìm kiếm **toàn văn** trong nội dung transcript (message, tool input, kết quả tool). |
| `/session?id=…` | **Session detail** | Chi tiết một phiên + **waterfall** dòng thời gian các tool call. |

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
- **Cảnh báo agent kẹt**: session chưa hoàn tất nhưng quá lâu không ghi transcript → badge đỏ + banner Dashboard + **thông báo trình duyệt** (Notification API). Ngưỡng cấu hình được (`--stuck <phút>`, mặc định 10).
- **Chi phí USD ước tính** theo model (bảng giá trong `lib/pricing.js` — ⚠ *giá có thể lỗi thời, sửa tay*), hiện ở Dashboard và từng session.
- **Heatmap** hoạt động theo giờ-trong-ngày × thứ-trong-tuần.
- **Bảng xếp hạng tool**: dùng nhiều nhất, hay lỗi nhất, thời lượng trung bình.
- **So sánh model**: tốc độ (tokens/phút), token, chi phí, tỉ lệ hoàn tất.
- **Full-text search** toàn bộ nội dung transcript.
- **Waterfall** tool-call cho từng session.
- **Export** báo cáo: CSV (session/khoảng thời gian) và PDF (báo cáo tổng hợp, jsPDF).
- **Chạy offline hoàn toàn**: Chart.js, vis-network, jsPDF được đóng gói sẵn trong `public/vendor/` (không gọi CDN).
- **Theme sáng/tối**, lưu lựa chọn.

## Tuỳ chỉnh

| Cách | Mô tả |
|------|-------|
| `npm start -- --port 8080` | Đổi cổng (mặc định 4317) |
| `npm start -- --dir /đường/dẫn` | Đổi thư mục projects cần theo dõi |
| `npm start -- --stuck 15` | Ngưỡng cảnh báo agent kẹt, phút (mặc định 10) |
| `LAAM_PROJECTS_DIR=... npm start` | Tương đương `--dir` qua biến môi trường |
| `LAAM_PORT=... npm start` | Tương đương `--port` |
| `LAAM_STUCK_MIN=... npm start` | Tương đương `--stuck` |

> 💲 **Bảng giá** dùng để ước tính chi phí USD nằm trong `lib/pricing.js`. Đây là số liệu thủ công, **có thể lỗi thời** — hãy đối chiếu bảng giá Anthropic chính thức và cập nhật tay khi cần.

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
  public/         ──►  5 trang vanilla JS (Dashboard / Agents / Graph / Search / Session), không build step
```

**Phát hiện sub-agent:** mỗi lời gọi tool `Task` trong transcript là một sub-agent. LAAM ghép nó với `tool_result` tương ứng — nếu chưa có kết quả nghĩa là sub-agent vẫn đang chạy.

## API

| Endpoint | Mô tả |
|----------|-------|
| `GET /api/sessions` | Toàn bộ session, gom theo project (kèm chi phí, tools, histogram) |
| `GET /api/session/:id` | Chi tiết 1 session + timeline + tool-call waterfall |
| `GET /api/stats` | Số liệu tổng hợp (cost, tool leaderboard, heatmap, so sánh model) |
| `GET /api/search?q=` | Tìm kiếm toàn văn trong transcript |
| `GET /api/config` | Cấu hình runtime (ngưỡng kẹt, ngày cập nhật bảng giá) |
| `GET /api/events` | SSE stream (snapshot mỗi khi có thay đổi) |
| `GET /api/health` | Kiểm tra thư mục theo dõi |

## Cấu trúc

```
bin/laam.js       server + watcher + SSE + page/API routes
lib/parser.js     đọc & phân tích JSONL (per-tool stats, histogram, tool-call timing)
lib/stats.js      tổng hợp (cost, tool leaderboard, heatmap, so sánh model)
lib/pricing.js    bảng giá USD theo model (sửa tay — có thể lỗi thời)
lib/search.js     tìm kiếm toàn văn transcript
public/           index.html (Dashboard) · agents.html · graph.html · search.html · session.html
                  common.js · dashboard.js · agents.js · graph.js · search.js · session.js
                  dash-cost.js · dash-heatmap.js · dash-tools.js · dash-models.js (module Dashboard)
                  export.js (CSV/PDF) · styles.css · vendor/ (Chart.js, vis-network, jsPDF — offline)
test/run.mjs      kiểm thử parser + stats + search  (npm test)
```

## Giới hạn (MVP)

- Trạng thái dựa trên thời gian sửa file, nên không phân biệt được tuyệt đối "agent đang nghĩ" với "đang chờ người dùng".
- Chỉ đọc (one-directional) — LAAM không can thiệp vào agent.
- Chạy trên một máy local; chưa hỗ trợ tổng hợp nhiều máy.
