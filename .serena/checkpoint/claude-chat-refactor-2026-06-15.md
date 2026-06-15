# Checkpoint: claude-chat-refactor — 2026-06-15

## What was done
Chat stream/finalizer refactor (tech-debt từ audit T1/T4/T5), trong worktree
`worktree-chat-stream-refactor` (junction node_modules → main, KHÔNG npm install).
- **R1** `src/lib/llm/ollama.ts` — `ollamaStream(res)` generator (NDJSON → `{delta?,usage?}`), mirror `claudeStream`. +3 unit test.
- **R2** `finalizeTurn()` trong route.ts — 1 finalizer cho CẢ 4 stream path (main Ollama, main Claude, resume Ollama, resume Claude): F1-guard → persist assistant → trailing frames (leading+token) → persist tool-turn → updatedAt → close. `emitTokens` gate token (Claude omit khi !gotUsage, Ollama luôn). Error-semantics PRE-stream giữ riêng từng caller (test-locked).
- **R4** confirm-write tool-turn nay persist vào `chat_tool_call` (đóng gap documented). +1 test.
- **R5** sửa comment QW-1 stale.
- **Defer có lý do:** T2 `ChatProvider` interface (YAGNI, generator-seam đủ 80%), T3 parse-2-lần (micro-opt), T6 default model (cosmetic, test-coupled).

## Files changed
- NEW `src/lib/llm/ollama.ts`, `src/lib/llm/ollama.test.ts`
- MOD `src/app/api/chat/route.ts` (1098→1037 dòng; 4 path → 1 finalizer), `src/app/api/chat/route.test.ts` (+R4)
- NEW `docs/superpowers/plans/2026-06-15-chat-stream-finalizer-refactor.md`
- 4 commit: b540907(plan) f1176bd(R1) 02ad79c(R2) 53c3b95(R4+R5). Base 6fcb609.

## Current state
- ✅ `tsc --noEmit` exit 0. ✅ Full suite **1976 pass / 0 skip** (275 files). Baseline chat-surface 389→389 (bảo toàn).
- ⏳ CHƯA merge vào main (chờ user). CHƯA E2E live.
- 1 behavior delta CHỦ Ý: live-token enqueue nay try/catch-wrapped đồng nhất 4 path → client abort giữa stream Ollama nay persist FULL (Ollama đã sinh xong) thay vì partial — nhất quán với nhánh Claude. Untested edge.

## Next steps
- **E2E live** (cần user): chạy `next dev` từ worktree (hoặc serve tailnet) + Ollama + login → test: chat thường Ollama, vision, tool-loop + tool-trace, write-gate confirm-card (Demo connector `demo_create_task`) → verify `chat_tool_call` có row sau confirm (R4), Claude provider MVS nếu có ANTHROPIC_API_KEY.
- Sau E2E xanh: merge → main (⚠️ [[npm-destroys-worktree-junction]]: chạy `npm install` + `tsc` trên main sau merge nếu cần; refactor này KHÔNG thêm dep nên chỉ cần verify).
- Cập nhật backlog `agent-harness-route-merge-reconciliation` (gap #1 "persist confirm-path" nay đã đóng = R4).

## Blockers / Risks
- Refactor route lõi production-critical → rủi ro regression tinh vi; đã giảm bằng characterization suite (R0/C1×9) giữ xanh + structural review (4 finalize site, 0 NDJSON sót).
- E2E phải bật dev server (agent-ops-rules: KHÔNG tự chạy ngầm) → chờ user.
