# RBAC lỗ hổng đang sống + quyết định batch2 (2026-06-12)

**Nguồn:** workflow nghiên cứu + 3 phản biện (security/architect/product), verified file:line. Digest: `.claude/tmp/batch2-digest.txt`. Plan: `docs/superpowers/plans/2026-06-12-batch2-security-monitoring-notifications.md`.

## ⚠️ LỖ HỔNG ĐANG SỐNG (vá TRƯỚC mọi feature)
1. **RBAC trang trí** — `auth.config.ts authorized()` chỉ check logged-in; role-403 CHỈ ở /api/machines. viewer/member chạy được MỌI mutation kể cả `POST /api/workflows/[id]/run` (dryRun=false → connector write THẬT, cred live). Vá: `src/lib/auth/rbac.ts` requireMutator/requireRole + gate mọi mutation route.
2. **SSE rò** — `/api/events snapshot()` không WHERE → broadcast mọi agent_session cho mọi client; session api|mcp mang userId thật → user B thấy hoạt động MCP của user A. Vá: snapshot áp visibility (api|mcp per-principal, local/claude org-shared); SseClient mang userId; kênh sessions GIỮ org fan-out (đừng thu hẹp /agents).
3. **Off-boarding rò** — xoá user → access_token set-null userId nhưng revokedAt=null → token sống; + legacy machines.tokenHash chưa drop; + user KHÔNG có cột disabled. Vá: disable user = transaction revoke-all-token (cả legacy) + block login; thêm user.disabledAt.
4. **Scopes không enforce** (defer cứng) — verifyAccessToken bỏ qua scopes; phòng tuyến write = 1 dòng filter kind==='read'. Backlog: enforce scope ở callTool TRƯỚC MCP-write GA.

## Quyết định feature
- **Câu local-file (user hỏi):** GIỮ local-parse cho dev/host (nguồn DUY NHẤT của log timeline + tool waterfall; DB chỉ summary). Prod container KHÔNG mount ~/.claude/projects → local-parse đã chết trên prod; waterfall cho session collector cần events-push (mới, defer). KHÔNG bỏ local-parse.
- **Gộp Agents/Monitoring:** tab Local = AgentsClient live; redirect /agents→/monitoring?tab=local; detail adapter per-source (chat=message timeline, workflow=node-waterfall từ workflow_run_step). KHÔNG ép chat/workflow giống agent. Giữ tên "Machines" filter (LOCKED).
- **Notification:** in-app bell ONLY (workflow-terminal + write-gate-pending); model channel-extensible (cột audience) chỉ implement in-app; per-user SSE = kênh RIÊNG (không đụng sessions broadcast — đây là chặn cứng, dễ vô tình thu hẹp /agents). Defer email/Slack/org-broadcast/eval-emit.
- **User-mgmt:** UI tối thiểu (list + role owner-only + access self-service). Team <50: KHÔNG state-machine role/nhiều-owner.
- **claude-runtime:** CHỈ Phase 0 parser augment (parentToolUseId + outputText, fail-loud version guard, redact outputText). DROP todos/Desktop-parity.

## F1 ĐÃ IMPLEMENT (2026-06-12, feat/batch2 `9b79cb1` backend + `c8c2085` UI)
Off-boarding GỘP vào F1 xong. migration **0012** `user.disabled_at` (`drizzle-kit generate` CHẠY ĐƯỢC trong worktree — **host phải `npm run db:migrate`**). `GET /api/users` (owner/admin, whitelist cột, no secret); `PATCH /api/users/[id]` {role} owner-only (guard self + owner-cuối; audit role_change target=JSON{actor,subject,from,to}) / {disabled} owner/admin tx = set disabledAt + revoke MỌI access_token + clear legacy `machines.tokenHash WHERE ownerUserId` + audit user_disabled/enabled (guard self + owner-cuối). auth.ts chặn login disabled (sau bcrypt → no leak; helper `lib/auth/disabled.ts`). `access-tokens/[id]` DELETE: owner/admin thu hồi token bất kỳ, self-revoke mọi người, 404 khi WHERE rỗng. UI `/settings/users` (owner/admin) + `/settings/access` (mọi user) + SettingsMenu rows + i18n vi/en/zh. **1702 test, tsc sạch.** machines owner-col = `ownerUserId`. audit_log.target = JSON string (cột text).

## Ràng buộc LOCKED giữ nguyên (machines-decomposition)
token=H3 unified; ingest visibility PER-SOURCE (KHÔNG per-user isolation cho monitoring — phá value-prop team); Q2 isVisible; MCP write defer qua scope. **ĐÍNH CHÍNH (v2.4.1, verify code):** userId trên access_token = **attribution/provenance**, KHÔNG phải khoá cô lập dữ liệu MCP đang hoạt động. Các tool `laam_*` (search-sessions/get-timeline/get-agent/list-agents/find-stuck/query-audit) **KHÔNG** lọc theo `ctx.userId` — đọc monitoring org-shared. Cô lập per-user cho MCP là **DÀNH SẴN, chưa kích hoạt** (sẽ là isolation key KHI có tool MCP per-user). v2.4.1 đã đóng riêng phần `laam_query_audit` (principal-scope); phần còn lại ở `backlog/access-mcp-orgshared-read.md`. Xem `decisions/access-provisioning.md`.

## Đính chính nghiên cứu (phản biện bắt)
- proactive dedupe ĐÃ persist (proactiveState jsonb on conversation), KHÔNG phải pure in-memory.
- crater write-selection ĐÃ bị bác (chat-tool-selection 06-11) — KHÔNG còn chặn connector-write GA.
- prod ≠ main: verify image prod (/api/chat/info) trước khi xây trên giả định runtime.
