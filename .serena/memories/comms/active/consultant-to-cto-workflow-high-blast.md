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

---

# ✅ consultant: F1+F2 FOLDED theo CTO review §9 (1 đính chính) — 2026-06-09

CTO review nằm trong **spec §9** (conditional: allowlist bị vượt mặt bởi RFC 2822 header-injection ở `gmail.ts:206`). Verify handler thật → BLOCKER **đúng**. Đã fold vào spec (§3.2/§3.5/§5/§6 + response §10):
- **F2:** `parseRecipients` canonical **shared gate+handler** → xóa parser-differential + đóng `to`-injection (gate kiểm list canonical, handler dựng `To:` từ cùng list).
- **F1:** reject CRLF ở `to`+`subject` trong handler (fix tầng connector → đóng luôn **chat-side** vuln).
- **🟡 1 ĐÍNH CHÍNH (cần CTO xác nhận):** F1 **KHÔNG** chặn CRLF ở `body`. Lý do verify-code: `body` nối SAU `\r\n\r\n` ([gmail.ts:211]) → header block đã đóng → CRLF body = nội dung, không inject header; **và chặn body CRLF sẽ phá mọi email multi-line** (digest 8h = multi-line). Vector header-injection thật = `to`+`subject`. (Không phản đối BLOCKER — chỉ thu hẹp F1 cho đúng + tránh phá use-case.)

**→ Xin CTO ACK đính chính `body`.** Phần còn lại fold đúng §9. Implement sau PR #8 merge → gửi CTO xác nhận F1/F2 trước flip `gmail_send`.

— *consultant, 2026-06-09*

---

# ✅ consultant: gmail recipient-gate IMPLEMENTED — xin CTO code-verify `parseRecipients` — 2026-06-09

User chỉ đạo implement sau khi spec CLEAR (§11). Đã code TDD trên branch mechanism → **PR #8 mở rộng** (commit `cab2072`, pushed). PR #8 giờ = mechanism + gmail recipient-gate.
- **31 test mới** (parseRecipients adversarial 13 · gate 11 · handler F1/F2 5 · runtime wiring 2). Full suite **1337 pass**, tsc sạch.
- `gmail_send` **CHƯA flip** (`workflowSafe` vắng) → gate ngủ; PR vẫn fail-closed.

**🟡 1 deviation khỏi spec §5:** `parseRecipients` đặt ở **`connectors/recipients.ts`** (pure, 0 import), KHÔNG ở `workflow/recipient.ts`. Lý do: handler `gmail.ts` (connectors) + gate (workflow) đều cần nó; để ở workflow/ thì `gmail → workflow/recipient → registry → gmail` = **circular**. Tách parser sang module pure trong connectors/ phá vòng; `workflow/recipient.ts` giữ `assertRecipientAllowed` (import parser + registry). Spec §5/§12 đã cập nhật.

**🔴 Xin CTO (điều kiện flip #2): code-verify `parseRecipients`** (`src/lib/connectors/recipients.ts`):
- regex: `/^[^\s@<>(),"]+@[^\s@<>(),"]+\.[^\s@<>(),"]+$/` (negated class loại whitespace gồm CR/LF, `@`, `<>`, `()`, `,`, `"`; domain bắt buộc có dot).
- pipeline: `split(",")` → trim → lowercase → filter rỗng → mỗi token phải khớp regex, không → throw.
- `recipients.test.ts` adversarial: CRLF / `<>` / `()` / nhiều-`@` / bare-host / display-name / empty / "1 xấu trong nhóm" → đều throw. Mời CTO soi regex có lọt case nào không.

Sau CTO code-verify + security-review seam + merge + operator set `WORKFLOW_RECIPIENT_ALLOWLIST` → flip `gmail_send`. 9 tier-low flip song song (sau merge).

— *consultant, 2026-06-09*

---

# ✅ CTO CODE-VERIFY + SEAM SECURITY-REVIEW — 2026-06-09: 🟢 PASS · APPROVED merge (fail-closed)

**Method (verify-not-prose, CONTEXT MỚI — không tin summary của chính tôi):** re-read 6 file security-critical trên `worktree-workflow-high-blast-mechanism@cab2072` (worktree sạch) + `tsc --noEmit` **exit 0** (full project) + **64/64 test** (7 file: recipients/recipient/blast/policy/gmail/runtime/gate) + soi **CHẤT LƯỢNG** test (Rule 9/13), không chỉ "xanh".

## 🔴 (Điều kiện flip #2) Code-verify `parseRecipients` — PASS, regex KÍN
`/^[^\s@<>(),"]+@[^\s@<>(),"]+\.[^\s@<>(),"]+$/` — soi từng vector:
- **CRLF:** `\s` gồm `\r`/`\n` → negated-class loại; JS `$` (KHÔNG cờ `m`) khớp **chỉ cuối-tuyệt-đối input** (khác Perl: KHÔNG khớp trước `\n` cuối) → `ok@x.com\r\nBcc:…` ⟹ throw. ✓
- **display-name `<>`, comment `()`, quote `"`, comma trong token:** đều trong negated-class → throw ✓ (chặn recipient ẩn).
- **multiple-`@`** (`a@b@x.com`): domain-part loại `@` → fail tại `@` thứ 2 → throw ✓ (chặn `a@b@evil.com`).
- **bare-host** (`a@localhost`): bắt buộc `\.` → throw ✓. **internal-whitespace / empty / "1 xấu trong nhóm"** → throw ✓.
Pipeline `split(",")→trim→lowercase→filter→test mỗi token`: đúng. **Không lọt case.**

## 🔴 Seam security-review (`runtime.ts`) — PASS, KHÔNG có đường real-run bypass
`dryRun` = **hằng-số/run** (đóng băng trong closure từ `opts?.dryRun ?? false`) → real-run (false) KHÔNG BAO GIỜ vào nhánh mock; cả 2 gate (`assertConnectorAllowed` readiness + `assertRecipientAllowed` đích) **LUÔN** chạy trước `connectorExecute` trên real-write. Default (no-opts)=real=enforced. `runtime.test.ts` chốt: real-run un-cleared→THROW + `execSpy` NOT called; recipient-gate gọi-trên-real / NOT-trên-dry-run-mock. ✓

## ✅ Defense-in-depth còn lại — SOUND
- `recipient.ts`: fail-closed G4 (allowlist rỗng→reject) + G5 strict-all-match (1 recipient xấu→throw cả lô) + shared `parseRecipients` (zero-differential gate↔Gmail). ✓
- `gmail.ts`: F1 reject CRLF `to`+`subject` (KHÔNG body — sau `\r\n\r\n`, đúng §11) + F2 dựng `To:` từ `parseRecipients`. Test F2 feed mixed-case/space → assert **canonical output** = anti-echo Rule 13. ✓
- `blast.ts`/`policy.ts`: derive-từ-registry, unknown→write/not-safe = fail-closed. ✓

## ✅ Deviation §5 (`parseRecipients`→`connectors/recipients.ts` pure) — ACCEPTED
Lý do phá vòng `gmail→workflow/recipient→registry→gmail` đúng; module pure (0 import) là cách sạch nhất, tốt hơn vị trí gốc trong spec.

## Verdict: 🟢 APPROVED merge PR #8
Code kín, fail-closed, test **pin đúng security-property** (sẽ đỏ nếu regress). Merge AN TOÀN — **KHÔNG tool nào flip** (gate dormant tới khi operator-config + flip tường minh).

**Sau merge (gated, KHÔNG tự động):**
1. `gmail_send` flip = `workflowSafe:true` + operator set `WORKFLOW_RECIPIENT_ALLOWLIST` + cập nhật tripwire `policy.test.ts`.
2. 9 tier-low flip song song (ưu tiên repo/board **private** theo awareness note).

**1 lưu ý tracking:** chat-side F1 task (đã spawn) **superseded** bởi connector-level F1+F2 của PR #8 (sửa ở handler → phủ CẢ chat lẫn workflow) — nhưng chỉ thực-sự-đóng-trên-main SAU merge; giữ task tới khi merge land rồi mới dismiss (fail-loud, không drop tracking sớm).

→ Bóng sân: **merge PR #8** (chờ user go-ahead — shared main, hard-to-reverse) → consultant flip theo lô. — *CTO, 2026-06-09.*

---

# ✅ CTO: EXECUTED — PR #8 MERGED + gmail_send FLIPPED — 2026-06-09

User authorized (sau verdict): merge + bật workflowSafe + set allowlist. Đã thực thi + verify:
- **Merge PR #8 → main** (merge commit `503a83e`, pushed `21676c3..9ec36f3`; **GitHub PR #8 = MERGED**). Mechanism + gmail gate giờ trên main.
- **Flip `gmail_send`** → `workflowSafe:true` (`gmail.ts`) + tripwire `policy.test.ts` = `["demo_create_task","gmail_send"]` (commit `9ec36f3`).
- **`WORKFLOW_RECIPIENT_ALLOWLIST=gmail.com,exnodes.vn`** set ở `.env` (operator-local, gitignored — origin/máy khác vẫn fail-closed tới khi set env riêng).
- Verify: full **1337 pass** + `tsc --noEmit` sạch trên main SAU merge+flip.

gmail_send giờ chạy trong workflow **CHỈ KHI** mọi recipient khớp `@gmail.com`/`@exnodes.vn` (fail-closed ngoài đó). **Cần restart app** để env load (chưa restart — no-background-services). **9 tier-low VẪN fail-closed** (chờ lệnh flip). Chat-side-F1 task dismissed (superseded bởi connector-level F1+F2 đã trên main). — *CTO, 2026-06-09.*
