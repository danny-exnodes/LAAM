# SP-4 UX Feedback — Agent Harness (deep-dive spec)

> **Sub-project 4** của roadmap `docs/superpowers/specs/2026-06-04-agent-harness-architecture.md`.
> **Vai trò tài liệu:** spec chi tiết + **đóng băng hợp đồng frame** (`ChatFrame`) mà SP-2 trích dẫn.
> **Ngày:** 2026-06-05 · **Chủ:** orchestrator SP-4 (UX feedback) · **Trạng thái:** chờ user review → writing-plans.
> Serena: [[agent-harness-architecture]] · [[agent-harness-sp4-ux-feedback]] · spec SP-1 §2 · comms `lead-to-sp4-frame-protocol`.

---

## 1. Mục tiêu & phạm vi

**Mục tiêu:** cho người dùng chat **thấy** trợ lý đang/đã gọi internal/connector tool nào (trace ✓/✗ + args tóm tắt) và **nguồn** dữ liệu cho câu trả lời (citations) — **không phá** trải nghiệm streaming hiện tại, **fail-soft**.

**Trong phạm vi:**
- Nối `onEvent` của `makeDispatch` → phát **frame** ra stream (chế độ **Gộp**).
- **Giao thức frame chung** (envelope `U+001E` + discriminated union `t`) — module thuần `src/lib/chat/frames.ts` (SP-4 sở hữu; SP-2 dùng `t:"pending_write"`).
- FE render: `ToolTrace` (gập) + `Citations` (footer), **điểm chạm tối thiểu** vào `components/chat/*` (FE sở hữu).
- Redaction args (server-side, set-membership) + citations chính xác (từ `convo`).
- i18n vi/en/zh.

**Ngoài phạm vi (defer):**
- **Trực tiếp / interleaved** (tick từng bước lúc tool chạy) → stretch, **nâng thuần server** sau (D-SP4-1).
- **Bền (durable)** trace/citations khi reload → đọc bảng `chat_tool_call` của **SP-3** (chưa merge); SP-4 nay **ephemeral**.
- Persist tool turns / summarize / proactive → SP-3. Confirm card write → SP-2 (`pending_write`).
- Không đổi schema; không đổi model; không sửa connectors.

**Success criteria (verify được):**
1. Câu cần tool ("agent nào kẹt?") → bong bóng hiện trace "✓ Tìm agent kẹt" + footer "Nguồn: Tìm agent kẹt" lấy **đúng** từ tool đã chạy.
2. Câu **không** gọi tool (chào hỏi) → **0 trace, 0 footer**, bong bóng y hệt hiện tại (streaming nguyên vẹn).
3. Tool trả `{error}`/rỗng (get_agent id sai) → trace **✓ (đã chạy)** nhưng **KHÔNG** vào "Nguồn" (citation chính xác từ `convo`, không từ `ok`).
4. User bấm Stop giữa chừng / stream cắt → **không** rò `U+001E{…}` ra bong bóng (guard frame một-phần).
5. token-usage cũ vẫn hiện đúng (migrate `{i,o}`→`{t:"tokens"}` không vỡ); reload đọc token từ cột DB.
6. Lỗi tạo frame → degrade: vẫn stream text thường (fail-soft, **có log** — Rule 12).
7. Logic thuần (`frames.ts`, `trace.ts`) test vitest không cần Ollama/DB; **baseline hiện hành xanh + test mới SP-4** (đo lại khi vào nhánh — KHÔNG hardcode số tuyệt đối; vd SP-3 ~435 có thể land trước); `tsc` sạch, `next build` xanh.

---

## 2. Hợp đồng (CONTRACTS)

### 2.1 Tái dùng từ SP-1 (KHÔNG sửa — Rule 7)
- `ToolEvent` (`types.ts`) **giữ nguyên**: `{type:"tool_call";name;args}` | `{type:"tool_result";name;ok;bytes}`.
- `onEvent` tiêm qua `makeDispatch(internal, ctx, onEvent?)` (`registry.ts:20-24`) — **KHÔNG** qua `ToolRoundsDeps`. ⚠️ *spec SP-1 §2 ghi `onEvent` trong `ToolRoundsDeps` = **drift**; SP-4 theo code.* (đề nghị chủ SP-1 cập nhật §2.)
- Citations suy từ **`convo`** mà `runToolRounds` trả (`orchestrator.ts:31-32` → `{role:'tool',content:JSON.stringify(result)}`, khoá bởi `orchestrator.test.ts:33-34`), **KHÔNG** mở rộng `ToolEvent` — theo verdict **A1** (lead → SP-3). Lý do: `ok` của `ToolEvent` = "không ném" ⇒ `get-agent.ts` trả `{error}` không ném vẫn `ok=true`.

### 2.2 SP-4 đóng băng (SP-2 trích dẫn) — `src/lib/chat/frames.ts`
```ts
export type ChatFrame =
 | { t:"tokens"; i:number; o:number }
 | { t:"tool"; phase:"call"|"result"; c:number; name:string; args?:string; ok?:boolean }
 | { t:"cite"; names:string[] }
 | { t:"pending_write"; token:string; tool:string; title:string; summary:string; fields?:{ label:string; value:string }[] }; // nội dung SP-2 sở hữu (narrow khớp shape thật SP-2; SP-2 chốt khi land)

export function encodeFrame(f: ChatFrame): string;            // = SEP + JSON.stringify(f) + SEP   (SEP = U+001E)
export function splitFrames(raw: string): { text: string; frames: ChatFrame[] };
```
**Quy tắc envelope (D-SP4-2 — verified):**
- Mỗi frame = `SEP + JSON-1-dòng + SEP`. `text` = mọi byte **ngoài** các cặp SEP. *(Frame token cũ = 1 SEP mở + JSON, **KHÔNG** SEP đóng — `route.ts:229`; envelope mới bọc 2 SEP là thay đổi có chủ đích.)*
- `encodeFrame` là **đường phát DUY NHẤT** (luôn `JSON.stringify` ⇒ không lọt SEP thô vào JSON).
- `splitFrames` **bắt buộc**: SEP mở **chưa có** SEP đóng (frame đuôi một-phần) ⇒ coi là *pending* → **loại khỏi `text`, KHÔNG parse, KHÔNG render**. Áp **mỗi chunk** trong vòng đọc (không chỉ buffer cuối) ⇒ không rò khi user Stop/cắt giữa chunk.
- Giả định nêu rõ: `U+001E` không xuất hiện trong text model; **attachment feed thô** (`ChatClient.tsx:138-144`) không sanitize ⇒ caveat (cực hiếm, ngang rủi ro hiện tại). **Hardening (vào plan):** strip `U+001E` khỏi text attachment ở `withAttachments` (1 dòng `.replaceAll`) — defense-in-depth cho D-SP4-2 (envelope-cặp có bề mặt rộng hơn `indexOf` cũ).

---

## 3. Thiết kế từng phần

### 3.1 `src/lib/chat/frames.ts` (THUẦN, dùng chung server + client)
- `encodeFrame`, `splitFrames` như §2.2. `splitFrames` = state-machine nhỏ: quét SEP; text ngoài cặp; frame trong cặp; **opener lẻ cuối → pending (ẩn)**.
- Test: round-trip; nhiều frame; **partial trailing frame ẩn (incremental per-chunk)**; token-frame shape; interleaved (future-proof cho Trực tiếp).

### 3.2 `src/lib/chat/trace.ts` (THUẦN, server-side)
- `summarizeArgs(name, rawArgs, isInternal): string | undefined` — internal: tóm tắt **an toàn ngắn** (vd `ngưỡng 10′`); connector: **KHÔNG hiện giá trị** (redact). `isInternal` = **set membership** trên `INTERNAL_TOOLS` names (D-SP4-3), **KHÔNG** theo prefix.
- `deriveCitations(convo, baseLen): string[]` — zip `assistant.tool_calls[].name` với các `{role:'tool'}` theo sau; tool vào citations nếu result **không** có key `error` và **không rỗng** (`[]`/`{}`/`""`). Tái dùng `extractToolTurns` của SP-3 nếu đã export; chưa thì bản cục bộ ~15 dòng cùng quy tắc (không tạo bản sao thứ 3 lâu dài).
- Test: convo fixture → cite set đúng (loại `{error}`/rỗng); redaction (connector ẩn giá trị, internal an toàn).

### 3.3 Server — `src/app/api/chat/route.ts` (nối onEvent + phát frame + migrate token)
- **Trước** `runToolRounds`: chụp `baseLen = payload.messages.length`; dựng collector:
  ```ts
  let c = -1; const toolFrames: ChatFrame[] = [];
  const internalNames = new Set(INTERNAL_TOOLS.map(t => t.name));
  const onEvent = (e: ToolEvent) => {
    if (e.type === "tool_call") { c++; toolFrames.push({ t:"tool", phase:"call", c, name:e.name, args: summarizeArgs(e.name, e.args, internalNames.has(e.name)) }); }
    else { toolFrames.push({ t:"tool", phase:"result", c, name:e.name, ok:e.ok }); }
  };
  const dispatch = makeDispatch(INTERNAL_TOOLS, { userId, now, lang }, onEvent);
  ```
  (Sự kiện phát **tuần tự** call→result ⇒ gán `c` đúng cặp; FE ghép theo `c`, không dựa thứ tự.)
- **Sau** `runToolRounds`: `const cites = deriveCitations(convo, baseLen);`
- **Stream:** text token **y như hiện tại**; cuối stream phát **trailing**: từng `toolFrames` → `encodeFrame`; rồi `encodeFrame({t:"cite",names:cites})` nếu `cites.length`; rồi `encodeFrame({t:"tokens",i,o})` **thay cho** `""+JSON({i,o})` cũ.
- **Gộp:** frame ở đuôi (sau text) — vị trí wire **độc lập** render (FE gắn vào message, vẽ trace **trên** / citations **dưới**). *Trực tiếp (sau) = đổi handler `onEvent` sang enqueue-ngay + mở stream trước; **protocol + FE 0 đổi** (D-SP4-1).*
- **Fail-soft:** mọi lỗi `summarizeArgs`/`deriveCitations`/`encodeFrame` bọc try/catch → bỏ frame, **vẫn stream text** (Rule 12: log).

### 3.4 Client — render (FE sở hữu — chạm **additive**, cần FE sign-off)
- `ChatClient.tsx` (chạm): thay khối strip thủ công (173-200) bằng `splitFrames` tích luỹ `raw` mỗi chunk → `{text, frames}`; set text; gom frames → cập nhật message: `toolTrace` (ghép tool frames theo `c`), `cites` (cite frame), `tokens` (tokens frame).
- `chat/types.ts` (chạm, **additive**): `ChatMsg += { toolTrace?: ToolTraceItem[]; cites?: string[] }`; `ToolTraceItem = { c:number; name:string; args?:string; ok?:boolean; done:boolean }`.
- `MessageItem.tsx` (chạm, **2 slot**): trên `MarkdownView` → `<ToolTrace items={msg.toolTrace}/>`; dưới → `<Citations names={msg.cites}/>`. Cả hai **null khi rỗng** (vô hình ca 0 tool — Success #2).
- **Mới (SP-4 sở hữu):** `ToolTrace.tsx` (dòng tóm tắt "Đã dùng N công cụ" + gập chi tiết ✓/✗ + args), `Citations.tsx` (footer "Nguồn: …"). Nhãn thân thiện: map `name`→i18n (`laam_*` map; connector humanize) — **mỹ thuật, client-side** (D-SP4-3: lệch nhãn ≠ rò).
- **i18n** vi/en/zh: keys `chat.toolUsed`, `chat.toolRunning`, `chat.toolDetail`, `chat.source` + map 5 nhãn `laam_*`.
- **Ephemeral:** `toolTrace`/`cites` chỉ sống trong phiên; `openConv` reload chỉ có text+token (DB). **Seam bền:** khi SP-3 merge `chat_tool_call`, `openConv`/API đọc bảng đó → fill `toolTrace`/`cites` (read-only, không đụng phần SP-3 ghi).

---

## 4. Files
**Mới (SP-4 sở hữu):** `src/lib/chat/frames.ts`+test · `src/lib/chat/trace.ts`+test · `src/components/chat/ToolTrace.tsx`+test · `src/components/chat/Citations.tsx`+test · i18n keys.
**Chạm — FE sở hữu (additive, KHÔNG rewrite, cần sign-off):** `ChatClient.tsx` · `chat/types.ts` · `MessageItem.tsx` · `i18n/dictionaries/chat.{vi,en,zh}`.
**Chạm — route:** `src/app/api/chat/route.ts` (onEvent + trailing frames + migrate token frame).

---

## 5. Test plan (vitest, mirror style hiện có)
- `frames.test.ts`: encode/split round-trip; nhiều frame; **partial trailing frame ẩn per-chunk** (Success #4); token migrate shape; interleaved.
- `trace.test.ts`: `deriveCitations` loại `{error}`/rỗng (Success #3); `summarizeArgs` redact connector / an toàn internal (D-SP4-3).
- `ToolTrace.test.tsx` / `Citations.test.tsx`: ✓/✗, gập, **null khi rỗng** (Success #2).
- route: mở rộng — `onEvent` nối → trailing frames đúng; token frame vẫn phát (tagged); framing lỗi → fail-soft text (Success #6). Giữ `route.test.ts` + **`MessageItem.test.tsx` + mọi test `components/chat/*` hiện có xanh** (sau khi thêm 2 slot).
- Baseline **hiện hành xanh + test mới SP-4** (KHÔNG hardcode tuyệt đối — SP-3 ~435 có thể land trước).

---

## 6. Decision log (SP-4)
- **D-SP4-1:** **Gộp** (multiplex `U+001E`) trong SP-4; **Trực tiếp** = stretch, nâng **thuần server** (protocol + FE bất biến theo thời điểm). SSE riêng: **loại**. *(user duyệt 2026-06-05)*
- **D-SP4-2:** Envelope = cặp `U+001E`; `splitFrames` **nuốt-ẩn frame đuôi một-phần per-chunk**; `encodeFrame` là đường phát duy nhất. *(verified — review §3-d1)*
- **D-SP4-3:** Redaction theo **set membership `INTERNAL_TOOLS`** (server), **KHÔNG** prefix; prefix/label-map chỉ mỹ thuật. *(verified — review §6-f; tuỳ chọn assert khởi động)*
- **D-SP4-4:** Citations từ **`convo`** (không `ToolEvent`) — verdict A1; `ToolEvent` giữ nguyên.
- **D-SP4-5:** Ghép call↔result bằng **bộ đếm `c` tầng frame** (gán server, phát tuần tự) — không phụ thuộc ordering SP-1; nếu dispatch song song hoá sau → cần id từ `makeDispatch` (flag tương lai).
- **D-SP4-6:** **Ephemeral** nay; **bền qua `chat_tool_call` của SP-3** (đọc sau, read-only seam).
- **D-SP4-7:** Write event đến **qua `onEvent`** (lead duyệt Cải tiến #2 của SP-2) — không phát thủ công.

---

## 7. Open questions
- ✅ **Lead ACK — ĐÃ XONG:** migrate token-frame + spec SP-1 §2 drift (lead đã sửa) + bless D-SP4-2/D-SP4-3 — `comms lead-to-sp4-frame-protocol` line 92-108. (assert `laam_` = tuỳ chọn defense-in-depth.)
- **FE sign-off:** 3 điểm chạm `components/chat/*` (ChatClient / types / MessageItem) — mở comms FE.
- Nhãn thân thiện: map đặt ở i18n dict (đề xuất) — chốt khi writing-plans.
- Gập mặc định **đóng** (dòng tóm tắt hiện) hay mở khi đang chạy — mặc định đóng; chốt khi implement.

---

## 8. Phụ thuộc & rủi ro
- Phụ thuộc: SP-1 merged (✓). SP-3 `chat_tool_call` cho durable (tương lai, tuỳ chọn). SP-2 reserve `pending_write` + **import `encodeFrame` chung** (lead chỉ thị 1 nguồn) ⇒ **SP-4 land `frames.ts` TRƯỚC** (nhỏ, pure) cho SP-2 import; chốt interim nếu cần.
- Rủi ro: phối hợp file FE (additive + sign-off giảm thiểu); model local gọi tool thất thường (fail-soft phủ); đúng đắn guard frame một-phần (test khoá Success #4).
- **Giới hạn verify Success #5:** không có integration test ChatClient strip→render (FE chưa có ChatClient.test) — `frames.test.ts` thuần là lưới duy nhất; claim "verified" phải kèm **preview thủ công** (nếu được phép) hoặc **tuyên bố giới hạn** (Rule 12).
- **Cross-SP coordination (chốt ở writing-plans — lead review APPROVED, không chặn):** (1) ↔SP-2 **suspend-flush**: nhánh write-SUSPEND của SP-2 phải **flush `toolFrames`** (các READ đã gom trước write) + `pending_write`, kẻo trace read mất; (2) ↔SP-3 **chia sẻ 1 extractor** convo (`deriveCitations`/`extractToolTurns` — không 2 bản); (3) ↔SP-2 **`frames.ts` 1 nguồn** (SP-2 land tối thiểu `encodeFrame`+`ChatFrame`, SP-4 thêm `splitFrames` cùng file — thread `sp2-to-sp4-frames`); (4) **FE sign-off** 3 điểm chạm trước khi sửa.
- agent-ops-rules: không tự chạy dev/build; verify bằng test thuần + (nếu được phép) preview.
