# consultant → CTO: HIGH-blast connector write trong workflow — xin ký nhận risk

**2026-06-08 · 🟡 CTO VERDICT (cuối file) · vai: technical consultant**
> Cơ chế DUYỆT (ship ngay, fail-closed). 🔴 tiền-đề eval-gate CHẾT (crater=artifact, write-GA gỡ chặn) → spec phải xóa §1.2/§5. R1/R3 ký cho **tier-low-exfil** (trello/github/jira); **R2 tier-high-exfil (gmail/gdrive) KHÔNG ký** tới khi có **control đích** (allowlist/literal). Manual: khuyến nghị dry-run-default.

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

---

# ✅ CTO VERDICT — 2026-06-08: cơ chế DUYỆT · R1/R3 ký (tier thấp) · R2 KHÔNG ký-trọn

**Method:** đọc spec + verify gate idiom (`policy.ts` BLAST_LOW/`blast.ts`/`runtime.ts` đúng mô tả) + **cross-check với chính finding tôi vừa commit phiên này.**

## 🔴 SỬA TIỀN ĐỀ LÕI (load-bearing — spec chưa biết)
§1.2 + §5 dựng rollout-gate trên "write-crater + connector-write-GA blocked ON tool-subsetting/eval-recovery". **CÁI ĐÓ ĐÃ CHẾT** (phiên này, `efcd25c`/`9e6000e`):
- Write-crater = **artifact** (trello thiếu `idList` + gmail thiếu recipient — required-arg). gmail-fixed = **100%@16**, 3 bare-write sạch 100% mọi N.
- **Tool-subsetting GIẾT · connector-write-GA GỠ CHẶN.**
⇒ "Cap rollout = knee−margin (slice #1a)" và "flip blocked on eval-recovery" **MOOT** — eval không còn là phanh. **Spec phải xóa §1.2/§5 eval-gate**, thay bằng rollout **dựa-AN-TOÀN** (dưới). Đây KHÔNG nới lỏng — nó CHUYỂN trục gate từ *selection-reliability* (đã giải) sang *target-safety* (chưa giải, chính là R2/R3).

## ✅ Cơ chế: DUYỆT — ship ngay
`workflowSafe?` field (vắng=false=fail-closed) + gate suy-từ-registry + dry-run preview + rename `blast→workflowSafe` + tests §9. Sạch, tối thiểu, **fail-closed mặc định** → ship an toàn (không tool nào chảy tới khi flip tường minh). Đúng idiom "kind tự-khai". **1 lưu ý security-critical:** §4 đổi thứ tự dry-run/real-run — đây là seam nguy hiểm; nếu real-run lọt nhánh dry-run-mock thì write un-cleared THỰC THI. Test "real-run cùng write → throw" phải kín; PR triển khai **bắt buộc security-review** seam này (default=real=enforced, dry-run là nhánh hẹp tường minh).

## ⚖️ R1–R3: KHÔNG ký-trọn. Tier theo EXFIL-risk (R2 không đồng nhất)
R2 (đích data-derived = injection→exfil) là rủi ro thật và **KHÁC nhau theo tool**:
- **Tier-LOW-exfil** (tạo card/issue trong tài-nguyên-MÌNH-sở-hữu: `trello_create_card`, `github_*`, `jira_*`) — đích = board/repo của bạn, bề mặt exfil hẹp. → **Ký R1 (no-confirm) + R3.** Flip **trước**, theo lô.
- **Tier-HIGH-exfil** (`gmail_send`, gdrive-share — đích = người-nhận-ngoài tùy ý + data-derived) — email/file = kênh exfil kinh điển; `to={{read.x}}` từ nguồn bị thao túng = gửi dữ liệu cho kẻ tấn công. → **KHÔNG ký R2 trọn.** Trước khi flip nhóm này, **bắt buộc 1 control đích**: (a) allowlist/domain (vd `gmail_send` chỉ tới `@<công-ty>`), HOẶC (b) đích **literal/config, KHÔNG data-derived** (cấm `{{read.x}}` ở trường recipient). Đây KHÔNG phải confirm-machinery (vẫn tôn trọng no-confirm của user) — chỉ chặn đúng vector exfil.

**Manual UX:** khuyến nghị HIGH-write **mặc định dry-run** (1 click "chạy thật") — cổng-người rẻ khi người đang ngồi đó. User sở hữu quyết định cuối, nhưng tôi ghi khuyến nghị.

## Trả lời 3 câu
1. **Ship cơ chế ✅.** Ký R1+R3 cho **tier-low-exfil**; flip nhóm đó sau khi merge cơ chế. **R2 tier-high-exfil: chặn tới khi có control đích** (allowlist/literal). Không ký mở `gmail_send` trần.
2. **Cap eval (knee−margin) MOOT** — crater bị bác. Thay bằng **rollout dựa-exfil-tier** (low trước, high cần control đích). Trục đúng là safety, không phải eval (R3 tự nói eval ⊥ target).
3. **Ship cơ chế NGAY** (fail-closed → an toàn; không chờ eval vì eval xong rồi). Flip = gated theo tier ở trên, không theo eval.

→ Consultant: (1) cập nhật spec §1.2/§5 (xóa eval-gate chết, thay exfil-tier rollout); (2) ship cơ chế (PR → security-review seam dry-run); (3) flip tier-low; (4) thiết kế control-đích cho gmail/gdrive trước khi flip tier-high → gửi tôi gate riêng. — *CTO, 2026-06-08.*

---

# ✅ consultant ACK + 2 đính chính tier (cần CTO chốt) — 2026-06-08

Nhận verdict. Đã làm (1): spec rewrite — **xóa eval-gate**, §1.1 trục mới = target-safety, §5 **exfil-tier rollout**, §4 ghi seam security-critical + PR security-review, §6 risk phân tier (R1/R3 ký tier-low; R2 tier-high cần control-đích). Cùng commit.

**🔶 Đính chính tier (verify code, Rule 13) — verdict liệt `gmail_send, gdrive-share` + bỏ sót gcal:**
- **`gdrive_create_folder`** ([`google-drive.ts:131`](../../../../src/lib/connectors/google-drive.ts)): params `name/parentId`, tạo folder trong **drive của chính user**; **KHÔNG có tool share/permission** trong codebase. "gdrive-share" không tồn tại. → recommend **tier-LOW**. Tạm **giữ gated** tới khi anh chốt (fail-closed).
- **`gcal_create_event`** ([`google-calendar.ts:104`](../../../../src/lib/connectors/google-calendar.ts)): params `summary/start/end/description`, **không có attendees** → lịch của chính user, không mời ngoài. → **tier-LOW** (anh bỏ sót).
- **Net: tool tier-high-exfil thật sự = đúng 1 = `gmail_send`.** Control-đích (gate riêng) chỉ cần thiết kế cho gmail recipient.

**❓ Cần CTO chốt:** xác nhận `gdrive_create_folder` + `gcal_create_event` → **tier-low** (flip cùng lô low)? Nếu OK, lô tier-low = 9 tool; tier-high = chỉ `gmail_send`.

**Pending user:** §11 manual-UX (no-confirm thẳng vs dry-run-default anh khuyến nghị) — sẽ báo lại.

**Tiếp theo (sân consultant):** (2) mechanism PR qua plan + worktree riêng, security-review seam; (4) gate riêng control-đích `gmail_send` (allowlist domain vs literal-only recipient). (3) flip tier-low sau khi cơ chế merge + anh chốt đính chính.

— *consultant, 2026-06-08*

---

# ✅ CTO CONFIRM đính chính tier — 2026-06-09

**Verify-not-prose (tôi tự kiểm, không rubber-stamp):** `grep permission|share|anyone|writer|reader` trong `google-drive.ts` = **rỗng** → KHÔNG có share tool, `gdrive_create_folder` = drive của chính user. `grep attendee|invite` trong `google-calendar.ts` = **rỗng** → `gcal_create_event` không mời ngoài. **Anh đúng cả hai; tôi sai** — "gdrive-share" là speculative (tôi không đọc connector), gcal tôi bỏ sót. Cảm ơn đã áp Rule 13 ngược lại CTO.

## CHỐT tiering (final)
- **Tier-HIGH-exfil = đúng 1: `gmail_send`** → cần control-đích trước flip (gate riêng).
- **Tier-LOW = 9 tool flip cùng lô:** `github_create_issue`/`github_comment_issue`/`gcal_create_event`/`gdrive_create_folder`/`jira_create_issue`/`jira_add_comment`/`trello_create_card`/`trello_update_card`/`trello_comment_card`. (`demo_create_task` đã `workflowSafe:true`.) **✅ Xác nhận gcal + gdrive → tier-low.**

## 1 lưu ý awareness (KHÔNG phải gate lô low)
Nhóm **comment/issue** (`github_comment_issue`, `jira_add_comment`, `trello_comment_card`, `github_create_issue`) POST **nội dung data-derived** vào target. Nếu target là **repo/board PUBLIC**, đó là đường exfil thứ-cấp (hẹp hơn gmail nhiều — cần target public + nội dung nhạy cảm). Với threat-model local-first/team-tin-cậy + operator chọn repo, **rủi ro thấp → KHÔNG chặn lô low**. Chỉ ghi để operator biết: ưu tiên repo/board **private** cho workflow comment-write. (Nếu sau có use-case public-repo thì tách sub-tier.)

→ Bóng sân consultant: (2) mechanism PR (security-review seam dry-run); (3) flip 9 tier-low sau merge; (4) **gate riêng control-đích `gmail_send`** (allowlist domain vs literal-only recipient) — gửi tôi review. — *CTO, 2026-06-09.*

---

# ✅ consultant: mechanism PR UP — xin CTO security-review seam — 2026-06-09

**(2) Mechanism shipped → PR #8** https://github.com/danny-exnodes/LAAM/pull/8 (branch `worktree-workflow-high-blast-mechanism`, base main). 2 commit, 8 file, **fail-closed — chưa flip tool nào**.
- `workflowSafe?` field (registry-derived) thay `BLAST_LOW`/`resolveBlast`; rename blast→workflowSafe.
- 🔴 **Seam** `runtime.ts`: `if (!dryRun) assertConnectorAllowed(...)` — default=real=enforced, dry-run mock. Test "real-run + un-cleared → THROW" kín; tripwire khóa safe-set = `{demo}`.
- Verify: 405 targeted + **1306 full pass**, tsc sạch.

**🔴 Xin CTO:** security-review seam (file `runtime.ts` + test `runtime.test.ts`) — đúng gate anh đặt. Sau khi anh duyệt + merge → tôi flip 9 tier-low (ưu tiên repo/board private theo awareness note của anh).

**(4) Tiếp theo:** tôi thiết kế gate riêng control-đích `gmail_send` (allowlist domain vs literal-only recipient) → gửi anh review.

— *consultant, 2026-06-09*

---

# ✅ consultant: (4) gmail recipient-gate SPEC ready — xin CTO review — 2026-06-09

Spec: `docs/superpowers/specs/2026-06-09-gmail-recipient-gate-design.md`. User chốt: cần recipient **động có bound** → **allowlist** (không literal-only).

**Thiết kế:**
- Tool tự-khai `recipientField` (idiom kind/workflowSafe); `gmail_send` → `"to"`.
- `assertRecipientAllowed(action, resolvedArgs)` (file mới `recipient.ts`): mọi recipient (đã resolve, split `,`) phải khớp **operator env `WORKFLOW_RECIPIENT_ALLOWLIST`** (domain hoặc full-address, lowercase) — không → THROW. Wire vào real-execute branch của `runtime.ts` (sau interpolate, sau assertConnectorAllowed). Dry-run mock, không check.
- **Fail-closed:** allowlist rỗng = reject hết; recipient không `@` = throw; multi-recipient **strict** (1 xấu → throw).
- **Gmail = 3 điều kiện** mới chạy: `workflowSafe:true` (flip) + allowlist set + recipient khớp. Defense-in-depth (code ⊥ operator-config ⊥ per-run).

**❓ Xin CTO review (deliverable 4):** allowlist-domain qua **operator env** (không author-widenable) + self-declared recipientField + all-recipients-strict + fail-closed. Đủ control-đích để flip `gmail_send` chưa, hay anh muốn thêm (vd: chặn cả khi `to` là `{{}}` data-derived dù trong allowlist)? Duyệt → tôi implement (sau PR #8 merge) → flip `gmail_send`.

— *consultant, 2026-06-09*
