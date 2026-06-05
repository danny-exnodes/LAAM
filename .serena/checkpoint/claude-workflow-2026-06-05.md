# Checkpoint: claude-workflow (technical consultant) — 2026-06-05

## What was done
- Brainstorming **có phản biện** (3 vòng review user) cho feature MỚI **AI Workflow Orchestration** (chạy song song Harness roadmap).
- Boot Protocol đầy đủ (INDEX → harness memories → checkpoint `claude-harness-06-05` → `schema.ts` → `orchestrator/types/policy`).
- Chốt 8 nhóm quyết định (D-RUNTIME/ENTITY/TOPOLOGY/STATE + #3 safety + blast-radius + scheduler + snapshot + phasing). **User đã KÝ.**
- Viết spec đầy đủ + decision memo + cập nhật INDEX.

## Files changed (KHÔNG đụng code, KHÔNG chạy service)
- `docs/superpowers/specs/2026-06-05-ai-workflow-orchestration-design.md` (MỚI — spec đầy đủ, 5 PIN dạng chữ).
- `.serena/memories/decisions/workflow-orchestration-architecture.md` (MỚI — pointer + chốt).
- `.serena/memories/INDEX.md` (+1 pointer Decisions).
- `.serena/checkpoint/claude-workflow-2026-06-05.md` (file này).

## Current state
- Spec **signed**, đang chờ **user đọc một lượt** trước khi A0 chạm code (user yêu cầu rõ: D1/D3 phải ở dạng chữ trong spec — đã có, đánh dấu PIN).
- Verify factual: `runToolRounds` phẳng `maxRounds=4` **KHÔNG** sub-agent. **Pushback của reviewer chứa 1 claim sai (sub-agent fan-out); consultant verify `orchestrator.ts` & sửa**; bounding reframe theo `foreach`×inference.

## Next steps
- User đọc spec → OK → `superpowers:writing-plans` tạo plan **A0**.
- A0 = slice mỏng (manual + 1 agent + 1 connector + run_step + SSE). **PIN-D3a (connector args non-string) cắn ngay A0.**

## Blockers / Risks
- Phase B đụng luật **no-background-services** (Windows Task poke) → phải xin phép user trước khi cài.
- **PIN-D1** (atomic claim cửa-tử) + **PIN-D3** (type nội suy) = loại đúng-sơ-đồ-sai-code; phải có test đúng.
- 5 PIN mới ở spec, **chưa vào plan/code**.

## Update — CTO audit post-sign-off (vá F1–F4, 2026-06-05)
- CTO audit spec sau ký (comms `cto-to-consultant-workflow-spec-audit`). Verify code thật (`gate.ts`/`resume.ts`/`preview.ts`) — **CTO đúng cả 4**.
- **F1 🔴 → (a):** bỏ claim tái-dùng-`gate.ts`; v1 workflow = `BLAST_LOW`-only (scheduled+manual); manual-`BLAST_HIGH` → §10 (PIN-6 suspend-continue + ngoại lệ D4b). Chặn *plan Phase B*, KHÔNG chặn A0.
- **F2 🟡:** sửa lý do no-resume (harness ĐÃ có nonce `resume.ts:56-58`; v1 hoãn resume-cấp-run cần idempotency per-node).
- **F3 🟡:** thống nhất memo+checkpoint (reviewer pushback có claim sai, consultant sửa — không đổ lỗi consultant/user).
- **F4 🟡:** +§6.4 owner-lifecycle. **Finding:** `users` chưa có cột `active`/`disabled` → cred-missing enforce ngay, user-deactivate cần flag.
- Vá: spec (§3.4/§5.4/§6.4/§7/§10/§11) + memo + checkpoint này. **KHÔNG đụng code.** Đã append phản hồi vào comms file → chờ CTO review → `resolved/`.

## Update — Plan A0 viết xong + HOLD cho CTO (2026-06-05)
- `writing-plans` → `docs/superpowers/plans/2026-06-05-ai-workflow-a0.md` (8 task TDD: types→schema→interpolate→validate→executors→engine→run/routes→E2E host). Đọc thật `route.ts`/`connectors/index`/`events-bus`/`registry`/`orchestrator.test` để code đầy đủ, không placeholder. Verify quirk: `runToolRounds` break KHÔNG trả text cuối → agent executor gọi `callOllama(convo,[])` lần cuối.
- DI khắp nơi → Task 1–7 build+test KHÔNG cần host; chỉ migrate (Task 2.4) + E2E (Task 8) là host (agent-ops).
- **Item MỚI surface cho CTO (không thuộc F1–F4):** **PIN-D3a-sink** — object embedded: sink text=stringify (agent prompt), sink arg=fail (connector arg); sole-token giữ type. Đã append vào comms.
- **User chọn HOLD cho CTO** → A0 chưa execute. Chờ CTO ký F1–F4 + chốt PIN-D3a-sink.

## Update — CTO CLEAR cả 2 gate + refinement land (2026-06-05)
- CTO ký F1–F4 (verify file thật) + duyệt PIN-D3a-sink **với 1 refinement bắt buộc**: `resolveTemplate(text)` = **total→string** (kể cả sole-token; stringify MỘT chỗ trong interpolate), KHÔNG giữ-type ở text sink; `arg` sink sole-token giữ type. (A2) condition = arg-sink.
- Verify refinement đúng (single-responsibility stringify) rồi áp: spec §5.2 reword + plan Task 3 (interpolate sink-split + header/doc-comment + 2 test mới text-sink) + Task 5 (`runAgentNode` dùng string thẳng) + nit §3.4 (gate land Phase B).
- Comms thread → `comms/resolved/cto-to-consultant-workflow-spec-audit.md`.

## Next — HẾT HOLD
- Chờ user chọn execution mode (subagent-driven khuyến nghị) → isolate worktree → chạy plan A0 task-by-task. Task 1–7 không cần host; Task 2.4 (migrate) + Task 8 (E2E) là host (user).
