# Confirm-Eval (slice #1a) — Knee + Write-Class Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đo "knee" của vách đá write trong selection-at-scale (xác định N nơi write bắt đầu sụp) và xác nhận lỗi là **lớp-write** (không trello-đặc-thù), để khoá `fallbackK`/`tau` cho retriever (slice #2).

**Architecture:** Mở rộng eval-scale harness sẵn có (`scripts/eval/`) — KHÔNG có code retriever, KHÔNG đụng `src/`. Thêm: (1) sampling dày N=8/10/12/14/16; (2) resolver probe-schema tổng quát (mọi internal/connector tool, bỏ special-case `trello_`); (3) non-trello write-probe (`gmail_send`); (4) multi-tool probe (read+write cùng lượt). Đo-only, host-run.

**Tech Stack:** Vitest project riêng (`npm run eval:scale`, host-only cần Ollama), TypeScript, alias `@/`. Phần thuần (resolver) test trong `npm test`; suite live verify bằng host-run.

**Scope:** Slice **1a only**. `recall@K` + embedding de-risk + ca implicit/đa-ngữ = **slice 1b (plan riêng)** — cần CTO gate (introduces embedding client, chồng lấn slice #2).

---

## File structure
- Modify `scripts/eval/scale/distractors.ts` — thêm `resolveProbeSchema`/`resolveProbeSchemas` (pure, tra registry).
- Modify `scripts/eval/scale/distractors.test.ts` — unit test resolver (trong `npm test`).
- Modify `scripts/eval/suite.scale.eval.ts` — knee SIZES; PROBE.correct→`string|string[]`; dùng resolver; +2 probe.
- (host) `npm run eval:scale` → `.serena/qa/eval-scale-<date>.md`.

---

### Task 1: Generalize probe-schema resolution (pure, TDD)

**Files:**
- Modify: `scripts/eval/scale/distractors.ts`
- Test: `scripts/eval/scale/distractors.test.ts`

- [ ] **Step 1: Write the failing test**

Thêm vào `scripts/eval/scale/distractors.test.ts`:
```ts
import { resolveProbeSchema, resolveProbeSchemas } from "./distractors";

describe("resolveProbeSchema", () => {
  it("resolves an internal tool by name", () => {
    const s = resolveProbeSchema("laam_find_stuck");
    expect(s.function.name).toBe("laam_find_stuck");
  });
  it("resolves a connector tool by name (non-trello)", () => {
    const s = resolveProbeSchema("gmail_send");
    expect(s.function.name).toBe("gmail_send");
    expect(s.kind).toBe("write");
  });
  it("throws on unknown tool", () => {
    expect(() => resolveProbeSchema("nope_xyz")).toThrow(/not found/);
  });
  it("resolveProbeSchemas maps an array preserving order", () => {
    const out = resolveProbeSchemas(["laam_find_stuck", "trello_create_card"]);
    expect(out.map((t) => t.function.name)).toEqual(["laam_find_stuck", "trello_create_card"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/eval/scale/distractors.test.ts`
Expected: FAIL — `resolveProbeSchema is not a function`.

- [ ] **Step 3: Write minimal implementation**

Thêm vào `scripts/eval/scale/distractors.ts` (giữ nguyên `allConnectorSchemas`/`padToN`):
```ts
import { INTERNAL_TOOLS, modelToolSchemas } from "@/lib/agent/registry";

// Tra schema THẬT cho 1 probe theo tên — internal trước, rồi connector. Bỏ special-case `trello_`.
export function resolveProbeSchema(name: string): ConnectorTool {
  const internal = INTERNAL_TOOLS.find((t) => t.name === name);
  if (internal) return modelToolSchemas([internal], [])[0];
  const conn = allConnectorSchemas().find((t) => t.function.name === name);
  if (conn) return conn;
  throw new Error(`probe tool not found in registry: ${name}`);
}

export function resolveProbeSchemas(names: string[]): ConnectorTool[] {
  return names.map(resolveProbeSchema);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/eval/scale/distractors.test.ts`
Expected: PASS (4 ca).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/scale/distractors.ts scripts/eval/scale/distractors.test.ts
git commit -m "test(eval): generalize probe-schema resolver (internal+connector)"
```

---

### Task 2: Knee sampling + wire resolver + multi-tool-ready PROBE type

**Files:**
- Modify: `scripts/eval/suite.scale.eval.ts:12` (SIZES), `:19-20` (bỏ `schemaOf`), `:23` (PROBE type), `:47-50` (resolver + padToN)

- [ ] **Step 1: Knee SIZES**

`scripts/eval/suite.scale.eval.ts` dòng 12 — đổi:
```ts
const SIZES = [8, 10, 12, 14, 16]; // knee-finding: mẫu dày trong (8,16] (24/40 đã biết = 0%)
```

- [ ] **Step 2: PROBE.correct nhận string | string[]**

Đổi khai báo `PROBES` (dòng ~23): `correct: string` → `correct: string | string[]`.

- [ ] **Step 3: Thay resolution bằng resolver tổng quát**

Import (đầu file): thêm `resolveProbeSchemas` vào dòng import `./scale/distractors`. Xoá `schemaOf` (dòng 19-20). Trong thân `test(...)` (dòng **46-50**, `correctSchema` + `padToN`) đổi:
```ts
const names = Array.isArray(p.correct) ? p.correct : [p.correct];
const union = padToN(resolveProbeSchemas(names), POOL, n);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: sạch (0 lỗi).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/suite.scale.eval.ts scripts/eval/scale/distractors.ts
git commit -m "feat(eval): knee sampling N=8..16 + generalized multi-tool probes"
```

---

### Task 3: Non-trello write probe (`gmail_send`)

**Files:**
- Modify: `scripts/eval/suite.scale.eval.ts` (PROBES array)

- [ ] **Step 1: Thêm probe**

Thêm vào mảng `PROBES` (sau probe `write`):
```ts
{ id: "write-gmail", correct: "gmail_send", scn: {
  id: "scale-write-gmail", capability: "tool-selection",
  input: "Gửi email cho sếp báo cáo sprint đã xong.",
  toolStubs: { gmail_send: { status: "pending_write" } },
  expect: { callsTool: "gmail_send" } } },
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sạch.

- [ ] **Step 3: Commit**

```bash
git add scripts/eval/suite.scale.eval.ts
git commit -m "feat(eval): add non-trello write probe (gmail_send) for write-class confirm"
```

---

### Task 4: Multi-tool probe (read + write cùng lượt)

**Files:**
- Modify: `scripts/eval/suite.scale.eval.ts` (PROBES array)

- [ ] **Step 1: Thêm probe**

```ts
{ id: "multi-read-write", correct: ["laam_find_stuck", "trello_create_card"], scn: {
  id: "scale-multi", capability: "tool-selection",
  input: "Xem agent nào đang kẹt rồi tạo card Trello nhắc tôi xử lý.",
  toolStubs: { laam_find_stuck: { stuck: [{ id: "s1", project: "billing", stuck: true }] },
               trello_create_card: { status: "pending_write" } },
  expect: { callsTool: ["laam_find_stuck", "trello_create_card"] } } },
```
*(grader tool-selection pass chỉ khi CẢ HAI được gọi — `callsTool: string[]` = tất cả phải xuất hiện, types.ts:11. Xác nhận cả read-liên-quan + write cùng lọt ≤ capK.)*

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sạch.

- [ ] **Step 3: Commit**

```bash
git add scripts/eval/suite.scale.eval.ts
git commit -m "feat(eval): add multi-tool (read+write) scale probe"
```

---

### Task 5: Host run + interpret knee (HOST/user — agent KHÔNG chạy)

**Files:** đọc `.serena/qa/eval-scale-<date>.md`

- [ ] **Step 1: Run (host)**

Run: `npm run eval:scale`  *(cần Ollama sống; agent-ops cấm agent chạy)*
Expected: ghi `.serena/qa/eval-scale-<date>.md` với hàng `write`, `write-gmail`, `multi-read-write` × N=8/10/12/14/16 + dòng no-call + Wilson CI.

- [ ] **Step 2: Đọc knee**

Từ bảng: tìm N nhỏ nhất nơi `write` (và `write-gmail`) bắt đầu < 100% / no-call nhảy. Đó = **knee**.
- Nếu `write-gmail` cũng crater quanh cùng N ⇒ **xác nhận lỗi-lớp-write** (không trello-đặc-thù).
- Nếu chỉ `write` (trello) crater, `write-gmail` giữ 100% ⇒ **chẩn đoán đổi** → báo CTO trước slice #2.
- **Multi-tool — label đúng lớp (CTO):** nếu `multi-read-write` thấp ở **MỌI N (kể cả 8)** ⇒ đó là **weak-multi-step-actor** (vấn đề TÁCH, spec §2 non-goal), **KHÔNG** phải bằng chứng subsetting. Chỉ khi nó **cao@8 → sụp theo N** mới là tín hiệu toolset-size. Đừng quy nhầm.

- [ ] **Step 3: Khoá hằng số vào spec**

Cập nhật `docs/superpowers/specs/2026-06-08-tool-subsetting-design.md` §6 bảng: `capK ≤ min(8, knee−margin)`, `fallbackK = knee − margin` (margin ≥1, đặt theo CI). Ghi knee đo được + ngày.

- [ ] **Step 4: Commit**

```bash
git add .serena/qa/eval-scale-*.md docs/superpowers/specs/2026-06-08-tool-subsetting-design.md
git commit -m "docs(eval): record measured knee; lock fallbackK/capK from data"
```

---

## Self-Review

**1. Spec coverage (§10 confirm-eval):** knee sampling ✅ T1-2; non-trello write-probe ✅ T3; multi-tool ✅ T4; **implicit + đa-ngữ + recall@K ⇒ slice 1b (plan riêng, flagged)**. Knee→`fallbackK`/`tau` ✅ T5.
**2. Placeholder scan:** không TBD/TODO; code đầy đủ mỗi step; `gmail_send` tra registry (không copy schema — DRY).
**3. Type consistency:** `resolveProbeSchemas(string[])→ConnectorTool[]` (T1) khớp `padToN(ConnectorTool[],…)` (distractors.ts:11) + `PROBE.correct: string|string[]` (T2). `callsTool: string[]` khớp types.ts:11.

## Mở (CTO plan-gate)
- **Q1:** slice 1b (recall@K + embedding client + implicit/đa-ngữ) — plan riêng NGAY (de-risk embedding sớm) hay gộp vào slice #2 retriever? *(consultant đề xuất: plan riêng 1b, vì recall xác nhận "embedding tách được tool" TRƯỚC khi dựng module production.)*
- **Q2:** giữ N=24/40 trong cùng run knee không? *(đề xuất: bỏ ở run knee — đã biết 0%, tiết kiệm k×probe×2 lượt Ollama; chạy lại full nếu cần.)*
