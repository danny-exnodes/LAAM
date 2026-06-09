# Design: Gmail recipient-control gate (tier-high-exfil destination bound)

**Ngày:** 2026-06-09 · **Vai trò:** technical consultant · **Trạng thái:** 🟢 SPEC CLEAR (CTO confirm §11) — model + F1/F2 fold sạch; đính chính `body` (F1=to+subject only, không body) **CTO xác nhận đúng** (verify `gmail.ts:211` body sau separator). Flip `gmail_send` chỉ sau PR #8 merge + implement + CTO verify CODE `parseRecipients` + operator set allowlist.

> **TL;DR:** `gmail_send` là tool tier-high-exfil **duy nhất** (gdrive/gcal đã verify own-resource). CTO không ký mở `gmail_send` trần — bắt buộc 1 control-đích. Spec này thêm **recipient-allowlist gate**: tool tự-khai `recipientField`; runtime kiểm recipient (đã resolve) phải khớp **operator env allowlist** (`WORKFLOW_RECIPIENT_ALLOWLIST`), nếu không → fail-closed THROW. Không phải confirm-machinery (tôn trọng no-confirm của user) — chỉ chặn vector exfil. Gmail cần **3 điều kiện** để chạy: `workflowSafe:true` (flip) + allowlist set + recipient khớp.

---

## 1. Vấn đề & bối cảnh

Mechanism gate (PR #8, spec `2026-06-08-workflow-high-blast-design.md`) cho phép flip tool → `workflowSafe:true` để chạy trong workflow. CTO verdict (`comms/active/consultant-to-cto-workflow-high-blast`) phân tier exfil:
- **Tier-low-exfil** (9 tool, tài-nguyên-mình-sở-hữu) — flip sau merge, không cần control-đích.
- **Tier-high-exfil = `gmail_send`** (đích = người-nhận-ngoài tùy ý; `to={{read.x}}` từ nguồn bị thao túng = exfil) — **KHÔNG flip tới khi có control-đích.**

User chọn (brainstorming 2026-06-09): cần recipient **động** (data-derived) nhưng **có bound** → **allowlist domain**, cấu hình **operator env** (không author-widenable).

**Mục tiêu:** chặn vector exfil của `gmail_send` bằng allowlist-đích, đủ điều kiện để flip `gmail_send` sau khi CTO duyệt.

---

## 2. Decisions (brainstorming 2026-06-09)

| # | Trục | Chốt |
|---|---|---|
| G1 | Recipient động? | **Có, nhưng bound** (data-derived OK trong allowlist) → approach **allowlist** |
| G2 | Allowlist ở đâu | **Operator env** (global, không author-widenable) — khớp PIN "not user-editable" |
| G3 | Khai recipient field | **Self-declared `recipientField`** trên ConnectorTool (idiom kind/workflowSafe) |
| G4 | Empty allowlist | **Fail-closed** (reject hết) |
| G5 | Multi-recipient | **Mọi** recipient phải khớp (strict, chống comma-injection bypass) |

---

## 3. Mechanism

### 3.1 Self-declared `recipientField`
`ConnectorTool` ([`connectors/types.ts`](../../src/lib/connectors/types.ts)) +field optional:
```ts
export type ConnectorTool = {
  type: "function";
  kind: "read" | "write";
  workflowSafe?: boolean;
  // Tên trường args chứa ĐÍCH gửi-ra (exfil). Có → runtime enforce recipient-allowlist
  // trên giá trị ĐÃ RESOLVE của trường này. Vắng → tool không bị recipient-gate.
  recipientField?: string;
  function: { name: string; description: string; parameters: object };
};
```
`gmail_send` ([`gmail.ts`](../../src/lib/connectors/gmail.ts)) khai `recipientField: "to"`. (9 tool tier-low không khai → không bị gate.)

### 3.2 Canonical recipient parse (F2) + `assertRecipientAllowed` (file mới `src/lib/workflow/recipient.ts`)

**F2 — `parseRecipients(raw): string[]`** — 1 parser CHÍNH XÁC dùng chung cho **gate VÀ handler** (xóa parser-differential CTO §9.3). Tách trên `,` → mỗi token trim+lowercase → **THROW** nếu bất kỳ token nào không khớp **bare `local@domain`** (regex đơn giản: đúng 1 `@`, không khoảng trắng / `<>` / `()` / `"` / CRLF). Tức **từ chối** display-name (`"Smith, John" <x>`), comment (`(...)`), nhiều-`@`, CRLF, địa chỉ rỗng. v1 cố ý HẸP — chỉ địa chỉ trần, đủ cho workflow, loại mọi mơ hồ → gate-thấy = Gmail-gửi.

```ts
export function parseRecipients(raw: string): string[]; // THROW nếu bất kỳ token non-canonical
export function assertRecipientAllowed(
  action: string,
  resolvedArgs: Record<string, unknown>,
  allowlist?: ReadonlySet<string>,   // lowercased entries; default = parseEnv()
): void;
```
**`assertRecipientAllowed` logic:**
1. Tra `recipientField` của `action` từ `CONNECTORS` registry. Vắng → return (no-op).
2. `list = parseRecipients(String(resolvedArgs[recipientField] ?? ""))` — throw nếu non-canonical (F2). List rỗng → THROW.
3. Mỗi `local@host`: pass nếu **full address** ∈ allowlist HOẶC **domain `host`** ∈ allowlist.
4. Bất kỳ recipient không khớp → THROW (G5 strict). Allowlist rỗng → mọi recipient fail (G4).

Handler `gmail_send` dùng **cùng** `parseRecipients` để dựng lại `To:` sạch (§3.5) → không còn raw-concat.

### 3.3 Allowlist env
- **`WORKFLOW_RECIPIENT_ALLOWLIST`** — comma-separated. Entry = domain (`company.com`) hoặc full address (`alerts@gmail.com`). Parse: split `,`, trim, lowercase, bỏ rỗng → Set. Đọc **call-time** (env set sau load vẫn áp; test set `process.env` hoặc truyền `allowlist?`).
- Thêm vào `.env.example` + README env section (vi).

### 3.4 Enforcement point
Trong [`runtime.ts`](../../src/lib/workflow/runtime.ts) execute closure (xây trên mechanism PR #8), nhánh **real-execute** (sau interpolate → thấy recipient đã resolve; sau `assertConnectorAllowed`):
```ts
const execute = (action: string, args: Record<string, unknown>): Promise<unknown> => {
  if (dryRun && resolveKind(action, INTERNAL_TOOLS) === "write") {
    return Promise.resolve({ dryRun: true, wouldHaveCalled: action, args });
  }
  assertRecipientAllowed(action, args); // destination-safety (real-run); no-op nếu không recipientField
  return connectorExecute(userId, action, args);
};
```
Dry-run write → mock trước, **không** check (preview; real-run mới enforce — nhất quán seam mechanism). Reads → không recipientField → no-op.

### 3.5 Handler hardening (F1+F2) — `gmail.ts`
Fix tầng **connector** → bảo vệ CẢ chat lẫn workflow (vuln pre-existing, CTO §9). `gmail_send` handler:
- **F1 — reject CRLF ở header fields:** `to` HOẶC `subject` chứa `\r`/`\n` → THROW. **`body` KHÔNG chặn** — body nối SAU `\r\n\r\n` ([gmail.ts:211](../../src/lib/connectors/gmail.ts)) nên CRLF trong body = nội dung body, KHÔNG inject header; chặn sẽ phá email multi-line (digest = multi-line). Đính chính §9 (vector = `to`+`subject`); chi tiết §10.
- **F2 — dựng `To:` từ `parseRecipients(to)`** (join `, `), KHÔNG nối raw `to`. Gate + handler cùng parser → zero differential.
- `subject` sau F1 (đã sạch CRLF) → nối an toàn. RFC 2047 encode subject non-ASCII = follow-up (không chặn flip).

---

## 4. Quan hệ với mechanism — gmail cần 3 điều kiện

`gmail_send` chạy được trong workflow real-run **CHỈ KHI**:
1. `workflowSafe: true` (flip — sau CTO duyệt spec này), **VÀ**
2. `WORKFLOW_RECIPIENT_ALLOWLIST` được operator set (khác rỗng), **VÀ**
3. mọi recipient (đã resolve) khớp allowlist.

Thiếu bất kỳ → fail-closed. Defense-in-depth: flip (code) ⊥ allowlist (operator config) ⊥ per-run recipient match.

---

## 5. Phạm vi chạm

**Không** migration · route · UI · suspend-resume. Build **trên** mechanism PR #8 (giả định đã merge).

| File | Đổi |
|---|---|
| `src/lib/connectors/types.ts` | +`recipientField?: string` trên `ConnectorTool` |
| `src/lib/connectors/gmail.ts` | `gmail_send` khai `recipientField: "to"`; **F1** reject CRLF ở `to`+`subject`; **F2** dựng `To:` từ `parseRecipients` (không nối raw) |
| `src/lib/workflow/recipient.ts` | **mới** — `parseRecipients` (F2, shared) + `assertRecipientAllowed` + parse env |
| `src/lib/workflow/runtime.ts` | wire `assertRecipientAllowed` vào real-execute branch |
| `.env.example` · `README.md` | document `WORKFLOW_RECIPIENT_ALLOWLIST` (vi) |
| tests | `recipient.test.ts` (mới) + `runtime.test.ts` (gmail recipient path) |

**Flip `gmail_send`** (`workflowSafe:true`) = bước riêng SAU khi spec này merge + operator set env (cập nhật tripwire test trong `policy.test.ts`).

---

## 6. Testing (Rule 9 — test mã hóa *vì sao*)

| Test | Intent | File |
|---|---|---|
| recipient trong allowed domain → pass | recipient động trong bound chạy được | `recipient.test.ts` |
| recipient ngoài allowlist → throw | bound exfil giữ | `recipient.test.ts` |
| allowlist rỗng → throw (cả addr hợp lệ) | **fail-closed default load-bearing** | `recipient.test.ts` |
| multi-recipient, 1 xấu → throw | không bypass qua comma-injection (G5) | `recipient.test.ts` |
| tool không recipientField → no-op | chỉ exfil-tool bị gate | `recipient.test.ts` |
| full-address entry khớp; domain entry khớp | cả 2 granularity | `recipient.test.ts` |
| recipient không có `@` → throw | không phân giải domain → fail-closed | `recipient.test.ts` |
| 🔴 real-run gmail_send ngoài allowlist → throw, KHÔNG execute | seam destination-safety | `runtime.test.ts` |
| dry-run gmail_send → mock, không recipient-check | real-run mới enforce | `runtime.test.ts` |
| 🔴 `to` chứa CRLF (`ok@x\r\nBcc:evil`) → throw (F2 parse) | header-injection qua `to` đóng | `recipient.test.ts` |
| 🔴 `subject` chứa CRLF → handler throw (F1) | header-injection qua `subject` đóng | `gmail.test.ts` |
| `to` display-name / comment / nhiều-`@` → throw | parser-differential bị loại (canonical) | `recipient.test.ts` |
| handler dựng `To:` = list canonical (gate-thấy = gửi) | gate↔handler cùng parser, zero differential | `gmail.test.ts` |
| ✅ `body` multi-line (có `\n`) → KHÔNG throw, gửi OK | body hợp lệ, không over-block (đính chính §10) | `gmail.test.ts` |

---

## 7. Non-goals (YAGNI)
- ❌ Per-workflow / per-node allowlist (operator env là bound đúng tầng — author không nới được).
- ❌ Allowlist UI / DB config.
- ❌ Recipient-control cho tier-low (bề mặt hẹp, R2 chấp nhận).
- ❌ Confirm-machinery (tôn trọng no-confirm).
- ❌ Dry-run recipient preview-warning (có thể thêm sau).
- ❌ Mở rộng exfil-tool khác (chỉ `gmail_send` hôm nay).

---

## 8. Liên quan
spec mechanism `2026-06-08-workflow-high-blast-design.md` · comms `consultant-to-cto-workflow-high-blast` (CTO verdict + tier confirm) · PR #8 (mechanism) · [[connectors-oauth]] (self-declare idiom) · [[workflow-orchestration-architecture]] (#3 đích-safety).

**→ CTO review (deliverable 4):** allowlist-domain qua operator env + self-declared recipientField + all-recipients-strict + fail-closed. Duyệt → implement (sau PR #8 merge) → flip `gmail_send`.

---

## 9. CTO REVIEW — 2026-06-09: model DUYỆT · 🔴 CONDITIONAL (đóng header-injection trước flip)

**Method:** đọc spec + **verify handler `gmail_send` thật** (`gmail.ts:201-219`).

### ✅ Security MODEL — đúng, duyệt
Allowlist ở **operator-env** (không author-widenable, G2) · fail-closed mọi nhánh (G4 empty / no-`@` / empty-list) · **G5 strict-all-match** (chống comma-injection) · enforce **sau interpolate** (recipient đã resolve) trên real-run · defense-in-depth 3 điều kiện. Tầng & trục đúng.

### 🔴 BLOCKER (verified) — allowlist BỊ VƯỢT MẶT ở tầng parsing
`gmail.ts:206-212` nối **raw** `to`/`subject`/`body` vào RFC 2822 headers, KHÔNG sanitize CRLF. Hệ quả:
1. **Header injection qua `to`:** `to="ok@company.com\r\nBcc: evil@x.com"` → header `Bcc:` tiêm thêm → Gmail gửi Bcc; gate split-`,` KHÔNG thấy.
2. **Bcc qua `subject`/`body`:** cũng nối raw → attacker tiêm Bcc qua trường gate **không đụng tới** → recipient-gate hoàn hảo trên `to` vẫn **vô dụng**.
3. **Parser differential:** gate split-`,` đơn giản ≠ RFC 2822 (quoted-comma `"Smith, John" <x>`, comment `(...)`, display-name) → đích gate-thấy ≠ đích Gmail-gửi.
⇒ **Allowlist một mình KHÔNG đủ.** (Pre-existing vuln — chat-side `gmail_send` cũng dính; sửa bất kể spec này.)

### Bắt buộc TRƯỚC khi flip `gmail_send` (thêm vào spec)
- **F1 — Sanitize handler (`gmail.ts`):** REJECT bất kỳ `to`/`subject`/`body` chứa `\r`/`\n` (hoặc encode đúng RFC 2822). Fix tầng connector → bảo vệ CẢ chat lẫn workflow. Test: `to`/`subject`/`body` có CRLF → throw.
- **F2 — Canonical recipient parse (1 hàm dùng chung gate+handler):** parse `to` → list **bare `local@domain`** đã validate (loại CRLF/comment/display-name-có-comma/nhiều-`@`); **gate kiểm list canonical đó**, handler gửi đúng list đó (dựng lại sạch). Xóa differential. §3.2 phải đặc tả parse CHÍNH XÁC này (hiện để ngỏ).
- Test 🔴 mới: header-injection qua to **và** qua subject/body → throw, KHÔNG execute.

### 🟡 Thứ cấp
- `recipientField` đơn-trường ổn **hôm nay** (gmail chỉ có `to`). Nếu sau thêm `cc`/`bcc` → phải cover (cân nhắc `recipientFields: string[]` + test fail nếu xuất hiện send-field mới).
- Gate này **kế thừa** tính security-critical của seam dry-run/real-run (PR #8): nếu real-run lọt nhánh mock thì gate bị skip → review **cùng** PR #8.

### Verdict
**Model ✅ duyệt. Spec 🔴 CONDITIONAL:** thêm F1+F2 (sanitize handler + canonical parse) vào §3/§5/§6 → đó mới là điều kiện thật để flip `gmail_send`, KHÔNG chỉ allowlist. Implement sau PR #8 merge; gửi CTO xác nhận F1/F2 đã fold trước flip. — *CTO, 2026-06-09.*

---

## 10. Consultant response — F1+F2 folded (1 đính chính) — 2026-06-09

Verify handler thật (`gmail.ts:201-219`). BLOCKER đúng — đã fold §3.2/§3.5/§5/§6:
- **F2 accept:** `parseRecipients` canonical, **shared gate+handler** (§3.2/§3.5) → xóa parser-differential VÀ đóng `to`-injection trong một cơ chế.
- **F1 accept cho `to`+`subject`** (§3.5) — header fields, CRLF = injection.
- **🟡 ĐÍNH CHÍNH F1 cho `body`:** verify code — `body` nối SAU `\r\n\r\n` ([gmail.ts:211](../../src/lib/connectors/gmail.ts)) → header block đã đóng → CRLF trong body là **nội dung body, KHÔNG inject header**. Hơn nữa **chặn CRLF ở body sẽ phá MỌI email multi-line** — kể cả flagship digest 8h sáng (body nhiều dòng). ⇒ F1 **loại `body`**, chỉ `to`+`subject`. Threat-model chính xác: vector header-injection = `to`+`subject`.
- **🟡 secondary accept:** `recipientField` đơn-trường OK (gmail chỉ `to`); thêm cc/bcc sau → `recipientFields: string[]` (non-goal nay). Gate kế thừa seam dry/real PR #8 → review chung.
- Fix ở tầng connector → đóng luôn **chat-side** vuln (CTO nêu), không chỉ workflow.

**→ Xin CTO xác nhận đính chính `body`** (KHÔNG chặn CRLF body) — phần còn lại fold đúng §9. Sau xác nhận + PR #8 merge → implement → flip `gmail_send`. — *consultant, 2026-06-09.*

---

## 11. CTO CONFIRM — 2026-06-09: đính chính body ĐÚNG, fold sạch, spec CLEAR

**✅ Xác nhận đính chính `body`.** Verify `gmail.ts:211` — header block đóng ở `...\r\n\r\n`, `body` nối ở `:212` (sau separator) → CRLF body = **nội dung**, không inject header; chặn nó **phá email multi-line** (digest). **F1 của tôi (§9) gồm `body` là OVER-BROAD — anh sửa đúng.** F1 = `to`+`subject` only.

**✅ Fold F1+F2 đúng + đầy đủ:**
- `to`-injection đóng (F1 reject CRLF **VÀ** F2 canonical-parse — double cover).
- `subject`-injection đóng (F1).
- parser-differential đóng (F2 shared `parseRecipients`, handler dựng `To:` từ list canonical = gate-thấy = Gmail-gửi).
- `body` đúng-không-over-block. §6 test phủ trúng cả 5 (incl. body-multiline-OK).

**Verdict: 🟢 spec CLEAR** (model + F1/F2 + đính chính). **Flip `gmail_send` CHỈ sau:** (1) PR #8 mechanism merge, (2) implement F1/F2 + tôi **verify CODE** (không chỉ spec) `parseRecipients` kín (regex bare-addr không lọt CRLF/`<>`/`()`), (3) operator set `WORKFLOW_RECIPIENT_ALLOWLIST`. 9 tool tier-low không liên quan, đi tiếp.

**Lưu ý task:** chat-side handler fix (F1) tôi đã spawn task — sẽ chỉnh scope = `to`+`subject` only (theo đính chính này). — *CTO, 2026-06-09.*
