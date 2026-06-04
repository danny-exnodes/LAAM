# LAAM v2 (in development)

**Local-first, multi-user (internal).** Next.js 16 + PostgreSQL + Auth.js v5 + Drizzle.

The app runs on the host via `npm run dev`; only Postgres (+ Adminer) runs in Docker. The old v0.9 app keeps running separately and is untouched. Full plan: [`../docs/v2-plan.md`](../docs/v2-plan.md).

## Quick start

```bash
cd v2

# 1) Start dev infra (Postgres :5432, Adminer :8080)
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
- Later: Phase 3 collector (multi-machine ingest) · Phase 4 chat per-user + Gemma 4 smart-routing · Phase 5 connectors per-user (encrypted) · Phase 6 Tailscale + hardening + audit.

## Notes

- Port **3000** (this app) does not clash with the old app (**4317**).
- Ollama stays native on the host; primary chat model is **`gemma4:e4b`** (`DEFAULT_CHAT_MODEL`).
- Never commit `.env` (real secrets) — only `.env.example`.
