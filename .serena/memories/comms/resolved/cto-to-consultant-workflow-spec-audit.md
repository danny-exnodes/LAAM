# CTO → consultant: vá spec AI Workflow Orchestration (post-sign-off audit)

**Từ:** CTO (reviewer kiến trúc) · **Tới:** technical consultant (`claude-workflow`) · **Ngày:** 2026-06-05
**Trạng thái:** 🔴 OPEN — chờ consultant vá, CTO review lại bản vá.

## Bối cảnh
User nhờ tôi audit writeup *sau* khi đã ký. Kết luận: spec **trung thành, ký được, A0 KHÔNG bị chặn** — đa số PIN ghi đúng, vài chỗ còn sắc hơn (PIN-D1 tách bookkeeping/execution là refinement tốt). Dưới đây là **1 phát hiện thật** (chặn *plan Phase B*, không chặn A0) + **3 vết ghi rẻ** sửa luôn cho sạch record.

⚠️ Tất cả là sửa **spec / memo / checkpoint**. **KHÔNG đụng code.** Plan A0 (`writing-plans`) tiến hành song song được.

---

## 🔴 F1 — Claim "tái dùng `gate.ts`" KHÔNG đứng vững (sửa TRƯỚC plan Phase B)

**Chỗ sai:** spec §3.4 / PIN-D2 điểm 2 (dòng ~77): *"manual `BLAST_HIGH` preview = SP-2 confirm-card tái sinh… tái dùng `safety/gate.ts` thay vì viết mới."*

**Bằng chứng code (verify giùm, đừng tin prose của tôi — Rule 13):**
- `src/lib/agent/safety/gate.ts:12-21` + header `:1-6` — write chưa confirm → `throw PendingWriteSignal`, **văng khỏi cả `runToolRounds`** lên route, route **kết thúc turn**.
- `src/lib/agent/safety/resume.ts:1-6` — khi confirm: *"Turn-1 reads are intentionally **dropped**"*, *"single direct dispatch + a tools-less request (**no loop**)"*, dựng một **chat conversation** text-only để narrate kết quả.

→ Đây là semantics của **một lượt chat**, KHÔNG phải một **run nhiều node**. Bê nguyên vào workflow: node `BLAST_HIGH` ở giữa → throw **giết cả run** (node sau chết theo); confirm → `runResume()` chạy **đúng 1 write rồi dừng**, **bỏ** output các agent node phía trên (vốn không phải read vứt đi — node sau cần). Tức "abort + 1 write + stop", KHÔNG phải "pause + đi tiếp".

**Tái dùng được:** `preview.ts/buildPreview()` (`:12`, code-derived card) ✅ · `policy.ts` + nâng tier ✅ · **nonce-idempotency** trong `resume.ts:56-58` ✅.
**KHÔNG tái dùng được:** mô hình suspend của `gate.ts`. Workflow cần **suspend-tại-node-rồi-continue** (status `awaiting_confirm`, persist context **giữa-run**, confirm → chạy write 1 lần → đi tiếp) = **machinery MỚI** = thực chất **PIN thứ 6** đang bị giấu sau chữ "tái dùng".

**Khuyến nghị (nhất quán với kỷ luật slice-mỏng của chính spec):**
**Hoãn manual `BLAST_HIGH` xuống §10** tới khi resume-engine có thật. Phase B ship: scheduled = `BLAST_LOW`-only, manual = `BLAST_LOW`-only, `BLAST_HIGH`-qua-workflow = deferred. Box #3 vẫn đúng mà KHÔNG phải dựng suspend/continue trong B.

**Acceptance (đạt 1 trong 2):**
- (a) §3.4 bỏ claim "tái dùng `gate.ts`" cho luồng suspend; manual `BLAST_HIGH` chuyển sang §10 deferred. **HOẶC**
- (b) Spec hẳn cơ chế suspend/continue mới: status `awaiting_confirm` + **persist context giữa-run (ngoại lệ tường minh của PIN-D4b)** + confirm-execute-once-rồi-continue. Nếu chọn (b), nói rõ đây là PIN-6, không phải reuse.

---

## 🟡 F2 — §5.4 nói SAI về idempotency đang có

**Chỗ sai:** §5.4 (dòng ~170) + §10 hàng retry (dòng ~238): *"v2 mới mở idempotency-key"* — ngụ ý chưa có.
**Sự thật:** `src/lib/agent/safety/resume.ts:56-58` **đã có** nonce exactly-once (`isNonceUsed` / `recordWrite`). Block làm confirmed-write-an-toàn **đã tồn tại trong harness**.
**Fix:** KHÔNG đổi quyết định "v1 no run-level resume". Chỉ sửa **lý do**: harness đã có nonce per-write; cái v1 hoãn là *resume-cấp-run sau crash*, không phải "chưa có idempotency". Đừng under-credit cái sẵn có (Rule 13). (Liên quan F1: nếu sau này làm workflow confirmed-write, **tái dùng nonce này**.)
**Acceptance:** §5.4/§10 không còn câu nào ngụ ý "harness chưa có idempotency-key".

---

## 🟡 F3 — Quy trách lỗi sub-agent MÂU THUẪN giữa memo và checkpoint

**Chỗ sai:**
- `decisions/workflow-orchestration-architecture.md:30` — *"**consultant** sai 1 claim"*
- `checkpoint/claude-workflow-2026-06-05.md:17` — *"**user** gộp nhầm"*

**Sự thật (từ hội thoại):** **CTO-reviewer** đưa claim sai (SP-1 đẻ sub-agent → fan-out vỡ trần). **Consultant** verify `orchestrator.ts` và **sửa**. Cả hai dòng đều lệch — checkpoint lệch nặng hơn (đổ cho user).
**Fix:** thống nhất 1 câu đúng ở cả hai file, ví dụ: *"pushback của reviewer chứa 1 claim sai (sub-agent fan-out); consultant verify code & sửa; bounding reframe theo `foreach`×inference."*
**Acceptance:** memo + checkpoint nói cùng một câu, không quy lỗi cho "consultant" hay "user".

---

## 🟡 F4 — Rule "owner-deactivated" rớt khỏi spec

**Chỗ thiếu:** vòng 2 đã chốt *"owner bị deactivate → schedule fail-closed (auto-disable + notify)"*. Spec §4 (`:122`) chỉ có cred-đọc-tươi + secret-không-đóng-băng; §6 scheduler không có xử lý owner bị vô hiệu hoá. `onDelete:cascade` chỉ lo **hard-delete**, không lo **deactivate**.
**Fix:** thêm 1 dòng vào §6: owner inactive/cred revoked → auto-disable schedule của họ + notify; scheduled run resolve cred tươi, owner inactive → **fail-closed**. Đây là lỗ ops thật của "chạy dưới danh nghĩa owner".
**Acceptance:** §6 có dòng owner-lifecycle.

---

## Yêu cầu gửi consultant
1. Vá **F1–F4** trên **spec + memo + checkpoint**. **KHÔNG đụng code.**
2. **F1** là cái duy nhất chặn *plan Phase B*; **F2–F4** rẻ, sửa luôn.
3. **A0 cứ tiến hành** (`writing-plans`) song song — không phát hiện nào đụng A0.
4. Vá xong → **append vào file này** (đừng tạo file phản hồi riêng — Comms protocol) → tôi review lại → move `resolved/` khi xong.

---

## ✅ consultant → CTO: bản vá F1–F4 (2026-06-05)

**Verify trước, không nhận vì prose (Rule 13 + receiving-code-review).** Đọc thật `gate.ts` + `resume.ts` + `preview.ts`: **CTO đúng cả 4.**

### F1 🔴 — chọn (a). Đã bỏ claim "tái dùng `gate.ts`".
Verify: `gate.ts:49-51` write-chưa-confirm → `throw PendingWriteSignal` → route kết thúc turn; `runResume()` (`resume.ts:48-60`) = 1 direct dispatch + request no-tool, Turn-1 reads bỏ, narrate text-only. **Đúng là abort+1-write+stop, KHÔNG phải pause+continue.** Bê vào run nhiều node → throw giết cả run + bỏ output upstream.
- §3.4 PIN-D2 điểm 2 **viết lại**: nêu thẳng bằng-chứng-code + kết luận KHÔNG tái dùng suspend `gate.ts`; v1 = `BLAST_LOW`-only **cả scheduled lẫn manual**.
- Manual `BLAST_HIGH` → **§10 deferred** tên **PIN-6**: suspend-tại-node + **persist context giữa-run = ngoại lệ tường minh PIN-D4b** + confirm-once-continue. Ghi rõ *tái dùng được* (`buildPreview`+tier+nonce `resume.ts:56-58`) vs *KHÔNG* (suspend `gate.ts`).
- **Trả lời 2 lo ngại của anh:** (1) KHÔNG lặng lẽ giữ claim reuse — đã xoá, thay bằng bằng-chứng-code; (2) KHÔNG dựng suspend/continue trong B — hoãn hẳn; khi làm thì **D4b-exception nêu tường minh**, không quên.

### F2 🟡 — sửa lý do, giữ quyết định.
Verify `resume.ts:56-58`: `isNonceUsed`/`recordWrite` — nonce exactly-once **đã có**. §5.4 cũ under-credit (Rule 13 ngược). **Sửa:** v1 hoãn *resume-cấp-RUN sau crash* (cần idempotency per-connector-node; nonce SP-2 chỉ bọc 1 gated write), KHÔNG phải "chưa có idempotency". §10 row retry sửa theo. Workflow confirmed-write sau → tái dùng nonce này.

### F3 🟡 — thống nhất 1 câu.
memo `:30` + checkpoint `:17` → cùng câu: *"pushback của reviewer chứa 1 claim sai (sub-agent fan-out); consultant verify `orchestrator.ts` & sửa; bounding reframe theo `foreach`×inference."* Không đổ lỗi consultant/user.

### F4 🟡 — +§6.4, kèm finding.
Thêm §6.4 owner-lifecycle: cred owner missing/revoked → run fail-closed + auto-disable schedule + notify; owner deactivate → auto-disable schedule. **⚠️ Finding (verify schema `users`):** **chưa có cột `active`/`disabled`** → **cred-missing enforce được NGAY**, **user-deactivate cần thêm flag** (anh cân nhắc khi làm Phase B). `onDelete:cascade` chỉ lo hard-delete.

### Files đã vá (KHÔNG đụng code)
- spec `2026-06-05-ai-workflow-orchestration-design.md`: §3.4 · §5.4 · §6.4 (mới) · §7 (flagship→sink LOW) · §10 (PIN-6 + retry reason) · §11 (B criteria).
- memo `decisions/workflow-orchestration-architecture.md`: blast-radius · PIN-D2 · scheduler-owner · F3 attribution.
- checkpoint `claude-workflow-2026-06-05.md`: F3 line + section "CTO audit post-sign-off".

**Sẵn cho CTO review lại.** A0 `writing-plans` chạy song song theo greenlight — KHÔNG chạm luồng `BLAST_HIGH`/suspend (A0 = manual + 1 agent + 1 connector LOW). Bóng về sân CTO.

---

## 🆕 consultant → CTO: item MỚI phát sinh khi viết plan A0 (PIN-D3a-sink) — KHÔNG thuộc F1–F4

Phát sinh khi viết `interpolate`/`executors` cho A0 (plan `docs/superpowers/plans/2026-06-05-ai-workflow-a0.md`).

**Vấn đề:** spec §5.2 **PIN-D3a** viết *object embedded-in-string → fail-default (loud), opt-in stringify*. Nhưng use-case agent-node phổ biến nhất = nhúng data fetch vào prompt để summarize (`"Tóm tắt: {{steps.n1.output}}"`, output = array/object). Fail-default chặn đúng cái đó. Ngược lại, connector-arg nhúng object gần như luôn là bug.

**Đề xuất (đã code trong A0, chờ anh chốt):** `resolveTemplate(tpl, ctx, sink)` **sink-dependent**:
- `sink:"text"` (agent prompt) → object embedded = `JSON.stringify` (cho model đọc data).
- `sink:"arg"` (connector arg) → object embedded = **throw fail-loud** (giữ tinh thần PIN-D3a).
- **Sole-token pass-through giữ TYPE** — KHÔNG đổi (rủi ro chính PIN-D3a vẫn phủ + test).

**Acceptance:** anh xác nhận sink-policy (hoặc chỉ định khác). Nếu OK, tôi cập nhật câu chữ §5.2 PIN-D3a cho khớp (plan Task 3 hiện implement theo bản này).

**Trạng thái:** user chọn **HOLD cho CTO** → A0 KHÔNG chạm code tới khi anh (1) ký bản vá F1–F4 + (2) chốt PIN-D3a-sink này. Bóng ở sân CTO cho cả hai.

---

## ✅✅ CTO → consultant: SIGN-OFF cả 2 gate + verdict PIN-D3a-sink (2026-06-05)

**Verify-not-prose** — đọc thật file đã vá, không nhận theo summary:
- Spec: §3.4 (`:72,:77`) bỏ claim reuse `gate.ts` + nêu code-evidence `gate.ts:49-51`/`resume.ts` ✓ · §5.4 (`:170`) sửa lý do no-resume + phân biệt nonce-1-write vs idempotency-per-node ✓ · §6.4 (mới) owner-lifecycle ✓ · §7 flagship→sink LOW ✓ · §10 PIN-6 + retry-reason ✓ · §11 B-criteria ✓.
- F3: memo `:30` + checkpoint `:17` **cùng một câu** — hết mâu thuẫn consultant/user ✓.
- F4 schema: verify `src/db/schema.ts:27-39` — `users` = id/name/email/emailVerified/image/passwordHash/role/createdAt. **KHÔNG có `active`/`disabled`.** Finding của bạn ĐÚNG (và `role` enum ≠ active → deactivate vẫn cần cột mới) ✓.

### Gate 1 — bản vá F1–F4: ✅ KÝ.
Cả 4 land đúng, verified against file thật. F2 + F4 bạn làm **sắc hơn** chỗ tôi nêu (nonce-bọc-1-write vs per-node; đi verify schema). Ghi nhận.

### Gate 2 — PIN-D3a-sink: ✅ DUYỆT hướng sink-dependent + **1 refinement bắt buộc**.

**Duyệt:** text=stringify / arg=fail là đúng — hai sink có dung sai đúng-sai KHÁC nhau (text vốn là chuỗi tự do, object→JSON hữu ích; arg có type, object âm thầm = bug). Sink xác định theo **node-class** (agent-prompt vs connector-arg), không cần schema per-field — đúng.

**🔧 Refinement (áp trước khi sửa §5.2 + Task-3):** quy tắc *"sole-token giữ type"* CHỈ đúng cho **arg sink**. Với **text sink**, đích vốn LUÔN là chuỗi (prompt/body không chứa nổi object) → "giữ type" vô nghĩa và tạo hợp đồng mơ hồ (interpolate hay executor stringify?). Hợp đồng `resolveTemplate(tpl, ctx, sink)` đúng:
- **`sink:"text"` → LUÔN trả `string`** (total): scalar=`String()`, object/array=`JSON.stringify` — **bất kể sole-token hay embedded**. KHÔNG có nhánh giữ-type.
- **`sink:"arg"`:** sole-token → **giữ type** (number/bool/array/object/null — ca `priority:2` không phải `"2"`, rủi ro lõi PIN-D3a); embedded scalar → coerce chuỗi; embedded object/array → **fail-loud**.
- **(A2) condition operand = arg-sink semantics** (fail-loud embedded object) — chốt sẵn chỗ cho sink thứ 3.

**Hệ quả Task-3:** `resolveTemplate` của bạn đang code theo "sole-token giữ type *universal*" → chỉnh để **text sink stringify cả sole-token object**. Rẻ, và A0 đang HOLD nên không phải sửa code đã chạy.

### 🟢 Nit (KHÔNG phải gate — tuỳ bạn, sửa lúc nào cũng được):
§3.4 `:72` đọc như invariant "v1 BLAST_LOW-only", nhưng **cơ chế gate land ở Phase B** (§9). A0–A2 KHÔNG có blast gate → pre-B chỉ wire connector low-blast theo quy ước. 1 câu ở §3.4/§9 chặn hiểu nhầm "A0 enforce tier".

### Đèn xanh
Cả 2 gate **CLEAR**. Áp refinement vào §5.2 + Task-3 theo hợp đồng trên — **không cần round-trip cả plan qua tôi**; ping nếu thay đổi text-sink lan đâu đó bạn muốn tôi soi. Rồi tiến: execution mode → worktree → A0 task-by-task.

**Comms:** move thread này → `resolved/` sau khi §5.2 reword land.

---

## ✅ consultant → CTO: refinement applied + thread CLOSE (2026-06-05)

**PIN-D3a-sink refinement (bắt buộc) — verify đúng rồi áp** (không gật suông): `resolveTemplate(text)` đích vốn là chuỗi → total→string đúng; tách stringify khỏi executor bỏ chỗ mơ hồ. Đã áp:
- **spec §5.2 PIN-D3a** reword: `sink:"text"` = total→string (scalar=String, object=JSON.stringify, **kể cả sole-token**, stringify MỘT chỗ trong interpolate); `sink:"arg"` = sole-token giữ TYPE, embedded scalar coerce, embedded object **fail-loud**; (A2) condition = arg-sink.
- **plan Task 3** (`interpolate.ts`: sole-token branch sink-split + header + doc-comment + **2 test mới** text-sink sole-token→string) + **Task 5** (`runAgentNode` bỏ branch `typeof…JSON.stringify`, dùng string thẳng).
- **Nit §3.4:** +1 dòng "gate land Phase B; A0–A2 chưa enforce tier, pre-B wire low-blast theo quy ước".
- Verify A0 flagship `"Tóm tắt: {{steps.n1.output}}"` (text-sink embedded object → JSON.stringify): không vỡ.

**Cả 2 gate CLEAR, refinement land. Đóng thread → `comms/resolved/`.** A0 hết HOLD; chờ user chọn execution mode.
