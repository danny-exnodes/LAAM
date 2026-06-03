# Serena Memory Index — LAAM

> Đọc đầu mỗi phiên (Session Boot Protocol).

## Decisions
- [v2-architecture](decisions/v2-architecture.md) — Định hướng v2: **local-first** (không SaaS), giám sát **đa máy**, Next.js 16 + Postgres + Auth.js v5 + RBAC + Drizzle, **Gemma 4** chủ đạo, Tailscale, <50 user.
- [db-migrations](decisions/db-migrations.md) — Dùng **migration** (db:generate→commit→db:migrate), KHÔNG db:push; drizzle-kit không chạy trong sandbox agent.
- [auth-and-proxy](decisions/auth-and-proxy.md) — Auth.js `trustHost:true`; Next 16 `proxy.ts`; **GOTCHA: API public phải thêm vào isPublic** (auth.config.ts); RBAC + user đầu = owner.
- [monitoring-parser-reuse](decisions/monitoring-parser-reuse.md) — v2 tái dùng parser v0.9 (copy vào v2/src/lib/monitoring); `upsertSessions` dùng chung local + ingest; transcriptPath chỉ live cho host.
- [v2-parity-gap](decisions/v2-parity-gap.md) — **v2 CHƯA parity v1** (Dash ~35%, Agents ~40%, Chat ~8%, Connectors 0%). Quyết định: port đầy đủ theo lộ trình `docs/v2-parity-roadmap.md` (Wave 0 hạ tầng → Agents → Dashboard → Chat → Connectors).

## Services
- [v2-app](services/v2-app.md) — Trạng thái app `v2/`: routes, schema, phase status (P1-3 ✅, P4 Chat built chờ test), lib chính, việc chưa làm.

## Spec
- `docs/v2-plan.md` — kế hoạch/spec v2 đầy đủ (Phase 0→6).

## Trạng thái hiện tại (2026-06-03)
- v2: P1 auth/RBAC ✅ · P2 monitoring ✅ · P3 collector đa máy (đơn giản) ✅ · P4 Chat Gemma 4 đã build, **chờ test runtime**. Verified live P1+P2+P3.
- App cũ (vanilla, Docker :4317) vẫn chạy; Phase 0 fixes (gemma4 default + toolbar) chưa deploy.
- DB dùng **migration**; user đã làm baseline sạch.
- Checkpoint mới nhất: `checkpoint/claude-2026-06-03.md`
