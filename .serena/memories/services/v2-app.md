# Service: v2 app (`v2/`)

Cập nhật: 2026-06-03. Stack: Next.js 16 + React 19 + TS + Tailwind 4 + Auth.js v5 + Drizzle + Postgres. Spec đầy đủ: `docs/v2-plan.md`.

**Dev:** `cd v2 && docker compose up -d && cp .env.example .env && npm install && npm run db:migrate && npm run dev` (:3000). Docker chỉ chạy Postgres+Adminer; app chạy bằng npm; Ollama native (gemma4:e4b).

## Routes
- Pages: `/login` `/register` `/dashboard` `/chat` `/agents` `/agents/[id]` `/graph` `/machines`
- API: `/api/auth/[...nextauth]`, `/api/register`, `/api/sync`, `/api/ingest`, `/api/machines`(+`/[id]`), `/api/chat`, `/api/conversations`(+`/[id]`), `/api/agents/[id]/timeline` (log cho drawer — Session 2), `/api/connectors`(+`/[id]/[action]`), `/api/stats`, `/api/events`(SSE), map+ocr helpers

## Trạng thái
- P1 auth/RBAC ✅ · P2 monitoring (sync, Agents, Session-detail, Dashboard: KPIs+cost chart recharts+heatmap+breakdowns+leaderboard, Graph @xyflow/react) ✅ · P3 collector đa máy (đơn giản: machine-token + ingest + /machines + collector) ✅ · **P4 Chat Gemma 4** ✅ built (streaming Ollama, per-user history) — **chờ test runtime**.
- Verified LIVE (Chrome): P1+P2+P3. Chat cần Ollama gemma4:e4b + login để test.

## Schema (`v2/src/db/schema.ts`)
Auth.js: user/account/session/verificationToken + `role`. App: machines(`tokenHash`), projects, agent_sessions (+jsonb subAgents/tools/histo, transcriptPath), chat_conversations, chat_messages, audit_log.

## Lib chính
`src/lib/sync.ts` (upsertSessions, syncLocalMonitoring) · `src/lib/monitoring/*` (parser copy) · `src/lib/machine-token.ts` · `src/lib/format.ts` · `src/auth.ts` + `auth.config.ts` + `proxy.ts`.

## Parity roadmap (v1→v2) — `docs/v2-parity-roadmap.md`
- **Wave 0 hạ tầng ✅ (2026-06-03)** — làm bằng Agent Team `laam-v2-wave0` (5 agent song song), TDD. Test harness mới: **vitest + RTL + jsdom** (`npm test`). 123 test pass, next build xanh. Đã build:
  - i18n vi/en/zh: `src/i18n/*` (resolve + I18nProvider/useT/useLang + cookie + 5 dict ported).
  - `/api/stats`: `src/lib/stats.ts` (+types) + route — port `lib/stats.js`, shape MỚI (Record/flat array, KHÁC v1 raw — cố ý).
  - SSE: `src/app/api/events/route.ts` + `src/lib/{stuck,events-bus}.ts` + `src/hooks/useLiveSessions.ts`. **Bus publisher chưa wire → để Wave 1.**
  - rich-render: `src/components/render/{MarkdownView,ChartBlock,MapBlock,LeafletMap,CodeBlock}.tsx`. leaflet qua `dynamic ssr:false`. **SSR-safety mới đảm bảo cấu trúc — exercise thật khi Wave 1/3 nhúng vào page.**
  - export: `src/lib/export/*` (CSV/MD/JSON/PDF jsPDF).
- **Wave 1 Agents ✅ (2026-06-03)** — Agent Team `laam-v2-wave1` (3 agent). Live SSE list (`AgentsClient` + `useLiveSessions`, bỏ sync thủ công), filter bar + stuck filter/badge + live ticker (`components/agents/*`), sub-agent detail, tool waterfall (`ToolWaterfall` ở `/agents/[id]`), CSV export. Backend: `/api/events` enrich (projectName+subAgents, `mapRowToLiveSession`) + `/api/sync` publish bus. **I18nProvider đã mount ở `app/layout.tsx`** (đọc cookie lang) → useT chạy app-wide. 160 test, build xanh.
- **i18n integration**: provider mount ở root layout. Trang cũ (dashboard/chat…) vẫn hardcode vi — swap sang useT dần ở các Wave sau.
- **Wave 2 Dashboard ✅ (2026-06-03)** — Agent Team `laam-v2-wave2` (3 agent kpi/charts/tables). 14 widget ở `components/dashboard/*` tiêu thụ `/api/stats`; `DashboardClient` (fetch + compose) + `page.tsx` shell mỏng (TL). KPIs, doughnut ×3 (recharts), activity timeline dual-axis, cost-by-model, tokens-by-project, model-comparison table, tool leaderboard/errors/slowest, top sessions, heatmap, export CSV/PDF. `.chart-card` thêm vào globals.css. i18n dashboard dict (+9 key Wave 2). 209 test, build xanh.
- Residual Wave 2: cost-by-project = token-based, cost-by-day bị bỏ (Stats chưa có field cost-per-project / cost-per-day; `components/cost-chart.tsx` cũ giờ orphan). Thêm field vào `computeStats`/Stats nếu cần parity tuyệt đối.
- **Wave 3 Chat ✅ (2026-06-03)** — Agent Team `laam-v2-wave3` (4 agent). 8 endpoint mới (`api/{ollama/models,chat/info,fetch-url,ocr,geocode,reverse,route,nearby}`); `/api/chat` nhận model/temp/topP/system (pure buildOllamaPayload). UI ở `components/chat/*`: `ChatClient` (orchestrator, TL) + MessageList/MessageItem (MarkdownView render + actions copy/edit/regen/delete) + Composer (slash/token/attach/drag-drop/shortcuts) + SettingsPanel + ConversationSidebar (search/rename) + ChatExport (MD/JSON). PATCH /api/conversations/[id] rename. types khoá ở `components/chat/types.ts`. 301 test, build xanh → **leaflet SSR residual ĐÓNG** (/chat nhúng MarkdownView). chat dict +2 key (errServer/errConn), guard → >=157.
- Residual Wave 3: relTime vi-only; fetch-url không chặn DNS-rebinding; streaming/OCR chưa verify end-to-end (cần Ollama + tesseract trên máy chủ).
- **Wave 4 Connectors ✅ (2026-06-03) — FULL PARITY** — Agent Team `laam-v2-wave4` (5 agent). `lib/connectors/`: crypto (AES-256-GCM), store (Postgres per-user encrypted), index (user-scoped list/connect/disconnect/test/chatTools/execute + mask), registry + 7 connector (demo/github/trello/jira/gdrive/gcal/gmail). API `app/api/connectors/route.ts` + `[id]/[action]`. UI `app/connectors` + `components/connectors/ConnectorsClient` + nav link. Tool-loop trong `/api/chat` (bounded rounds, no-connector path nguyên vẹn). Bảng `connector_credentials` (per-user, secret mã hoá). 375 test, build xanh.
- **⚠️ Migration:** `connector_credentials` cần `npm run db:generate && db:migrate` trên host (drizzle-kit không chạy sandbox). Prod set `CONNECTOR_KEY`.
- **🎉 v1→v2 parity ĐẠT** (Dashboard/Agents/Chat/Connectors). Branch `feat/v2-foundation`. Còn lại: nghiệm thu live (Ollama+tesseract), real OAuth flow cho Google, cost-by-project/day, relTime i18n.
- **Parity-polish ✅ (2026-06-03, Session 2, branch `fix/v2-parity-polish`)** — sửa 11 lỗi user báo khi so v1. Migrate `connector_credential` (drizzle/0001) + sửa route đọc `body.fields`. Full-width mọi trang, agents grid ≤5/hàng, viền card theo trạng thái (inline borderLeftColor), **dark theme chart** (hook `useChartTheme` + fix `.chart-card` media-query — xem [[v2-dark-mode-theming]]), **lucide-react** (đã cài; nav/buttons/cards/composer). **Restructure Agents kiểu v1**: `AgentDrawer` (log + timestamp HH:MM:SS) ở danh sách, `/agents/[id]` chỉ waterfall+meta; `ToolWaterfall` viết lại có trục thời gian thật (offset theo start + ruler). 375 test pass, tsc sạch. Chat/machines/connectors verify LIVE OK (gốc "không chạy" = user table rỗng sau reset).
- Files mới Session 2: `components/agents/AgentDrawer.tsx`, `hooks/useChartTheme.ts`, `app/api/agents/[id]/timeline/route.ts`.

## Chưa làm
Bảng `events` (timeline remote), lọc Agents theo máy/owner, connectors + smart-routing (Phase 5), deploy/Tailscale (Phase 6). Phase 0 UI #10/#11 (full-width, gom nút chat) ở app cũ chưa code.
