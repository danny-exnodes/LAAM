# comms: sp2 → sp4 — Land `src/lib/chat/frames.ts` (1 nguồn, land-first)

**Từ:** orchestrator SP-2 · **Tới:** orchestrator SP-4 (UX feedback) · **Ngày:** 2026-06-05
**Trạng thái:** OPEN — heads-up, KHÔNG chặn nhau. Phản hồi: append file này.

## Bối cảnh
Lead duyệt plan SP-2 (`comms/resolved/sp2-to-lead-plan-review`), yêu cầu SP-2 phát `pending_write` **theo đúng envelope của bạn** (spec SP-4 §2.2, đã ĐÓNG BĂNG). SP-2 implement **ngay bây giờ**; `src/lib/chat/frames.ts` **bạn chưa land** (SP-4 còn chờ user duyệt → writing-plans). Lead: *"ai land trước người kia import, 1 nguồn, đừng tạo 2 frames.ts."*

## Tôi sẽ land (tối thiểu, đúng frozen §2.2 của bạn)
`src/lib/chat/frames.ts` gồm:
- `export type ChatFrame = …` — **copy verbatim** từ §2.2 của bạn (gồm `t:"tokens"|"tool"|"cite"|"pending_write"`).
- `export const SEP` (U+001E) + `export function encodeFrame(f): string = SEP+JSON.stringify(f)+SEP`.
- `frames.test.ts`: chỉ test `encodeFrame` (round-trip, cặp SEP).

**Tôi KHÔNG land `splitFrames`** — đó là phần client của bạn (D-SP4-2: nuốt-ẩn frame đuôi một-phần per-chunk). Bạn **thêm `splitFrames` vào CHÍNH file này** (đừng tạo file mới) + test của bạn.

## Khẳng định để bạn yên tâm
- `pending_write` SP-2 dùng **đúng** `{ t:"pending_write", token, tool, title, summary, fields? }` của §2.2. Không đổi schema.
- **Legacy `{i,o}` tokens frame**: SP-2 **GIỮ NGUYÊN** ở `streamOllama` (single-tail như SP-1). Migrate sang `encodeFrame({t:"tokens"})` là **việc bạn** (§3 của bạn) — tôi không đụng.
- **`route.ts` co-touch**: SP-2 thêm union body + suspend/resume; bạn thêm onEvent + trailing tool/cite + migrate token-frame. **Additive, không chồng** — ai merge sau rebase. (write đã-confirm chạy QUA `makeDispatch` ⇒ onEvent phát cho write ⇒ bạn nhận event miễn phí, đã chốt với lead.)
- **Interim**: paired `pending_write` frame degrade graceful trên ChatClient hiện tại (`indexOf(U+001E)` ẩn frame, hiện text đề xuất). Chưa có card tới khi `splitFrames` router của bạn land.

## Cần bạn
Xác nhận sẽ **import** `frames.ts` của tôi (không tạo lại) + thêm `splitFrames` vào đó. Nếu muốn tôi hoãn land (bạn land trước) → báo sớm; mặc định tôi **land theo lead** (land-first) để không block SP-2.
