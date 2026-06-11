# Batch 2 — Security foundation + Monitoring unify + User-mgmt + Notifications + Claude-runtime

> Subagent-driven. Worktree `.claude/worktrees/batch2`, branch `feat/batch2`. Nghiên cứu + phản biện 3 vai: `.claude/tmp/batch2-digest.txt`. Mỗi epic chuỗi commit riêng + 2 vòng review.

**Bối cảnh quan trọng:** 3 phản biện (security/architect/product) HỘI TỤ: cả 5 nghiên cứu coi RBAC/SSE-isolation là "việc kèm tính năng" nhưng đó là **LỖ HỔNG ĐANG SỐNG**. Vá nền TRƯỚC, feature SAU.

---

## QUYẾT ĐỊNH (đã qua panel phản biện)

### Phát hiện bảo mật — LỖ HỔNG ĐANG SỐNG (verified file:line)
1. **RBAC là trang trí.** `authorized()` (auth.config.ts:15-30) chỉ check logged-in. Role-403 CHỈ ở `machines` route. → viewer/member chạy được MỌI mutation: `POST /api/workflows/[id]/run` (dryRun=false → connector write THẬT ra Trello/Google), connect/disconnect connector (cred thật), tạo/xoá workflow/conversation, tạo access-token. **memory connector-write-test-safety: connector LÀ LIVE với cred thật.**
2. **SSE `/api/events` rò mọi session.** `snapshot()` (events/route.ts:125-152) KHÔNG có WHERE → broadcast TẤT CẢ agent_sessions cho mọi client. Session `api|mcp` mang userId thật (mỗi MCP external call ghi 1 session userId=token owner) → user B thấy user A gọi tool gì, lúc nào, cost bao nhiêu.
3. **Off-boarding rò.** Xoá user → access_token `onDelete:set null` nhưng `revokedAt` vẫn null → token VẪN active (verifyAccessToken chỉ check revoked/expiry). + đường legacy `machines.tokenHash` (ingest fallback, chưa drop). + KHÔNG có cột disabled trên user. → cựu nhân viên vẫn ingest/gọi MCP.
4. **Scopes không enforce** (🟡 defer). verifyAccessToken bỏ qua `scopes`; phòng tuyến write DUY NHẤT = 1 dòng filter `kind==='read'` (tools.ts:17). Backlog cứng: enforce scope ở callTool TRƯỚC khi mở write-tool.

### Trả lời câu hỏi user "đọc file log local còn ý nghĩa không khi DB đã có?"
**Có — nhưng chỉ trên máy chạy Claude (dev/host), KHÔNG trên prod.** DB chỉ lưu SUMMARY phiên (status/cost/token/sub-agent-count) — đủ cho list + KPI. Hai thứ CHỈ có từ file `.jsonl`: (a) log timeline đầy đủ (AgentDrawer), (b) tool-call waterfall (`/agents/[id]`). Prod container KHÔNG mount `~/.claude/projects` (docker-compose verified) → host-direct-parse trên prod đã chết; prod chỉ có data từ collector→ingest, mà session collector có `transcriptPath=null` → KHÔNG waterfall/timeline. ⇒ **GIỮ local-parse cho dev. Muốn waterfall trên prod cho session máy-khác cần đẩy tool-call detail qua ingest (bảng events v1-unported) — việc MỚI, không thuộc đợt này.** KHÔNG bỏ local-parse (Rule 2: nó là feature thật cho dev, không phải code chết).

### Quyết định feature (defaults — phản biện hậu thuẫn, reversible)
- **Gộp Agents/Monitoring:** tab Local của /monitoring render trải nghiệm AgentsClient (live SSE + filter + drawer + waterfall); redirect `/agents`→`/monitoring?tab=local`; per-source detail adapter cho chat (timeline message) + workflow (node-waterfall từ workflow_run_step). KHÔNG ép chat/workflow trông giống agent (shape khác). Giữ "last synced" + Sync button mọi tab (phân biệt UI-live vs data-fresh).
- **Notification:** in-app bell ONLY đợt này (workflow-terminal + write-gate-pending). Model thiết kế channel-extensible (cột `audience`) nhưng chỉ implement in-app. Defer email/Slack/org-broadcast/connector-reconnect/eval-emit. Per-user SSE = CHẶN CỨNG (kênh riêng, không dùng chung registry sessions).
- **User-management:** UI thật nhưng tối thiểu (list user + đổi role owner-only + /settings/access self-service token). KHÔNG state-machine role, KHÔNG nhiều-owner logic phức tạp.
- **claude-runtime:** CHỈ Phase 0 (parser augment `parentToolUseId` + `outputText`) với fail-loud version guard. DROP todos/Desktop-parity (format undocumented, ROI thấp, không ai xin). Lưu ý: outputText KHÔNG được org-broadcast qua SSE nếu chứa PII → redact hoặc không đưa vào snapshot.

---

## PHASE S — Security foundation (LÀM TRƯỚC, merge nhanh, độc lập feature)

### S1: RBAC enforcement helper + gate mutation routes
**Files:** Create `src/lib/auth/rbac.ts` (`requireRole(session, roles[])`, `requireMutator(session)` chặn viewer → trả `{ok:true,session}` | `NextResponse 403`); Modify mọi mutation route gate viewer: `api/workflows/route.ts`, `api/workflows/[id]/run/route.ts`, `api/workflows/[id]/route.ts` (PATCH/DELETE), `api/connectors/[id]/[action]/route.ts`, `api/conversations/[id]/route.ts` (DELETE), `api/access-tokens/route.ts` (POST), `api/chat/route.ts` (POST — cân nhắc: viewer chat được không? QUYẾT: viewer READ-ONLY = không chat, vì chat tạo conversation+gọi tool). Refactor 2 copy-paste trong `machines/route.ts` + `machines/[id]/route.ts` vào helper (Rule 7).
**Chính sách:** owner=all; admin=all trừ đổi role user; member=mutate được; viewer=READ-ONLY mọi mutation. Helper CHỈ gate mutation, KHÔNG đụng visibility read (monitoring vẫn org-shared Q2).
**Test (TDD, integration gọi thẳng route):** viewer POST workflows/run/connectors/access-tokens/chat → 403; member → 200; refactor machines giữ hành vi cũ.
**Commit:** `fix(security): enforce RBAC on mutation routes — viewer is read-only (was decorative)`

### S2: SSE snapshot isolation
**Files:** `src/app/api/events/route.ts` — `snapshot()` áp visibility. Cách: gắn `{userId, role}` vào SseClient (đã có `auth()` trong GET); query agent_sessions giữ org-shared cho local/claude NHƯNG lọc `api|mcp` per-principal (mirror đúng read-model.ts isVisible — QUYẾT định: api|mcp = per-principal khi qua SSE vì mang userId thật; HOẶC nếu giữ org-shared thì doc rõ "ai cầm token MCP của bạn = đồng nghiệp thấy bạn gọi gì"). Khuyến nghị: lọc `api|mcp` theo viewer.userId trong snapshot, local/claude org-shared. CHẶN CỨNG: kênh `sessions` giữ org fan-out; KHÔNG để refactor thu hẹp /agents xuống per-user.
**Test:** 2 client khác user → cả 2 nhận local/claude sessions; chỉ đúng owner nhận api|mcp session của mình.
**Commit:** `fix(security): SSE snapshot applies per-principal visibility to api/mcp sessions`

### S3: Off-boarding — revoke token + soft-disable user
**Files:** `schema.ts` (thêm `user.disabledAt timestamp nullable` — migration additive); `src/lib/access-token.ts` (verifyAccessToken cũng check user.disabledAt? hoặc revoke khi disable); New `api/users/[id]/route.ts` PATCH `{disabled}` (owner/admin) → transaction: set disabledAt + revoke MỌI access_token userId=target + clear machines.tokenHash WHERE ownerUserId=target; New endpoint owner/admin revoke token người khác (mở rộng access-tokens DELETE cho owner/admin, hoặc route admin riêng). auth.config: chặn login nếu disabledAt set.
**Test:** disable user → verifyAccessToken token họ = null (cả access_token lẫn legacy tokenHash); login bị chặn.
**Commit:** `fix(security): off-boarding — disable user revokes all tokens (incl legacy) + blocks login`

---

## PHASE F — Feature work (sau khi S xanh + merge)

### F1: User-management UI + role change
- `api/users/route.ts` GET (owner/admin list: name/email/role/disabledAt/lastSeen); `api/users/[id]/route.ts` PATCH `{role}` (OWNER-ONLY, chống tự-giáng owner cuối, audit_log action='role_change' target=JSON{actor,subject,from,to}); `/settings/users` page (owner/admin, bảng + role dropdown + disable toggle + confirm nguy hiểm); `/settings/access` page (self-service token list/create/revoke, hiện raw 1 lần, prefix+last4). i18n vi/en/zh.

### F2: Notifications in-app
- Migration bảng `notifications` (id/userId-nullable/audience/type/severity/title/body/link/source/readAt/dedupeKey/createdAt; unique partial (userId,dedupeKey); index (userId,readAt,createdAt)). `src/lib/notifications/` (create chokepoint = insert+dedupe+publish; listForUser mirror isVisible; markRead; pruneOld). Wire: workflow-terminal (run.ts:157/resume.ts cạnh publish), write-gate-pending. SSE: **kênh riêng** `Map<userId,Set<client>>` cho event notification (KHÔNG đụng sessions broadcast). `<NotificationBell>` header + badge + dropdown; `/notifications` page. Browser Notification refactor dùng chung hook (giữ stuck-notify nguyên). Proactive stuck/cost: gọi create() làm 1 nguồn (không nhân đôi card+bell).

### F3: Monitoring unify
- Tab Local của MonitoringClient render AgentsClient (live). Redirect /agents → /monitoring?tab=local. Detail adapter: chat (chat_messages timeline), workflow (workflow_run_step node-waterfall). "last synced" + Sync mọi tab. Visibility cho mọi tab mới phải có luật (eval_run/external chưa có isVisible → định nghĩa trước khi thêm tab).

### F4: Claude-runtime Phase 0
- `parser.js`: thêm `subAgents[].parentToolUseId` (từ parent_tool_use_id) + `outputText` (tool_result content, redact PII trước khi store nếu vào jsonb org-broadcast). Fail-loud version guard (warn nếu field tên lạ). Test fixture 3 case (nested Task, Task+output, Task error). FE: /agents/[id] sub-agent tree đẹp hơn. DROP todos/Desktop-parity.

---

## Verify & bàn giao
- Full vitest + tsc mỗi epic; S-phase E2E verify (viewer→403 live; SSE 2-user). Final review. Merge security trước (có thể merge riêng), feature sau. CHANGELOG + tag (v2.4.0 khi xong). Checkpoint + decision memories (RBAC holes, batch2 decisions).
- Backlog cứng: scope enforcement token (trước MCP-write GA); events-push cho waterfall-trên-prod; drop machines.tokenHash.
