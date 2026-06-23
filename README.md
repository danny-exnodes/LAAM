# LAAM — Local AI Agent Monitoring

Theo dõi real-time các Claude agent chạy local + trợ lý chat model-local + connectors — all local, model $0. **Next.js 16 + PostgreSQL + Auth.js + Drizzle.** Bản v1 (vanilla/Express) lưu ở branch `archive/v1`.

Triển khai production (Docker + Tailscale): xem runbook [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

# LAAM v2 (in development)

**Local-first, multi-user (internal).** Next.js 16 + PostgreSQL + Auth.js v5 + Drizzle.

The app runs on the host via `npm run dev`; only Postgres (+ Adminer) runs in Docker. The old v0.9 app keeps running separately and is untouched. Full plan: [`../docs/v2-plan.md`](../docs/v2-plan.md).

## Quick start

```bash
cd v2

# 1) Start dev infra (Postgres :5434, Adminer :8080)
docker compose up -d

# 2) Env: copy the template, then set a real AUTH_SECRET
cp .env.example .env
#   AUTH_SECRET:  openssl rand -base64 32

# 3) Install deps (on YOUR machine — native node_modules)
npm install

# 4) Schema → Postgres bằng MIGRATION (versioned, an toàn, không mất dữ liệu)
npm run db:generate     # sinh file SQL migration từ schema → commit thư mục drizzle/
npm run db:migrate      # áp dụng migration (idempotent, theo journal)
#   db:push CHỈ để thử nhanh khi dev (đồng bộ trực tiếp, có thể hỏi drop khi diff
#   phức tạp) — KHÔNG dùng khi đã có dữ liệu thật.

# 5) Run the app
npm run dev        # → http://localhost:3000
```

Open http://localhost:3000 → you'll be redirected to **/login**. Click **Đăng ký** to create the first account (**the first user becomes `owner`**), then log in. Once in, click **Đồng bộ** (top-right) to pull your local sessions from `~/.claude/projects` into Postgres, then open **Agents**.

## Scripts

| Script | What |
|---|---|
| `npm run dev` | Next.js dev server (Turbopack) on :3000 |
| `npm run build` / `start` | production build / serve |
| `npm run db:push` | sync schema → Postgres (dev) |
| `npm run db:generate` | emit SQL migrations from the schema |
| `npm run db:migrate` | apply migrations |
| `npm run db:studio` | Drizzle Studio (DB browser) |

## Database & migrations

Schema lives in `src/db/schema.ts` (Drizzle). Track every change as a **versioned migration** committed under `drizzle/`:

```bash
npm run db:generate   # diff schema → new SQL migration file (commit it)
npm run db:migrate    # apply pending migrations (idempotent, additive)
```

`db:push` is for **fast local prototyping only** — it syncs the schema directly and can prompt to drop on ambiguous diffs. Once there's real data, use migrations.

**Adopting migrations on a DB that was created with `push`:** because the current data is test-only and sessions are re-syncable, the cleanest baseline is a fresh start:

```bash
docker compose down -v && docker compose up -d   # wipe + restart Postgres
npm run db:generate && npm run db:migrate         # baseline migration (commit drizzle/)
npm run dev                                       # then register + Đồng bộ again
```

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · Auth.js v5 (Credentials, JWT sessions) · Drizzle ORM (node-postgres) · PostgreSQL 16 · bcryptjs.

## Layout

```
v2/
  src/
    app/                 App Router (login, register, dashboard, api/auth, api/register)
    components/          client components (signout button…)
    db/                  schema.ts (Drizzle) + index.ts (pg client)
    auth.ts              Auth.js (Node): Drizzle adapter + Credentials
    auth.config.ts       edge-safe config used by proxy
    proxy.ts             route protection (Next.js 16 renamed middleware → proxy)
    types/               next-auth type augmentation (role)
  drizzle.config.ts
  docker-compose.yml     Postgres + Adminer (dev infra)
```

## Status

**Phase 1 ✅** (auth + RBAC) and **Phase 2 ✅** (monitoring → Postgres, full UI). Roles: `owner` / `admin` / `member` / `viewer`.

- Phase 2 so far: **Sync** scans `~/.claude/projects` (reusing the v0.9 parser) → upserts `machine` / `project` / `agent_session`; **Agents** groups sessions by project; **Dashboard** shows KPIs. After logging in, click **Đồng bộ** (top-right).
- Done since: local-model sessions (Ollama logs), **Session-detail** (`/agents/[id]` — live timeline + recent tool calls), **Dashboard breakdowns** (status / top models / top projects).
- **Phase 2 complete:** **Graph** (`/graph`, react-flow — orchestrator → sub-agents) + Dashboard charts (cost-over-time via recharts, hour×weekday heatmap, tool leaderboard).
- **Access & off-boarding (v2.4.x):** mỗi người tự quản token api/mcp ở `/settings/access`; owner/admin quản người dùng ở `/settings/users` — đổi vai trò, vô hiệu hoá (thu hồi mọi token), và **cấp access-key cho người khác** (đọc-chỉ, ghi nhật ký `token_issued_for`/`token_revoked_for`).
- Later: Phase 3 collector (multi-machine ingest) · Phase 4 chat per-user + Gemma 4 smart-routing · Phase 5 connectors per-user (encrypted) · Phase 6 Tailscale + hardening + audit.

## Notes

- Port **3000** (this app) does not clash with the old app (**4317**).
- Ollama stays native on the host; primary chat model is **`gemma4:e4b`** (`DEFAULT_CHAT_MODEL`).
- The chat assistant can **search & read the web** (`web_search` + `web_read` tools). `web_search` uses a self-hosted **SearXNG** (`docker compose up -d searxng`, localhost `:8888`, **$0**) — set `SEARXNG_URL`; without it `web_search` fails soft. It can also `util_calc` exact arithmetic and search/inspect its own LAAM sessions (`laam_search_sessions` / `laam_get_timeline` / `laam_query_audit`).
- **Search** (`/search`, `GET /api/search?q=`): full-text across agent sessions (org-shared) + your own conversations & workflows.
- **Chat vision:** image attachments are sent to the (vision-capable) local model — up to 2 images, ≤2 MB each — alongside the existing OCR-text path.
- **Workflow runs are cancellable:** the run waterfall has a **Huỷ** button (`PATCH /api/workflows/runs/[id]`); the engine stops cleanly before the next node.
- **Quick-tools trong chat:** gõ `/` mở menu **Lệnh nhanh + Công cụ** (gom nhóm LAAM / connector / MCP server, badge đọc-ghi). Chọn tool → điền **tham số bắt buộc** (vd `project_id` UUID) → server gọi đúng tool đó deterministic trước vòng model (tool ghi vẫn qua thẻ xác nhận).
- **Workflow node MCP + Custom Agents:** workflow có node **MCP** (gọi tool read của MCP server đã trust — write fail-closed) và node **Agent** chọn được **Custom Agent preset** (system prompt tái dùng, quản lý ở **Cài đặt → Custom Agents**, có 3 mẫu nhanh).
- **Stuck threshold** is configurable via `LAAM_STUCK_MIN` (default 10 min), served by `GET /api/config`.
- **Connectors (10):** demo · GitHub · Trello · Jira · Google Drive/Calendar/Gmail · **Slack** · **WhatsApp** · **Zalo OA**. Kết nối kiểu **authorize 1-click** (như Google) cho Jira (Atlassian 3LO), Slack, Zalo và Trello khi operator đặt env tương ứng (xem `docs/DEPLOYMENT.md` mục 8–8e); Jira/Trello vẫn nhận **nhập key tay** (fallback, user cũ không vỡ). WhatsApp = Cloud API token (Meta không có OAuth khả thi cho self-host), **chỉ gửi** trong cửa sổ 24h; Zalo cần **OA xác thực** + gói API. Mọi tool ghi qua confirm-card, không tự chạy trong workflow.
- **Mount MCP server ngoài (per-user):** Connectors → mục **MCP servers** cho phép mỗi user khai một MCP server HTTP bất kỳ (Streamable HTTP/SSE) — tool xuất hiện trong chat dưới namespace `mcp__<slug>__<tool>`, mặc định **fail-closed** (mọi tool coi là write → qua confirm-card) trừ khi bật "tin readOnlyHint" cho server đó; URL bị chặn SSRF (localhost/IP nội bộ). Token lưu mã hoá per-user như connector thường.
- **Claude trong chat (tuỳ chọn, MVS):** đặt `ANTHROPIC_API_KEY` (key org, server-only) để picker model có thêm **Claude Sonnet/Opus** (Messages API — tính phí token vào key org, **không liên quan/không trừ subscription Claude cá nhân**; ToS Anthropic 02/2026 không cho dùng subscription OAuth trong app thứ ba). Phiên bản này Claude **chưa dùng tool/dữ liệu LAAM** — chat thường + stream; mặc định vẫn là model local $0.
- **BytePlus trong chat (tuỳ chọn, full-agent):** đặt `BYTEPLUS_API_KEY` (key org, server-only) + `BYTEPLUS_BASE_URL` khớp region (mặc định `ap-southeast`; EU = `ark.eu-west`) để picker có thêm optgroup **BytePlus** (Seed 1.8 / 1.6 / 1.6-flash — ModelArk OpenAI-compatible, tính phí token). **KHÁC Claude:** BytePlus **chạy đầy đủ tool/connectors + write-gate** như model local (256k context, đa phương thức); vision chưa nối ở bản này. Dữ liệu xử lý ở SEA (Johor/Jakarta) hoặc EU — cân nhắc compliance khi chọn region. Summarize/proactive vẫn chạy model local $0.
- Never commit `.env` (real secrets) — only `.env.example`.
