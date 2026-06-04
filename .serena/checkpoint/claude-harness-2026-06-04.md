# Checkpoint: claude-harness — 2026-06-04

Vai trò: technical consultant. Nhiệm vụ: khảo sát hiện trạng + lên roadmap các lớp Agent Harness
để AI tương tác thông minh với user qua chat. (Session 3 song song; trước đó cùng session đã lo OCR/Tesseract — xem claude-ocr-2026-06-04.md.)

## What was done
- Khảo sát hiện trạng harness từ code thật: `/api/chat` (buildOllamaPayload, runToolRounds — tool-loop bounded, non-streaming, fail-soft), `lib/connectors/*` (types/index/registry: tool connector ngoài, execute dispatch), model qwen3-vl, stats.ts/stuck.ts.
- Xác định 6 khoảng trống; lớn nhất: **AI mù với dữ liệu LAAM** (không tool nào trỏ agent_sessions/stats/machines).
- Brainstorm với user (3 vòng): chốt trọng tâm = **nền tảng tổng quát**; đầu ra = **roadmap mức cao**; quyết định L2 = **hybrid dispatch hợp nhất, connectors giữ nguyên** (user đồng ý recommend).
- Viết roadmap + lưu Serena.

## Files changed (chỉ docs/Serena — KHÔNG đụng code)
- `docs/superpowers/specs/2026-06-04-agent-harness-architecture.md` (mới — roadmap đầy đủ: 6 lớp, build order SP-1→SP-4, decision log D1–D6, coordination, open questions)
- `.serena/memories/decisions/agent-harness-architecture.md` (mới — pointer + decision log)
- `.serena/memories/backlog/agent-harness-coordination.md` (mới — cảnh báo file dùng chung cho 3 session)
- `.serena/memories/INDEX.md` (thêm 2 pointer)
- `.serena/checkpoint/claude-harness-2026-06-04.md` (file này)

## Current state
- Roadmap hoàn tất, self-review xong, **chờ user review chi tiết file spec**. Chưa commit (theo rule + 2 session kia có việc chưa commit).
- KHÔNG có thay đổi code nào. `:3000` không bị đụng.

## Next steps
- User review file spec → nếu OK: đào sâu **SP-1 Foundation** thành spec riêng → writing-plans → TDD.
- SP-1 = L0 orchestrator (tách `/api/chat`) + L1 context + L2 union/dispatch + L3 internal read tools + L4 guardrail min. Read-only, không đụng schema/connectors.

## Blockers / Risks
- Coordination: SP-1 refactor `/api/chat`; SP-4 đụng `components/chat/*` (session FE). Đã ghi cảnh báo ở backlog/agent-harness-coordination.
- Roadmap mới là thiết kế — chưa có code/test; success criteria từng SP ở §4 của spec.

## Update — SP-1 ĐÃ IMPLEMENT (subagent-driven)
- Thực thi SP-1 bằng subagent-driven (worktree `.claude/worktrees/agent-harness-sp1`, branch **`worktree-agent-harness-sp1`**), TDD, mỗi task có spec+quality review.
- 8 commit (a873774→684cad9): contracts · guardrails(+hardening) · context · orchestrator(move runToolRounds, execute→dispatch) · registry/dispatch · 5 internal tools · wire /api/chat + migrate tool-loop.test→orchestrator.test.
- **Verify:** `npx vitest run` = **398 pass** (was 375; +tests mới, −3 tool-loop đã migrate); `tsc --noEmit` sạch; `npm run build` xanh. Final review: READY TO MERGE.
- Ràng buộc giữ đúng: KHÔNG đổi schema, KHÔNG thêm npm dep, KHÔNG đụng `components/chat/*` hay `lib/connectors/*` (chỉ thêm `src/lib/agent/*` + sửa `src/app/api/chat/route.ts`).
- Minor còn lại (không chặn): find-stuck `stuck` field thừa khi thresholdMin<10; query-stats nhân bản mapping SessionRow của /api/stats (có comment cảnh báo).
- **Chưa merge vào main** (chờ user quyết — đang có việc chưa commit của 2 session song song). Branch sẵn sàng review/PR/merge.
