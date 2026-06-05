# Changelog

Mọi thay đổi đáng chú ý của **LAAM** được ghi ở đây.

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.0.0/),
phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

---

## [Unreleased]

### Đã thêm — Chat: nâng cấp sau E2E (2026-06-05, đợt 2)
- **Dọn dữ liệu cũ (S1)**: `POST /api/conversations {action:"backfill-titles"}` re-derive tiêu đề conv bị lẫn byte file (nút "Dọn tiêu đề" hiện khi có); badge **"trùng"** cảnh báo conv trùng tên (không tự xoá). Helper thuần `src/lib/chat/title.ts` (`retitleFromMessage`).
- **Proactive card (S2)**: dismiss **bền qua localStorage** (TTL 24h) + mỗi cảnh báo **click mở `/agents/[id]`** (thêm `key`+`sessionId` vào frame `proactive`).
- **Tool status realtime (S3)**: refactor `/api/chat` thành **một stream** phát frame tool **LIVE** ngay khi loop dispatch → UI hiện chip "đang gọi `<tool>`…" tức thì (trace hiện cả lúc đang chờ); suspend (`pending_write`) + persist dời vào trong stream; `streamOllama` giữ cho confirm round-trip. Bỏ `suspendForConfirm` (gộp inline).
- **Biểu đồ dễ đọc (S4)**: nhãn giá trị trên cột/đường (single-series), cao hơn (300px), cột bo góc.
- **Parse khoan dung (S5)**: `looseJsonParse` (bỏ dấu phẩy thừa / smart-quote / fence) cho ```chart/```map; lỗi → hiện raw; map có nút **"Thử lại"**.
- **Nearby (S6)**: prompt hướng dẫn `near` vs vị-trí-trình-duyệt; nút "Thử lại" khi từ chối định vị.
- **Token total ở header (S7)**: tổng token (miễn phí local) cho conv hiện hành.
- **Lang a11y (S8)**: aria-label bộ chọn ngôn ngữ i18n (native `<select>` vốn đã accessible bàn phím).
- **Smart rename (S9)**: hành động ✨ mỗi conv → `POST {action:"retitle",id}` đặt lại tên theo tin nhắn đầu.
- Verify: **toàn bộ test xanh**, `tsc` sạch, không đổi schema (pin/dismiss = localStorage).

### Đã sửa — Chat QA E2E (2026-06-05): lỗi giao diện & chức năng
- **U1** Composer lệch 144px + tràn dưới sidebar → thêm `relative` cho `<section>` (composer `absolute` neo đúng cột chat).
- **F1** Slash command `/moi /xoa /xuat /caidat` "chết" → nối handler từ ChatClient (trước chỉ `/dung` chạy). `/xuat` mở menu export (ChatExport thành controlled).
- **F3** OCR chết im lặng → thêm `GET /api/ocr` báo `{available}`; composer **chủ động báo trước** + bỏ qua call OCR khi thiếu tesseract (thay vì fail sau upload). *(Image Docker đã bake tesseract; host trần chạy `next start` thì chưa có — chạy bản Docker hoặc cài native.)*
- **F4** Tiêu đề hội thoại lẫn byte file đính kèm (`%PDF…`) → thêm `titleHint` (text user thật); fallback lấy **tên file**, không bao giờ là byte (Rule 13).
- **U2** Bỏ hardcode "Gemma" (empty-state/placeholder/export, cả vi/en/zh) → **tên model động** từ `/api/chat/info`, fallback trung tính.
- **U3** Nút header (giao diện/đồng bộ/tài khoản) nay **i18n** đủ vi/en/zh.
- **U-minor** Hết nháy "Chưa có cuộc trò chuyện" lúc mount → skeleton tới khi load xong.

### Đã thêm — Chat: rich-render, UX & nâng cấp
- **F2** Khôi phục render **biểu đồ/bản đồ**: dạy model hợp đồng khối ```` ```chart ````/```` ```map ```` trong system prompt; **giải mã địa lý phía client** (`/api/geocode|route|nearby`) từ tên địa điểm → marker + tuyến thật (model chỉ nêu **tên**, không bịa toạ độ — Rule 13). Module thuần `src/lib/chat/geo-resolve.ts`.
- **UX**: prompt mẫu **tự gửi** 1 chạm (UX-1); nhập URL **inline** thay `window.prompt` (UX-2); nút cuộn-đáy hiện khi rời đáy (UX-4); empty-state gợi ý **hội thoại gần đây** (UX-6); message actions hiện khi **focus bàn phím** (UX-7, a11y).
- **FEAT-1** Quản lý hội thoại: **nhóm theo thời gian** (Hôm nay/Hôm qua/7 ngày/Cũ hơn), **chọn nhiều — xoá hàng loạt**, **ghim lên đầu** (localStorage), **tìm theo nội dung tin nhắn** (`/api/conversations?q=`).
- **FEAT-2** Cảnh báo chủ động tách thành **card hệ thống riêng** (frame `proactive`, có nút bỏ qua) thay vì nhét vào câu trả lời của model; ngưỡng cấu hình qua env `PROACTIVE_STUCK_MIN`/`PROACTIVE_COST_USD`.
- **FEAT-3** Export **PDF** + **copy cả hội thoại** + **tổng token** (model local → miễn phí) trong menu xuất.
- **FEAT-4** Composer báo OCR off + chip đính kèm xem trước trích đoạn (hover).
- **FEAT-5** **Demo write-gate không cần credential**: tool `demo_create_task` (connector Demo) chạy đủ luồng gate → Confirm Card → execute offline. Doc: `docs/demo-connector-write-gate.md`.
- Verify: **540 test** xanh (từ 499), `tsc` sạch. Không đổi schema (pin = localStorage; không migration).

### Đã thêm — Agent Harness SP-3 (Memory & Proactive)
- **Lưu tool turns**: bảng mới `chat_tool_call` ghi lại từng lượt gọi công cụ (tên/args/kết quả/ok) trong một lượt chat — trước đây bị bỏ, chỉ lưu câu trả lời cuối. `chat_message` giữ nguyên (consumer hiện có không đổi).
- **Tóm tắt hội thoại dài**: khi lịch sử vượt ngân sách ký tự, các lượt cũ được **model tóm tắt** (cuộn) và giữ nguyên văn các lượt gần nhất — chat không vỡ context trên model local 16GB.
- **Cảnh báo chủ động**: trợ lý tự nêu trong chat khi có agent **đang kẹt** hoặc **chi phí cao** (ngưỡng tuyệt đối/burn-rate + dedupe theo hội thoại + cooldown 6h, không lặp mỗi lượt).
- Hạ tầng: migration **`0003`** (additive — `chat_tool_call` + cột `summary`/`summarizedThroughId`/`proactiveState` trên `chat_conversation`); module thuần `src/lib/agent/{persist,summarize,proactive}.ts` + loader chung `tools/laam/_load.ts`. **435 test** xanh, `tsc` sạch, `next build` xanh.
- ⚠️ **Cần chạy trên host:** `npm run db:migrate` (áp `0003`) trước khi chạy bản này.

### Changed
- **Tái cấu trúc repo:** v2 (Next.js) được đưa lên **root**; v1 (vanilla/Express) archive ở branch `archive/v1`. Root giờ là app v2.
- Gộp `.gitignore`; viết lại `CLAUDE.md`/`README` cho v2.

### Backlog (chưa migrate từ v1)
- Search, Office, proxy log Ollama, `/api/config` — xem `.serena/memories/backlog/v1-unported.md`.

---

## [2.0.0] — 2026-06-03 — Bản viết lại v2 (Next.js + Postgres, đa người dùng)

> **LAAM v2** (`v2/`) là bản viết lại local-first, đa máy, đa người dùng:
> **Next.js 16 + React 19 + Auth.js v5 + Drizzle + Postgres**. Đạt **parity tính
> năng** với app vanilla v1 trên 4 trang trọng tâm (Dashboard, Agents, Chat,
> Connectors) đồng thời thêm auth/RBAC, multi-machine và lưu trữ per-user.
> Thực hiện theo 5 wave (audit → hạ tầng → Agents → Dashboard → Chat → Connectors).
> **375 test** (Vitest + RTL), `next build` xanh.

### Đã thêm — Nền tảng (Wave 0)
- **i18n vi/en/zh** cho App Router (provider + `useT` + cookie `laam_lang`).
- **SSE real-time** `/api/events` + hook `useLiveSessions` (thay đồng bộ thủ công).
- **`/api/stats`** — port `lib/stats.js` thành `computeStats` có kiểu.
- **Rich render**: `MarkdownView` (react-markdown + remark-gfm + rehype-sanitize),
  ```chart``` (recharts), ```map``` (react-leaflet, SSR-safe), code highlight.
- **Export util**: CSV / Markdown / JSON / PDF (jsPDF).

### Đã thêm — Agents (Wave 1)
- Danh sách **live qua SSE** (bỏ "Đồng bộ" thủ công), gom theo project.
- Thanh lọc: tìm kiếm + project/model/status/branch/thời gian + xoá lọc.
- **Badge "nghi kẹt"** + thông báo trình duyệt, đồng hồ chạy theo giây/card.
- Chi tiết sub-agent; **waterfall tool-call** ở `/agents/[id]`; export CSV.

### Đã thêm — Dashboard (Wave 2)
- KPIs đầy đủ; doughnut status/model/branch; **timeline hoạt động 2 trục**.
- Bảng so sánh model; cost theo model; tokens theo project; top sessions.
- Tool leaderboard / errors / slowest; heatmap (hover + chú giải); export CSV/PDF.

### Đã thêm — Chat (Wave 3)
- 8 endpoint: `ollama/models`, `chat/info`, `fetch-url` (chặn SSRF), **`ocr`**
  (tesseract), `geocode/reverse/route/nearby`.
- `/api/chat` nhận **model / temperature / top-p / system prompt**.
- UI: rich render, settings panel, **đính kèm file/URL/ảnh + OCR** (drag-drop),
  message actions (copy/sửa/tạo lại/xoá) + timestamp, composer (slash menu/đếm
  token/phím tắt), sidebar (tìm/đổi tên/xoá), export MD/JSON.

### Đã thêm — Connectors (Wave 4)
- Framework `lib/connectors/`: **mã hoá AES-256-GCM**, lưu **per-user trong
  Postgres** (khác v1 dùng file cục bộ), các hàm user-scoped.
- 7 connector: demo · github · trello · jira · google-drive · google-calendar ·
  gmail (giữ nguyên tên tool như v1).
- Trang `/connectors` (kết nối/ngắt/kiểm tra) + nav link.
- **Vòng tool-calling** trong `/api/chat` (giữ nguyên đường đi khi không có connector).

### Bảo mật
- Credential connector **mã hoá at-rest per-user**; secret luôn **mask** khi hiển
  thị, không trả raw về browser. Khoá từ `CONNECTOR_KEY` (fallback `AUTH_SECRET`).

### Lưu ý nâng cấp
- Cần chạy migration trên host: `cd v2 && npm run db:generate && npm run db:migrate`
  (bảng `connector_credentials`). Đặt `CONNECTOR_KEY` cho production.
- Toàn bộ route hiện **dynamic** (root layout đọc cookie ngôn ngữ).

### Chưa làm (residual)
- Nghiệm thu runtime end-to-end (Ollama `gemma4:e4b` + `tesseract`); luồng OAuth
  thật cho Google; icon Lucide; cost theo project/ngày; relTime đa ngôn ngữ.

---

## [0.9.0] — 2026-06-03

> **Cột mốc "pre-connector".** LAAM đã chuyển hướng từ công cụ giám sát thuần tuý
> sang **trợ lý công việc hằng ngày** chạy hoàn toàn cục bộ (local, miễn phí). Toàn
> bộ nền tảng — giám sát, chat trợ lý đa phương thức, hạ tầng — đã hoàn thiện và
> chạy thật. Phần **connector** (Jira/Trello/GitHub/Google…) là cột mốc kế tiếp
> hướng tới `v1.0.0`, nên bản này là `0.9.0`.

### Đã thêm — Trợ lý Chat (`/chat`)
- **Chọn model** ngay trong chat: mặc định **`qwen3-vl:8b`** (general + tool-calling
  ổn định 18/18 + vision), kèm `gemma4:e4b` (mới nhất, nhanh nhất), `qwen3:8b`,
  `gemma3:4b`, các Qwen2.5 — tự khám phá qua `/api/ollama/models`. Chỉnh
  temperature / top-p / num_predict / system prompt theo từng hội thoại.
- **Render giàu** trong câu trả lời: Markdown (marked + DOMPurify chống XSS),
  **biểu đồ** (Chart.js), **bảng** GFM, **bản đồ** (Leaflet/OSM) với **marker SVG
  tự vẽ** (không phụ thuộc ảnh, chạy offline).
- **Bản đồ & chỉ đường thật**: geocode tên địa điểm (Nominatim), **định tuyến theo
  đường bộ thật** (OSRM), link mở Google Maps.
- **Nhận biết vị trí (location-awareness)**: tự xin GPS khi câu hỏi cần ("quanh
  đây / gần tôi / chỉ đường từ đây / toạ độ hiện tại"), reverse-geocode ra địa chỉ
  và **tiêm vào ngữ cảnh model** để trả lời thật; **tìm địa điểm quanh đây** (POI
  thật qua OSM Overpass) → marker + danh sách kèm khoảng cách.
- **OCR**: đọc **ảnh** (png/jpg/webp…) và **PDF scan** (không có lớp text) qua
  `tesseract` (vie + eng + chi_sim) để model text đọc được nội dung.
- **Đính kèm**: tải lên file (txt/md/csv/json/pdf/ảnh) và **đọc nội dung URL**
  (fetch phía server, có chặn SSRF).
- **Xuất hội thoại** ra Markdown / JSON; copy từng khối mã.
- **Lịch sử nhiều hội thoại** (đổi tên, tìm, xoá) lưu cục bộ.
- Kiến trúc **kernel + module** (`chat.js` + các `chat-*.js`) cho dễ mở rộng.

### Đã thêm — Giám sát (Monitoring)
- **Dashboard** (`/`): KPI tổng hợp, biểu đồ trạng thái/model/branch, **heatmap**
  giờ × thứ, bảng xếp hạng tool, so sánh model, **chi phí USD ước tính**, banner
  cảnh báo agent nghi kẹt, xuất **CSV / PDF**.
- **Agents** (`/agents`): theo dõi thời gian thực, gom theo project, **bộ lọc**
  (project/model/trạng thái/branch/thời gian), badge nguồn local, cảnh báo kẹt +
  thông báo trình duyệt.
- **Graph** (`/graph`): sơ đồ orchestrator → sub-agents (vis-network).
- **Session** (`/session`): chi tiết phiên + **waterfall** dòng thời gian tool-call.
- **Office** (`/office`): văn phòng **isometric** v2 — phòng theo project, agent đi
  lại/ghép cặp, kéo-thả xoay góc, HUD bật/tắt.
- Hai nguồn dữ liệu: transcript Claude Code (`~/.claude/projects`) **và** log model
  local (qua proxy) — đều gắn nhãn nguồn; model local chi phí **$0**.
- **Live update** qua SSE + file watcher (chokidar).

### Đã thêm — Hạ tầng & vận hành
- **Docker Compose**: Ollama + proxy ghi log + LAAM; override macOS giữ **GPU**
  (Ollama native) + proxy/laam trong Docker.
- **Proxy ghi log Ollama** (zero-dependency) trên `:11435` → đưa mọi lượt chat local
  vào LAAM như nguồn dữ liệu thứ hai.
- **HTTPS qua Tailscale serve** (`tailscale serve`) — cert Let's Encrypt hợp lệ trong
  tailnet → **secure context** cho GPS trên điện thoại (thay cho ngrok, đã tắt).
- **OCR**: cài `tesseract-ocr` + data vie/eng/chi_sim trong image.

### Đã thêm — Giao diện & quốc tế hoá
- **Đa ngôn ngữ** Tiếng Việt / English / 中文 (engine i18n nhẹ, đổi tức thì, lưu lựa
  chọn; font CJK fallback) — phủ mọi trang.
- **Bộ icon Lucide** vendored offline thay toàn bộ emoji/SVG tự chế, hợp theme
  sáng/tối, đồng nhất.
- **Responsive mobile** xuyên suốt; sửa loạt lỗi mobile của Chat (drawer nuốt click,
  map đè sidebar, route, ngôn ngữ trả lời).

### Kỹ thuật
- **Stack**: Node.js ≥ 18 (ESM) + Express; client **vanilla JS, không build step**;
  phụ thuộc runtime tối thiểu (`express`, `chokidar`). Mọi thư viện front-end vendored
  offline trong `public/vendor/` (Chart.js, vis-network, jsPDF, marked, DOMPurify,
  Leaflet, pdf.js, Lucide). Model local qua **Ollama** (GPU) + proxy.
- **Bảo mật**: DOMPurify cho mọi HTML từ model; `/api/fetch-url` chặn SSRF; geocode
  có User-Agent định danh + throttle; `.env`/secret **không commit** (đã .gitignore).

### Cách chạy nhanh
```bash
# Native (dev)
npm install && npm start            # → http://localhost:4317
# Model local: cài Ollama, `ollama pull qwen3-vl:8b`, chạy proxy/server.js (:11435)

# Docker (macOS, giữ GPU): Ollama native + proxy/laam trong Docker
ollama serve &
docker compose -f docker-compose.yml -f docker-compose.macos.yml up -d --build
# HTTPS qua tailnet: tailscale serve --bg http://127.0.0.1:4317
```

### Chưa có (kế tiếp → v1.0.0)
- **Connector thật**: trang `/connectors`, framework đăng ký connector như bộ *tools*
  cho model gọi qua chat (GitHub / Trello / Jira bằng token; Google Drive / Calendar /
  Gmail qua OAuth). Credential do người dùng cung cấp, lưu server-side, không commit.

---

[0.9.0]: https://github.com/danny-exnodes/LAAM/releases/tag/v0.9.0
