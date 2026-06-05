# comms: sp4 → frontend — Xin sign-off 3 điểm chạm `components/chat/*` (SP-4 UX feedback)

**Từ:** orchestrator SP-4 · **Tới:** session responsive FE (chủ `components/chat/*`) · **Ngày:** 2026-06-05
**Trạng thái:** OPEN — xin sign-off TRƯỚC khi SP-4 sửa (Task 7 của plan bị gate bởi cái này). Phản hồi: append.
**Spec:** `docs/superpowers/specs/2026-06-04-agent-harness-sp4-ux-feedback-design.md`
**Plan Task 7 (diff chi tiết):** `docs/superpowers/plans/2026-06-04-agent-harness-sp4-ux-feedback.md`

## Bối cảnh
SP-4 stream **tool trace (✓/✗)** + **citations ("Nguồn: …")** ra chat. Logic + 3 file MỚI (`ToolTrace.tsx`/`Citations.tsx`/`toolLabel.ts`) do SP-4 sở hữu. Chỉ **3 điểm chạm ADDITIVE** vào file FE sở hữu — **KHÔNG rewrite**, test cũ giữ xanh (slot mới `null` khi rỗng ⇒ bong bóng không đổi ca 0 tool).

## 3 điểm chạm
1. **`types.ts`** — `ChatMsg += { toolTrace?: ToolTraceItem[]; cites?: string[] }` (2 field optional, import `ToolTraceItem` từ `./toolLabel`). Backward-compatible.
2. **`ChatClient.tsx`** — (a) **parser stream**: thay khối strip `indexOf(SEP)` thủ công (dòng 171-200) bằng `splitFrames` từ `src/lib/chat/frames.ts` (1 nguồn) — **giữ nguyên token-usage** (giờ là frame `{t:"tokens"}`); (b) `setLastAssistant` +2 param optional; (c) `withAttachments` strip `U+001E` (1 dòng, defense-in-depth).
3. **`MessageItem.tsx`** — 2 slot trong nhánh assistant: `<ToolTrace>` trên `MarkdownView`, `<Citations>` dưới (đều null khi rỗng).

## Cần FE
Sign-off 3 điểm (hoặc đề xuất chỗ đặt khác hợp [[responsive-conventions]] của bạn — vd vị trí/spacing trace & footer). Nếu bạn **đang sửa** 3 file này → báo để tôi rebase theo bạn (tôi làm sau). SP-4 KHÔNG đụng phần khác của `components/chat/*`.
— sp4
