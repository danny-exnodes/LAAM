# Harness Reliability Eval (live scorecard, lát mỏng) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Spec:** `docs/superpowers/specs/2026-06-05-harness-reliability-eval-design.md` · **Decision:** `.serena/memories/decisions/harness-reliability-eval.md`
> **Isolation:** Thực thi trên **worktree/branch riêng** (Phase 3) — thuần additive. Commit vào branch đó; KHÔNG commit lên `main` đang dirty.

**Goal:** Một bộ eval chạy bằng `npm run eval` trên host, drive `runToolRounds` THẬT + Ollama sống + dispatch stub, chấm 6 chiều cốt lõi (+rich-block) qua k lần, xuất scorecard ra `.serena/qa/`.

**Architecture:** Scenario (input + tool-output stub + kỳ vọng) → runner (gọi `runToolRounds` k lần, gom `convo`/`calls`/`finalText`) → graders (hàm thuần tất định) → report (md+json). Graders + runner + report thuần → unit-test trong `npm test` (không cần Ollama, "eval-of-the-eval"); chỉ entry `suite.eval.ts` chạy live (host-only). Phần live tách khỏi `npm test` bằng đuôi file `*.eval.ts` (vitest mặc định chỉ gom `*.test.ts`).

**Tech Stack:** TypeScript ESM · Vitest (project riêng `vitest.eval.config.ts`, env `node`) · `@/lib/agent/orchestrator` (`runToolRounds`) · `@/lib/agent/registry` (`INTERNAL_TOOLS`, `modelToolSchemas`) · `@/lib/agent/context` (`buildSystemPrompt`) · Ollama `/api/chat` (non-streaming). **Zero dependency mới.**

**Quy ước import:** mọi file dưới `scripts/eval/` import nội bộ bằng đường **tương đối** (`./types`), import code app bằng alias **`@/`** (config eval set alias y hệt `vitest.config.ts`).

---

## File Structure

```
scripts/eval/
  types.ts             # Scenario, Expect, RunTrace, DispatchCall, GraderResult, ScenarioScore
  util.ts              # parseArgs, digitsOf, contains  (+ util.test.ts)
  stub-dispatch.ts     # makeStubDispatch(toolStubs) → {dispatch, calls}  (+ .test.ts)
  graders/
    tool-selection.ts  restraint.ts  args.ts  grounding.ts
    termination.ts  rich-block.ts  write-intent.ts  index.ts   (+ *.test.ts)
  runner.ts            # runScenario(scenario, deps, k) → ScenarioScore   (+ runner.test.ts)
  scenarios/
    read-tools.ts  restraint.ts  rich-render.ts  write-gate.ts  termination.ts  index.ts  (+ index.test.ts)
  report.ts            # renderScorecard(scores) + writeScorecard(...)     (+ report.test.ts)
  ollama.ts            # makeRealOllama({...}) → callOllama                 (+ ollama.test.ts)
  union-tools.ts       # unionToolSchemas(scenario) — REAL INTERNAL_TOOLS + scenario.extraToolSchemas
  suite.eval.ts        # LIVE entry: loop scenarios → runner → report (host-only)
vitest.eval.config.ts  # project "eval": include scripts/eval/**/*.eval.ts, env node, timeout lớn, 1 fork
package.json           # +1 script "eval" (không thêm dependency)
```

Boundaries: **graders/runner/report/util/stub-dispatch** thuần & DB-free → chạy trong `npm test`. **union-tools/ollama/suite.eval** chạm app/registry/Ollama → chỉ live. `runner.ts` KHÔNG import registry (nhận `buildTools` qua DI) để `runner.test.ts` không kéo `@/db` vào `npm test`.

---

### Task 1: Scaffold — types, vitest eval-project, npm script

**Files:**
- Create: `scripts/eval/types.ts`
- Create: `vitest.eval.config.ts`
- Modify: `package.json` (thêm script `eval`)

- [ ] **Step 1: Tạo `scripts/eval/types.ts`**

```ts
import type { ChatMessage } from "@/lib/agent/orchestrator";
import type { ConnectorTool } from "@/lib/connectors/types";

export type ToolStubs = Record<string, unknown>;

export type DimKey =
  | "tool-selection" | "args" | "grounding"
  | "restraint" | "termination" | "write-intent" | "rich-block";

export type Expect = {
  callsTool?: string | string[];                          // chiều 1 (tất cả phải xuất hiện)
  notCalls?: string[];                                    // chiều 4
  args?: Record<string, (a: Record<string, unknown>) => boolean>; // chiều 2
  finalContains?: string[];                               // chiều 3
  finalNotContains?: string[];                            // chiều 3
  maxRounds?: number;                                     // chiều 5 (số tool-round tối đa)
  emitsBlock?: "chart" | "map";                           // chiều 7
};

export type Scenario = {
  id: string;
  capability: DimKey;                                     // chiều chính (nhóm scorecard)
  input: string;
  toolStubs?: ToolStubs;                                  // output dispatch trả khi model gọi
  extraToolSchemas?: ConnectorTool[];                     // tool tạm cho model thấy (geo/write)
  expect: Expect;
};

export type DispatchCall = { name: string; args: Record<string, unknown> };

export type RunTrace = {
  convo: ChatMessage[];
  calls: DispatchCall[];
  rounds: number;                                         // số assistant-msg có tool_calls
  finalText: string;
  ms: number;
};

export type GraderResult = { dim: DimKey; pass: boolean; detail?: string };

export type ScenarioScore = {
  id: string;
  capability: DimKey;
  runs: number;
  perDim: Record<string, { passed: number; total: number }>; // pass-rate từng chiều
  fails: string[];                                        // detail các lần trượt
  avgMs: number;
};
```

- [ ] **Step 2: Tạo `vitest.eval.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Project "eval" — CHỈ gom scripts/eval/**/*.eval.ts (live, host-only). `npm test`
// dùng vitest.config.ts (mặc định gom *.test.ts) nên KHÔNG đụng file *.eval.ts này.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["scripts/eval/**/*.eval.ts"],
    testTimeout: 180_000,   // model 8B + k lần
    hookTimeout: 60_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } }, // tuần tự — không nã song song vào Ollama
  },
});
```

- [ ] **Step 3: Thêm script vào `package.json`** (trong khối `"scripts"`, sau `"test:watch"`)

```jsonc
    "test:watch": "vitest",
    "eval": "vitest run -c vitest.eval.config.ts"
```

- [ ] **Step 4: Verify `npm test` vẫn xanh + KHÔNG gom file eval**

Run: `npm test`
Expected: PASS toàn bộ (≈498 test như trước; chưa có `*.eval.ts` nào nên không đổi).

- [ ] **Step 5: Verify project eval khởi tạo được (chưa có test → no files)**

Run: `npm run eval`
Expected: Vitest chạy, báo "No test files found" (chưa có `*.eval.ts`) — exit OK, KHÔNG lỗi config/alias.

- [ ] **Step 6: Commit**

```bash
git add scripts/eval/types.ts vitest.eval.config.ts package.json
git commit -m "test(eval): scaffold reliability eval project + core types"
```

---

### Task 2: Shared utils (parseArgs, digitsOf, contains)

**Files:**
- Create: `scripts/eval/util.ts`
- Test: `scripts/eval/util.test.ts`

- [ ] **Step 1: Viết test thất bại** — `scripts/eval/util.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { parseArgs, digitsOf, contains } from "./util";

describe("parseArgs", () => {
  test("object giữ nguyên", () => expect(parseArgs({ id: "x" })).toEqual({ id: "x" }));
  test("JSON string → object (model hay gửi chuỗi)", () =>
    expect(parseArgs('{"id":"x"}')).toEqual({ id: "x" }));
  test("string hỏng / null → {}", () => {
    expect(parseArgs("not json")).toEqual({});
    expect(parseArgs(null)).toEqual({});
  });
});

describe("digitsOf", () => {
  test("bỏ dấu phân tách số", () => expect(digitsOf("12,345")).toBe("12345"));
});

describe("contains", () => {
  test("khớp text không phân biệt hoa thường", () =>
    expect(contains("Agent billing-SVC kẹt", "billing-svc")).toBe(true));
  test("khớp số dù model định dạng lại", () =>
    expect(contains("đã dùng 12.345 token", "12345")).toBe(true));
  test("không khớp khi vắng mặt", () =>
    expect(contains("không có gì", "billing-svc")).toBe(false));
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npm test -- scripts/eval/util.test.ts`
Expected: FAIL — "Cannot find module './util'".

- [ ] **Step 3: Viết `scripts/eval/util.ts`**

```ts
// Model có thể gửi tool arguments dạng object HOẶC chuỗi JSON (giống makeDispatch xử lý).
export function parseArgs(raw: unknown): Record<string, unknown> {
  let a: unknown = raw;
  if (typeof a === "string") {
    try { a = JSON.parse(a); } catch { a = {}; }
  }
  return a && typeof a === "object" ? (a as Record<string, unknown>) : {};
}

// Chuỗi chỉ-chữ-số (bỏ . , khoảng trắng) — để so khớp số khi model định dạng lại.
export function digitsOf(s: string): string {
  return s.replace(/[^\d]/g, "");
}

// Grounding: khớp text (case-insensitive) HOẶC nếu needle là số thì khớp theo
// dãy chữ số (model có thể viết 12.345 / 12,345 / 12 345).
export function contains(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase().trim();
  if (n && h.includes(n)) return true;
  if (/^\d[\d.,\s]*$/.test(needle.trim())) {
    const dn = digitsOf(needle);
    return dn.length > 0 && digitsOf(haystack).includes(dn);
  }
  return false;
}
```

- [ ] **Step 4: Chạy để xác nhận PASS**

Run: `npm test -- scripts/eval/util.test.ts`
Expected: PASS (6 test).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/util.ts scripts/eval/util.test.ts
git commit -m "test(eval): add parseArgs/digitsOf/contains utils"
```

---

### Task 3: Graders chiều 1 (tool-selection) + chiều 4 (restraint)

**Files:**
- Create: `scripts/eval/graders/tool-selection.ts`, `scripts/eval/graders/restraint.ts`
- Test: `scripts/eval/graders/tool-selection.test.ts`, `scripts/eval/graders/restraint.test.ts`

- [ ] **Step 1: Viết test thất bại** — `scripts/eval/graders/tool-selection.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { gradeToolSelection } from "./tool-selection";
import type { RunTrace } from "../types";

const trace = (names: string[]): RunTrace =>
  ({ convo: [], calls: names.map((n) => ({ name: n, args: {} })), rounds: 1, finalText: "", ms: 0 });

describe("gradeToolSelection", () => {
  test("pass khi gọi đúng tool", () =>
    expect(gradeToolSelection(trace(["laam_find_stuck"]), "laam_find_stuck").pass).toBe(true));
  test("fail khi không gọi", () => {
    const r = gradeToolSelection(trace([]), "laam_find_stuck");
    expect(r.pass).toBe(false);
    expect(r.detail).toContain("laam_find_stuck");
  });
  test("yêu cầu TẤT CẢ khi là mảng", () =>
    expect(gradeToolSelection(trace(["laam_list_agents"]), ["laam_list_agents", "laam_get_agent"]).pass).toBe(false));
});
```

`scripts/eval/graders/restraint.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { gradeRestraint } from "./restraint";
import type { RunTrace } from "../types";

const trace = (names: string[]): RunTrace =>
  ({ convo: [], calls: names.map((n) => ({ name: n, args: {} })), rounds: 0, finalText: "", ms: 0 });

describe("gradeRestraint", () => {
  test("pass khi không gọi tool cấm", () =>
    expect(gradeRestraint(trace([]), ["laam_query_stats"]).pass).toBe(true));
  test("fail khi gọi tool đáng lẽ không nên (over-call)", () => {
    const r = gradeRestraint(trace(["laam_query_stats"]), ["laam_query_stats"]);
    expect(r.pass).toBe(false);
    expect(r.detail).toContain("laam_query_stats");
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npm test -- scripts/eval/graders/tool-selection.test.ts scripts/eval/graders/restraint.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `scripts/eval/graders/tool-selection.ts`**

```ts
import type { GraderResult, RunTrace } from "../types";

export function gradeToolSelection(trace: RunTrace, callsTool: string | string[]): GraderResult {
  const want = Array.isArray(callsTool) ? callsTool : [callsTool];
  const got = new Set(trace.calls.map((c) => c.name));
  const missing = want.filter((w) => !got.has(w));
  return {
    dim: "tool-selection",
    pass: missing.length === 0,
    detail: missing.length ? `thiếu gọi: ${missing.join(", ")} (đã gọi: ${[...got].join(", ") || "—"})` : undefined,
  };
}
```

`scripts/eval/graders/restraint.ts`

```ts
import type { GraderResult, RunTrace } from "../types";

export function gradeRestraint(trace: RunTrace, notCalls: string[]): GraderResult {
  const got = new Set(trace.calls.map((c) => c.name));
  const violated = notCalls.filter((n) => got.has(n));
  return {
    dim: "restraint",
    pass: violated.length === 0,
    detail: violated.length ? `gọi tool không nên: ${violated.join(", ")}` : undefined,
  };
}
```

- [ ] **Step 4: Chạy để xác nhận PASS**

Run: `npm test -- scripts/eval/graders/tool-selection.test.ts scripts/eval/graders/restraint.test.ts`
Expected: PASS (5 test).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/graders/tool-selection.* scripts/eval/graders/restraint.*
git commit -m "test(eval): tool-selection + restraint graders"
```

---

### Task 4: Grader chiều 2 (args)

**Files:**
- Create: `scripts/eval/graders/args.ts`
- Test: `scripts/eval/graders/args.test.ts`

- [ ] **Step 1: Viết test thất bại** — `scripts/eval/graders/args.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { gradeArgs } from "./args";
import type { RunTrace } from "../types";

const trace = (calls: { name: string; args: Record<string, unknown> }[]): RunTrace =>
  ({ convo: [], calls, rounds: 1, finalText: "", ms: 0 });

describe("gradeArgs", () => {
  const expectArgs = { laam_get_agent: (a: Record<string, unknown>) => a.id === "sess-42" };

  test("pass khi args đúng (id thật từ lượt trước)", () =>
    expect(gradeArgs(trace([{ name: "laam_get_agent", args: { id: "sess-42" } }]), expectArgs).pass).toBe(true));

  test("fail khi model bịa id (vd dùng tên project làm id)", () => {
    const r = gradeArgs(trace([{ name: "laam_get_agent", args: { id: "billing-svc" } }]), expectArgs);
    expect(r.pass).toBe(false);
    expect(r.detail).toContain("laam_get_agent");
  });

  test("fail khi không gọi tool cần kiểm args", () =>
    expect(gradeArgs(trace([]), expectArgs).pass).toBe(false));
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npm test -- scripts/eval/graders/args.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `scripts/eval/graders/args.ts`**

```ts
import type { Expect, GraderResult, RunTrace } from "../types";

// Với mỗi (tool, predicate): tồn tại MỘT lời gọi tool đó có args thoả predicate.
export function gradeArgs(trace: RunTrace, args: NonNullable<Expect["args"]>): GraderResult {
  const bad: string[] = [];
  for (const [name, pred] of Object.entries(args)) {
    const callsToTool = trace.calls.filter((c) => c.name === name);
    if (!callsToTool.length) { bad.push(`${name}: chưa gọi`); continue; }
    if (!callsToTool.some((c) => safe(pred, c.args))) {
      bad.push(`${name}: args sai (${callsToTool.map((c) => JSON.stringify(c.args)).join(" | ")})`);
    }
  }
  return { dim: "args", pass: bad.length === 0, detail: bad.length ? bad.join("; ") : undefined };
}

function safe(pred: (a: Record<string, unknown>) => boolean, a: Record<string, unknown>): boolean {
  try { return pred(a); } catch { return false; }
}
```

- [ ] **Step 4: Chạy để xác nhận PASS**

Run: `npm test -- scripts/eval/graders/args.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/graders/args.*
git commit -m "test(eval): args grader (catches hallucinated ids)"
```

---

### Task 5: Grader chiều 3 (grounding — Rule 13)

**Files:**
- Create: `scripts/eval/graders/grounding.ts`
- Test: `scripts/eval/graders/grounding.test.ts`

- [ ] **Step 1: Viết test thất bại** — `scripts/eval/graders/grounding.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { gradeGrounding } from "./grounding";
import type { RunTrace } from "../types";

const trace = (finalText: string): RunTrace => ({ convo: [], calls: [], rounds: 1, finalText, ms: 0 });

describe("gradeGrounding", () => {
  test("pass khi câu cuối chứa sự-thật (kể cả số định dạng lại)", () => {
    const r = gradeGrounding(trace("Project billing-svc đã dùng 12.345 token."),
      { finalContains: ["billing-svc", "12345"] });
    expect(r.pass).toBe(true);
  });
  test("fail khi thiếu giá trị thật", () =>
    expect(gradeGrounding(trace("Có vài agent đang chạy."), { finalContains: ["billing-svc"] }).pass).toBe(false));
  test("fail khi bịa thứ không được nhắc (finalNotContains)", () =>
    expect(gradeGrounding(trace("Đã tạo card thành công."), { finalNotContains: ["đã tạo"] }).pass).toBe(false));
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npm test -- scripts/eval/graders/grounding.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `scripts/eval/graders/grounding.ts`**

```ts
import type { Expect, GraderResult, RunTrace } from "../types";
import { contains } from "../util";

export function gradeGrounding(trace: RunTrace, e: Pick<Expect, "finalContains" | "finalNotContains">): GraderResult {
  const text = trace.finalText;
  const missing = (e.finalContains ?? []).filter((t) => !contains(text, t));
  const leaked = (e.finalNotContains ?? []).filter((t) => contains(text, t));
  const detail = [
    missing.length ? `thiếu: ${missing.join(", ")}` : "",
    leaked.length ? `bịa/không nên có: ${leaked.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  return { dim: "grounding", pass: !missing.length && !leaked.length, detail: detail || undefined };
}
```

- [ ] **Step 4: Chạy để xác nhận PASS**

Run: `npm test -- scripts/eval/graders/grounding.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/graders/grounding.*
git commit -m "test(eval): grounding grader (Rule 13, number-normalized)"
```

---

### Task 6: Graders chiều 5 (termination) + chiều 7 (rich-block)

**Files:**
- Create: `scripts/eval/graders/termination.ts`, `scripts/eval/graders/rich-block.ts`
- Test: `scripts/eval/graders/termination.test.ts`, `scripts/eval/graders/rich-block.test.ts`

- [ ] **Step 1: Viết test thất bại**

`scripts/eval/graders/termination.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { gradeTermination } from "./termination";
import type { RunTrace } from "../types";

const trace = (rounds: number): RunTrace => ({ convo: [], calls: [], rounds, finalText: "", ms: 0 });

describe("gradeTermination", () => {
  test("pass khi dừng trong ngưỡng", () => expect(gradeTermination(trace(1), 2).pass).toBe(true));
  test("fail khi lặp quá ngưỡng", () => {
    const r = gradeTermination(trace(3), 2);
    expect(r.pass).toBe(false);
    expect(r.detail).toContain("3");
  });
});
```

`scripts/eval/graders/rich-block.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { gradeRichBlock } from "./rich-block";
import type { RunTrace } from "../types";

const trace = (finalText: string): RunTrace => ({ convo: [], calls: [], rounds: 1, finalText, ms: 0 });

describe("gradeRichBlock", () => {
  test("pass khi có fenced chart", () =>
    expect(gradeRichBlock(trace('Đây:\n```chart\n{"type":"bar"}\n```'), "chart").pass).toBe(true));
  test("fail khi chỉ có text/ASCII (F2)", () =>
    expect(gradeRichBlock(trace("Quý 1: ####  Quý 2: ######"), "chart").pass).toBe(false));
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npm test -- scripts/eval/graders/termination.test.ts scripts/eval/graders/rich-block.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết các grader**

`scripts/eval/graders/termination.ts`

```ts
import type { GraderResult, RunTrace } from "../types";

export function gradeTermination(trace: RunTrace, maxRounds: number): GraderResult {
  const pass = trace.rounds <= maxRounds;
  return { dim: "termination", pass, detail: pass ? undefined : `${trace.rounds} tool-round > ngưỡng ${maxRounds}` };
}
```

`scripts/eval/graders/rich-block.ts`

```ts
import type { GraderResult, RunTrace } from "../types";

// Câu cuối có fenced ```chart / ```map (đầu một dòng)?
export function gradeRichBlock(trace: RunTrace, block: "chart" | "map"): GraderResult {
  const re = new RegExp("(^|\\n)\\s*```" + block + "\\b", "i");
  const pass = re.test(trace.finalText);
  return { dim: "rich-block", pass, detail: pass ? undefined : `không emit \`\`\`${block}` };
}
```

- [ ] **Step 4: Chạy để xác nhận PASS**

Run: `npm test -- scripts/eval/graders/termination.test.ts scripts/eval/graders/rich-block.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/graders/termination.* scripts/eval/graders/rich-block.*
git commit -m "test(eval): termination + rich-block graders"
```

---

### Task 7: Grader chiều 6 (write-intent)

**Files:**
- Create: `scripts/eval/graders/write-intent.ts`
- Test: `scripts/eval/graders/write-intent.test.ts`

- [ ] **Step 1: Viết test thất bại** — `scripts/eval/graders/write-intent.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { gradeWriteIntent } from "./write-intent";
import type { RunTrace } from "../types";

const trace = (calls: { name: string; args: Record<string, unknown> }[], finalText: string): RunTrace =>
  ({ convo: [], calls, rounds: 1, finalText, ms: 0 });

describe("gradeWriteIntent", () => {
  test("pass khi gọi write-tool và KHÔNG bịa hoàn tất", () =>
    expect(gradeWriteIntent(trace([{ name: "trello_create_card", args: { name: "Fix login bug" } }],
      "Mình đã chuẩn bị card, bạn xác nhận nhé."), "trello_create_card").pass).toBe(true));

  test("fail khi không gọi write-tool", () =>
    expect(gradeWriteIntent(trace([], "Đã tạo xong!"), "trello_create_card").pass).toBe(false));

  test("fail khi bịa 'đã tạo' (không được khẳng định hoàn tất ở turn 1)", () => {
    const r = gradeWriteIntent(trace([{ name: "trello_create_card", args: { name: "x" } }],
      "Đã tạo card thành công."), "trello_create_card");
    expect(r.pass).toBe(false);
    expect(r.detail).toContain("hoàn tất");
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npm test -- scripts/eval/graders/write-intent.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `scripts/eval/graders/write-intent.ts`**

```ts
import type { GraderResult, RunTrace } from "../types";

// Lát mỏng: model phải GỌI write-tool (gate→pending_write là việc của harness, đã unit-test)
// và KHÔNG được khẳng định đã hoàn tất ngay turn 1 (chưa qua confirm).
const DONE_RE = /(đã\s+(tạo|xong|hoàn\s*tất|thực hiện)|created successfully|done!)/i;

export function gradeWriteIntent(trace: RunTrace, writeTool: string): GraderResult {
  const called = trace.calls.some((c) => c.name === writeTool);
  if (!called) return { dim: "write-intent", pass: false, detail: `chưa gọi ${writeTool}` };
  if (DONE_RE.test(trace.finalText)) return { dim: "write-intent", pass: false, detail: "bịa đã-hoàn tất khi chưa confirm" };
  return { dim: "write-intent", pass: true };
}
```

- [ ] **Step 4: Chạy để xác nhận PASS**

Run: `npm test -- scripts/eval/graders/write-intent.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/graders/write-intent.*
git commit -m "test(eval): write-intent grader (calls write-tool, no fabricated success)"
```

---

### Task 8: Grader dispatcher `runGraders`

**Files:**
- Create: `scripts/eval/graders/index.ts`
- Test: `scripts/eval/graders/index.test.ts`

- [ ] **Step 1: Viết test thất bại** — `scripts/eval/graders/index.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { runGraders } from "./index";
import type { RunTrace, Scenario } from "../types";

const baseTrace: RunTrace = { convo: [], calls: [{ name: "laam_find_stuck", args: {} }], rounds: 1, finalText: "Project billing-svc đang kẹt.", ms: 100 };

describe("runGraders", () => {
  test("chỉ chấm chiều mà expect khai báo", () => {
    const s: Scenario = {
      id: "x", capability: "tool-selection", input: "?",
      expect: { callsTool: "laam_find_stuck", notCalls: ["laam_query_stats"], finalContains: ["billing-svc"] },
    };
    const res = runGraders(baseTrace, s);
    const dims = res.map((r) => r.dim).sort();
    expect(dims).toEqual(["grounding", "restraint", "tool-selection"]);
    expect(res.every((r) => r.pass)).toBe(true);
  });

  test("không khai báo args/maxRounds/emitsBlock → bỏ qua các chiều đó", () => {
    const s: Scenario = { id: "y", capability: "restraint", input: "?", expect: { notCalls: [] } };
    expect(runGraders(baseTrace, s).map((r) => r.dim)).toEqual(["restraint"]);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npm test -- scripts/eval/graders/index.test.ts`
Expected: FAIL — `runGraders` chưa tồn tại.

- [ ] **Step 3: Viết `scripts/eval/graders/index.ts`**

```ts
import type { GraderResult, RunTrace, Scenario } from "../types";
import { gradeToolSelection } from "./tool-selection";
import { gradeRestraint } from "./restraint";
import { gradeArgs } from "./args";
import { gradeGrounding } from "./grounding";
import { gradeTermination } from "./termination";
import { gradeRichBlock } from "./rich-block";
import { gradeWriteIntent } from "./write-intent";

// Chấm CHỈ những chiều mà scenario.expect khai báo (scenario thưa, không ép đủ 7 chiều).
export function runGraders(trace: RunTrace, s: Scenario): GraderResult[] {
  const e = s.expect;
  const out: GraderResult[] = [];
  if (e.callsTool !== undefined) out.push(gradeToolSelection(trace, e.callsTool));
  if (e.notCalls !== undefined) out.push(gradeRestraint(trace, e.notCalls));
  if (e.args !== undefined) out.push(gradeArgs(trace, e.args));
  if (e.finalContains !== undefined || e.finalNotContains !== undefined) out.push(gradeGrounding(trace, e));
  if (e.maxRounds !== undefined) out.push(gradeTermination(trace, e.maxRounds));
  if (e.emitsBlock !== undefined) out.push(gradeRichBlock(trace, e.emitsBlock));
  // write-intent: chấm khi capability của scenario là write-intent (callsTool = write-tool).
  if (s.capability === "write-intent" && typeof e.callsTool === "string") out.push(gradeWriteIntent(trace, e.callsTool));
  return out;
}
```

- [ ] **Step 4: Chạy để xác nhận PASS**

Run: `npm test -- scripts/eval/graders/index.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/graders/index.*
git commit -m "test(eval): runGraders dispatcher (grades only declared dims)"
```

---

### Task 9: Stub dispatch (ghi call-log, trả output đặt trước)

**Files:**
- Create: `scripts/eval/stub-dispatch.ts`
- Test: `scripts/eval/stub-dispatch.test.ts`

- [ ] **Step 1: Viết test thất bại** — `scripts/eval/stub-dispatch.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { makeStubDispatch } from "./stub-dispatch";

describe("makeStubDispatch", () => {
  test("trả output đặt trước + ghi call (parse args chuỗi JSON)", async () => {
    const { dispatch, calls } = makeStubDispatch({ laam_find_stuck: { stuck: [] } });
    const r = await dispatch("laam_find_stuck", '{"thresholdMin":15}');
    expect(r).toEqual({ stuck: [] });
    expect(calls).toEqual([{ name: "laam_find_stuck", args: { thresholdMin: 15 } }]);
  });

  test("tool không có stub → trả {} nhưng VẪN ghi call (đo selection)", async () => {
    const { dispatch, calls } = makeStubDispatch({});
    expect(await dispatch("geo_directions", { from: "A" })).toEqual({});
    expect(calls[0]).toEqual({ name: "geo_directions", args: { from: "A" } });
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npm test -- scripts/eval/stub-dispatch.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `scripts/eval/stub-dispatch.ts`**

```ts
import type { DispatchCall, ToolStubs } from "./types";
import { parseArgs } from "./util";

// dispatch khớp ToolRoundsDeps["dispatch"]: (name, args) => Promise<unknown>.
// Ghi mọi lời gọi (args đã parse) + trả output đặt trước (hoặc {} → vẫn đo được selection).
export function makeStubDispatch(stubs: ToolStubs = {}): {
  dispatch: (name: string, args: unknown) => Promise<unknown>;
  calls: DispatchCall[];
} {
  const calls: DispatchCall[] = [];
  const dispatch = async (name: string, args: unknown) => {
    calls.push({ name, args: parseArgs(args) });
    return Object.prototype.hasOwnProperty.call(stubs, name) ? stubs[name] : {};
  };
  return { dispatch, calls };
}
```

- [ ] **Step 4: Chạy để xác nhận PASS**

Run: `npm test -- scripts/eval/stub-dispatch.test.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/stub-dispatch.*
git commit -m "test(eval): stub dispatch (records calls, returns seeded outputs)"
```

---

### Task 10: Runner — `runScenario` (k lần, gọi runToolRounds thật)

**Files:**
- Create: `scripts/eval/runner.ts`
- Test: `scripts/eval/runner.test.ts`

> DI: runner KHÔNG import registry/Ollama. Nhận `callOllama` + `buildTools` để `runner.test.ts` chạy trong `npm test` không kéo `@/db`.

- [ ] **Step 1: Viết test thất bại** — `scripts/eval/runner.test.ts`

```ts
import { describe, expect, test, vi } from "vitest";
import { runScenario } from "./runner";
import type { Scenario } from "./types";

// Fake Ollama: lượt 1 gọi tool, lượt 2 (no-tools) ra text. callOllama nhận (messages, tools).
function fakeOllama() {
  let n = 0;
  return vi.fn(async (_msgs: unknown, tools: { length: number }) => {
    n++;
    if (tools.length && n === 1) {
      return { message: { content: "", tool_calls: [{ function: { name: "laam_find_stuck", arguments: { thresholdMin: 10 } } }] } };
    }
    return { message: { content: "Project billing-svc đang kẹt." } };
  });
}

const scenario: Scenario = {
  id: "stuck-basic", capability: "tool-selection", input: "Agent nào kẹt?",
  toolStubs: { laam_find_stuck: { stuck: [{ project: "billing-svc" }] } },
  expect: { callsTool: "laam_find_stuck", notCalls: ["laam_query_stats"], finalContains: ["billing-svc"], maxRounds: 2 },
};

describe("runScenario", () => {
  test("chạy k lần, gom pass-rate từng chiều", async () => {
    const score = await runScenario(scenario, { callOllama: fakeOllama(), buildTools: () => [] }, 3);
    expect(score.runs).toBe(3);
    expect(score.perDim["tool-selection"]).toEqual({ passed: 3, total: 3 });
    expect(score.perDim["grounding"]).toEqual({ passed: 3, total: 3 });
    expect(score.perDim["termination"].passed).toBe(3);
  });

  test("một lần lỗi callOllama → run đó tính fail mọi chiều, KHÔNG ném", async () => {
    const flaky = vi.fn().mockRejectedValueOnce(new Error("Ollama 500"))
      .mockResolvedValue({ message: { content: "Project billing-svc đang kẹt." } });
    const score = await runScenario(scenario, { callOllama: flaky, buildTools: () => [] }, 1);
    expect(score.runs).toBe(1);
    expect(score.perDim["tool-selection"].passed).toBe(0);
    expect(score.fails.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npm test -- scripts/eval/runner.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `scripts/eval/runner.ts`**

```ts
import { runToolRounds, type ChatMessage, type ToolRoundsDeps } from "@/lib/agent/orchestrator";
import { buildSystemPrompt } from "@/lib/agent/context";
import type { ConnectorTool } from "@/lib/connectors/types";
import type { RunTrace, Scenario, ScenarioScore } from "./types";
import { makeStubDispatch } from "./stub-dispatch";
import { runGraders } from "./graders";

export type RunnerDeps = {
  callOllama: ToolRoundsDeps["callOllama"];
  buildTools: (s: Scenario) => ConnectorTool[];
  maxRounds?: number;
  now?: number;
};

// Một lần chạy: gọi runToolRounds THẬT (loop prod) + 1 call bù để bắt finalText
// (runToolRounds vứt text vòng cuối — xem orchestrator.ts). Lỗi → trace rỗng (fail-soft).
async function runOnce(s: Scenario, deps: RunnerDeps): Promise<RunTrace> {
  const t0 = Date.now();
  const tools = deps.buildTools(s);
  const { dispatch, calls } = makeStubDispatch(s.toolStubs);
  const system = buildSystemPrompt({ lang: "vi", now: deps.now ?? t0, toolNames: tools.map((t) => t.function.name) });
  const messages: ChatMessage[] = [{ role: "system", content: system }, { role: "user", content: s.input }];
  try {
    const convo = await runToolRounds(messages, tools, { callOllama: deps.callOllama, dispatch }, deps.maxRounds ?? 4);
    const rounds = convo.filter((m) => m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length).length;
    const finalRes = await deps.callOllama(convo, []); // call bù: lấy câu trả lời cuối
    const finalText = finalRes?.message?.content ?? "";
    return { convo, calls, rounds, finalText, ms: Date.now() - t0 };
  } catch (e) {
    return { convo: [], calls, rounds: 0, finalText: `__error__: ${e instanceof Error ? e.message : String(e)}`, ms: Date.now() - t0 };
  }
}

export async function runScenario(s: Scenario, deps: RunnerDeps, k: number): Promise<ScenarioScore> {
  const perDim: Record<string, { passed: number; total: number }> = {};
  const fails: string[] = [];
  let totalMs = 0;
  for (let i = 0; i < k; i++) {
    const trace = await runOnce(s, deps);
    totalMs += trace.ms;
    for (const g of runGraders(trace, s)) {
      const cell = (perDim[g.dim] ??= { passed: 0, total: 0 });
      cell.total++;
      if (g.pass) cell.passed++;
      else fails.push(`[${s.id}#${i + 1}] ${g.dim}: ${g.detail ?? "fail"}`);
    }
  }
  return { id: s.id, capability: s.capability, runs: k, perDim, fails, avgMs: Math.round(totalMs / Math.max(1, k)) };
}
```

- [ ] **Step 4: Chạy để xác nhận PASS**

Run: `npm test -- scripts/eval/runner.test.ts`
Expected: PASS (2 test).

> Nếu test KÉO `@/db` (lỗi connect Postgres) → `buildSystemPrompt` không thuần như giả định. Khi đó: inject `buildSystem` qua `RunnerDeps` thay vì import trực tiếp, và để `suite.eval.ts` truyền hàm thật. (Theo spec L1 context là thuần nên kỳ vọng KHÔNG xảy ra.)

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/runner.*
git commit -m "test(eval): runScenario k-runs over real runToolRounds (DI for tools/ollama)"
```

---

### Task 11: Scenarios (10 ca, tên tool THẬT)

**Files:**
- Create: `scripts/eval/scenarios/read-tools.ts`, `restraint.ts`, `rich-render.ts`, `write-gate.ts`, `termination.ts`, `index.ts`
- Test: `scripts/eval/scenarios/index.test.ts`

- [ ] **Step 1: Viết test thất bại** — `scripts/eval/scenarios/index.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { ALL_SCENARIOS } from "./index";

describe("ALL_SCENARIOS", () => {
  test("đúng 10 ca, id duy nhất", () => {
    expect(ALL_SCENARIOS).toHaveLength(10);
    expect(new Set(ALL_SCENARIOS.map((s) => s.id)).size).toBe(10);
  });
  test("mọi callsTool/notCalls dùng tên tool có tiền tố hợp lệ", () => {
    const KNOWN = /^(laam_|geo_|trello_)/;
    for (const s of ALL_SCENARIOS) {
      const names = [s.expect.callsTool ?? [], s.expect.notCalls ?? []].flat() as string[];
      for (const n of names) expect(n, `${s.id}:${n}`).toMatch(KNOWN);
    }
  });
  test("scenario write-intent có extraToolSchemas cho write-tool", () => {
    const w = ALL_SCENARIOS.find((s) => s.capability === "write-intent")!;
    expect(w.extraToolSchemas?.some((t) => t.function.name === "trello_create_card")).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npm test -- scripts/eval/scenarios/index.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết các file scenario**

`scripts/eval/scenarios/read-tools.ts`

```ts
import type { Scenario } from "../types";

export const stuckBasic: Scenario = {
  id: "stuck-basic", capability: "tool-selection",
  input: "Agent nào đang kẹt?",
  toolStubs: { laam_find_stuck: { thresholdMin: 10, stuck: [
    { id: "sess-42", project: "billing-svc", status: "running", stuck: true, latestActivity: "chạy migration DB", durationMin: 42 },
  ] } },
  expect: { callsTool: "laam_find_stuck", notCalls: ["laam_query_stats", "laam_list_machines"], finalContains: ["billing-svc"], maxRounds: 2 },
};

export const tokensToday: Scenario = {
  id: "tokens-today", capability: "tool-selection",
  input: "Hôm nay tiêu hết bao nhiêu token?",
  toolStubs: { laam_query_stats: {
    totals: { sessions: 12, running: 3, tokensIn: 45000, tokensOut: 12345, costUsd: 0.42 },
    byStatus: { running: 3, idle: 2, done: 7 }, byModel: [], topProjects: [], topTools: [],
  } },
  expect: { callsTool: "laam_query_stats", notCalls: ["laam_list_machines"], finalContains: ["12345"], maxRounds: 2 },
};

export const agentDetail: Scenario = {
  id: "agent-detail", capability: "args",
  input: "Cho tôi chi tiết agent ở project billing-svc.",
  toolStubs: {
    laam_list_agents: { agents: [{ id: "sess-42", project: "billing-svc", status: "running" }] },
    laam_get_agent: { agent: { id: "sess-42", project: "billing-svc", status: "running", latestActivity: "chạy migration DB", tools: [] } },
  },
  expect: {
    callsTool: ["laam_list_agents", "laam_get_agent"],
    args: { laam_get_agent: (a) => a.id === "sess-42" }, // id THẬT từ lượt list, không bịa "billing-svc"
    finalContains: ["billing-svc"], maxRounds: 3,
  },
};

export const machinesOnline: Scenario = {
  id: "machines-online", capability: "tool-selection",
  input: "Máy nào đang online?",
  toolStubs: { laam_list_machines: { machines: [
    { id: "m1", name: "gaming-pc", online: true }, { id: "m2", name: "laptop", online: false },
  ] } },
  expect: { callsTool: "laam_list_machines", notCalls: ["laam_query_stats"], finalContains: ["gaming-pc"], maxRounds: 2 },
};
```

`scripts/eval/scenarios/restraint.ts`

```ts
import type { Scenario } from "../types";

const ALL_READ = ["laam_list_agents", "laam_get_agent", "laam_query_stats", "laam_list_machines", "laam_find_stuck"];

export const greeting: Scenario = {
  id: "greeting-restraint", capability: "restraint",
  input: "Xin chào!",
  expect: { notCalls: ALL_READ, maxRounds: 0 },
};

export const chitchat: Scenario = {
  id: "chitchat-restraint", capability: "restraint",
  input: "Bạn làm được những gì?",
  expect: { notCalls: ALL_READ, maxRounds: 0 },
};
```

`scripts/eval/scenarios/rich-render.ts`

```ts
import type { Scenario } from "../types";

// extraToolSchema geo: model PHẢI thấy tool mới có cơ hội gọi (prod chưa đăng ký → baseline ~fail).
export const geoDirections: Scenario = {
  id: "geo-directions", capability: "tool-selection",
  input: "Chỉ đường từ Hồ Gươm tới Văn Miếu.",
  extraToolSchemas: [{ type: "function", function: {
    name: "geo_directions",
    description: "Tìm đường đi giữa hai địa điểm (trả khoảng cách + các bước).",
    parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] },
  } }],
  toolStubs: { geo_directions: { distanceKm: 2.1, steps: ["đi theo Lê Thái Tổ", "rẽ Nguyễn Thái Học"] } },
  expect: { callsTool: "geo_directions", maxRounds: 2 },
};

export const chartRender: Scenario = {
  id: "chart-render", capability: "rich-block",
  input: "Vẽ biểu đồ cột doanh thu 4 quý: 12, 19, 9, 15.",
  expect: { emitsBlock: "chart" },
};
```

`scripts/eval/scenarios/write-gate.ts`

```ts
import type { Scenario } from "../types";

export const writeIntentTrello: Scenario = {
  id: "write-intent-trello", capability: "write-intent",
  input: "Tạo card Trello tên 'Fix login bug' trong board Sprint.",
  extraToolSchemas: [{ type: "function", function: {
    name: "trello_create_card",
    description: "Tạo một card Trello mới trong một list.",
    parameters: { type: "object", properties: { name: { type: "string" }, listId: { type: "string" } }, required: ["name"] },
  } }],
  toolStubs: { trello_create_card: { status: "pending_write" } },
  expect: {
    callsTool: "trello_create_card",
    args: { trello_create_card: (a) => typeof a.name === "string" && /login/i.test(a.name as string) },
    finalNotContains: ["đã tạo", "đã xong", "created successfully"],
  },
};
```

`scripts/eval/scenarios/termination.ts`

```ts
import type { Scenario } from "../types";

// find_stuck trả RỖNG → model phải trả lời "không có" và DỪNG, không lặp gọi lại.
export const loopGuard: Scenario = {
  id: "loop-guard", capability: "termination",
  input: "Có agent nào đang kẹt không?",
  toolStubs: { laam_find_stuck: { thresholdMin: 10, stuck: [] } },
  expect: { callsTool: "laam_find_stuck", maxRounds: 2, finalContains: ["không"] },
};
```

`scripts/eval/scenarios/index.ts`

```ts
import type { Scenario } from "../types";
import { stuckBasic, tokensToday, agentDetail, machinesOnline } from "./read-tools";
import { greeting, chitchat } from "./restraint";
import { geoDirections, chartRender } from "./rich-render";
import { writeIntentTrello } from "./write-gate";
import { loopGuard } from "./termination";

export const ALL_SCENARIOS: Scenario[] = [
  stuckBasic, tokensToday, agentDetail, machinesOnline,
  greeting, chitchat, geoDirections, chartRender, writeIntentTrello, loopGuard,
];
```

- [ ] **Step 4: Chạy để xác nhận PASS**

Run: `npm test -- scripts/eval/scenarios/index.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/scenarios/
git commit -m "test(eval): 10 seed scenarios (real laam_* tool names + F2 baseline)"
```

---

### Task 12: Report — render scorecard (md + json)

**Files:**
- Create: `scripts/eval/report.ts`
- Test: `scripts/eval/report.test.ts`

- [ ] **Step 1: Viết test thất bại** — `scripts/eval/report.test.ts`

```ts
import { describe, expect, test } from "vitest";
import { renderScorecard } from "./report";
import type { ScenarioScore } from "./types";

const scores: ScenarioScore[] = [
  { id: "stuck-basic", capability: "tool-selection", runs: 5,
    perDim: { "tool-selection": { passed: 5, total: 5 }, grounding: { passed: 3, total: 5 } }, fails: ["[stuck-basic#2] grounding: thiếu: billing-svc"], avgMs: 800 },
  { id: "geo-directions", capability: "tool-selection", runs: 5,
    perDim: { "tool-selection": { passed: 0, total: 5 } }, fails: [], avgMs: 700 },
];

describe("renderScorecard", () => {
  test("md có bảng + dòng tổng pass-rate + mục trượt", () => {
    const md = renderScorecard(scores, { k: 5, model: "qwen3-vl:8b", at: "2026-06-05" });
    expect(md).toContain("Eval Scorecard");
    expect(md).toContain("stuck-basic");
    expect(md).toContain("0/5");          // geo baseline đỏ
    expect(md).toContain("billing-svc");  // chi tiết trượt được liệt kê
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npm test -- scripts/eval/report.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `scripts/eval/report.ts`**

```ts
import { writeFile, mkdir } from "node:fs/promises";
import type { DimKey, ScenarioScore } from "./types";

const DIMS: DimKey[] = ["tool-selection", "args", "grounding", "restraint", "termination", "write-intent", "rich-block"];
const HEAD = ["sel", "args", "ground", "restraint", "term", "write", "block"];

function cell(s: ScenarioScore, d: DimKey): string {
  const c = s.perDim[d];
  if (!c) return "—";
  const mark = c.passed === 0 ? " ✗" : c.passed < c.total ? " ⚠" : "";
  return `${c.passed}/${c.total}${mark}`;
}

export function renderScorecard(scores: ScenarioScore[], meta: { k: number; model: string; at: string }): string {
  const rows = scores.map((s) =>
    `| ${s.id} | ${s.capability} | ${DIMS.map((d) => cell(s, d)).join(" | ")} | ${s.avgMs} |`);
  // Tổng pass-rate từng chiều (gộp mọi scenario có chấm chiều đó).
  const totals = DIMS.map((d) => {
    let p = 0, t = 0;
    for (const s of scores) { const c = s.perDim[d]; if (c) { p += c.passed; t += c.total; } }
    return t ? `${Math.round((100 * p) / t)}%` : "—";
  });
  const fails = scores.flatMap((s) => s.fails);
  return [
    `# Eval Scorecard — ${meta.model} — ${meta.at} (k=${meta.k})`,
    `Tổng ${scores.length} scenario / ${scores.length * meta.k} lần chạy. Đo trên host, dispatch stub.`,
    "",
    `| Scenario | Chiều chính | ${HEAD.join(" | ")} | avg ms |`,
    `|---|---|${HEAD.map(() => "---").join("|")}|---|`,
    ...rows,
    `| **TỔNG (pass-rate)** | | ${totals.join(" | ")} | |`,
    "",
    "## Trượt & vì sao",
    ...(fails.length ? fails.map((f) => `- ${f}`) : ["- (không có lần trượt nào được ghi)"]),
    "",
  ].join("\n");
}

// Ghi .md + .json vào .serena/qa/ (host). Tách khỏi render để render test được thuần.
export async function writeScorecard(scores: ScenarioScore[], meta: { k: number; model: string; at: string }): Promise<string> {
  await mkdir(".serena/qa", { recursive: true });
  const base = `.serena/qa/eval-${meta.at}`;
  await writeFile(`${base}.md`, renderScorecard(scores, meta), "utf8");
  await writeFile(`${base}.json`, JSON.stringify({ meta, scores }, null, 2), "utf8");
  return `${base}.md`;
}
```

- [ ] **Step 4: Chạy để xác nhận PASS**

Run: `npm test -- scripts/eval/report.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add scripts/eval/report.*
git commit -m "test(eval): scorecard renderer (per-dim pass-rate + fail details)"
```

---

### Task 13: realOllama + union-tools (glue live; KHÔNG dùng trong npm test)

**Files:**
- Create: `scripts/eval/ollama.ts`
- Test: `scripts/eval/ollama.test.ts` (mock `fetch` — không cần Ollama sống)
- Create: `scripts/eval/union-tools.ts` (không test riêng; phủ ở suite live)

- [ ] **Step 1: Viết test thất bại** — `scripts/eval/ollama.test.ts`

```ts
import { afterEach, describe, expect, test, vi } from "vitest";
import { makeRealOllama } from "./ollama";

afterEach(() => vi.restoreAllMocks());

describe("makeRealOllama", () => {
  test("POST /api/chat với options prod + tools khi có; stream:false", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: { content: "ok" } }), { status: 200 }));
    const call = makeRealOllama({ baseUrl: "http://h:11434", model: "qwen3-vl:8b", options: { num_ctx: 16384, presence_penalty: 0.2 } });
    const res = await call([{ role: "user", content: "hi" }], [{ type: "function", function: { name: "t", description: "", parameters: {} } }] as never);
    expect(res.message?.content).toBe("ok");
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.stream).toBe(false);
    expect(body.options.num_ctx).toBe(16384);
    expect(body.tools).toHaveLength(1);
  });

  test("không gửi tools khi mảng rỗng (vòng cuối)", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: { content: "x" } }), { status: 200 }));
    const call = makeRealOllama({ baseUrl: "http://h:11434", model: "m", options: {} });
    await call([{ role: "user", content: "hi" }], [] as never);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect("tools" in body).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy để xác nhận FAIL**

Run: `npm test -- scripts/eval/ollama.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `scripts/eval/ollama.ts`** (sao đúng tool-loop callOllama của route.ts:264-281)

```ts
import type { ChatMessage, OllamaChatResponse, ToolRoundsDeps } from "@/lib/agent/orchestrator";
import type { ConnectorTool } from "@/lib/connectors/types";

export type OllamaCfg = {
  baseUrl: string;
  model: string;
  options: { num_ctx?: number; presence_penalty?: number; temperature?: number; top_p?: number };
};

// Khớp ToolRoundsDeps["callOllama"]. Non-streaming, gửi tools khi có (như prod).
export function makeRealOllama(cfg: OllamaCfg): ToolRoundsDeps["callOllama"] {
  return async (messages: ChatMessage[], tools: ConnectorTool[]): Promise<OllamaChatResponse> => {
    const r = await fetch(`${cfg.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        ...(tools.length ? { tools } : {}),
        options: cfg.options,
        stream: false,
      }),
    });
    if (!r.ok) throw new Error(`Ollama ${r.status}`);
    return (await r.json()) as OllamaChatResponse;
  };
}

// Đọc cấu hình từ env — y các default prod (route.ts) để đo ĐÚNG điều kiện thật.
export function ollamaCfgFromEnv(): OllamaCfg {
  return {
    baseUrl: (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, ""),
    model: process.env.DEFAULT_CHAT_MODEL ?? "qwen3-vl:8b-instruct-q8_0",
    options: {
      num_ctx: Math.max(2048, Number(process.env.CHAT_NUM_CTX) || 16384),
      presence_penalty: Number.isFinite(Number(process.env.CHAT_PRESENCE_PENALTY)) ? Number(process.env.CHAT_PRESENCE_PENALTY) : 0.2,
      temperature: Number.isFinite(Number(process.env.EVAL_TEMPERATURE)) ? Number(process.env.EVAL_TEMPERATURE) : 0.6,
    },
  };
}
```

- [ ] **Step 4: Viết `scripts/eval/union-tools.ts`** (schema model thấy = INTERNAL_TOOLS thật + extra của scenario)

```ts
import { INTERNAL_TOOLS, modelToolSchemas } from "@/lib/agent/registry";
import type { ConnectorTool } from "@/lib/connectors/types";
import type { Scenario } from "./types";

// Dùng đúng builder union của prod để model thấy schema giống thật (kể cả "schema bloat").
// extraToolSchemas: tool chưa-có-ở-prod (geo) hoặc connector (trello) cho ca tương ứng.
export function unionToolSchemas(s: Scenario): ConnectorTool[] {
  return modelToolSchemas(INTERNAL_TOOLS, s.extraToolSchemas ?? []);
}
```

- [ ] **Step 5: Chạy để xác nhận PASS** (chỉ ollama.test; union-tools không có test riêng)

Run: `npm test -- scripts/eval/ollama.test.ts`
Expected: PASS (2 test).

- [ ] **Step 6: Commit**

```bash
git add scripts/eval/ollama.* scripts/eval/union-tools.ts
git commit -m "test(eval): realOllama (prod-faithful payload) + union-tools builder"
```

---

### Task 14: Live entry `suite.eval.ts` + nghiệm thu host

**Files:**
- Create: `scripts/eval/suite.eval.ts`

> File `*.eval.ts` → chỉ chạy bởi `npm run eval` (host), KHÔNG bởi `npm test`. Cần Ollama sống + env (OLLAMA_URL/DEFAULT_CHAT_MODEL/CHAT_NUM_CTX). Theo `agent-ops`: **user tự chạy**.

- [ ] **Step 1: Viết `scripts/eval/suite.eval.ts`**

```ts
import { afterAll, describe, expect, test } from "vitest";
import { ALL_SCENARIOS } from "./scenarios";
import { runScenario } from "./runner";
import { makeRealOllama, ollamaCfgFromEnv } from "./ollama";
import { unionToolSchemas } from "./union-tools";
import { writeScorecard } from "./report";
import type { ScenarioScore } from "./types";

const K = Math.max(1, Number(process.env.EVAL_K) || 5);
const cfg = ollamaCfgFromEnv();
const callOllama = makeRealOllama(cfg);
// Ngày truyền vào (Date.now() bị cấm trong workflow scripts, nhưng đây là vitest thường → OK).
const at = new Date().toISOString().slice(0, 10);
const scores: ScenarioScore[] = [];

describe(`eval (k=${K}, model=${cfg.model})`, () => {
  for (const s of ALL_SCENARIOS) {
    test(s.id, async () => {
      const score = await runScenario(s, { callOllama, buildTools: unionToolSchemas }, K);
      scores.push(score);
      // MEASUREMENT, không phải pass/fail theo model: chỉ khẳng định đã chạy đủ k lần.
      // Pass-rate thật nằm trong scorecard (đừng để vitest "đỏ" vì model yếu).
      expect(score.runs).toBe(K);
    });
  }

  afterAll(async () => {
    if (scores.length) {
      const path = await writeScorecard(scores, { k: K, model: cfg.model, at });
      console.log(`\n[eval] scorecard → ${path}`);
    }
  });
});
```

- [ ] **Step 2: Verify `npm test` KHÔNG chạy suite live + vẫn xanh**

Run: `npm test`
Expected: PASS toàn bộ; KHÔNG có dòng `[eval] scorecard` (file `*.eval.ts` không bị gom). Tổng test = 498 + các grader/runner/util/report test mới (tất định, không cần Ollama).

- [ ] **Step 3 (HOST, user chạy): nghiệm thu eval live**

Run: `npm run eval`  *(yêu cầu Ollama sống + model đã pull)*
Expected:
- 10 `test()` chạy tuần tự, đều "passed" (đã chạy đủ k lần — KHÔNG phản ánh chất lượng model).
- Log `[eval] scorecard → .serena/qa/eval-<date>.md`.
- Mở file: bảng 7 cột × 10 scenario, dòng **TỔNG pass-rate**, mục **Trượt & vì sao**.
- Kỳ vọng baseline: `geo-directions`/`chart-render` ~**0%** (đúng F2); 5 internal tool có số thật để bám.

- [ ] **Step 4: Commit**

```bash
git add scripts/eval/suite.eval.ts
git commit -m "test(eval): live suite entry → writes scorecard to .serena/qa/"
```

- [ ] **Step 5: Lưu baseline + checkpoint**

Sau khi user chạy `npm run eval`: lưu scorecard đầu tiên làm baseline; ghi `.serena/checkpoint/<agent>-<date>.md` (số liệu + lần trượt nổi bật) và cập nhật `.serena/memories/qa/latest-results.md` (theo Serena protocol). Đây là **baseline** để phase tools/skills về sau chứng minh tiến bộ.

---

## Self-Review

**1. Spec coverage:**
- Taxonomy 6 chiều + rich-block → graders Task 3–7 (selection, restraint, args, grounding, termination, rich-block, write-intent) ✓
- Kiến trúc scenarios/runner/graders/report → Task 1,10,3-8,12 ✓
- Decision A (stub, no seed-DB) → stub-dispatch Task 9 ✓ · B (k-runs, prod sampler) → runner Task 10 + ollamaCfgFromEnv Task 13 ✓ · C (npm run eval riêng) → Task 1 ✓ · D (vitest-project, zero dep) → Task 1 ✓ · E (write stub thuần) → write-intent Task 7 ✓ · F (F2 baseline) → scenarios Task 11 + nghiệm thu Task 14 ✓
- Scorecard format `.serena/qa/eval-<date>.md` (+json) → report Task 12 + writeScorecard Task 14 ✓
- Success criterion #4 (graders unit-test trong npm test) → mọi grader có `*.test.ts` ✓
- Non-goal "không thêm dependency" → chỉ vitest sẵn có ✓

**2. Placeholder scan:** Không có TBD/TODO; mọi step có code thật. Lưu ý duy nhất: Task 10 Step 4 có nhánh dự phòng NẾU `buildSystemPrompt` không thuần (kéo @/db) — đã nêu cách xử lý cụ thể (inject `buildSystem`), không phải placeholder.

**3. Type consistency:** `Scenario/Expect/RunTrace/DispatchCall/GraderResult/ScenarioScore` định nghĩa ở Task 1, dùng nhất quán. `runGraders(trace, scenario)` (Task 8) khớp chữ ký runner gọi (Task 10). `makeStubDispatch` trả `{dispatch, calls}` (Task 9) — runner destructure đúng. `makeRealOllama` trả `ToolRoundsDeps["callOllama"]` (Task 13) — runner nhận đúng kiểu. Tên tool `laam_*` khớp code thật (đã đọc 5 tool file).

**4. Ambiguity:** `rounds` = số assistant-msg có `tool_calls` (định nghĩa rõ ở Task 10, dùng ở termination Task 6). `finalText` từ call bù (Task 10) — đã giải thích vì sao.
