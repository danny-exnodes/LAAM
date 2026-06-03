# Changelog

Mọi thay đổi đáng chú ý của **LAAM** được ghi ở đây.

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.0.0/),
phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

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
