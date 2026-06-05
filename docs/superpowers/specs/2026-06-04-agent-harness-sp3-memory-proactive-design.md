# SP-3 Memory & Proactive — Agent Harness (deep-dive spec)

> **Sub-project 3** của roadmap `docs/superpowers/specs/2026-06-04-agent-harness-architecture.md` (lớp **L5 Memory** + lớp **proactive**).
> **Vai trò tài liệu:** spec chi tiết để writing-plans → TDD. Trích dẫn **hợp đồng SP-1 §2** (`src/lib/agent/types.ts`) làm cố định.
> **Ngày:** 2026-06-04 · **Chủ:** orchestrator SP-3 · **Trạng thái:** chờ user review → writing-plans.
> Serena: [[agent-harness-architecture]] · [[agent-harness-sp-analysis-plan]] · [[db-migrations]] · [[agent-ops-rules]] · [[poc-model-choice]].
> Phối hợp đã chốt: `comms/resolved/sp3-to-lead-design-review.md` (verdict A1–A4 của chủ SP-1) · `comms/resolved/lead-to-sp3-persistence-and-audit.md`.

---

## 1. Mục tiêu & phạm vi

**Mục tiêu:** làm trợ lý chat **bền** với hội thoại dài và **chủ động** với trạng thái giám sát:
1. **Persist tool turns** — lưu lại các lượt tool (tool_call + tool_result) hiện đang bị bỏ, để có lịch sử đầy đủ (nền cho SP-4 render + SP-2 đơn giản hoá resume sau).
2. **Summarize** — khi lịch sử vượt ngân sách token của model local 16GB, tóm tắt lượt cũ (model = judgment) để không vỡ context.
3. **Proactive** — phát hiện agent **kẹt** / chi phí **cao bất thường** (tái dùng `isStuck` + dữ liệu `agent_session`) và **chủ động nêu trong chat**, có ngưỡng + dedupe để tránh nhiễu.

**Trong phạm vi:** bảng mới `chat_tool_call`; cột mới trên `chat_conversation` (`summary`, `summarizedThroughId`, `proactiveState`); migration `0003` (additive); 3 module thuần mới `src/lib/agent/{persist,summarize,proactive}.ts`; tách loader dùng chung `src/lib/agent/tools/laam/_load.ts`; nối tất cả vào `src/app/api/chat/route.ts`.

**Ngoài phạm vi (defer / không làm):**
- **Token-undercount của vòng tool** (cost sai) → **OUT of scope**, đã thành backlog **do chủ SP-1 (orchestrator) sở hữu**: `backlog/agent-harness-tooltoken-usage.md` (verdict A4).
- **Render tool turns ra UI** → SP-4 (SP-3 chỉ GHI `chat_tool_call`, không sửa `components/chat/*`).
- **Stream proactive ra banner/SSE** → đã loại; user chốt surface **in-chat tại turn time** (không background service).
- Không RAG/vector store; không đổi model; không sửa `connectors/*`; không đổi `types.ts` hay chữ ký `buildSystemPrompt`.

**Success criteria (verify được):**
1. Sau 1 lượt chat có gọi tool, bảng `chat_tool_call` có đủ hàng (name/args/result/ok/bytes) khớp số tool đã gọi; `chat_message` **không** mọc role lạ; `/api/conversations/[id]` + ChatClient hiển thị **y như cũ** (không thấy JSON tool thô).
2. Hội thoại vượt ngân sách → có `summary` + `summarizedThroughId` được ghi; payload gửi Ollama = `[system, (summary note), N lượt gần nhất]` (bị **bound**, không gửi toàn bộ lịch sử); câu trả lời vẫn mạch lạc.
3. Khi có agent kẹt/chi phí cao **mới**, lượt chat kế tiếp model nêu cảnh báo (đến từ dữ liệu thật, không bịa); cùng cảnh báo **không lặp lại mỗi turn** (dedupe). Không có agent kẹt → không nhiễu.
4. Mọi logic ở `src/lib/agent/{persist,summarize,proactive}.ts` + `_load.ts` là **hàm thuần + DI**, test vitest không cần Ollama/DB sống. Baseline **398 test xanh** + test mới. `tsc` sạch, `next build` xanh.
5. Lỗi persist/summarize/proactive → **fail-soft** (chat vẫn trả lời bình thường), **có log** (Rule 12). Migration chỉ chạy trên host (ACTION REQUIRED rõ ràng).

---

## 2. Hợp đồng & ảnh hưởng (contract impact)

| Thành phần | Trạng thái | Ghi chú |
|---|---|---|
| `src/lib/agent/types.ts` | **FROZEN — không đổi** | SP-3 không cần type mới trong hợp đồng. |
| `buildSystemPrompt` (context.ts) | **FROZEN — không đổi chữ ký** | Proactive **compose quanh** (nối chuỗi output), không thêm param (verdict A3). |
| `runToolRounds` (orchestrator.ts) | **không đổi** | Persist đọc **giá trị trả về** (`convo`), không cần `onEvent`/`ToolEvent` (verdict A1). |
| `ToolEvent` / `onEvent` | **không đụng** | Vẫn dành riêng cho SP-4 stream. |
| `query-stats.ts` | **sửa nhẹ (được chủ SP-1 authorize)** | Rút `loadSessionRows` ra `_load.ts`, import lại (verdict A2(b)). Không phá test. |
| Schema (`chat_conversation`, +`chat_tool_call`) | **ADDITIVE migration 0003** | CREATE TABLE + ADD COLUMN, backward-compatible. |
| `src/app/api/chat/route.ts` | **sửa** (SP-3 sở hữu lượt này) | Bản refactor SP-1 đã merge `main`; SP-3 tự rebase. |
| `components/chat/*`, `connectors/*`, Dockerfile/compose | **KHÔNG đụng** | |

**Nguyên tắc xuyên suốt:** *compose around frozen contracts, đừng sửa chúng* — đây là điều giữ SP-3 merge không gây rework cho SP-1/2/4 (Rule 7).

---

## 3. Thiết kế Feature 1 — Persist tool turns

### 3.1 Bảng `chat_tool_call` (Drizzle, additive)
```ts
// thêm vào src/db/schema.ts ; nhớ thêm `boolean` vào import drizzle-orm/pg-core
export const chatToolCalls = pgTable("chat_tool_call", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  conversationId: text("conversationId")
    .notNull()
    .references(() => chatConversations.id, { onDelete: "cascade" }),
  // assistant message mà lượt tool này phục vụ; nullable cho ca câu trả lời rỗng.
  messageId: text("messageId").references(() => chatMessages.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull().default(0),     // thứ tự trong 1 turn
  name: text("name").notNull(),                  // tên tool (internal laam_* hoặc connector)
  args: jsonb("args"),                           // arguments model gửi (đã chuẩn hoá về object)
  result: jsonb("result"),                       // kết quả dispatch (object/array/string)
  ok: boolean("ok").notNull().default(true),     // result KHÔNG có key 'error'
  bytes: integer("bytes").notNull().default(0),  // độ dài JSON result (đo tải context)
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});
export type ChatToolCall = typeof chatToolCalls.$inferSelect;
```
`chat_message` **giữ nguyên** ⇒ display path + Ollama-replay path không cần lọc gì (verdict A1/A3 của thread persistence).

### 3.2 Core thuần `src/lib/agent/persist.ts`
```ts
import type { ChatMessage } from "./orchestrator";

export type ToolTurnRow = {
  seq: number; name: string; args: unknown; result: unknown; ok: boolean; bytes: number;
};

// Trích các lượt tool mà runToolRounds đã APPEND (từ baseLen trở đi). Convo có cấu trúc:
//   { role:'assistant', tool_calls:[tc0, tc1...] }  rồi N × { role:'tool', content: JSON(result) }
// Ghép tc[i] với tool message kế tiếp theo thứ tự. Thuần — test không cần DB.
export function extractToolTurns(convo: ChatMessage[], baseLen: number): ToolTurnRow[];
```
**Quy tắc trích (chính xác để impl + test):**
- Chỉ xét `convo.slice(baseLen)`. `seq` chạy 0,1,2… qua toàn bộ lượt tool của turn.
- `name` = `tc.function?.name`. `args` = `tc.function?.arguments`, nếu là **chuỗi** thì thử `JSON.parse` (giống `makeDispatch`); lỗi parse → giữ `{}`.
- `result` = `JSON.parse(toolMsg.content)`; lỗi parse → giữ chuỗi thô.
- `ok` = **không** phải `(result là object && có key 'error')`. `bytes` = `toolMsg.content.length`.
- Phòng thủ: số `tool` message ≠ số `tool_calls` → ghép theo index, thiếu thì bỏ qua (không ném).
- Không có lượt tool → `[]`.

### 3.3 Nối vào route (verdict A1 — capture baseLen TRƯỚC)
```ts
const baseLen = payload.messages.length;            // chụp TRƯỚC runToolRounds
payload.messages = await runToolRounds(payload.messages, tools, { callOllama, dispatch });
const toolTurns = extractToolTurns(payload.messages, baseLen);   // phần append
```
**Persist** trong khối `finally` của stream (nơi đã insert assistant message), dùng **id assistant tạo sẵn**:
```ts
const assistantMsgId = crypto.randomUUID();         // tạo sớm để FK
// ...trong finally, sau khi stream xong:
if (full) await db.insert(chatMessages).values({ id: assistantMsgId, conversationId: convId, role:"assistant", content: full, tokensIn, tokensOut });
if (toolTurns.length) {
  await db.insert(chatToolCalls).values(toolTurns.map(t => ({
    conversationId: convId, messageId: full ? assistantMsgId : null,
    seq: t.seq, name: t.name, args: t.args, result: t.result, ok: t.ok, bytes: t.bytes,
  }))).catch(() => {/* fail-soft + log; không vỡ chat */});
}
```
- `extractToolTurns` **tool-agnostic** ⇒ lưu cả internal `laam_*` lẫn connector tool. Cả write-turn đã-confirm của SP-2 (nếu có sau này) cũng được lưu — persist không cần biết (verdict A1).
- SP-3 chỉ **GHI**; SP-4 đọc `chat_tool_call` (join theo `messageId`, sắp theo `seq`) để render. `/api/conversations/[id]` **chưa** trả tool calls (để SP-4).

---

## 4. Thiết kế Feature 2 — Summarize hội thoại dài

### 4.1 Lưu trữ (cột additive trên `chat_conversation`)
- `summary text` (nullable) — tóm tắt cuộn (rolling) các lượt đã gập.
- `summarizedThroughId text` (nullable) — id `chat_message` cuối cùng đã nằm trong `summary` (watermark).

### 4.2 Core thuần `src/lib/agent/summarize.ts`
```ts
export type HistoryMsg = { id: string; role: string; content: string };
export type HistoryPlan = {
  needsSummary: boolean;
  toSummarize: HistoryMsg[];  // lượt cũ cần gập vào summary
  toReplay: HistoryMsg[];     // lượt gần nhất giữ nguyên văn
};

// THUẦN. Quyết định cần tóm tắt không + chia lượt. Ngân sách theo CHAR (không cần tokenizer;
// ~chars/4 ≈ token). `now` không cần ở đây.
export function planHistory(
  messages: HistoryMsg[],            // toàn bộ history (user|assistant), thứ tự thời gian
  existingSummary: string | null,
  watermarkId: string | null,
  opts?: { budgetChars?: number; keepLast?: number },
): HistoryPlan;
```
**Logic:**
1. `live` = các message **sau** `watermarkId` (đã summarize thì bỏ). Không có watermark → `live` = toàn bộ.
2. Ước lượng `cost = len(existingSummary) + Σ len(live[i].content)`.
3. `cost ≤ budgetChars` → `{needsSummary:false, toSummarize:[], toReplay: live}`.
4. Ngược lại → giữ nguyên văn `keepLast` message cuối; phần còn lại của `live` đem gập:
   `toSummarize = live[0 .. len-keepLast]`, `toReplay = live[len-keepLast ..]`, `needsSummary:true`.
5. **Sàn an toàn:** luôn giữ ≥ 2 message cuối (lượt user hiện tại + 1). Nếu `live.length ≤ 2` mà vẫn quá ngân sách (1 message khổng lồ) → `needsSummary:false`, replay nguyên (model tự cắt) + **log** (không thể tóm tắt lượt đang hoạt động — giới hạn thành thật, Rule 12).

**Mặc định:** `budgetChars = 16000` (~4k token, an toàn cho qwen3-vl 16GB), `keepLast = 6` (3 cặp hỏi-đáp).

### 4.3 I/O `summarizeMessages` (model = judgment, DI để test)
```ts
export type SummarizeDeps = { callModel: (prompt: string) => Promise<string> };
export async function summarizeMessages(
  toSummarize: HistoryMsg[], prevSummary: string | null, lang: string, deps: SummarizeDeps,
): Promise<string>;
```
- Prompt (theo `lang`): "Gộp **tóm tắt trước** + đoạn hội thoại cũ dưới đây thành bản tóm tắt ngắn gọn giữ lại **sự kiện, quyết định, tên/ID/số liệu chính xác** cần để tiếp tục. Chỉ xuất tóm tắt." Kèm `prevSummary` + nội dung `toSummarize`.
- **Rule 13 / lossy:** summary là model-output → không thể ground tuyệt đối. Giảm thiểu bằng việc **giữ nguyên văn `keepLast` lượt gần nhất** (độ chính xác ở gần đây không mất); summary chỉ cho bối cảnh xa. Spec ghi rõ summary là **lossy**.

### 4.4 Nối vào route (trước khi dựng tool-loop)
1. Load history (thêm `id` vào select). Load `conv.summary`, `conv.summarizedThroughId`.
2. `plan = planHistory(history, summary, watermarkId)`.
3. `if plan.needsSummary`: `newSummary = await summarizeMessages(plan.toSummarize, summary, lang, {callModel})`; `db.update(chatConversations).set({ summary:newSummary, summarizedThroughId: last(plan.toSummarize).id })`; `effectiveSummary = newSummary`. Else `effectiveSummary = summary`.
4. Dựng `payload` với **history đã bound** = `plan.toReplay.map(m=>({role,content}))` (thay cho `history.map(...)` cũ).
5. Nếu `effectiveSummary`: chèn **một** message bối cảnh ở index 1 (sau system): `{ role:"system", content: "Bối cảnh hội thoại trước (tóm tắt): " + effectiveSummary }`. *(Open-Q1 impl: nếu qwen xử lý kém 2 system message, fallback dùng role 'user'.)*
- Tóm tắt **đồng bộ tại turn vượt ngân sách** (+1 lần gọi Ollama). Bắt buộc bởi no-background-service; hiếm khi xảy ra. Tối ưu async sau-câu-trả-lời = future (D-SP3-3).

---

## 5. Thiết kế Feature 3 — Proactive (in-chat tại turn time)

### 5.1 Loader dùng chung `src/lib/agent/tools/laam/_load.ts` (verdict A2(b))
- **Chuyển** `loadSessionRows()` (hiện private trong `query-stats.ts`) sang `_load.ts`, `export`.
- `query-stats.ts` import từ `_load`; `proactive.ts` import từ `_load`. **Một nguồn**, diệt bản sao thứ 3.
- `/api/stats/route.ts`: **chỉ** repoint nếu là swap 1 import + `stats` test giữ xanh; nếu không, để nguyên + ghi chú (verdict A2 — ưu tiên không phá test).

### 5.2 Core thuần `src/lib/agent/proactive.ts`
```ts
import type { SessionRow } from "@/lib/stats.types";
import { isStuck } from "@/lib/stuck";

export type ProactiveAlert = {
  type: "stuck" | "cost";
  key: string;            // dedupe ổn định: `stuck:<id>` | `cost:<id>`
  sessionId: string;
  project: string | null;
  minutesIdle?: number;   // cho stuck
  costUsd?: number;       // cho cost
};

export function detectAlerts(
  rows: SessionRow[], now: number,
  opts?: { stuckMin?: number; costUsd?: number; burnUsdPerMin?: number; max?: number },
): ProactiveAlert[];
```
**Quy tắc (chính xác — yêu cầu A3 của chủ SP-1):**
- **Stuck:** với mỗi row, `isStuck({status, lastActivity}, stuckMin, now)` → alert `stuck`, `minutesIdle = round((now-lastActivity)/60000)`. **Ngưỡng `stuckMin = 10′`** (khớp `laam_find_stuck` + `isStuck` SP-1).
- **Cost-alert (KHÔNG phải "spike" windowed):** với mỗi row **chưa done**, cảnh báo nếu `costUsd ≥ costUsd(ngưỡng, mặc định 1.0)` **HOẶC** burn-rate `costUsd / durationMin ≥ burnUsdPerMin (mặc định 0.10)` với `durationMin=(lastActivity-startedAt)/60000 > 0`.
  - ⚠️ **Giới hạn dữ liệu (Rule 12):** `agent_session` chỉ lưu **tổng** cost mỗi phiên, **không** có cost theo mốc thời gian ⇒ **không tính được Δcost/Δt thật**. "Cost-alert" ở đây = *"agent này đang đắt"* (tuyệt đối/burn-rate), không phải đột biến theo cửa sổ. Đột biến thật = cần timeline per-event → enhancement tương lai. Spec nêu thẳng để không ngụ ý độ chính xác không có.
- Cắt `max` (mặc định 5) alert/lần để tránh ngập.
- **Tái dùng** `isStuck` + `_load` (không nhân bản). `computeStats` không cần cho phát hiện per-session (sẵn dùng nếu sau cần tổng hợp).

### 5.3 Dedupe per-conversation `proactiveState jsonb` (verdict — KHÔNG đụng audit_log)
```ts
export type ProactiveState = { surfaced: Record<string, number> };  // key -> epoch ms lần nêu cuối

// THUẦN. Lọc alert mới cần nêu + trả state cập nhật. cooldownMs: cùng key chỉ nêu lại sau cooldown.
export function selectNewAlerts(
  alerts: ProactiveAlert[], state: ProactiveState | null, now: number, cooldownMs?: number,
): { toSurface: ProactiveAlert[]; newState: ProactiveState };
```
- `toSurface` = alert có `key` **chưa** trong `surfaced` **hoặc** `now - surfaced[key] > cooldownMs`.
- `cooldownMs` mặc định **6 giờ** ⇒ agent vẫn kẹt sẽ nhắc lại tối đa mỗi 6h, **không lặp mỗi turn**.
- `newState.surfaced` = cũ + cập nhật `now` cho các key vừa nêu. (Có thể prune key cũ > 24h để gọn.)

### 5.4 Formatter thuần + nối route (compose-around — verdict A3)
```ts
export function formatProactiveNotice(alerts: ProactiveAlert[], lang: string): string; // '' nếu rỗng
```
Ví dụ (vi): `"⚠️ Lưu ý chủ động: 2 agent đang kẹt — LAAM (kẹt 25′), API (kẹt 14′); 1 agent chi phí cao — Worker ($1.30). Nếu liên quan, hãy nhắc người dùng."`

**Nối route (giữ `buildSystemPrompt` nguyên chữ ký):**
```ts
const sysPrompt = buildSystemPrompt({ lang, now, toolNames });
let finalSystem = sysPrompt;
if (!bodySystemOverride) {                          // user tự đặt system → bỏ qua proactive
  const rows = await loadSessionRows();             // +1 DB read/turn (như Dashboard)
  const alerts = detectAlerts(rows, now);
  const { toSurface, newState } = selectNewAlerts(alerts, conv.proactiveState ?? null, now);
  const notice = formatProactiveNotice(toSurface, lang);
  if (notice) {
    finalSystem = sysPrompt + "\n\n" + notice;      // COMPOSE AROUND, không sửa buildSystemPrompt
    await db.update(chatConversations).set({ proactiveState: newState }).where(eq(chatConversations.id, convId));
  }
}
payload.messages[0] = { role: "system", content: bodySystemOverride ?? finalSystem };
```
Đây cũng **chốt Open-Q1 của SP-1**: CÓ bơm "light state" nhưng **chỉ alert có chủ đích** (ngưỡng + dedupe), không dump toàn trạng thái.

### 5.5 Thứ tự nối trong `route.ts` (tổng hợp cả 3 feature — **load-bearing**)
Sai thứ tự ⇒ `baseLen` lệch (lưu nhầm summary thành tool turn) hoặc mất context. Trình tự bắt buộc:
1. Resolve/insert conversation. **Load (hoặc default `null`) 3 cột mới:** `summary`, `summarizedThroughId`, `proactiveState`. Conversation **mới** → cả 3 = `null`; conversation **cũ** → **mở rộng câu `select` ownership hiện có** (route đang chỉ lấy để kiểm chủ sở hữu) để lấy thêm 3 cột này.
2. Insert user message; load `history` (thêm `id` vào select).
3. **Summarize:** `plan = planHistory(history, summary, watermarkId)`; nếu `needsSummary` → `summarizeMessages(...)` + `db.update` `summary`/`summarizedThroughId`.
4. Dựng `payload` với history = **`plan.toReplay`** (không phải toàn bộ). Nếu có `effectiveSummary` → chèn message bối cảnh ở **index 1**.
5. **Proactive** (bỏ qua nếu có `body.system`): detect → `selectNewAlerts` → nối notice vào system → gán `payload.messages[0]`; nếu có nêu → `db.update` `proactiveState`.
6. Dựng `tools` + `dispatch`; **`baseLen = payload.messages.length`** — chụp **SAU bước 4–5, TRƯỚC `runToolRounds`** (verdict A1).
7. `runToolRounds` → `toolTurns = extractToolTurns(payload.messages, baseLen)`.
8. Stream câu cuối; trong `finally`: insert assistant message (id tạo sẵn) + insert `chat_tool_call` — **mỗi bước fail-soft + log**, không vỡ chat.

---

## 6. Migration `0003` (ADDITIVE — ACTION REQUIRED trên host)

`db:generate` sẽ sinh `drizzle/0003_*.sql` đại ý:
```sql
CREATE TABLE "chat_tool_call" (
  "id" text PRIMARY KEY NOT NULL,
  "conversationId" text NOT NULL,
  "messageId" text,
  "seq" integer DEFAULT 0 NOT NULL,
  "name" text NOT NULL,
  "args" jsonb, "result" jsonb,
  "ok" boolean DEFAULT true NOT NULL,
  "bytes" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "chat_conversation" ADD COLUMN "summary" text;
ALTER TABLE "chat_conversation" ADD COLUMN "summarizedThroughId" text;
ALTER TABLE "chat_conversation" ADD COLUMN "proactiveState" jsonb;
ALTER TABLE "chat_tool_call" ADD CONSTRAINT ... FOREIGN KEY ("conversationId") REFERENCES "chat_conversation"("id") ON DELETE cascade;
ALTER TABLE "chat_tool_call" ADD CONSTRAINT ... FOREIGN KEY ("messageId") REFERENCES "chat_message"("id") ON DELETE cascade;
```
- Tất cả **CREATE TABLE / ADD COLUMN** ⇒ backward-compatible; hàng cũ: 3 cột mới = NULL (đọc sạch).
- **KHÔNG hand-write** file SQL — chạy `db:generate` để khớp snapshot drizzle. Đánh số tiếp **0003** (mới nhất `0002_natural_chat`, đã verify journal).
- **ACTION REQUIRED (user chạy trên host, không sandbox — [[db-migrations]] / [[agent-ops-rules]]):**
  1. `npm run db:generate` → review `drizzle/0003_*.sql` + `meta/`.
  2. commit `drizzle/`.
  3. `npm run db:migrate`.
- Tôi (agent) **KHÔNG** tự chạy db:generate/migrate, **KHÔNG** chạy ngầm service.

---

## 7. Test plan (vitest, mirror style SP-1 — mock `@/db`, `@/auth`)

- `persist.test.ts`: `extractToolTurns` — ghép assistant.tool_calls với tool message; slice theo `baseLen`; args dạng chuỗi → parse; `ok=false` khi result có `error`; `bytes` đúng; lệch số call/result → không ném; không tool → `[]`.
- `summarize.test.ts`: `planHistory` — dưới ngân sách → `needsSummary:false`; trên ngân sách → chia `toSummarize`/`toReplay` giữ `keepLast`; lọc theo `watermarkId` (chỉ lượt sau watermark); sàn ≥2 message. `summarizeMessages` với `callModel` mock → gộp `prevSummary`; **test giữ nguyên văn** `toReplay` (không bị model đụng).
- `proactive.test.ts`: `detectAlerts` — stuck đúng ngưỡng 10′; cost-alert theo tuyệt đối + burn-rate; **done bị loại**; cắt `max`. `selectNewAlerts` — key mới nêu; key vừa nêu trong cooldown bị chặn; key cũ quá cooldown nêu lại. `formatProactiveNotice` — vi/en/zh; rỗng → `''`.
- `_load`: query-stats test cũ vẫn xanh sau khi chuyển loader (test nhắm `shapeStatsSummary`, không nhắm loader → an toàn). Nếu repoint `/api/stats`: chạy stats test xác nhận xanh.
- `route.test.ts`: thêm test nhẹ — history bound khi over-budget (mock); proactive notice nối vào system khi có alert (mock loader). Giữ test cũ.
- **Toàn bộ:** `npx vitest run` = 398 + mới đều xanh; `tsc --noEmit` sạch; `npm run build` xanh (trong worktree, không đụng cây dev — agent-ops-rules).

---

## 8. Decision log (SP-3)

- **D-SP3-1:** Persist = **bảng mới `chat_tool_call`** (không thêm role 'tool' vào `chat_message`) ⇒ consumer hiện có không vỡ. *(user + chủ SP-1 duyệt.)*
- **D-SP3-2:** Persist đọc **`convo` trả về** của `runToolRounds` (slice từ `baseLen`), **không** dùng `ToolEvent` (thiếu body/args). *(verdict A1.)*
- **D-SP3-3:** Summarize **đồng bộ tại turn vượt ngân sách**, model sinh summary, giữ nguyên văn `keepLast`. Async sau-trả-lời = future.
- **D-SP3-4:** Proactive **compose quanh** `buildSystemPrompt` (nối chuỗi), giữ chữ ký L1 (Rule 7). Chốt **Open-Q1 SP-1** = bơm *alert có chủ đích*. *(verdict A3.)*
- **D-SP3-5:** **Cost-alert = tuyệt đối/burn-rate trên phiên chưa done, KHÔNG phải Δcost/Δt windowed** (dữ liệu summary chỉ có tổng/phiên — nêu rõ giới hạn). *(verdict A3.)*
- **D-SP3-6:** Dedupe **per-conversation** qua `proactiveState jsonb` + cooldown 6h. **Không** đụng `audit_log` (tránh xung đột SP-2).
- **D-SP3-7:** Rút **`loadSessionRows` → `_load.ts`** dùng chung (query-stats + proactive). *(verdict A2(b); chủ SP-1 authorize sửa query-stats.)*
- **D-SP3-8:** **Token-undercount OUT of scope** → backlog do chủ SP-1 sở hữu. *(verdict A4.)*
- **D-SP3-9:** `now` inject (epoch ms) vào mọi core; không `Date.now()` trong hàm thuần (mirror D-SP1-6).
- **D-SP3-10:** Mọi side-effect mới (persist tool turns / summarize / update proactiveState) **fail-soft + log**; không vỡ luồng chat (Rule 12).

---

## 9. Open questions (chốt khi review / writing-plans)

- **Q1 (impl):** Chèn summary là **system message #2** (mặc định) hay role 'user' nếu qwen3-vl xử lý kém 2 system message? Chốt lúc smoke test.
- **Q2 (tuning):** Mặc định `budgetChars=16000`, `keepLast=6`, `stuckMin=10`, `costUsd=1.0`, `burnUsdPerMin=0.10`, `cooldown=6h`, `max=5`. Để hằng số (có thể nâng env sau)? Tinh chỉnh sau test thật.
- **Q3:** Proactive chạy `loadSessionRows` **mỗi turn** (+1 DB read). Chấp nhận (như Dashboard); có cần cache ngắn không? (mặc định: không, giữ đơn giản.)
- **Q4:** Persist cũng lưu **connector tool turns** (extractToolTurns tool-agnostic) — xác nhận mong muốn (mặc định: có, lịch sử đầy đủ).

## 10. Phụ thuộc & rủi ro

- **Migration host-only** (drizzle-kit không chạy sandbox) — ACTION REQUIRED §6.
- **Độ trễ:** +1 Ollama call ở turn tóm tắt (hiếm); +1 DB read/turn cho proactive.
- **Summary lossy** — giảm thiểu bằng giữ nguyên văn lượt gần.
- **Nhiễu proactive** — giảm thiểu bằng ngưỡng + dedupe + cooldown; "cost-alert" nêu rõ là tuyệt đối (không spike thật).
- **Coordination:** chỉ đụng `route.ts` (rebase tự lo) + thêm `src/lib/agent/*` + sửa nhẹ `query-stats.ts` (đã authorize). Không đụng `components/chat/*` (SP-4/FE), `connectors/*`, hạ tầng. Worktree riêng (Phase 3) khi implement.
