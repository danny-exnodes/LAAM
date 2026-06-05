# comms: lead → session FE — PICK UP: hoàn thiện FE Confirm-Card (write-gate UI)

**Từ:** lead (PM Agent Harness) · **Tới:** session responsive-FE (sở hữu `src/components/chat/*`) · **Ngày:** 2026-06-05
**Trạng thái:** 🟢 READY TO PICK — spec + plan đã viết, backend gate đã merge end-to-end. Phản hồi: append file này; resolve khi xong.

## Việc (1 câu)
Render **confirm-card** cho hành động *write* của agent (vd `trello_create_card`): khi `/api/chat` trả frame `pending_write`, hiện card (title/summary/fields + nút Xác nhận/Huỷ); bấm → `POST /api/chat {confirm}` → stream kết quả. Đây là **mảnh FE cuối** để luồng write dùng được trên trình duyệt.

## Tài liệu (đọc trước — Boot Protocol)
- **Spec (nguồn chân lý):** `docs/superpowers/specs/2026-06-05-fe-confirm-card-design.md`
- **Plan TDD (7 task):** `docs/superpowers/plans/2026-06-05-fe-confirm-card.md`
- Wire contract gốc: `backlog/agent-harness-sp2-fe-confirm.md` · SP-2 spec §7 · `decisions/responsive-conventions.md` (của BẠN — style card/nút theo đây).

## Vì sao gọn (đã verify trên main)
SP-4 **đã land frame-router** trong `ChatClient` (`splitFrames` + `applyFrames` xử lý `tokens`/`tool`/`cite`). `ChatFrame` **đã có** type `pending_write`. ⇒ chỉ cần **THÊM** nhánh `pending_write` vào `applyFrames` + 1 field `ChatMsg.pendingWrite` + component `ConfirmCard` + round-trip confirm (tái dùng stream helper, đổi body `{confirm:{token,approve},conversationId}`) + i18n. **Additive thuần.**

## Ràng buộc
- **Bạn sở hữu `components/chat/*`** — additive, KHÔNG rewrite frame-router của SP-4 (chỉ thêm 1 nhánh vào `applyFrames`). Giữ test FE cũ xanh (slot null khi 0 write).
- KHÔNG đổi backend / `frames.ts` / `trace.ts`. FE chỉ echo `token` (mờ), không parse. Token/execute/redact/audit = backend lo.
- agent-ops-rules: không tự chạy dev/build ngầm; verify bằng `vitest` + (nếu được phép) preview. Worktree riêng.
- Nếu bạn đang sửa `ChatClient/MessageItem/types` cho việc khác → đồng bộ trước (báo ở đây).

## Deliverable
Worktree riêng (vd `feat/fe-confirm-card`) → TDD theo plan 7 task → `vitest`(loại `.claude/worktrees`)+`tsc` xanh → commit → **reply comms này** (kết quả + test count) → cập nhật `backlog/agent-harness-sp2-fe-confirm` = done. Ready-to-merge thì xin lead review (như các SP khác).

## Success (tóm)
Write proposal → card hiện (không lòi JSON) · Xác nhận → execute + stream kết quả, card `done` · Huỷ → "Đã huỷ", card `cancelled` · không double-submit · 0 write → bong bóng nguyên vẹn.

→ **Pick lên + chạy.** Hỏi gì append ở đây.
— lead

---
### Phản hồi của FE: (append bên dưới)
