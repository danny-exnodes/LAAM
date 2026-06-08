# Design: HIGH-blast connector writes trong Workflow (workflowSafe + exfil-tier rollout)

**Ngày:** 2026-06-08 · **Vai trò:** technical consultant · **Trạng thái:** 🟢 cơ chế **CTO-DUYỆT (ship ngay, fail-closed)** · tier-low-exfil **R1/R3 ký** → flip sau merge · tier-high-exfil (`gmail_send`) **chờ control-đích** (gate riêng). 🔴 **Tiền đề eval-gate BÁC** (crater = artifact) — §5 rollout chuyển sang **exfil-tier**, không còn eval.

> **TL;DR:** Hôm nay workflow chỉ chạy 1 write (`demo_create_task`); mọi HIGH-blast write khác fail-closed. Spec thay `Set` hardcoded bằng **field tự-khai `workflowSafe`** (mặc định fail-closed), gate suy-từ-registry. Manual + scheduled chạy không-confirm per-action (user chọn; CTO khuyến nghị manual dry-run-default). **CTO duyệt cơ chế ship ngay.** Trục gate KHÔNG còn là eval (selection-reliability đã giải — crater là artifact) mà là **exfil-tier** (target-safety, chưa giải): **tier-low** (tài-nguyên-mình-sở-hữu) flip trước; **tier-high = `gmail_send`** cần control-đích (allowlist/literal) qua **gate riêng** trước khi flip.

---

## 1. Vấn đề & bối cảnh

LAAM workflow engine cho phép node connector ghi ra app ngoài. Hiện **mọi write blast-cao bị chặn cứng**:

- [`policy.ts:39`](../../src/lib/agent/safety/policy.ts) — `BLAST_LOW = new Set(["demo_create_task"])`, hardcoded.
- [`policy.ts:43`](../../src/lib/agent/safety/policy.ts) — `resolveBlast(name)` → mọi tool ngoài set = `"high"` (fail-closed).
- [`blast.ts:9`](../../src/lib/workflow/blast.ts) — `assertConnectorAllowed`: `kind=write` **VÀ** `blast=high` → `throw`.
- [`runtime.ts:22`](../../src/lib/workflow/runtime.ts) — gate wire vào `buildRunNode` **trước** `connectorExecute`, áp **cả manual lẫn scheduled**, cả dry-run.
- Agent node trong workflow read-only ([`runtime.ts:18,33`](../../src/lib/workflow/runtime.ts)) — không bao giờ cầm write tool.

`gmail_send` ([`gmail.ts:149`](../../src/lib/connectors/gmail.ts)) + 9 write tool thật khác → không trong `BLAST_LOW` → throw.

**Mục tiêu:** cho phép chạy HIGH-blast connector write trong workflow (manual + scheduled), rollout có kiểm soát, **không** runtime mới, **không** over-engineer lớp an toàn user từ chối.

### 1.1 Trục gate đúng = target-safety, KHÔNG phải selection-reliability (CTO 06-08)

Gate `BLAST_LOW`-only ban đầu là placeholder chống *actor 8B chọn sai write-tool*. **Mối lo đó đã được giải/bác phiên này** (CTO, commit `efcd25c`/`9e6000e`):
- Cái gọi là "write-crater 100%@8→0%@16" là **artifact của probe**: `trello_create_card` thiếu `idList`, `gmail_send` thiếu recipient — **lỗi required-arg**, không phải actor bất tin. Sửa probe → `gmail` **100%@16**; 3 bare-write sạch 100% mọi N.
- ⇒ **tool-subsetting GIẾT · connector-write-GA GỠ CHẶN.** Eval **không còn là phanh**.

Vì vậy trục gate **chuyển** từ *selection-reliability* (đã giải) sang **target-safety / exfil** (chưa giải — chính là R2). Đây **không** nới lỏng: nó đặt phanh đúng chỗ rủi ro thật sự nằm.

---

## 2. Decision log

### 2.1 Brainstorming (user, 2026-06-08)
| # | Trục | Chốt |
|---|---|---|
| D1 | Use case | Tổng quát |
| D2 | Quyết định đích | Template từ upstream read (`to={{read.x}}`) |
| D3 | Scheduled auth | Autonomy (không approval per-run) |
| D4 | Guard đích | Không allowlist — chấp nhận rủi ro |
| D5 | Manual UX | Không confirm per-action; dùng dry-run |
| D6 | Cách hiện thực | Eval-readiness flag tự-khai (Cách 1) |

### 2.2 CTO verdict áp lên (2026-06-08, comms `consultant-to-cto-workflow-high-blast`)
- **Cơ chế DUYỆT — ship ngay** (fail-closed → an toàn; không tool nào chảy tới khi flip tường minh).
- **Tiền đề eval-gate BÁC** → D3/D6 không còn dựa eval; rollout = **exfil-tier** (§5). "Cap = knee−margin" **MOOT**.
- **D4 phân tier:** chấp nhận cho **tier-low-exfil**; **OVERRIDE cho tier-high-exfil** (`gmail_send`) — bắt buộc control-đích trước flip.
- **Manual UX:** CTO khuyến nghị HIGH-write **mặc định dry-run** (1 click "chạy thật"). User sở hữu quyết định cuối (§11).

**Hệ quả thẳng thắn (Rule 7/12):** runtime behavior cho tier-low ≈ "write chạy như LOW write, không confirm". Cho tier-high (`gmail_send`), **không** mở trần — phải có control-đích.

---

## 3. Mô hình policy (cơ chế — CTO duyệt)

### 3.1 Field tự-khai (thay `Set` hardcoded)
Thêm field optional trên `ConnectorTool` ([`connectors/types.ts:28`](../../src/lib/connectors/types.ts)) — **vắng = `false` = fail-closed**:

```ts
export type ConnectorTool = {
  type: "function";
  kind: "read" | "write";
  // Eval-readiness → đổi nghĩa: "đã được clear cho workflow autonomy". VẮNG = false =
  // fail-closed: tool KHÔNG chạy trong workflow run tới khi operator flip tường minh
  // (tier-low sau merge; tier-high sau gate control-đích). Trực giao với kind: reads
  // không bị gate này.
  workflowSafe?: boolean;
  function: { name: string; description: string; parameters: object };
};
```

`policy.ts` suy từ registry (đúng idiom "kind tự-khai, policy suy từ registry"):
```ts
const WORKFLOW_SAFE: ReadonlySet<string> = new Set(
  CONNECTORS.flatMap((c) => c.tools.filter((t) => t.workflowSafe).map((t) => t.function.name)),
);
export function isWorkflowSafe(name: string): boolean { return WORKFLOW_SAFE.has(name); }
```
`demo_create_task` khai `workflowSafe: true` → bảo toàn hành vi hôm nay.

### 3.2 Gate giữ nguyên hình dạng
```ts
export function assertConnectorAllowed(action: string, internal: Tool[]): void {
  if (resolveKind(action, internal) !== "write") return;     // reads luôn qua
  if (!isWorkflowSafe(action)) {
    throw new Error(`workflow: '${action}' chưa được clear cho workflow (fail-closed)`);
  }
}
```

### 3.3 Trigger uniformity
D3+D5 (cả 2 không-confirm) → gate **không** cần tham số trigger; cả manual lẫn scheduled qua cùng `buildRunNode` → cùng verdict.

---

## 4. Dry-run preview + 🔴 security-critical seam

Hôm nay gate throw **trước cả** dry-run mock → tool chưa-cleared thì dry-run cũng lỗi, không xem trước được. Tinh chỉnh để "dùng dry-run làm preview" (D5) khả dụng:
- **Dry-run:** bỏ qua readiness throw cho write → **mock + trả args đã resolve** (`{dryRun:true, wouldHaveCalled, args}`). Read vẫn execute thật.
- **Real-run:** enforce `assertConnectorAllowed` (§3.2).

Cụ thể trong `buildRunNode`: `if (!dryRun) assertConnectorAllowed(...)`; nhánh dry-run write luôn mock.

### 🔴 Seam nguy hiểm (CTO — bắt buộc security-review ở PR)
§4 đổi thứ tự dry-run/real-run là **seam security-critical**: nếu real-run lọt nhánh dry-run-mock → **write un-cleared THỰC THI**. Ràng buộc thiết kế:
- **Default = real = enforced.** `dryRun` mặc định `false`; dry-run là **nhánh hẹp, tường minh**, opt-in.
- Test "real-run cùng write → throw" phải **kín** (§9) — đây là test load-bearing, không phải happy-path.
- **PR triển khai BẮT BUỘC security-review riêng seam này.**

---

## 5. Rollout: exfil-tier (THAY eval-gate)

Tách **cơ chế** (ship được) vs **flip tool** (gated theo exfil-tier):

| Phần | Trạng thái |
|---|---|
| Field + gate registry-derived + dry-run + rename + tests | **Ship ngay** sau review (fail-closed) |
| Flip tier-low-exfil → `workflowSafe:true` | Sau merge cơ chế (R1/R3 đã ký), theo lô |
| Flip tier-high-exfil (`gmail_send`) | **Chặn tới khi có control-đích** (gate riêng §9-task) |

### 5.1 Phân tier exfil (code-derived — Rule 13)
Tiêu chí (CTO): đích = **tài-nguyên-mình-sở-hữu** (low) vs **người-nhận-ngoài tùy ý + data-derived** (high).

**Tier-LOW-exfil (9 write thật — flip trước):**
`trello_create_card` · `trello_update_card` · `trello_comment_card` · `github_create_issue` · `github_comment_issue` · `jira_add_comment` · `jira_create_issue` · `gcal_create_event` · `gdrive_create_folder`🔶.

> 🔶 `gdrive_create_folder` được tôi recommend tier-low (code-derived, §5.2) **nhưng CTO đã gắn nó tier-high** → vẫn **gated** (không flip) tới khi CTO xác nhận đính chính §5.2. 8 tool còn lại flip ngay sau merge.

**Tier-HIGH-exfil (1 write — cần control-đích):**
`gmail_send` (đích = recipient ngoài tùy ý; `to={{read.x}}` từ nguồn bị thao túng = gửi data cho kẻ tấn công).

### 5.2 🔶 2 đính chính verdict CTO (đã verify code)
CTO liệt tier-high = "gmail_send, gdrive-share" và **bỏ sót gcal**. Verify code:
- **`gdrive_create_folder`** ([`google-drive.ts:131`](../../src/lib/connectors/google-drive.ts)) — params `name/parentId`, tạo folder trong **drive của chính user**; **không có tool share/permission**. → **tier-LOW** (không có "gdrive-share" trong codebase). *Khuyến nghị CTO reclassify.*
- **`gcal_create_event`** ([`google-calendar.ts:104`](../../src/lib/connectors/google-calendar.ts)) — params `summary/start/end/description`, **không có trường attendees** → không mời người ngoài, lịch của chính user. → **tier-LOW**.

**Mặc định an toàn tới khi CTO xác nhận:** tool nào CTO đã gắn high vẫn **gated** (không flip) cho tới khi CTO chốt đính chính — fail-closed, đính chính chỉ *thả nhanh hơn*, không *mở rộng rủi ro*.

---

## 6. Risks (phân tier per CTO)

- **R1 — không confirm per-action.** ✅ Ký cho **tier-low-exfil**. Tier-high: xem R2.
- **R2 — đích data-derived = injection→exfil.** Tier-low: bề mặt hẹp (đích = board/repo/calendar/drive **của mình**) → chấp nhận. **Tier-high (`gmail_send`): KHÔNG ký** — bắt buộc 1 control-đích trước flip: (a) allowlist domain/địa chỉ, HOẶC (b) recipient **literal/config, cấm `{{read.x}}`**. (Không phải confirm-machinery — vẫn tôn trọng no-confirm; chỉ chặn vector exfil.)
- **R3 — eval ⊥ target-safety.** ✅ Ký (acknowledged). Lưu ý: actor-reliability (mối lo gốc của R3) **đã giải** phiên này; rủi ro dư = target-safety, **được địa chỉ hóa** bằng exfil-tier (§5) + control-đích (tier-high), không để hở.

### Phòng thủ còn lại
fail-closed default · write-idempotency WAL ([`idempotency.ts`](../../src/lib/workflow/idempotency.ts)) · dry-run preview · `audit_log` ([`agent/safety/audit.ts`](../../src/lib/agent/safety/audit.ts)) · kill-switch per-tool · snapshot-on-run + output capped.

---

## 7. Phạm vi chạm (cơ chế)

**Không** migration · route · schema · suspend-resume.

| File | Đổi |
|---|---|
| `src/lib/connectors/types.ts` | +`workflowSafe?: boolean` |
| `src/lib/agent/safety/policy.ts` | `BLAST_LOW`+`resolveBlast` → `WORKFLOW_SAFE` (registry-derived) + `isWorkflowSafe` |
| `src/lib/workflow/blast.ts` | `assertConnectorAllowed` dùng `isWorkflowSafe`; comment cập nhật |
| `src/lib/workflow/runtime.ts` | dry-run seam: `if (!dryRun) assertConnectorAllowed(...)` |
| `src/lib/connectors/demo.ts` | `demo_create_task` `workflowSafe: true` |
| tests | `blast.test.ts` · `policy.test.ts` · `runtime.test.ts` (§9) |

**Flip (sau merge, KHÔNG trong slice cơ chế):** tier-low = +`workflowSafe:true` vào 9 tool (theo lô); `gmail_send` = sau gate control-đích.

---

## 8. Đổi tên `blast` → `workflowSafe`
Ý niệm cũ `blast: low/high` = impact radius. Reframe: gate = "đã clear cho workflow autonomy" (gmail_send vẫn tác-động-cao thật; chỉ *workflow-safe* sau khi đủ control). Xóa `BLAST_LOW`/`resolveBlast`/`BLAST_HIGH`; cập nhật comment [`blast.ts`](../../src/lib/workflow/blast.ts). Tier vẫn **code-defined, không user-editable** (PIN D2).

---

## 9. Testing (Rule 9 — test mã hóa *vì sao*)

| Test | Intent | File |
|---|---|---|
| write không cờ → throw | write mới không lặng lẽ chạy | `blast.test.ts` |
| write `workflowSafe:true` → pass | tool đã clear chạy | `blast.test.ts` |
| read luôn pass | read không bị gate | `blast.test.ts` |
| tool lạ → fail-closed | registry-miss không mở write | `policy.test.ts` |
| **default fail-closed** (cờ vắng=false) | thuộc tính an-toàn load-bearing: FAIL nếu default true | `policy.test.ts` |
| dry-run: write chưa-cleared → mock+args, không throw | dry-run chỉ preview | `runtime.test.ts` |
| 🔴 **real-run: cùng write → throw** (seam) | security-critical: default=real=enforced | `runtime.test.ts` |
| verdict giống nhau manual ∥ scheduled | 2 trigger hợp nhất, không lách | `blast.test.ts` |

**PR triển khai:** bắt buộc security-review seam dry-run (§4).

---

## 10. Non-goals (cố ý KHÔNG làm)
- ❌ Suspend-mid-run + confirm card (no-confirm).
- ❌ **Control-đích cho `gmail_send` = GATE RIÊNG** (allowlist/literal), không thuộc slice cơ chế này.
- ❌ Allowlist cho tier-low (bề mặt hẹp, R2 chấp nhận).
- ❌ Async approval queue · agent tự soạn đích (agent read-only).
- ❌ Bật tool ngoài tier-low trước khi gate control-đích xong.

---

## 11. Manual UX — quyết định chờ user
CTO khuyến nghị manual HIGH-write **mặc định dry-run** (nút "chạy thật" tường minh) — cổng-người rẻ khi người đang ngồi đó, không phá no-confirm của scheduled. User chọn (D5) no-confirm thẳng. **Cần user chốt:** giữ no-confirm thẳng cho manual, hay nhận khuyến nghị dry-run-default? (Ảnh hưởng UI editor + route `/run`, không ảnh hưởng cơ chế gate.)

---

## 12. Liên quan
[[workflow-orchestration-architecture]] (gate gốc, PIN D2) · [[connectors-oauth]] (write surface, kind tự-khai) · [[harness-write-tool-subsetting]] (⚠️ crater BÁC = artifact — eval không còn phanh) · comms `consultant-to-cto-workflow-high-blast` (CTO verdict đầy đủ) · gate riêng control-đích `gmail_send` (sắp viết).
