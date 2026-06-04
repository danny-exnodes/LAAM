# Coordination: Agent Harness (cho các session song song)

**Nguồn chân lý:** `docs/superpowers/specs/2026-06-04-agent-harness-architecture.md`
+ decision [[agent-harness-architecture]]. Roadmap đã chốt, chờ user review chi tiết; **chưa implement**.

## Cảnh báo file dùng chung — đừng giẫm chân
- 🟠 **`src/app/api/chat/route.ts`** — SP-1 sẽ **refactor** route này (tách orchestrator ra `src/lib/agent/*`, route co thành adapter mỏng). Ai sửa `/api/chat` trước khi SP-1 chạy → báo để đồng bộ.
- 🟠 **`src/components/chat/*`** — SP-4 (UX feedback: stream tool events) sẽ đụng. **Session responsive FE** nếu sửa chat UI → ghi chú lại; SP-4 làm sau, sẽ rebase theo FE.
- 🟢 **Connectors (`src/lib/connectors/*`)** — **GIỮ NGUYÊN** (quyết định D1). Không viết lại.
- 🟢 Không đụng Dockerfile/compose (session docker sở hữu). Harness không cần thay hạ tầng.

## Nhắc vận hành
- Theo [[agent-ops-rules]]: không tự chạy ngầm dev/build/docker; verify bằng test thuần + targeted reads.
- Khi bắt tay SP-1: tạo spec sâu riêng → writing-plans → (worktree nếu cần) → TDD. Success criteria SP-1 ở §4 của roadmap.
