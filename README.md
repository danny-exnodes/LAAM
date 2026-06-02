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
| `/chat` | **Chat** | Trò chuyện trực tiếp với **Qwen 7B local** (streaming, qua proxy → mọi chat được track như nguồn local, miễn phí). |

## Tính năng

- **Đọc dữ liệu thật** từ `~/.claude/projects/` — chạy là thấy ngay session đang diễn ra.
- **Hai nguồn dữ liệu**: transcript Claude Code **và** model local (Qwen qua Ollama) — mỗi session gắn nhãn nguồn (badge `⬡ LOCAL`), lọc theo nguồn ở trang Agents. Model local **miễn phí → chi phí $0**, chỉ track token + thời gian + trạng thái. Xem [Model local](#model-local-qwen-qua-ollama).
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
| `npm start -- --local /đường/dẫn` | Thư mục log model local (mặc định `~/.laam/local-logs`) |
| `LAAM_PROJECTS_DIR=... npm start` | Tương đương `--dir` qua biến môi trường |
| `LAAM_PORT=... npm start` | Tương đương `--port` |
| `LAAM_STUCK_MIN=... npm start` | Tương đương `--stuck` |
| `LAAM_LOCAL_LOGS=... npm start` | Tương đương `--local` |

> 💲 **Bảng giá** dùng để ước tính chi phí USD nằm trong `lib/pricing.js`. Đây là số liệu thủ công, **có thể lỗi thời** — hãy đối chiếu bảng giá Anthropic chính thức và cập nhật tay khi cần. Model **local = $0**.

## Model local (Qwen qua Ollama)

LAAM theo dõi model local như **nguồn dữ liệu thứ hai** thông qua một **logging proxy** đứng trước [Ollama](https://ollama.com):

```
client ──► proxy (:11435) ──► Ollama (:11434)
                  │
                  ▼  ghi JSONL
        ~/.laam/local-logs/<session>.jsonl ──► LAAM đọc & hiển thị
```

**Chạy thử (native, không cần Docker):**

```bash
# 1) Cài & chạy Ollama (https://ollama.com), rồi pull model
ollama pull qwen2.5-coder:7b           # ~4.7 GB

# 2) Bật logging proxy (zero-dependency, chỉ Node built-in)
node proxy/server.js                    # :11435 -> :11434, log vào ~/.laam/local-logs

# 3) Trỏ client vào proxy thay vì Ollama
#    OpenAI base_url: http://localhost:11435/v1
#    Ollama host:     http://localhost:11435
curl http://localhost:11435/api/chat -d '{"model":"qwen2.5-coder:7b","messages":[{"role":"user","content":"hi"}]}'
```

Mỗi request hoàn tất được proxy ghi 1 dòng JSON (`model, endpoint, tokensIn/out, thời lượng, status, request, responseText`). Đặt header `x-laam-session: <tên>` để gom các request vào cùng một "session" trong LAAM. Chi tiết: [`proxy/README.md`](proxy/README.md).

## Docker (đóng gói lâu dài)

`docker-compose.yml` đóng gói **Ollama + proxy + LAAM** (tùy chọn thêm **ngrok** cho public URL bền), `restart: unless-stopped`, volume giữ model + log, mount `~/.claude/projects` (read-only).

**Linux / CPU (full stack trong Docker):**
```bash
docker compose build
docker compose up -d
docker compose exec ollama ollama pull qwen2.5-coder:7b   # tải model vào volume
docker compose --profile public up -d                     # (tùy chọn) bật ngrok — cần NGROK_AUTHTOKEN
```

**macOS / Apple Silicon (giữ GPU — khuyến nghị):** Docker Desktop không truyền GPU, nên Ollama chạy **native trên host** (GPU), còn **proxy + LAAM chạy trong Docker** trỏ về host:
```bash
ollama serve &                       # native, có GPU + model
docker compose -f docker-compose.yml -f docker-compose.macos.yml up -d --no-deps proxy laam
```
Override `docker-compose.macos.yml` đặt `OLLAMA_URL=http://host.docker.internal:11434` và bind-mount `~/.laam/local-logs` + `~/.claude/projects`. ngrok native vẫn trỏ `:4317` (giờ là container LAAM) nên public URL không đổi.

**Chọn model (7b ↔ 14b):**
```bash
ollama pull qwen2.5-coder:7b         # ~4.7 GB (mặc định, an toàn cho 16 GB)
ollama pull qwen2.5-coder:14b        # ~9 GB  (xem kết quả load test bên dưới)
# Đặt model mặc định cho proxy (inject khi request thiếu field "model"):
LAAM_DEFAULT_MODEL=qwen2.5-coder:14b docker compose ... up -d proxy
# Hoặc gọi trực tiếp, chọn model per-request:
scripts/qwen-chat.sh qwen2.5-coder:14b "Viết quicksort bằng Python"
```

### Load test 7b vs 14b trên Apple M3 / 16 GB (2026-06-02)

Đo qua proxy → Ollama native (Metal GPU), trong khi Docker Desktop + LAAM + proxy cùng chạy:

| Model | Tốc độ sinh | Trong bộ nhớ | RAM trống khi inference | Swap | Kết luận |
|-------|-------------|--------------|--------------------------|------|----------|
| **7b** | **~11 tok/s** | 4.9 GB · **100% GPU** | ~1.7 GB | ổn định | Thoải mái — **mặc định** |
| **14b** | **~5–8 tok/s** | 9.7 GB · **100% GPU** | ~0.1 GB | +3 GB (file 6→7 GB) | Chạy được nhưng **căng** |

**Kết luận:** Máy 16 GB **chịu được 14b** — model nạp **100% lên GPU** (vừa unified memory), cold-start ~10s. Nhưng 14b chạy **~½ tốc độ 7b** và đẩy hệ thống vào **swap nặng** (gần như hết RAM trống), nên cả máy ì khi có app khác. → Dùng **7b làm mặc định** (nhanh, còn dư RAM); chỉ dùng **14b cho tác vụ nặng thỉnh thoảng**, nên đóng bớt app khác (kể cả cân nhắc tắt Docker Desktop) để bớt áp lực bộ nhớ. Cả hai đều **miễn phí ($0)** trong LAAM.

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
