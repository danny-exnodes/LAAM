# Decision: Agent Harness SP-3 — Memory & Proactive

**Ngày:** 2026-06-05 · **Vai trò:** orchestrator SP-3 · **Trạng thái:** ✅ **IMPLEMENTED** branch `feat/agent-harness-sp3` (8 commit, 435 test xanh, build xanh, final review READY TO MERGE). Chưa merge/migrate (chờ user). Spec+plan: `docs/superpowers/{specs,plans}/2026-06-04-agent-harness-sp3-*`.

**Tài liệu đầy đủ:** `docs/superpowers/specs/2026-06-04-agent-harness-sp3-memory-proactive-design.md`
(3 feature, hợp đồng impact, migration 0003, test plan, decision log D-SP3-1..10). Memo này = pointer + chốt quyết định.
Phối hợp đã resolved: `comms/resolved/sp3-to-lead-design-review.md` (verdict A1–A4 chủ SP-1) · `comms/resolved/lead-to-sp3-persistence-and-audit.md`.

## Phạm vi (lớp L5 Memory + proactive)
1. **Persist tool turns** → bảng mới **`chat_tool_call`** (không thêm role 'tool' vào chat_message).
2. **Summarize** hội thoại dài → cột `summary` + `summarizedThroughId` trên `chat_conversation`; model sinh summary; giữ nguyên văn lượt gần.
3. **Proactive** (stuck/cost) → surface **in-chat tại turn time**, compose quanh `buildSystemPrompt`; dedupe per-conversation qua cột `proactiveState jsonb`.

## Quyết định chốt (user + chủ SP-1 duyệt)
- **D-SP3-1** bảng mới `chat_tool_call` (consumer chat_message không vỡ).
- **D-SP3-2** persist đọc `convo` trả về của `runToolRounds` (slice từ `baseLen` chụp TRƯỚC), không dùng `ToolEvent` (thiếu body/args). *(A1)*
- **D-SP3-3** summarize đồng bộ tại turn vượt ngân sách (char-budget), giữ `keepLast` nguyên văn; async sau-trả-lời = future.
- **D-SP3-4** proactive compose-around `buildSystemPrompt` (nối chuỗi, giữ chữ ký L1); chốt **Open-Q1 SP-1** = chỉ alert có chủ đích. *(A3)*
- **D-SP3-5** **cost-alert = tuyệt đối/burn-rate trên phiên chưa done, KHÔNG phải Δcost/Δt windowed** — agent_session chỉ có tổng/phiên (giới hạn dữ liệu, nêu rõ). *(A3)*
- **D-SP3-6** dedupe per-conversation `proactiveState jsonb` + cooldown 6h; **không** đụng `audit_log` (tránh xung đột SP-2).
- **D-SP3-7** rút `loadSessionRows` → `src/lib/agent/tools/laam/_load.ts` dùng chung (query-stats + proactive); chủ SP-1 authorize sửa query-stats, ưu tiên không phá test. *(A2(b))*
- **D-SP3-8** token-undercount **OUT of scope** → backlog do chủ SP-1 sở hữu (`backlog/agent-harness-tooltoken-usage.md`). *(A4)*

## Schema / migration
- **Migration `0003` ADDITIVE** (CREATE TABLE chat_tool_call + ADD COLUMN summary/summarizedThroughId/proactiveState). Mới nhất hiện tại `0002_natural_chat` (journal verify).
- **ACTION REQUIRED (host):** `npm run db:generate` → commit `drizzle/` → `npm run db:migrate`. drizzle-kit KHÔNG chạy sandbox ([[db-migrations]]). Agent không tự chạy.

## Module mới (thuần + DI)
`src/lib/agent/persist.ts` (`extractToolTurns`) · `summarize.ts` (`planHistory` + `summarizeMessages`) · `proactive.ts` (`detectAlerts` + `selectNewAlerts` + `formatProactiveNotice`) · `tools/laam/_load.ts` (`loadSessionRows`). Nối vào `src/app/api/chat/route.ts`. KHÔNG đụng `components/chat/*`, `connectors/*`, `types.ts`, hạ tầng.

## Liên quan
[[agent-harness-architecture]] · [[agent-harness-sp-analysis-plan]] · [[db-migrations]] · [[agent-ops-rules]] · [[poc-model-choice]].
