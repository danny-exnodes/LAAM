# Decision: V2 chưa đạt parity với V1 — port đầy đủ theo lộ trình

Ngày: 2026-06-03. Bối cảnh: user thấy v2 (Next.js, :3000) "thiếu lệch nhiều" so với v1 (vanilla, :4317). Đã audit code 4 trang.

## Phát hiện (parity ước tính)
- **Dashboard ~35%** — chỉ thiếu UI (data đã có trong `agentSessions`). Thiếu: doughnut status/model/branch, activity timeline dual-axis, model-comparison table, cost by model/project, top sessions, tool errors, export CSV/PDF, i18n, SSE.
- **Agents ~40%** — thiếu UI + **real-time SSE** (v2 đang sync thủ công). Thiếu: filter bar (search/project/model/status/branch/time), stuck badge + notification, live ticker, sub-agent detail (chỉ count), tool waterfall, CSV export.
- **Chat ~8%** — gap lớn nhất, thiếu cả backend lẫn UI. v1 ~5000 dòng/10 module → v2 ~386 dòng. Thiếu: rich render (table/Chart.js/Leaflet/syntax), settings (model/temp/top-p/system), đính kèm file/URL/ảnh+OCR, location, message actions, slash menu, export MD/JSON. v1 có 8 chat-API endpoint → v2 có 2.
- **Connectors 0%** — KHÔNG tồn tại ở v2 (không page/schema/framework/tool-loop). v1: framework + 7 connector (demo/github/trello/jira/gdrive/gcal/gmail) + tool-calling loop trong /api/chat.

## Nguyên nhân
v2 mới đi qua P1–P4 ở mức "khung chạy được". Phần lớn giá trị v1 nằm ở lớp UI/feature dày (~12k dòng `public/`) chưa được port. Memory cũ ghi "P2/P4 ✅" đúng theo nghĩa *milestone khung*, KHÔNG phải parity tính năng.

## Quyết định
User chọn **port đầy đủ theo thứ tự ưu tiên**. Lộ trình chi tiết: `docs/v2-parity-roadmap.md`.
Thứ tự: **Wave 0 hạ tầng** (i18n vi/en/zh, SSE, /api/stats, rich-render+chart primitives, export util) → **W1 Agents** → **W2 Dashboard** → **W3 Chat** → **W4 Connectors**.
Nguyên tắc: parity = ngang tính năng người dùng, KHÔNG copy 1:1; giữ ưu thế v2 (auth/RBAC, multi-machine, Postgres per-user). Connector creds: mã hoá at-rest trong Postgres per-user (không bê file ~/.laam mode 600 của v1).

## Liên quan
[[v2-architecture]] · service [[v2-app]]. Nguồn v1 trỏ trong roadmap (public/*.js, lib/stats.js, lib/connectors/*, bin/laam.js).
