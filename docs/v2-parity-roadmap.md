# V2 ↔ V1 Parity Roadmap

> Mục tiêu: đưa v2 (Next.js, :3000) đạt **parity tính năng** với v1 (vanilla, :4317)
> trên 4 trang trọng tâm: Dashboard, Agents, Chat, Connectors.
> Cập nhật: 2026-06-03. Nguồn: audit 4 trang (xem `.serena/memories/decisions/v2-parity-gap.md`).

## Trạng thái parity tại thời điểm audit

| Trang | Parity | Bản chất gap |
|---|---|---|
| Dashboard | ~35% | **Chỉ thiếu UI** — data đã có trong schema |
| Agents | ~40% | Thiếu UI **+ real-time (SSE)** |
| Chat | ~8% | Thiếu **cả backend lẫn UI** (8 endpoint, rich render, settings, ingest) |
| Connectors | 0% | **Không tồn tại** — schema + framework + 7 connector + tool-loop |

Nguyên tắc: v2 giữ ưu thế của mình (auth/RBAC, multi-machine, Postgres per-user) — **không** bê nguyên localStorage của v1. Parity = ngang *tính năng người dùng*, không phải copy 1:1 code.

---

## Wave 0 — Hạ tầng dùng chung ✅ HOÀN THÀNH (2026-06-03)

> Thực hiện bằng Agent Team `laam-v2-wave0` (5 agent song song). Test harness: vitest + RTL + jsdom.
> Kết quả: **123 test pass** (23 file), **next build xanh**. Commit: `6cad5be` (harness) → `db463a8` (E) · `d754293` (C) · `40478b9` (B) · `7eeb17e` (D) · `3e9b20b` (A).
> Plan chi tiết: `docs/superpowers/plans/2026-06-03-v2-wave0-foundation.md`.
> Residual: leaflet SSR-safety mới đảm bảo cấu trúc (dynamic ssr:false) — sẽ exercise thật khi Wave 3 nhúng MarkdownView vào /chat. Bus publisher (SSE) sẽ wire ở Wave 1. Hook stuck-threshold hardcode 10' (chưa có /api/config).

Mục tiêu: dựng các lớp cross-cutting để 4 trang sau không phải làm lại.

- **0.1 i18n vi/en/zh** — port engine nhẹ của v1 sang React (context/provider + `t()` + dict per page). Nguồn: `public/i18n.*.js`. Hiện v2 hardcode tiếng Việt ở mọi trang.
- **0.2 SSE real-time** — endpoint `GET /api/events` (Next route handler streaming) + hook `useLiveSessions()` ở client; thay cơ chế "bấm Đồng bộ thủ công". Nguồn: `bin/laam.js` (`/api/events`), `public/common.js` (`connectSSE`, `isStuck`, `notify`).
- **0.3 Stats aggregation endpoint** — port `lib/stats.js::computeStats` thành `GET /api/stats` (hoặc server action) để Dashboard không tự tính ad-hoc trong page. Nguồn: `lib/stats.js`.
- **0.4 Rich-render + chart primitives** — chọn hướng: (a) tái dùng Chart.js + marked + DOMPurify + Leaflet (đã vendored ở v1, port logic `chat-render.js`), hoặc (b) recharts/react-leaflet (đã có recharts trong v2). **Đề xuất: tái dùng marked+DOMPurify cho markdown; Chart.js cho ```chart```; react-leaflet cho ```map```.** Cần chốt trước Chat.
- **0.5 Export helper (CSV/MD/JSON/PDF)** — port `public/export.js` + `chat-export.js` thành util dùng chung. jsPDF cho PDF.

**Success criteria Wave 0:** chuyển ngôn ngữ live trên 1 trang mẫu; 1 trang nhận update qua SSE không cần reload; `/api/stats` trả payload đầy đủ như v1.

---

## Wave 1 — Agents ✅ HOÀN THÀNH (2026-06-03)

> Agent Team `laam-v2-wave1` (3 agent: list/detail/backend) + TL prep (mở rộng LiveSession) + TL integration (mount I18nProvider ở root layout).
> Kết quả: **160 test pass** (31 file), `next build` xanh. Commits: `fe75aaf` prep · `47377a0` C · `2d3bb7f` B · `bdd91c9` i18n mount · `00c6ad6` A.
> Đã có: live SSE list (bỏ sync thủ công), filter bar (search/project/model/status/branch/time + clear), stuck badge + status=stuck filter, per-card live ticker 1s, sub-agent detail (card + detail page), tool-call waterfall ở /agents/[id], CSV export (cột theo v1, bỏ field LiveSession không mang), i18n vi/en/zh hoạt động thật (provider đã mount).
> Residual: browser Notification cho stuck đã có trong hook (useLiveSessions) nhưng cần user cấp quyền; threshold hardcode 10'. Toàn bộ route giờ dynamic (root layout đọc cookie lang).

Data đã có trong `agentSessions`; chủ yếu là UI + SSE (Wave 0.2).

- Filter bar: search + project/model/status/branch/time + nút xoá lọc. Nguồn: `public/agents.{html,js}`.
- Stuck-agent badge + browser notification (ngưỡng `LAAM_STUCK_MIN`). Nguồn: `common.js::isStuck/notify`.
- Live duration ticker (mỗi giây cho session running).
- Sub-agent: hiện danh sách type/description/duration/status (không chỉ count).
- Tool-call **waterfall/Gantt** ở `/agents/[id]`. Nguồn: `public/session.js`.
- CSV export (respect filter). Drawer modal (tùy chọn — có thể giữ full-page).

**Success criteria:** lọc/tìm hoạt động; agent kẹt hiện badge + notification; trang tự cập nhật qua SSE; export CSV khớp cột v1.

---

## Wave 2 — Dashboard ✅ HOÀN THÀNH (2026-06-03)

> Agent Team `laam-v2-wave2` (3 agent: kpi/charts/tables) + TL integration (DashboardClient + page shell + .chart-card).
> Kết quả: **209 test pass** (45 file), `next build` xanh. Commits: `5a95005` B charts · `496fada` A kpi · `53ca8a7` C tables · `9a1808b` integration.
> Đã có (14 widget, tiêu thụ `/api/stats`): KpiGrid (đủ totals), doughnut status/model/branch, activity timeline dual-axis, cost-by-model, tokens-by-project, model-comparison table, tool leaderboard/errors/slowest, top sessions (duration+tokens), heatmap (hover+legend), export CSV (model-comparison) + PDF (summary). i18n vi/en/zh.
> Residual: (1) **cost-by-project là token-based** (Stats.byProject chưa có field cost); (2) **cost-by-day bị bỏ** (Stats chưa có series cost theo ngày; cost-chart.tsx cũ giờ orphan) — cả hai cần thêm field vào Stats nếu muốn parity tuyệt đối. Heatmap accent hardcode #6d5efc.

## Wave 2 — Dashboard (chỉ thiếu UI, dùng `/api/stats`) — chi tiết gốc

- Doughnut: status / model / branch distribution.
- Activity timeline dual-axis (sessions + tokens theo thời gian).
- Model comparison table (sessions, tokens, cost, avg dur, tokens/min, done%). Nguồn: `dash-models.js`.
- Cost by model + by project (bổ sung cho cost-by-day). Nguồn: `dash-cost.js`.
- Top sessions by duration/tokens; tool errors table; slowest tools. Nguồn: `dashboard.js`, `dash-tools.js`.
- Export CSV + PDF report. Nguồn: `export.js`.
- i18n (Wave 0.1). Heatmap: thêm hover/legend.

**Success criteria:** mọi widget v1 có mặt với cùng dữ liệu; export CSV/PDF chạy; 3 ngôn ngữ.

---

## Wave 3 — Chat (gap lớn nhất; backend + UI)

Backend endpoints cần port sang Next route handlers:
- `/api/ollama/models`, `/api/chat/info`, `/api/fetch-url` (SSRF-guard), `/api/ocr` (Tesseract+pdf.js), `/api/geocode`, `/api/reverse`, `/api/route`, `/api/nearby`.
- Mở rộng `/api/chat`: nhận model/temperature/top_p/system prompt; **vòng lặp tool-calling** (dùng cho Wave 4).

UI (port từ kiến trúc kernel+module của v1):
- Settings panel: model picker, temperature/top-p/num_predict, system prompt (lưu per-conversation).
- Rich render: markdown tables, code + syntax highlight + copy, ```chart``` (Chart.js), ```map``` (Leaflet). Nguồn: `chat-render.js`, `chat-geo.js`.
- Đính kèm: file (txt/md/csv/json/log/pdf), URL fetch, ảnh + **OCR**, drag-drop, paste→attachment. Nguồn: `chat-ingest.js`.
- Message actions: copy/edit/regenerate/delete + timestamps. Nguồn: `chat-actions.js`.
- Composer: slash menu, token counter, phím tắt (Esc/↑/Cmd+K), scroll-to-bottom FAB. Nguồn: `chat-composer.js`.
- Sidebar UX: rename/search/filter conversation. Nguồn: `chat-history.js`.
- Export MD/JSON. i18n.

**Success criteria:** gửi câu → render bảng/chart/map; đổi model+temp; đính kèm CSV/ảnh(OCR) và hỏi; edit/regenerate message; export MD/JSON.

---

## Wave 4 — Connectors (xây mới hoàn toàn; phụ thuộc Wave 3 tool-loop)

- Schema: bảng `connector_credentials` (userId, connectorId, credentials **mã hoá at-rest**, connectedAt). Migration drizzle.
- API: `GET /api/connectors`, `POST /api/connectors/:id/{connect,disconnect,test}` — per-user, mask secret.
- Framework `src/lib/connectors/`: loader + `isConnected/list/connect/disconnect/test/chatTools/execute`. Nguồn: `lib/connectors/index.js`.
- 7 connector: demo, github, trello, jira, google-drive, google-calendar, gmail. Nguồn: `lib/connectors/*.js`.
- Trang `/connectors` (list/connect/disconnect/test) + i18n.
- Nối `chatTools()`/`execute()` vào vòng lặp tool-calling của `/api/chat` (Wave 3).

**Success criteria:** kết nối GitHub bằng PAT → chat gọi `github_list_repos` → render kết quả; secret được mask + mã hoá; demo connector chạy offline.

---

## Lưu ý xuyên suốt

- **Bảo mật:** v1 lưu connector creds ở `~/.laam/connectors.json` (mode 600) — v2 nên lưu **mã hoá at-rest trong Postgres**, per-user. Không log token.
- **i18n:** mọi chuỗi user-facing mới phải có đủ vi/en/zh (Rule trong CLAUDE.md).
- **Migration DB:** `db:generate → commit drizzle/ → db:migrate`, KHÔNG `db:push`; chạy trên máy user (drizzle-kit không chạy trong sandbox agent).
- **Verify:** mỗi Wave nghiệm thu live qua Chrome trước khi sang Wave sau (Phase 5 workflow).

## Thứ tự đề xuất & lý do
Wave 0 → 1 → 2 → 3 → 4. Monitoring trước (ROI cao, data sẵn) để v2 sớm dùng được đúng mục đích cốt lõi; Chat/Connectors sau vì nặng và phụ thuộc hạ tầng Wave 0. Có thể đảo 3↔1/2 nếu ưu tiên "daily assistant".
