# Coordination: Agent Harness (cho các session song song)

**Nguồn chân lý:** `docs/superpowers/specs/2026-06-04-agent-harness-architecture.md`
+ decision [[agent-harness-architecture]]. Roadmap đã chốt.

**SP-1 Foundation: ✅ ĐÃ IMPLEMENT** (branch `worktree-agent-harness-sp1`, 8 commit, 398 test pass, build xanh, READY TO MERGE — chưa merge, chờ user). Spec `docs/superpowers/specs/2026-06-04-agent-harness-sp1-foundation-design.md` + plan `docs/superpowers/plans/2026-06-04-agent-harness-sp1-foundation.md`. **Hợp đồng §2 spec (`src/lib/agent/types.ts`) là cái SP-2/3/4 trích dẫn** — giờ đã có code thật: `Tool/ToolContext/ToolEvent`, `makeDispatch` (chokepoint), `runToolRounds` (orchestrator), `INTERNAL_TOOLS`+`modelToolSchemas`, `guard/validateArgs/boundOutput`, 5 tool `laam_*`.
- SP-1 đã đụng `src/app/api/chat/route.ts` (refactor: bỏ runToolRounds cục bộ, dùng `src/lib/agent/*`) + thêm `src/lib/agent/**` + xoá `tool-loop.test.ts` (migrate sang `orchestrator.test.ts`). **KHÔNG** đụng `components/chat/*`, schema, connectors.
- ⚠️ Ai đang sửa `src/app/api/chat/route.ts` ở session khác: branch SP-1 đã refactor file này — rebase/merge cẩn thận.

## Cảnh báo file dùng chung — đừng giẫm chân
- 🟠 **`src/app/api/chat/route.ts`** — SP-1 sẽ **refactor** route này (tách orchestrator ra `src/lib/agent/*`, route co thành adapter mỏng). Ai sửa `/api/chat` trước khi SP-1 chạy → báo để đồng bộ.
- 🟠 **`src/components/chat/*`** — SP-4 (UX feedback: stream tool events) sẽ đụng. **Session responsive FE** nếu sửa chat UI → ghi chú lại; SP-4 làm sau, sẽ rebase theo FE.
- 🟢 **Connectors (`src/lib/connectors/*`)** — **GIỮ NGUYÊN** (quyết định D1). Không viết lại.
- 🟢 Không đụng Dockerfile/compose (session docker sở hữu). Harness không cần thay hạ tầng.

## Nhắc vận hành
- Theo [[agent-ops-rules]]: không tự chạy ngầm dev/build/docker; verify bằng test thuần + targeted reads.
- Khi bắt tay SP-1: tạo spec sâu riêng → writing-plans → (worktree nếu cần) → TDD. Success criteria SP-1 ở §4 của roadmap.
