# SP-2 Actions & Safety — Agent Harness (deep-dive spec)

> **Sub-project 2** của roadmap `docs/superpowers/specs/2026-06-04-agent-harness-architecture.md`.
> **Tiền đề:** hợp đồng SP-1 (`src/lib/agent/types.ts`, `registry.ts`, `orchestrator.ts`, `guardrails.ts`) **đã merge + cố định**.
> **Ngày:** 2026-06-04 · **Chủ:** orchestrator SP-2 · **Trạng thái:** APPROVED-WITH-CHANGES (lead) → đã sửa → chờ lead re-review §6 (Critical) → writing-plans.
> Serena: [[agent-harness-architecture]] · [[agent-harness-sp1-foundation-design]] · [[agent-harness-sp2-actions-safety]] · [[agent-ops-rules]] · [[poc-model-choice]].

---

## 1. Mục tiêu & phạm vi

**Mục tiêu:** cho phép model **thực hiện hành động ghi (write)** — nội bộ lẫn connector — **một cách an toàn**: mỗi write phải được **người dùng xác nhận** trước khi chạy, và mọi tool (read lẫn write) đi qua một lớp guardrail đầy đủ tại chokepoint.

**Nguyên tắc trung tâm (YAGNI):** SP-2 là **KHUNG an toàn**, không phải đợt thêm tool write. Bề mặt write hiện tại = **đúng 1 tool**: `trello_create_card`. SP-2 chứng minh khung trên đúng tool đó và áp đồng nhất cho mọi write tương lai (internal + connector). **KHÔNG thêm tool write mới.**

**Trong phạm vi:** L4 đầy đủ (gate write · ground-truth Rule 13 · redact · bound connector) + một phần L2 (lớp `withSafety` bọc `dispatch`). Phân loại read/write. Giao thức suspend/resume xác nhận. Multi-step connector bounded.

**Ngoài phạm vi (defer):**
- Persist tool turns / summarize lịch sử → **SP-3** (SP-2 cố tình KHÔNG phụ thuộc, xem §6.4).
- Stream tool-call events ra UI → **SP-4** (SP-2 phát frame `pending_write` theo schema chung do SP-4 sở hữu).
- Đổi schema DB (SP-2 chỉ dùng bảng `audit_log` **sẵn có**).
- Chính sách "tin tưởng"/"đừng hỏi lại" (trust toggles) → defer. **Mặc định: luôn hỏi mỗi write** (safety-first POC).
- Render UI confirm card → **session FE responsive** sở hữu `components/chat/*`; SP-2 chỉ giao **hợp đồng dây (wire contract)** + handoff (§7).

**Success criteria (verify được bằng test thuần):**
1. Model gọi `trello_create_card` → **không** chạy ngay; turn kết thúc bằng text đề xuất + frame `pending_write`; **không** có card nào được tạo (mock `execute` không bị gọi).
2. Sau khi user **approve** (gửi token) → card được tạo **đúng 1 lần** với **đúng `{name,args}` đã ký**; turn 2 sinh text báo kết quả.
3. User **deny** → `execute` **không** bị gọi; trả text "đã huỷ".
4. Tool **read** (internal `laam_*` + connector list/search) chạy **y như SP-1** (không gate, không đổi luồng).
5. Token bị **sửa / hết hạn / sai user / nonce đã dùng** → reject, fail-soft (text thân thiện), **có log** (Rule 12).
6. Kết quả connector chứa cred (vd URL Trello `?key=…&token=…`) → **bị redact** trước khi vào context model / persist / audit.
7. Baseline test xanh (398 + test SP-2 mới); `tsc` sạch; `next build` xanh. **Hợp đồng SP-1 không đổi.**

---

## 2. Tác động hợp đồng SP-1 → **KHÔNG đổi** (zero contract change)

Quyết định kiến trúc: gate là **lớp bọc composable** quanh `dispatch` của SP-1, không sửa file hợp đồng.

| File hợp đồng SP-1 | SP-2 đụng? |
|---|---|
| `types.ts` (`Tool`/`ToolContext`/`ToolEvent`/`ToolKind`) | **Không** — dùng `Tool.kind` sẵn có |
| `registry.ts` (`makeDispatch`/`modelToolSchemas`) | **Không** — `withSafety` bọc *kết quả* của `makeDispatch` |
| `orchestrator.ts` (`runToolRounds`) | **Không** — gate **throw** xuyên qua loop (loop không cần biết) |
| `guardrails.ts` (`validateArgs`/`boundOutput`/`guard`) | **Không sửa** — chỉ **import lại** `boundOutput` để bound connector. (`redact` là **file mới** `safety/redact.ts`, KHÔNG thêm vào `guardrails.ts`.) |

**SP-2 chỉ thêm file mới** dưới `src/lib/agent/safety/*` + **sửa `src/app/api/chat/route.ts`** (backend, SP-1 đã sở hữu/refactor; SP-2 được phép) + **insert `audit_log`** (bảng sẵn có).

> **Đề xuất đổi hợp đồng:** *KHÔNG có.* (Phương án thay thế đã cân nhắc & bác: thêm tham số `kind`/`classify`/`confirmedAction` vào `makeDispatch` — đó là *additive optional* nhưng vẫn là chạm hợp đồng đóng băng; lead đã chốt **dùng wrapper** để zero-risk. Nếu review sau muốn gộp wrapper vào `makeDispatch`, round-trip về chủ SP-1 trước.)

---

## 3. Phân loại read/write

### 3.1 Internal tools — tự phân loại
`Tool.kind` đã tồn tại ([types.ts:10]). Cả 5 `laam_*` = `read` ở SP-1. Khi có internal write tương lai, chỉ cần đặt `kind:"write"` — gate tự áp. **Không cần map ngoài.**

### 3.2 Connector tools — `policy.ts` (map tường minh, fail-closed)
`ConnectorTool` **không có `kind`** ([connectors/types.ts:23]) và **không được sửa connector** (D1 "giữ nguyên"). ⇒ một module policy trong lớp agent phân loại theo tên:

```ts
// src/lib/agent/safety/policy.ts
export const CONNECTOR_WRITES: ReadonlySet<string> = new Set(["trello_create_card"]);
export const CONNECTOR_READS: ReadonlySet<string> = new Set([
  "demo_list_tasks",
  "github_list_repos", "github_list_issues", "github_search_issues",
  "trello_list_boards", "trello_list_cards",
  "jira_search_issues", "jira_my_issues",
  "gdrive_list_files", "gdrive_search",
  "gcal_list_events",
  "gmail_list_messages", "gmail_search",
]);

// internal tool: dùng Tool.kind. connector: tra 2 set.
// KHÔNG nằm trong set nào (connector mới chưa phân loại) → "write" (FAIL-CLOSED) + log loud.
export function resolveKind(name: string, internal: Tool[]): "read" | "write";
```

**Quy tắc fail-closed (Rule 12):** tool connector lạ ⇒ coi là **write (bị gate)** + `console.warn("[safety] tool chưa phân loại, mặc định GATE: " + name)`. Hệ quả an toàn: write mới quên khai báo **không bao giờ** chạy ngầm; tệ nhất là một read mới bị gate cho tới khi thêm vào `CONNECTOR_READS`. Không bao giờ rò một write ungated.

> **Ghi chú dài hạn (defer):** giải pháp bền hơn là thêm `kind` vào *định nghĩa connector* (`ConnectorTool`/`Connector.tools`) — đó là **đổi hợp đồng connector**, đúng khi defer (YAGNI, 1 write hiện tại).
> **Test phải có (Rule 9/13):** `policy.test` mock một connector tool tên lạ → khẳng định `resolveKind="write"` + có log. Đây là test "intent": nếu ai đó đổi default sang fail-open, test phải đỏ.

---

## 4. Kiến trúc gate — lớp `withSafety` (chokepoint duy nhất)

```ts
// src/lib/agent/safety/gate.ts
export class PendingWriteSignal extends Error {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  constructor(tool: string, args: Record<string, unknown>);
}

export type SafetyOptions = {
  internal: Tool[];                                   // để resolveKind đọc Tool.kind
  confirmedAction?: { name: string; args: Record<string, unknown> }; // one-shot allow (resume)
};

// Bọc dispatch SP-1. Trả lại đúng chữ ký (name,args)=>Promise nên cắm thẳng vào runToolRounds.
export function withSafety(
  inner: (name: string, args: unknown) => Promise<unknown>,
  opts: SafetyOptions,
): (name: string, args: unknown) => Promise<unknown>;
```

**Hành vi mỗi lần gọi `(name, args)`:**

```
kind = resolveKind(name, opts.internal)
parse args (chuỗi JSON → object, như makeDispatch)         // chống lệch định dạng
if kind === "write" AND không khớp confirmedAction:
    throw new PendingWriteSignal(name, parsedArgs)         // KHÔNG gọi inner → KHÔNG side-effect
else:                                                       // read, hoặc write đã-confirm one-shot
    result = await inner(name, args)
    return redact(boundOutput(result))                      // vá lỗ hổng connector (xem §8)
```

**Ba việc của wrapper (mở rộng L4 tới connector):**
1. **Gate write**: throw trước khi `inner` chạy ⇒ tất định không có side-effect khi chưa confirm.
2. **Redact** kết quả (§8.1) — vá: connector **không** qua `guard()` ở SP-1.
3. **Bound** kết quả qua `boundOutput` (tái dùng `guardrails.ts`) — vá: connector **không** bị bound ở SP-1.

**Vì sao throw, không return marker:** `runToolRounds` gọi `dispatch(name,args)` **không** try/catch ([orchestrator.ts:31]); throw nổi lên thẳng route ([orchestrator.ts] → [route.ts:152]). Loop **không cần biết** gì về gate ⇒ orchestrator giữ nguyên (zero contract change). Convo dở của Turn 1 bị mất khi throw — **không sao**, resume dựng lại từ DB + token (§6).

**`confirmedAction` (one-shot):** chỉ dùng ở nhánh resume. Vì resume **tự** gọi `dispatch(signedName, signedArgs)` với đúng giá trị đã ký nên match là **tất định** (không liên quan model). Write đi qua `inner` (= `makeDispatch`) ⇒ **`onEvent` vẫn phát** cho write đó (lợi cho SP-4, xem §11).

---

## 5. Token niêm phong hành động (stateless, không schema)

Người dùng đã chọn **stateless signed token** (không lưu DB). SP-2 **niêm phong bằng mã hoá xác thực** thay vì HMAC tự viết — tái dùng `lib/connectors/crypto.ts` (Rule 3).

```ts
// src/lib/agent/safety/token.ts
import { encryptJson, decryptJson } from "@/lib/connectors/crypto"; // AES-256-GCM sẵn có

export type PendingWrite = {
  v: 1;
  name: string;
  args: Record<string, unknown>;     // ARGS THẬT (cần để execute) — an toàn vì blob đã mã hoá
  conversationId: string;
  userId: string;
  iat: number;                        // epoch ms (inject)
  exp: number;                        // iat + TTL
  nonce: string;                      // crypto.randomUUID — replay-dedupe
};

export function sealPendingWrite(p: PendingWrite): string;            // = encryptJson(p) → blob mờ
export function openPendingWrite(token: string, now: number):
  | { ok: true; value: PendingWrite }
  | { ok: false; error: string };     // decrypt fail / v sai / now>exp → ok:false
```

**Tính chất an toàn (đủ cho threat model nội bộ <50 user / Tailscale):**
- **Toàn vẹn / chống sửa:** GCM auth tag — sửa 1 byte ⇒ `decryptJson` throw ⇒ reject.
- **Bảo mật:** client chỉ thấy **blob mờ**; args (kể cả arg nhạy cảm của write tool *tương lai*) **không đọc được** từ token. Giải quyết lo ngại "args trong token".
- **Hết hạn:** `exp = iat + TTL` (mặc định **5 phút**); enforce trong code sau decrypt.
- **Ràng user:** caller so `value.userId === session.user.id` (chống dùng token của người khác).
- **Chống replay:** `nonce` + dedupe qua `audit_log` (§8.4). ⚠️ Còn 1 race nhỏ (2 confirm đồng thời, không có unique index) — chấp nhận POC, fix bền để SP-3.

Key derive sẵn (`CONNECTOR_KEY ?? AUTH_SECRET ?? dev-fallback`) — **không** thêm env/dep mới.

---

## 6. 🔴 Giao thức Suspend / Resume (mục lead re-review)

Tool-loop chạy **server-side, non-streaming, TRƯỚC khi stream** ⇒ write sẽ chạy *vô hình trước khi user thấy gì*. Gate phải **dừng loop, trả quyền cho người**, rồi **resume tất định**.

### 6.1 Thân request `/api/chat` — union sạch

```ts
type ChatBody =
  | { message: string; conversationId?: string; model?: string; /* …settings cũ */ }
  | { confirm: { token: string; approve: boolean }; conversationId?: string };
```
Route phân nhánh ở đầu: có `body.confirm` → **nhánh resume (§6.3)**; ngược lại → **nhánh thường (§6.2)**.

### 6.2 Turn 1 — phát hiện write & SUSPEND

```
1. Chạy như SP-1: persist user msg → history → buildSystemPrompt → tools = modelToolSchemas(...)
2. dispatch = withSafety(makeDispatch(INTERNAL_TOOLS, ctx, onEvent), { internal: INTERNAL_TOOLS })
3. try: runToolRounds(payload.messages, tools, { callOllama, dispatch })   // READ chạy bình thường
   catch (e):
     if e instanceof PendingWriteSignal:
        preview = buildPreview(e.tool, e.args)                 // §7.2 — CODE-built, đã redact
        proposalText = preview.summary                         // luôn dựng từ preview (Important #1)
        persist assistant message { role:"assistant", content: proposalText }   // KHÔNG rỗng
        token = sealPendingWrite({ v:1, name:e.tool, args:e.args,
                  conversationId: convId, userId, iat: now, exp: now+TTL, nonce: randomUUID() })
        frame = { t:"pending_write", token, tool:e.tool,
                  title:preview.title, summary:preview.summary, fields:preview.fields }
        return streamProposal(proposalText, frame, convId)     // stream text + U+001E + JSON(frame) → close
     else:
        // lỗi tool-loop thật → giữ FAIL-SOFT cũ: stream trả lời thường từ payload gốc
4. (không có write) → stream câu cuối + frame {t:"tokens",i,o} y như SP-1
```

> **Important #1 đã xử lý:** `proposalText`/frame **luôn** dựng từ `buildPreview` (code), **không** phụ thuộc `msg.content` của model (model hay trả `content:""`, và throw xảy ra *trong* `dispatch` nên không thấy content). Hệ quả tốt (Rule 13): card mô tả **chính xác hành động code sẽ chạy**, không phải lời kể có thể sai của model. Không bao giờ persist message rỗng ⇒ Turn-2 history luôn đủ ngữ cảnh.
> **Important #3 đã xử lý:** throw ở **write đầu tiên** ⇒ **1 turn = 1 write được gate**; các tool_call sau write trong cùng round **không** chạy. Tác vụ nhiều write = **nhiều turn confirm nối tiếp**, KHÔNG gói trong `maxRounds`. (`maxRounds` chỉ bound các READ *trước* write trong 1 turn.)

### 6.3 🔴 Turn 2 — RESUME (chống double-execute) — đặc tả chính xác

> Bối cảnh rủi ro (lead nêu): SP-1 **không persist tool turns** ⇒ READ + assistant tool_call của Turn 1 **mất** sang Turn 2 (history DB chỉ có user/assistant text). Nếu dựng lại convo còn `tool_call` đề xuất write rồi gọi loop có tool, model **có thể đề xuất lại write → double-execute / loop gate**.

```
1. p = openPendingWrite(body.confirm.token, now)
   if !p.ok → return friendly error (log loud, Rule 12)
   if p.value.userId !== session.user.id → reject (log)
   if await isNonceUsed(db, p.value.nonce) → reject "đã xử lý"        // replay-dedupe (§8.4)

2. if body.confirm.approve === false:
      persist assistant "Đã huỷ hành động." → stream → return         // execute KHÔNG chạy

3. // APPROVE — execute ĐÚNG 1 LẦN, từ giá trị ĐÃ KÝ (không hỏi lại model — Rule 13):
   gated1 = withSafety(makeDispatch(INTERNAL_TOOLS, ctx, onEvent),
              { internal: INTERNAL_TOOLS, confirmedAction: { name:p.value.name, args:p.value.args } })
   result = await gated1(p.value.name, p.value.args)                  // qua makeDispatch → onEvent phát; redact+bound áp
   await recordWrite(db, userId, { nonce:p.value.nonce, tool:p.value.name, args:p.value.args })  // audit + claim nonce

4. // Dựng convo TỔNG HỢP tại chỗ (KHÔNG dựa tool-turn của SP-3); BỎ READ của Turn 1:
   history = select chat_message where conversationId order by createdAt   // user + proposal-assistant text
   synthetic = [
     { role:"system", content: buildSystemPrompt(...) },
     ...history.map(m => ({ role:m.role, content:m.content })),
     { role:"assistant", content:"", tool_calls:[{ function:{ name:p.value.name, arguments:p.value.args } }] },
     { role:"tool",      content: JSON.stringify(result) },
   ]

5. // Sinh TEXT-ONLY: gọi Ollama stream KHÔNG kèm tools ⇒ model chỉ tả kết quả, KHÔNG gọi tool mới
   stream final text (no tools) → persist assistant final → frame {t:"tokens",i,o}
```

**Bất biến phải test (`resume.test`):**
- `execute` (mock) được gọi **đúng 1 lần**, với **đúng `{name,args}` đã ký** (không phải args do model bịa).
- Vòng sinh text gọi Ollama **với `tools` rỗng** ⇒ **không** phát sinh tool_call mới ⇒ **không** write trùng.
- Cùng `nonce` gửi lần 2 → `isNonceUsed` true → reject, `execute` **không** gọi lại.
- `approve:false` → `execute` **không** gọi.

### 6.4 Độc lập với SP-3 (ghi nhận follow-up)
Resume **không** dùng tool-turn đã lưu (SP-1 chưa lưu; SP-2 không được chờ SP-3). Khi SP-3 persist tool turns xong, **có thể** đơn giản hoá resume (replay từ turn đã lưu thay vì dựng tay) — **follow-up**, không ép SP-2 đổi trước. (Đã đồng bộ qua `comms/active/lead-to-sp3-persistence-and-audit.md`.)

---

## 7. Wire contract + handoff FE (SP-2 = backend/contract-only)

SP-2 **không** chạm `components/chat/*`. Giao 3 thứ cho session FE:

### 7.1 Frame `pending_write` (theo schema discriminated chung — SP-4 sở hữu)
```jsonc
// Khung U+001E ở cuối stream (tái dùng cơ chế token-usage hiện có)
{ "t": "pending_write",
  "token": "<blob mã hoá>",
  "tool": "trello_create_card",
  "title": "Tạo card Trello",
  "summary": "Tạo card \"Mua sữa\" trong danh sách 64f…(idList).",
  "fields": [ { "label":"Danh sách", "value":"64f…" }, { "label":"Tiêu đề", "value":"Mua sữa" } ] }
```
- Khoá phân biệt là **`t`** (không phải `type`) theo schema chung SP-4 đề xuất `{t:"tokens"|"pending_write"|"tool_event"}`. Frame token-usage cũ `{i,o}` sẽ migrate thành `{t:"tokens",i,o}` (SP-4/FE sở hữu).
- **`fields`/`summary` đã redact** (§8.1). `token` mờ (đã mã hoá).

### 7.2 `buildPreview` (code-built, là ground-truth của card)
```ts
// src/lib/agent/safety/preview.ts
export type WritePreview = { title: string; summary: string; fields: { label: string; value: string }[] };
export function buildPreview(name: string, args: Record<string, unknown>): WritePreview; // redact bên trong
```
Bảng preview theo tool (mở rộng khi có write mới):

| Tool | title | summary | fields |
|---|---|---|---|
| `trello_create_card` | "Tạo card Trello" | `Tạo card "<name>" trong danh sách <idList>` | Danh sách, Tiêu đề, (Mô tả) |
| *unknown write* | "Hành động ghi" | `Chạy <name> với tham số đã cho` | mỗi arg (đã redact) |

### 7.3 Điểm chạm FE (handoff — không SP-2 tự sửa)
Ghi đầy đủ trong `.serena/memories/backlog/agent-harness-sp2-fe-confirm.md`:
- `ChatClient.tsx` (~dòng 171-200): mở rộng bộ strip U+001E thành **router theo `t`** (phối hợp SP-4 — *prerequisite* để render card); `t:"pending_write"` → set state pending.
- **Component mới** (FE sở hữu): card hiện `title/summary/fields` + 2 nút. Approve/Deny → `POST /api/chat { confirm:{ token, approve } }` → stream tiếp vào message assistant mới.
- **i18n** keys vi/en/zh: tiêu đề card, nút Xác nhận/Huỷ, trạng thái "đang chạy/đã tạo/đã huỷ".
- Endpoint: **dùng lại `/api/chat`** (union body §6.1) — không thêm route.

---

## 8. Guardrail mở rộng tại chokepoint (L4 đầy đủ)

### 8.1 Redact secret (Important #2 — áp result + args + preview + audit)
```ts
// src/lib/agent/safety/redact.ts
export function redactString(s: string): string;  // thay token bằng "‹redacted›"
export function redact<T>(value: T): T;            // deep, mọi string trong object/array
```
Mẫu cần scrub (rủi ro **có thật**: Trello nhét `key`+`token` vào query string [trello.ts:15] → URL trong message lỗi sẽ kéo cred vào context):
- `([?&](key|token|api_key|access_token|password|secret)=)[^&\s"]+` → `$1‹redacted›`
- `Bearer\s+[\w.\-]+` · `gh[pousr]_[A-Za-z0-9]{20,}` (GitHub PAT) · chuỗi base64/hex dài khả nghi.
- Áp tại: **(a)** kết quả mọi tool trong `withSafety`; **(b)** `args` khi dựng `preview`/`fields`; **(c)** bản ghi `audit_log`. Args THẬT chỉ tồn tại trong token (đã mã hoá) + lúc execute.

### 8.2 Bound output cho connector (vá lỗ hổng SP-1)
Connector ở SP-1 **không** qua `guard()`/`boundOutput`. Wrapper áp `boundOutput` (tái dùng `guardrails.ts`) cho **mọi** kết quả ⇒ context model 16GB không bị tràn bởi connector trả về lớn.

### 8.3 Ground-truth (Rule 13) — hai sắc thái
- **Internal write (tương lai):** resolve ID/tên theo **LAAM DB** trước khi ghi (khung sẵn; chưa có internal write ⇒ chưa kích hoạt — không viết code chết, chỉ đặc tả nghĩa vụ).
- **Connector write (ngoài DB LAAM):** "DB" không phải nguồn chân lý. An toàn = **preview code-built (không phải lời model) + người xác nhận**. Đây là lý do §6.2 luôn dựng card từ `buildPreview(args)`, không từ prose của model.

### 8.4 Audit + replay-dedupe (`audit_log` sẵn có, KHÔNG schema)
`audit_log(id, userId, action, target text, createdAt)` — không jsonb.
```ts
// src/lib/agent/safety/audit.ts
export async function recordWrite(db, userId, x: { nonce:string; tool:string; args:Record<string,unknown> }): Promise<void>;
//   insert { userId, action:"agent_write", target: JSON.stringify({ nonce:x.nonce, tool:x.tool, args:redact(x.args) }) }
export async function isNonceUsed(db, nonce: string): Promise<boolean>;
//   select 1 from audit_log where action='agent_write' and target like '%"nonce":"'||nonce||'"%' limit 1
```
- `action="agent_write"` là **category** (đã báo SP-3 tránh trùng ngữ nghĩa: proactive log dùng action khác).
- ⚠️ **Race tồn dư:** không unique index ⇒ 2 confirm đồng thời cùng nonce *có thể* lọt. Threat model nội bộ ⇒ chấp nhận; fix bền (unique index cột nonce riêng) **để SP-3** khi đụng schema. **Fail loud, không giấu** (Rule 12).

---

## 9. Multi-step connector an toàn (bounded)

- **Bounded sẵn:** `maxRounds=4` (SP-1) bound số vòng READ trước write trong 1 turn.
- **1 write / turn:** write đầu tiên suspend ngay (§6.2) ⇒ không bao giờ chạy chuỗi nhiều write ngầm.
- **Nhiều write = nhiều turn confirm:** mỗi write là một vòng gate độc lập, người duyệt từng cái. Resume sinh **text-only** ⇒ không tự nối write kế tiếp; write kế đến từ **lượt user mới**.
- **Fail-soft xuyên suốt:** lỗi connector/Ollama/redact/token → text thân thiện, **không** nuốt im (log). Không có "completed" giả khi có bước bị bỏ (Rule 12).

---

## 10. Test plan (vitest thuần — mock `@/db`, `@/lib/connectors`(execute), `@/lib/connectors/crypto` thật, no live service)

| File test | Khẳng định (intent, Rule 9) |
|---|---|
| `policy.test.ts` | 5 internal=read; `trello_create_card`=write; 13 connector read=read; **tool lạ → write + log** (fail-closed) |
| `token.test.ts` | seal→open round-trip; sửa blob → ok:false; quá `exp` → ok:false; payload giữ nguyên `{name,args,userId,nonce}` |
| `redact.test.ts` | scrub `?key=…&token=…` (Trello), `Bearer …`, `ghp_…`; giữ nguyên text thường; deep object/array |
| `gate.test.ts` | read → gọi inner + redact+bound; write chưa confirm → **throw PendingWriteSignal, inner KHÔNG gọi**; confirmedAction khớp → inner gọi |
| `preview.test.ts` | `trello_create_card` → title/summary/fields đúng; arg nhạy cảm → redacted trong fields |
| `audit.test.ts` | `recordWrite` insert đúng action/target; `isNonceUsed` true sau khi ghi, false trước |
| `resume.test.ts` | execute **đúng 1 lần** đúng signed args; vòng text gọi Ollama **tools rỗng** → 0 tool_call mới; nonce lần 2 → reject; approve:false → execute không gọi |
| `route` (mở rộng) | write → **không** stream câu thường mà phát frame `pending_write` (mock execute KHÔNG gọi); **connector read path KHÔNG đổi**; confirm approve → execute + stream; token hỏng → lỗi thân thiện |

---

## 11. Coordination & files

**File mới (SP-2 sở hữu):** `src/lib/agent/safety/{policy,gate,token,preview,redact,audit}.ts` + `*.test.ts`.
**Sửa (backend, được phép):** `src/app/api/chat/route.ts` — phân nhánh union body, `withSafety`, nhánh suspend/resume.
**Bảng:** `audit_log` insert (sẵn có, không schema).
**Handoff FE:** `.serena/memories/backlog/agent-harness-sp2-fe-confirm.md` (wire contract §7).

**Cross-SP (đã đồng bộ qua comms):**
- **SP-4 (frame):** SP-2 phát `{t:"pending_write",…}` theo schema chung do SP-4 sở hữu; render phụ thuộc frame-router chung. **Cải tiến SP-2 đề xuất:** write đã-confirm chạy **qua** `makeDispatch` (one-shot `confirmedAction`) ⇒ `onEvent` **vẫn phát** ⇒ SP-4 nhận event của write miễn phí (cải thiện so với note "execute ngoài makeDispatch"). Chờ lead/SP-4 chốt; mặc định: qua-wrapper.
- **SP-3 (schema/audit):** SP-2 không đụng schema; chỉ dùng `audit_log`, action `"agent_write"`. Unique-index cho nonce = việc SP-3.

**Vận hành (agent-ops-rules):** không chạy ngầm dev/build/docker/ollama; verify bằng `npx vitest run` + targeted reads. Worktree riêng tạo ở bước implementation (sau khi spec + plan duyệt).

---

## 12. Decision log (SP-2)
- **D-SP2-1:** Gate = **lớp bọc `withSafety`** quanh `dispatch`, **zero đổi hợp đồng SP-1**. (Thay vì thêm param vào `makeDispatch`.)
- **D-SP2-2:** Token = **`encryptJson` (AES-256-GCM) tái dùng `connectors/crypto`** thay HMAC tự viết — vừa toàn vẹn vừa **bảo mật** (args mờ với client). Không dep/env mới.
- **D-SP2-3 (🔴):** Resume **execute signed write 1 lần trong code** + convo tổng hợp tại chỗ + sinh **text-only (tools rỗng)**; **bỏ READ Turn 1**. Chống double-execute mà không cần SP-3.
- **D-SP2-4:** Card/proposal **luôn** dựng từ `buildPreview(args)` (code-truth, Rule 13), không từ prose model; tránh message rỗng.
- **D-SP2-5:** Phân loại connector bằng **set tên + fail-closed** (`policy.ts`); default write cho tool lạ. (Thêm `kind` vào connector = defer.)
- **D-SP2-6:** Redact áp **result + args + preview + audit**; bound áp cho connector (vá lỗ hổng L4 của SP-1).
- **D-SP2-7:** Always-confirm mỗi write (không trust toggle) ở POC. Audit qua `audit_log` sẵn có; race nonce tồn dư = defer SP-3.

## 13. Open questions
- **Q1:** TTL token 5 phút hợp lý? (nếu user rời đi rồi quay lại confirm muộn → re-ask.)
- **Q2:** `onEvent` cho write đã-confirm: qua-wrapper (mặc định) hay execute-ngoài + phát thủ công? (chờ SP-4.)
- **Q3:** Khi gate một **connector tool lạ** (fail-closed) mà thực ra là read vô hại → có cần "allowlist nhanh" để giảm ma sát không, hay cứ buộc khai báo `policy.ts`? (mặc định: buộc khai báo — an toàn hơn.)

## 14. Phụ thuộc & rủi ro
- Phụ thuộc: Ollama tool-calling (đã có); `connectors/crypto` (đã có); `audit_log` (đã có). **Không** đổi hạ tầng/schema/dep.
- Rủi ro: model local không phát đúng `tool_call` write → user không thấy card (fail-soft, không sai an toàn). Frame `pending_write` cần frame-router FE (SP-4) để render → handoff rõ. Race nonce (đã nêu, chấp nhận).
- Coordination: chỉ đụng `route.ts` (backend) + thêm `agent/safety/*`. **Không** đụng `components/chat/*`, connectors, schema.
