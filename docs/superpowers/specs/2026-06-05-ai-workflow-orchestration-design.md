# AI Workflow Orchestration — Design Spec

**Ngày:** 2026-06-05 · **Vai trò:** technical consultant · **Trạng thái:** ✅ **User đã ký** (2026-06-05). Chờ user đọc một lượt spec này trước khi A0 chạm code; sau đó → `writing-plans`.

> Spec này là sản phẩm của một phiên brainstorming có phản biện (3 vòng review của user). Mọi quyết định dưới đây đã được tranh luận và chốt; phần "PIN" là các điểm load-bearing user yêu cầu ghi thành chữ vì chúng thuộc loại *đúng-trên-sơ-đồ-sai-trong-code*.

---

## 0. Một dòng — và cái nó KHÔNG là

**Là gì:** một nền tảng *automation* cho phép xâu chuỗi nhiều bước (agent nội bộ + hành động connector) thành workflow chạy được, có lịch/recurring, có log từng lần chạy, có template, quản lý realtime — xây **trên** Agent Harness (SP-1→SP-4) đã hoàn tất.

**KHÔNG là:**
- KHÔNG phải engine cho agent *tự quyết-và-thực-thi* write (đã chủ động loại — xem §3).
- KHÔNG phải DAG/parallel engine (hoãn — xem §10).
- KHÔNG phải n8n-lite. Khác biệt (moat) = workflow đọc được **dữ liệu monitoring của chính LAAM** (`agent_sessions`/`stats`) qua internal tool SP-1 (xem §7).
- KHÔNG điều khiển Claude Code agent thật ở v1 (seam model pluggable để mở sau — D-RUNTIME).

---

## 1. Nền móng đã có (không build lại)

| Mảnh | Trạng thái | Dùng cho |
|---|---|---|
| Agent Harness SP-1→SP-4 | ✅ trên `main`, 498 test | `agent` node gọi orchestrator (`src/lib/agent/orchestrator.ts`) + 5 internal read tool |
| `runToolRounds` | vòng **phẳng, `maxRounds=4`, KHÔNG đẻ sub-agent** | runtime của agent node (đã verify — quan trọng cho bounding §5) |
| `safety/policy.ts` | `CONNECTOR_WRITES/READS` + `resolveKind()` **fail-closed** | nền để mở rộng blast-radius (§3) |
| `lib/connectors/*` | 7 connector, per-user AES-256-GCM, `execute()` | `connector` node |
| `@xyflow/react` | đã dùng ở `/graph` | editor kéo-thả (Phase D) — 0 hạ tầng mới |
| SSE `/api/events` + `useLiveSessions` | ✅ | realtime run-log |
| Drizzle migration + RBAC + `audit_log` | ✅ | persistence + log nền |

`runToolRounds(messages, tools, {callOllama, dispatch}, maxRounds=4)` — đây là hợp đồng runtime của agent node. **Không sub-agent** ⇒ bội số chi phí thật là `foreach` × inference/node, không phải fan-out agent (xem §5 bounding).

---

## 2. Quyết định nền tảng

- **D-RUNTIME** — Node executor là **interface**, v1 chỉ wire 1 implementation. Mỗi node có `executor:{kind, model?}`. v1 chỉ `kind:"harness"` (Ollama mặc định). Field `model` tồn tại trong schema nhưng UI-chọn-model + runtime khác (Claude Code SDK…) **hoãn**. Đóng băng seam, build 1 cái — đúng pattern SP-1 đóng băng `Tool{kind}` rồi chỉ implement read.
- **D-ENTITY** — "Entity" = **node** trên canvas. Hai nguồn: *connector node* (bọc `connectors.execute()`, xác định) và *custom agent node* (prompt + tool, phán đoán). Mô hình n8n/Zapier.
- **D-TOPOLOGY** — Engine **tuyến tính trước** (A0/A1), thêm `condition`+`foreach` (A2). **Hoãn DAG/parallel.** Lý do: trần tin cậy 8B + Rule 2 + foundation-first.
- **D-STATE** — Blackboard untyped JSON + interpolation `{{...}}`. Không port-typing (YAGNI; xem §5 + §10).

---

## 3. ⚠️ MÔ HÌNH AN TOÀN (phần quan trọng nhất)

### 3.1 Quyết định lõi
> **Agent node = read/judgment ONLY. Mọi *ghi* là `connector` node tường minh người dùng đặt sẵn trên graph.**

Người *thiết kế* workflow là người "confirm" tại **design-time**, không phải run-time. Né hẳn bài toán ghi-không-người-trực cho phần lớn ca.

### 3.2 📦 BOX: #3 **KHÔNG** bảo đảm gì (đọc trước khi tin vào lá chắn này)

> Bề mặt cấp quyền là **topology của graph**, KHÔNG phải agent.
> - Agent cấp **phán đoán** (boolean + nội dung).
> - Graph cấp **thẩm quyền** (loại action nào tồn tại, thứ tự nào, điều kiện nào).
>
> **#3 chỉ chốt cứng *tập loại-action gây side-effect* tại design-time.**
> Nó **KHÔNG** chốt **nội dung** (agent vẫn soạn body mail/ticket) và **KHÔNG** chốt **đích** (agent vẫn lái `{{steps.triage.output.channelId}}`).
>
> ⇒ Run theo lịch vẫn có thể gửi **nội-dung-do-AI-soạn**, tới **đích-do-AI-chọn**, qua **kênh người dùng đã duyệt**. Nghịch lý không bị xoá — bị **thu hẹp** về "nội dung/đích sai qua kênh đúng".
>
> **Phát biểu nội bộ chính xác:** "tập loại-action bị chốt" — KHÔNG phải "AI an toàn tuyệt đối". Đừng bán quá cái nó cho.

### 3.3 Idiom chính thống cho "hành động có điều kiện"
`agent → condition → connector`: agent ra boolean/enum, `condition` route, `connector` thực thi. **Agent cấp phán đoán, graph cấp thẩm quyền.** Đây là câu trả lời cho mọi đòi hỏi "tôi muốn agent tự quyết ghi" — không cần engine agent-tự-ghi.

### 3.4 Blast-radius cho scheduled write (mở rộng `policy.ts`, KHÔNG dựng song song)
Write mang thêm tier: `BLAST_LOW` (nội bộ / DB của chính mình / đảo ngược được) vs `BLAST_HIGH` (ra ngoài / khó đảo).

- **Engine rule (v1):** workflow chỉ chạy `BLAST_LOW` — **cả scheduled lẫn manual**; gặp `BLAST_HIGH` → **fail-closed khắp nơi** (từ chối + log + notify owner). Manual-`BLAST_HIGH`-có-preview **hoãn §10** (xem F1 dưới — cần resume-engine mới).
  - **⚠️ Nit (CTO 06-05): cơ chế gate land ở Phase B (§9).** A0–A2 CHƯA enforce tier — pre-B chỉ wire connector low-blast theo *quy ước*. Dòng trên là invariant *đích* của v1, KHÔNG phải thứ A0 enforce.
- **Default write chưa phân loại = `BLAST_HIGH`** → fail-closed (đúng triết lý fail-closed của `policy.ts`).

**🔒 PIN-D2 (3 điều để blast-radius thật sự cưỡng chế được):**
1. **Tier là code-defined, KHÔNG user-editable.** Phân loại nằm trong `policy.ts`, đi qua code-review. User hạ "send external email" xuống LOW = thủng gate ⇒ không cho phép qua UI.
2. **🔴 F1 (verified) — KHÔNG tái dùng được suspend của `gate.ts` cho workflow.** Đã đọc code: `gate.ts:49-51` write-chưa-confirm → `throw PendingWriteSignal` văng khỏi `runToolRounds` lên route → **route kết thúc turn**; `resume.ts` confirm → **1 direct dispatch + request không-tool (no loop)**, Turn-1 reads **bị bỏ**, narrate text-only. Đây là **semantics 1-lượt-chat** (abort+1-write+stop), KHÔNG phải **run nhiều node** (pause+đi-tiếp). ⇒ Manual `BLAST_HIGH` trong workflow cần **machinery MỚI** (suspend-tại-node + persist context **giữa-run** = *ngoại lệ tường minh PIN-D4b* + confirm-execute-once-rồi-continue) = thực chất **PIN-6**, **hoãn §10**. *Tái dùng được khi làm:* `preview.ts/buildPreview()` + tier `policy.ts` + **nonce `resume.ts:56-58`**. *KHÔNG tái dùng:* mô hình suspend `gate.ts`.
3. **Blast-radius ⊥ volume.** `BLAST_LOW × foreach 100` = sự cố spam dù mỗi cái "low/reversible". **Cap foreach iteration vẫn áp cho scheduled BLAST_LOW.** Hai trục độc lập, hai van độc lập — KHÔNG suy ra `BLAST_LOW = vô hạn`.

---

## 4. Data model (4 bảng mới — bám đúng quy ước `schema.ts`)

Quy ước: `pgTable("snake_case")`, `id` text uuid `$defaultFn(crypto.randomUUID)`, `userId → users.id {onDelete:cascade}`, `timestamp {mode:"date"}`, `jsonb.$type<>()`.

```ts
// graph là 1 JSONB (KHÔNG normalize node/edge ra bảng) — clone = copy 1 row, khớp toObject() React Flow
workflow:          { id, userId→users, name, description,
                     graph: jsonb<WorkflowGraph>,        // {nodes, edges, viewport?}
                     isTemplate: bool=false,
                     status: 'draft'|'active'|'disabled',
                     version: int=1,                     // bump khi save (hiển thị, không load-bearing)
                     createdAt, updatedAt }

workflow_schedule: { id, workflowId→workflow, userId→users,
                     cron, timezone='Asia/Ho_Chi_Minh', enabled: bool=true,
                     catchupPolicy: 'skip'|'fire-once'='skip',
                     nextRunAt, lastRunAt, missedCount: int=0,
                     createdAt, updatedAt }

workflow_run:      { id, workflowId→workflow, userId→users,   // userId = DANH TÍNH THỰC THI (bắt buộc)
                     scheduleId→workflow_schedule?,           // null cho manual
                     scheduledFor?,                           // slot đã floor (part of UNIQUE) — null cho manual
                     trigger: 'manual'|'schedule',
                     status: 'queued'|'running'|'succeeded'|'failed'|'cancelled',
                     graphSnapshot: jsonb<WorkflowGraph>,     // KẾ HOẠCH tĩnh đã authored (xem PIN-D4a)
                     context: jsonb?,                         // bản CUỐI, capped (KHÔNG mirror per-step)
                     error, tokensIn=0, tokensOut=0, costUsd=0,
                     startedAt, finishedAt, createdAt }
                     // UNIQUE(scheduleId, scheduledFor)  → exactly-once mỗi slot (NULLs distinct ⇒ manual không đụng)

workflow_run_step: { id, runId→workflow_run, nodeId, parentStepId?,   // parentStepId: lồng foreach
                     seq: int, kind: 'agent'|'connector'|'condition'|'foreach',
                     status: 'running'|'succeeded'|'failed'|'skipped',
                     input: jsonb, output: jsonb,             // output CAP 256KB (xem PIN-D4b)
                     error, tokensIn=0, tokensOut=0, costUsd=0,
                     startedAt, finishedAt, createdAt }
```

**Điểm then chốt:**
- `workflow.graph` = **1 cột JSONB**. Workflow sửa/clone như một khối; clone = copy 1 row. (Cần query "workflow nào dùng connector X" thì thêm index sau — YAGNI.)
- `workflow_run.userId` = **danh tính thực thi, bắt buộc**. Connector cred per-user mã hoá ⇒ run phải chạy "dưới danh nghĩa" một user. Scheduled run → dưới danh nghĩa **owner** workflow. **Cred đọc tươi mỗi run** từ `connector_credentials`, KHÔNG cache vào snapshot (rotate tự đúng; **secret không bao giờ đóng băng trong run-snapshot** — đây cũng là một bịt-lỗ-bảo-mật).

**🔒 PIN-D4a — Snapshot = graph *authored* (tĩnh), KHÔNG phải execution đã resolve.**
`graphSnapshot` lưu **kế hoạch** người dùng đã vẽ tại lúc start. `foreach`/`condition` **KHÔNG** resolve vào snapshot (chúng data-dependent, chưa tồn tại lúc start). **Expansion runtime** (nhánh nào đi, mấy vòng foreach) ghi ở `workflow_run_step`. ⇒ **Snapshot = kế hoạch; steps = thực tế đã chạy.** (Cụm "resolved linear chain" đúng cho A0 nhưng sai nghĩa từ A2 — đây là chỗ dễ implement ngược.)

**🔒 PIN-D4b — Truncation 256KB áp cho `run_step.output` ĐÃ PERSIST, KHÔNG áp cho giá trị `context` trong RAM** mà downstream nội suy. Cắt RAM → `{{steps.x.output.field}}` mất field → vỡ node sau. (Vì đã tách `context`(RAM)/`run_step`(durable) ở D-STATE nên việc này free — chỉ pin để impl KHÔNG cắt nhầm nguồn.) `foreach` lưu reference/summary, không nối full payload mọi vòng.

---

## 5. Engine (runner)

```
trigger → tạo workflow_run + graphSnapshot → init context{trigger, steps:{}, vars}
  validateGraph(snapshot)   ← CỔNG: A0/A1 chỉ chấp single-path acyclic; reject branch/cycle engine chưa làm
  duyệt node theo edge:
    resolve input (nội suy {{...}} — xem §5.2)
    dispatch theo kind:
      agent     → runToolRounds(...)               (orchestrator SP-1; tool đọc cả internal LAAM)
      connector → connectors.execute(userId, id, action, args)
      condition → eval comparator-struct → chọn cạnh ra           (A2)
      foreach   → lặp sub-chain theo list, mỗi vòng = child run_step (A2)
    ghi run_step + cập nhật context.steps[nodeId]=output (RAM)
  bounded (xem §5.3) · lỗi = fail-stop (xem §5.4)
  persist context CUỐI (capped) vào workflow_run.context
```

### 5.1 State = blackboard
`context = { trigger, steps: {<nodeId>: {output, status}}, vars }`. Untyped JSON. `run_step` = nguồn sự thật bền; `context` = working-set RAM, chỉ persist bản cuối (capped).

### 5.2 Interpolation grammar + 🔒 PIN-D3 (KIỂU GIÁ TRỊ — gap thật)
- `{{ path }}` = **tra cứu property thuần** vào context: `steps.<nodeId>.output…`, `item`, `item.<field>`, `trigger.<field>`, `vars.<name>`. Resolve = split `.` + walk object. **Không expression, không hàm, không số học. Không `eval()`, không `new Function()`.** Path thiếu → fail-step (loud, Rule 12) hoặc rỗng+warn (cấu hình; default fail-step cho connector arg, warn+rỗng cho prompt text).
- **🔒 PIN-D3a — `resolveTemplate(tpl, ctx, sink)` theo SINK (chốt với CTO 06-05):** kiểu trả phụ thuộc sink của đích.
  - **`sink:"text"` (agent prompt / body) → LUÔN trả `string` (total function):** scalar = `String(v)`, object/array = `JSON.stringify` — **bất kể sole-token hay embedded**. KHÔNG có nhánh giữ-type (đích vốn là chuỗi; "giữ type" ở text vô nghĩa + tạo hợp đồng mơ hồ interpolate-vs-executor). **Stringify sống MỘT chỗ** (trong interpolate, không ở executor).
  - **`sink:"arg"` (connector arg):** sole-token `{{path}}` → **giữ nguyên type** (number/bool/array/object/null — VD `priority: "{{steps.triage.output.priority}}"`, `priority=2` → arg = number `2`, KHÔNG phải `"2"`; đây là rủi ro lõi PIN-D3a); embedded scalar → coerce chuỗi; embedded object/array → **fail-loud** (tránh `[object Object]` âm thầm; object trong arg gần như luôn là bug).
  - **(A2) `condition` operand = arg-sink semantics** (fail-loud embedded object) — chốt sẵn sink thứ 3.
  - *Lý do:* hai sink có dung sai đúng-sai KHÁC nhau; sink xác định theo **node-class** (agent-prompt vs connector-arg), không cần schema per-field.
- **🔒 PIN-D3b — v1 KHÔNG bracket-index** (`items[0]`). Omission có ý thức. Index vào mảng → dùng `foreach`.
- **🔒 PIN-D3c — `contains` định nghĩa rõ:** operand string → substring test; operand array → membership test. `switch` trên type của operand trái, KHÔNG đoán.

### 5.2.1 Condition = comparator struct (KHÔNG JS eval)
`{ left: "{{path}}", op, right: <literal | {{path}}> }`, `op ∈ {eq, ne, gt, lt, gte, lte, contains, not_contains, exists, not_exists}`. Eval = `switch` viết tay trên enum. Ghép `all`/`any` của vài comparator (AND/OR), phẳng cho v1. (Regex/jsonata = bề mặt DoS riêng → hoãn §10.)

### 5.3 Bounding (🔒 đã sửa theo verify)
- **Theo token/inference toàn-run + cap cứng `foreach` iterations** — đây là bội số chi phí thật (`foreach` × ≤4 inference/agent-node), KHÔNG đếm node.
- Cap số node/step = belt-and-suspenders, không phải van chính.
- Mỗi agent node thừa hưởng `maxRounds=4` của orchestrator; run-level cộng dồn token có trần cứng → vượt = abort + fail-stop.

### 5.4 Lỗi = fail-stop (🔒 đóng khung là tính năng AN TOÀN)
- v1 fail-stop: step lỗi → ghi `failed`, dừng run, **notify owner bền** (§8).
- **KHÔNG retry/resume cấp-RUN ở v1 — CÓ CHỦ ĐÍCH (🟡 F2 — lý do đã sửa).** Harness **ĐÃ có** nonce exactly-once per-write (`resume.ts:56-58` `isNonceUsed`/`recordWrite`) — idempotency *không phải* cái thiếu. Cái v1 hoãn = **resume cấp-RUN sau crash**: re-enter một run nhiều node cần idempotency-key **per connector-node** (nonce SP-2 chỉ bọc 1 write đã gate, không bọc các connector node khác trong run); thiếu nó, resume sẽ re-execute node phía trên → double-send. v2 mở retry *cùng với* idempotency per-node, **tái dùng nonce `resume.ts`**. Đức tính, không phải lỗ hổng.

### 5.5 validateGraph() — cổng cho model-đi-trước-engine
A0/A1 chỉ chấp **single-path acyclic** (≤1 cạnh ra/node, không chu trình). Reject DAG/branch mà engine chưa hiểu → KHÔNG execute nửa chừng. A2 nới cho `condition` (nhiều cạnh ra có nhãn) + `foreach`.

---

## 6. Scheduler (Deliverable 1)

**Poke = (A) Windows Task Scheduler** — chốt dứt khoát. Lý do & *không* lock-in: durability sống trong DB (claim atomic), poke dumb/stateless/thay-thế-được. Host = 1 máy Windows self-hosted ⇒ A là ops thấp nhất (OS-native, sống sót app restart, user tự cài tường minh — khớp `setup-poc.ps1` + collector, app không tự spawn). Đổi sang Linux mai sau → swap A→cron/systemd-timer **miễn phí** vì durability không nằm ở poke. *Chọn A không cưới A.*

### 6.1 🔒 PIN-D1 — Claim + advance phải ATOMIC, nếu không schedule tự kẹt vĩnh viễn (im lặng)
**Cửa tử của thiết kế ngây thơ:** "poke thắng INSERT → rồi advance `nextRunAt`" — nếu poke chết *giữa* hai bước: run đã claim nhưng `nextRunAt` kẹt ở slot quá khứ → poke sau re-claim bị `UNIQUE` dedupe → **schedule kẹt vĩnh viễn, không ai biết.**

**Sửa — tách "ghi sổ" khỏi "chạy":**
- **Bookkeeping (atomic, nhanh, MỘT transaction):** với mỗi schedule đến hạn (`enabled AND nextRunAt <= now()`), trong **cùng 1 transaction**: (i) `INSERT workflow_run(scheduleId, scheduledFor=<nextRunAt đã lưu, floor theo cron resolution>, status='queued') ON CONFLICT(scheduleId, scheduledFor) DO NOTHING`; (ii) **advance** `workflow_schedule.nextRunAt` → slot tương lai kế + `lastRunAt`. Commit cùng nhau. Tx chết → KHÔNG persist cả hai → poke sau retry sạch. **Hết cửa tử.**
- **Execution (riêng, chậm, fail độc lập):** bước riêng nhặt `workflow_run WHERE status='queued'` → `running` → chạy engine → `succeeded/failed`. Execution chết chỉ ảnh hưởng *một* run (surface qua §8); **schedule không bao giờ kẹt** vì đã advance ở tx ghi sổ.
- **🔒 `scheduledFor` = `nextRunAt` đã lưu (floor theo cron), KHÔNG phải `now()`** — để hai poke đua tính ra **cùng** slot → `UNIQUE` dedupe đúng.
- **🔒 Poke endpoint** `/api/workflows/tick`: bind **localhost / secret-auth**, KHÔNG phơi ra Tailscale.
- **🔒 App-layer sở hữu missed-schedule**, KHÔNG dựa catch-up của OS. Task Scheduler catch-up phải **TẮT** (ghi tài liệu — kẻo ai "tối ưu" bằng cách bật → double-fire).

### 6.2 Missed-schedule (máy ngủ → thức dậy `nextRunAt` quá khứ)
- Mặc định **skip-and-realign**: nhảy tới slot tương lai kế, KHÔNG bắn loạt bù. Ghi `missedCount`.
- Per-schedule `catchupPolicy: 'skip'|'fire-once'` (default `skip`). Template digest-moat đặt `fire-once` (vẫn muốn digest hôm qua, đúng 1 lần).

### 6.3 ⛔ Luật no-background-services
Poke là **OS task user tự cài**, bước setup có tài liệu, **xin phép trước**. App KHÔNG tự spawn. (A0–A2 manual-only ⇒ *chưa đụng* background service đến tận Phase B.)

### 6.4 🔒 Owner lifecycle — chạy-dưới-danh-nghĩa-owner (🟡 F4)
Scheduled run resolve cred owner **tươi** mỗi lần. **Cred owner revoked/missing** (không có `connector_credential` row) → run **fail-closed** + auto-disable schedule + notify. **Owner bị deactivate** → auto-disable mọi schedule của họ + notify. ⚠️ *Ghi chú impl (đã verify schema):* bảng `users` **chưa có cột `active`/`disabled`** → case **cred-missing enforce được NGAY**; case **user-deactivate cần thêm flag** trước. `onDelete:cascade` chỉ lo **hard-delete**, KHÔNG lo deactivate — đây là lỗ ops thật của run-as-owner.

---

## 7. Templates & clone (moat-leaning)

- **Template = `workflow` với `isTemplate=true`.** Clone = deep-copy graph vào workflow mới editable. (Parameter hoá template = §10.)
- **🔒 Template credential-free** — reference connector *type/action*, KHÔNG ref credential row. Clone/instantiate → **người instantiate thành owner**, run bind cred của *họ* tại run-time. Template không buôn lậu cred tác giả.
- **🎯 Moat = success metric:** ≥2/3 template seed phải đọc `agent_sessions`/`stats` của chính LAAM qua internal tool SP-1.
  - **Flagship:** *"8h sáng — tóm tắt agent chạy đêm qua + flag con kẹt/đốt token → digest tới sink `BLAST_LOW` (GDrive của owner / Slack nội bộ)."* (Gửi mail ra ngoài = `BLAST_HIGH` ⇒ hoãn theo F1 — moat digest dùng sink LOW nên ship được trong v1.)
  - KHÔNG seed "fetch issue → mail" (n8n thắng cái đó).
- Moat-template ship dạng **curated fixture** (tốt hơn để user tự cuốn từ canvas trống — và không cần editor cho tới Phase D).

---

## 8. Observability (run-log + needs-attention)

- `workflow_run` + `workflow_run_step` = nguồn log (req #5). Realtime đẩy SSE qua `/api/events`.
- **🔒 Scheduled fail → notify owner BỀN:** persist run `failed` + **surface "cần chú ý"** (query được) + SSE nếu đang kết nối. SSE-only fail-silent lúc 3h sáng.
- **🔒 PHASING FIX:** observability tối thiểu (**list run + needs-attention query/view**) ship **CÙNG Phase B**, KHÔNG để tận E. B mở unattended execution ⇒ fail-closed (blast gate) + fail-stop (error) của run-không-người-trực **cần chỗ durable để đáp**. Đây là **dependency hàm của B**, không phải tính năng trang quản lý. Trang đầy đủ (filter, timeline, replay-view) vẫn ở E.

---

## 9. Phasing (A0 → E) — vertical-slice-first

| Slice | Nội dung | Chốt rủi ro |
|---|---|---|
| **A0** | manual → chain tuyến tính → **đúng 1 agent + 1 connector** → run + run_step + SSE. 1 workflow thật chạy hết đường cho 1 user thật. Seed graph qua API/fixture, **chưa editor**. | Diệt rủi ro #1: build cả engine+scheduler mà chưa gì chạy. PIN-D3a cắn ngay đây (connector args non-string). |
| **A1** | tổng quát engine tuyến tính + **`validateGraph()`** (reject non-linear/cycle) | cổng model-đi-trước-engine |
| **A2** | `condition` + `foreach` + bounding token/foreach (§5.3) | bội số chi phí thật |
| **B** | scheduler (§6, atomic claim PIN-D1) + missed + blast-radius gate (§3.4) **+ observability tối thiểu (§8)** | ⛔ điểm xin phép background service; mở unattended |
| **C** | template moat-seed + clone (§7) | moat metric |
| **D** | editor React Flow (`@xyflow/react`) | |
| **E** | trang quản lý realtime đầy đủ (filter/timeline/replay) | |

---

## 10. Hoãn có chủ đích (deferred)

| Hạng mục | Khi nào mở | Điều kiện mở khoá |
|---|---|---|
| DAG / parallel / join | có use-case lô-song-song thật | engine khác (scheduler topo) — project riêng |
| **Manual `BLAST_HIGH` trong workflow** (F1) | sau | **suspend-continue cấp-run (PIN-6):** status `awaiting_confirm` + persist context giữa-run (*ngoại lệ tường minh PIN-D4b*) + confirm-execute-once-rồi-continue. Tái dùng `buildPreview()`+tier+nonce `resume.ts`; **KHÔNG** tái dùng suspend `gate.ts` |
| Retry / resume cấp-run | v2 | idempotency-key **per connector-node** (nonce SP-2 chỉ bọc 1 gated write — xem §5.4) |
| Agent tự-quyết-ghi | sau | kênh approve bất đồng bộ — KHÔNG phải v1 |
| Typed ports | khi đau thật | thay blackboard untyped |
| Regex / jsonata trong condition | khi cần | sandbox bề mặt DoS |
| Bracket-index `items[0]` | khi cần | mở rộng grammar §5.2 |
| Chọn model per-step (UI) | Phase sau | seam D-RUNTIME đã sẵn |

---

## 11. Success criteria

- **A0:** một workflow thật (1 agent + 1 connector) chạy end-to-end cho 1 user thật; run + step + SSE quan sát được; PIN-D3a (type pass-through) verify với connector args non-string.
- **A2:** `condition` route đúng + `foreach` bị cap iteration; bound token toàn-run abort được run vượt trần.
- **B:** scheduled run exactly-once qua restart (test PIN-D1 cửa tử); `BLAST_HIGH` fail-closed trong **MỌI** run workflow v1 (scheduled + manual); owner cred-missing → run fail-closed + schedule auto-disable (F4); failure surface ở needs-attention không cần query Postgres tay.
- **C:** ≥2/3 template seed là moat-leaning (đọc dữ liệu LAAM); clone → instantiate → chạy bằng cred người clone.
- **Xuyên suốt:** mọi connector-write vào `audit_log`; #3 box hiện diện trong doc + không claim "AI an toàn tuyệt đối".

---

## Phụ lục — câu user đã ký (nguyên văn)

> **#3 chỉ mua "tập loại-action bị chốt", không mua "AI an toàn tuyệt đối".**

Đây là bảo đảm thật của toàn bộ mô hình write. 4 lỗ load-bearing (scheduler durability, snapshot, condition-eval, context/run_step) đã có **cơ chế cưỡng chế được** (PIN-D1..D4), không phải lời hứa.
