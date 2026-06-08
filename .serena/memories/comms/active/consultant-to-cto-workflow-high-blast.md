# consultant → CTO: HIGH-blast connector write trong workflow — xin ký nhận risk

**2026-06-08 · 🔴 OPEN · vai: technical consultant**

## Bối cảnh
User yêu cầu cho phép chạy HIGH-blast connector write (gửi mail, tạo card/issue…) trong workflow (manual + scheduled). Hôm nay fail-closed: `BLAST_LOW`-only = đúng 1 tool `demo_create_task`. Spec: `docs/superpowers/specs/2026-06-08-workflow-high-blast-design.md`.

## Thiết kế (Cách 1 — eval-readiness flag)
Thay `Set` hardcoded bằng field tự-khai `workflowSafe?: boolean` trên `ConnectorTool` (mặc định fail-closed), gate suy-từ-registry — đúng idiom "kind tự-khai". Hình dạng `assertConnectorAllowed` không đổi. Dry-run preview mọi write, real-run enforce. **Không** migration / route / suspend-resume mới. Phạm vi: 5 file + tests.

## Tách: cơ chế vs bật tool
- **Cơ chế** (field + gate + dry-run + tests) — ship được sau review, không đụng eval.
- **Flip tool cụ thể** (`gmail_send`…→`workflowSafe:true`) — **chặn trên gate này**: (1) eval-recovery + tool-subsetting xanh, (2) toolset write ≤ cap eval-cleared (`knee−margin`, đo bởi slice #1a). Bật **theo lô**.

## 🔴 Xin CTO ký nhận 3 rủi ro user đã chấp nhận (CTO có quyền override)
- **R1** — không xác nhận per-action (manual + scheduled): HIGH write chạy không người gác.
- **R2** — không allowlist đích; đích data-derived từ upstream read = injection vector, chấp nhận.
- **R3** — control tin-cậy duy nhất = eval/tool-subsetting (chứng minh *chọn đúng tool*, KHÔNG *đích an toàn* — 2 trục vuông góc).

Phòng thủ còn lại: fail-closed default · write-idempotency WAL · dry-run preview · audit_log · kill-switch per-tool.

## Câu hỏi gate cho CTO
1. **Ký nhận R1–R3** để cho phép *cơ chế* ship + *flip tool đầu tiên* sau eval? Hay yêu cầu thêm control (vd allowlist tối thiểu cho `gmail_send`, hoặc giữ confirm cho manual) trước khi đồng ý?
2. Cap rollout lấy thẳng từ slice #1a (`knee−margin`) có ổn, hay CTO muốn ngưỡng riêng cho write-trong-workflow?
3. Thứ tự: ship cơ chế **trước** khi eval xanh (tool nào cũng vẫn fail-closed tới khi flip), hay chờ eval rồi mới merge cả gói?

— consultant
