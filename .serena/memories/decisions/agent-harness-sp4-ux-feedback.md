# Decision: Agent Harness SP-4 — UX feedback (stream tool events + citations)

> Spec đầy đủ: `docs/superpowers/specs/2026-06-04-agent-harness-sp4-ux-feedback-design.md`.
> Trạng thái: **spec APPROVED (lead) + plan viết xong** — `docs/superpowers/plans/2026-06-04-agent-harness-sp4-ux-feedback.md` (8 task TDD). Chờ user chọn execution. **CHƯA implement.** FE sign-off đang mở (`comms/active/sp4-to-frontend-chat-touchpoints`).
> Liên quan: [[agent-harness-architecture]] · spec SP-1 §2 · comms `lead-to-sp4-frame-protocol`.

## Tóm tắt
SP-4 (L6) stream **tool-call events** (trace ✓/✗ + args tóm tắt) + **citations** ("Nguồn: …") ra chat UI; giữ streaming nguyên vẹn, fail-soft. Nối `onEvent` (đã có ở `makeDispatch`, route **chưa truyền**) → frame. Module frame chung **`src/lib/chat/frames.ts`** (SP-4 sở hữu; SP-2 dùng `t:"pending_write"`).

## Decision log
- **D-SP4-1:** Gộp (multiplex U+001E) nay; Trực tiếp = stretch, nâng **thuần server** (protocol+FE bất biến theo thời điểm). SSE riêng: loại. *(user duyệt 2026-06-05)*
- **D-SP4-2:** Envelope cặp U+001E; `splitFrames` **nuốt-ẩn frame đuôi một-phần per-chunk**; `encodeFrame` đường phát duy nhất. *(verified độc lập)*
- **D-SP4-3:** Redaction theo **set membership `INTERNAL_TOOLS`** (server), KHÔNG prefix; prefix chỉ mỹ thuật. *(verified — vá rò cred nếu connector lỡ tên `laam_*`)*
- **D-SP4-4:** Citations từ **`convo`** (không `ToolEvent`) — verdict A1; `ToolEvent` giữ nguyên.
- **D-SP4-5:** Ghép call↔result bằng counter `c` tầng frame (không phụ thuộc ordering SP-1).
- **D-SP4-6:** Ephemeral nay; **bền qua `chat_tool_call` của SP-3** (đọc sau, read-only seam).
- **D-SP4-7:** Write event qua `onEvent` (lead duyệt Cải tiến #2 SP-2) — không phát thủ công.

## Trạng thái review
- ✅ **Lead ACK xong** (migrate token-frame; spec SP-1 §2 drift lead đã sửa; bless D-SP4-2/D-SP4-3) — `comms/active/lead-to-sp4-frame-protocol` line 92-108.
- ✅ **Lead spec review:** **APPROVED** (clear to writing-plans, minor coordination) — `comms/active/lead-to-sp4-spec-review`. Pass review độc lập (sp4 dispatch) fold thêm 4 tightening (type/test/“398”/attachment) — **đã sửa spec**. 0 Critical.
- 🟠 **Chốt ở writing-plans:** FE sign-off 3 điểm chạm `components/chat/*`; **`frames.ts` 1 nguồn** (land order ↔SP-2, thread `sp2-to-sp4-frames`); type `pending_write.fields` ↔SP-2; **suspend-flush** `toolFrames` ↔SP-2; **chia sẻ extractor** convo ↔SP-3.

## Verify (agent-ops-rules)
Test thuần (frames/trace/components) + route mở rộng; baseline 398 xanh. Không tự chạy dev/build.
