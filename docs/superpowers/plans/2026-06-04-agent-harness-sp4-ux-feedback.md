# SP-4 UX Feedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho người dùng chat thấy tool nào đang/đã chạy (trace ✓/✗ + args) và nguồn dữ liệu (citations), stream qua giao thức frame `U+001E` chung — giữ streaming nguyên vẹn, fail-soft.

**Architecture:** Nối `onEvent` của `makeDispatch` (đã có, chưa truyền) → gom frame ở route → phát **trailing** trên stream hiện tại (chế độ **Gộp**). 1 module thuần `src/lib/chat/frames.ts` (`encodeFrame`/`splitFrames`) + `trace.ts` (redact args, suy citations từ `convo`). FE: 2 component mới (`ToolTrace`/`Citations`) + 3 điểm chạm additive vào `components/chat/*`. Logic nặng nằm ở hàm thuần (test vitest); route chỉ plumbing.

**Tech Stack:** Next.js 16 / React 19 / TypeScript · Vitest + Testing Library · Tailwind v4 · i18n in-house (vi/en/zh).

**Spec:** `docs/superpowers/specs/2026-06-04-agent-harness-sp4-ux-feedback-design.md` · Decisions D-SP4-1…7.

---

## Prerequisites (coordination — KHÔNG phải code; làm TRƯỚC khi chạm file liên quan)

- **P0. Worktree.** Tạo worktree cô lập (skill `superpowers:using-git-worktrees`) trên branch `feat/agent-harness-sp4`. Commit mỗi task trong worktree này (KHÔNG commit thẳng `main`; tree có việc chưa commit của session khác).
- **P1. FE sign-off (gate Task 7).** Mở `comms/active/sp4-to-frontend-chat-touchpoints.md`: xin sign-off 3 điểm chạm `components/chat/*` — `types.ts` (+2 field `ChatMsg`), `ChatClient.tsx` (đổi parser stream sang `splitFrames` + strip `U+001E` ở `withAttachments`), `MessageItem.tsx` (2 slot render). Kèm diff dự kiến (Task 7). **Không sửa 3 file này tới khi FE OK.** Tasks 1–6 + 8 KHÔNG bị gate.
- **P2. `frames.ts` 1 nguồn (↔SP-2).** Theo lead (`lead-to-sp4-frame-protocol` line 105): SP-4 land `frames.ts` (Task 1) TRƯỚC để SP-2 import `encodeFrame`; SP-2 KHÔNG tạo `frames.ts` thứ 2. Nếu SP-2 cần sớm, chốt interim ở thread `sp2-to-sp4-frames`.
- **P3. Suspend-flush (↔SP-2, khi cả hai merge).** Nhánh write-SUSPEND của SP-2 phải flush `toolFrames` đã gom — KHÔNG thuộc plan này (SP-2 thực thi), chỉ ghi nhận để phối hợp.

---

## File Structure

**Mới — SP-4 sở hữu:**
- `src/lib/chat/frames.ts` — `ChatFrame`, `encodeFrame`, `splitFrames`. THUẦN. (+`frames.test.ts`)
- `src/lib/chat/trace.ts` — `summarizeArgs`, `deriveCitations`, `makeFrameCollector`. THUẦN, server-side. (+`trace.test.ts`)
- `src/components/chat/toolLabel.ts` — `ToolTraceItem` type + `toolLabel(name,t)`. (+`toolLabel.test.ts`)
- `src/components/chat/ToolTrace.tsx` — trace gập ✓/✗. (+`ToolTrace.test.tsx`)
- `src/components/chat/Citations.tsx` — footer "Nguồn: …". (+`Citations.test.tsx`)

**Sửa:**
- `src/i18n/dictionaries/chat.ts` — thêm key (vi/en/zh).
- `src/app/api/chat/route.ts` — wire onEvent + trailing frames + migrate token frame.
- `src/components/chat/types.ts` *(FE-owned, gate P1)* — `ChatMsg += { toolTrace?, cites? }`.
- `src/components/chat/ChatClient.tsx` *(FE-owned, gate P1)* — `splitFrames` parser + `withAttachments` strip.
- `src/components/chat/MessageItem.tsx` *(FE-owned, gate P1)* — 2 slot.

---

## Task 1: Frame protocol (`frames.ts`)

**Files:**
- Create: `src/lib/chat/frames.ts`
- Test: `src/lib/chat/frames.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/chat/frames.test.ts
import { describe, expect, test } from "vitest";
import { encodeFrame, splitFrames, FRAME_SEP } from "./frames";

describe("encodeFrame / splitFrames", () => {
  test("encode bọc cặp SEP + JSON", () => {
    expect(encodeFrame({ t: "tokens", i: 3, o: 5 })).toBe(`${FRAME_SEP}{"t":"tokens","i":3,"o":5}${FRAME_SEP}`);
  });

  test("text thuần (không frame) trả nguyên văn", () => {
    expect(splitFrames("xin chào")).toEqual({ text: "xin chào", frames: [] });
  });

  test("text + frame đuôi → tách text & frame", () => {
    const raw = "Trả lời." + encodeFrame({ t: "tokens", i: 1, o: 2 });
    expect(splitFrames(raw)).toEqual({ text: "Trả lời.", frames: [{ t: "tokens", i: 1, o: 2 }] });
  });

  test("nhiều frame ở đuôi", () => {
    const raw = "ok" +
      encodeFrame({ t: "tool", phase: "call", c: 0, name: "laam_find_stuck" }) +
      encodeFrame({ t: "cite", names: ["laam_find_stuck"] }) +
      encodeFrame({ t: "tokens", i: 9, o: 4 });
    const { text, frames } = splitFrames(raw);
    expect(text).toBe("ok");
    expect(frames).toHaveLength(3);
    expect(frames[2]).toEqual({ t: "tokens", i: 9, o: 4 });
  });

  test("GUARD: frame đuôi CHƯA đóng (1 SEP mở) → loại khỏi text, KHÔNG render", () => {
    const raw = "Câu trả lời" + FRAME_SEP + '{"t":"tokens","i:'; // cắt giữa frame
    expect(splitFrames(raw)).toEqual({ text: "Câu trả lời", frames: [] });
  });

  test("GUARD áp per-chunk: SEP mở ở cuối buffer không rò ra text", () => {
    expect(splitFrames("đang gõ" + FRAME_SEP).text).toBe("đang gõ");
  });

  test("frame JSON hỏng → bỏ qua (fail-soft), text vẫn sạch", () => {
    const raw = "hi" + FRAME_SEP + "{bad json}" + FRAME_SEP + "đuôi";
    expect(splitFrames(raw)).toEqual({ text: "hiđuôi", frames: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/frames.test.ts`
Expected: FAIL — `Cannot find module './frames'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/chat/frames.ts
// Giao thức frame chung cho stream /api/chat: text thường + frame metadata bọc cặp
// U+001E. THUẦN — server dùng encodeFrame, client dùng splitFrames. SP-4 sở hữu (D-SP4-2).
// SP-2 import encodeFrame + ChatFrame ('pending_write') từ ĐÂY (1 nguồn, không bản 2).
export const FRAME_SEP = ""; // U+001E record separator

export type ChatFrame =
  | { t: "tokens"; i: number; o: number }
  | { t: "tool"; phase: "call" | "result"; c: number; name: string; args?: string; ok?: boolean }
  | { t: "cite"; names: string[] }
  | { t: "pending_write"; token: string; tool: string; title: string; summary: string; fields?: { label: string; value: string }[] };

// 1 frame = SEP + JSON-1-dòng + SEP. JSON.stringify đảm bảo không lọt SEP thô vào JSON.
export function encodeFrame(f: ChatFrame): string {
  return FRAME_SEP + JSON.stringify(f) + FRAME_SEP;
}

// Tách text hiển thị khỏi frame. text = byte ngoài các cặp SEP; frame = đoạn giữa cặp.
// GUARD (D-SP4-2): SEP mở CHƯA có SEP đóng (frame đuôi một-phần / stream cắt giữa chunk)
// ⇒ pending: loại khỏi text, KHÔNG parse, KHÔNG render. An toàn gọi trên buffer từng-phần
// (mỗi chunk) — luôn cho text "sạch" tới SEP mở cuối, không rò `U+001E{…` ra bong bóng.
export function splitFrames(raw: string): { text: string; frames: ChatFrame[] } {
  let text = "";
  const frames: ChatFrame[] = [];
  let i = 0;
  while (i < raw.length) {
    const open = raw.indexOf(FRAME_SEP, i);
    if (open === -1) { text += raw.slice(i); break; }
    text += raw.slice(i, open);
    const close = raw.indexOf(FRAME_SEP, open + 1);
    if (close === -1) break; // frame đuôi chưa đóng → pending; bỏ phần còn lại khỏi text
    try {
      const f = JSON.parse(raw.slice(open + 1, close)) as ChatFrame;
      if (f && typeof (f as { t?: unknown }).t === "string") frames.push(f);
    } catch { /* frame hỏng → bỏ qua (fail-soft) */ }
    i = close + 1;
  }
  return { text, frames };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/chat/frames.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/frames.ts src/lib/chat/frames.test.ts
git commit -m "feat(chat): frame protocol U+001E (encodeFrame/splitFrames) for tool-event stream" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Server trace helpers (`trace.ts`)

**Files:**
- Create: `src/lib/chat/trace.ts`
- Test: `src/lib/chat/trace.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/chat/trace.test.ts
import { describe, expect, test } from "vitest";
import { summarizeArgs, deriveCitations, makeFrameCollector } from "./trace";
import type { ChatMessage } from "@/lib/agent/orchestrator";

describe("summarizeArgs", () => {
  test("internal: hiện key=value an toàn", () => {
    expect(summarizeArgs({ thresholdMin: 10 }, true)).toBe("thresholdMin=10");
  });
  test("connector: KHÔNG hiện giá trị (redact), chỉ số tham số", () => {
    expect(summarizeArgs({ key: "secret", token: "abc" }, false)).toBe("2 tham số");
  });
  test("string JSON được parse", () => {
    expect(summarizeArgs('{"status":"running"}', true)).toBe("status=running");
  });
  test("rỗng → undefined", () => {
    expect(summarizeArgs({}, true)).toBeUndefined();
    expect(summarizeArgs("not json", true)).toBeUndefined();
  });
});

describe("deriveCitations", () => {
  const base: ChatMessage[] = [{ role: "system", content: "s" }, { role: "user", content: "u" }];
  test("chỉ tool có dữ liệu vào Nguồn; loại {error} và rỗng", () => {
    const convo: ChatMessage[] = [
      ...base,
      { role: "assistant", content: "", tool_calls: [
        { function: { name: "laam_list_agents" } },
        { function: { name: "laam_get_agent" } },
        { function: { name: "laam_find_stuck" } },
      ] },
      { role: "tool", content: JSON.stringify([{ id: "a1" }]) },              // có dữ liệu
      { role: "tool", content: JSON.stringify({ error: "không tìm thấy" }) }, // {error} → loại
      { role: "tool", content: JSON.stringify([]) },                          // rỗng → loại
      { role: "assistant", content: "xong" },
    ];
    expect(deriveCitations(convo, base.length)).toEqual(["laam_list_agents"]);
  });
  test("dedupe tên tool", () => {
    const convo: ChatMessage[] = [
      ...base,
      { role: "assistant", content: "", tool_calls: [{ function: { name: "laam_query_stats" } }] },
      { role: "tool", content: JSON.stringify({ kpi: 1 }) },
      { role: "assistant", content: "", tool_calls: [{ function: { name: "laam_query_stats" } }] },
      { role: "tool", content: JSON.stringify({ kpi: 2 }) },
    ];
    expect(deriveCitations(convo, base.length)).toEqual(["laam_query_stats"]);
  });
});

describe("makeFrameCollector", () => {
  test("gán c theo cặp call→result; redact args connector", () => {
    const internal = new Set(["laam_find_stuck"]);
    const { onEvent, frames } = makeFrameCollector(internal);
    onEvent({ type: "tool_call", name: "laam_find_stuck", args: { thresholdMin: 10 } });
    onEvent({ type: "tool_result", name: "laam_find_stuck", ok: true, bytes: 12 });
    onEvent({ type: "tool_call", name: "github_list_repos", args: { token: "x" } });
    onEvent({ type: "tool_result", name: "github_list_repos", ok: false, bytes: 0 });
    expect(frames).toEqual([
      { t: "tool", phase: "call", c: 0, name: "laam_find_stuck", args: "thresholdMin=10" },
      { t: "tool", phase: "result", c: 0, name: "laam_find_stuck", ok: true },
      { t: "tool", phase: "call", c: 1, name: "github_list_repos", args: "1 tham số" },
      { t: "tool", phase: "result", c: 1, name: "github_list_repos", ok: false },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/chat/trace.test.ts`
Expected: FAIL — `Cannot find module './trace'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/chat/trace.ts — THUẦN, server-side. Redact args + suy citations từ convo + gom frame.
import type { ChatFrame } from "./frames";
import type { ChatMessage } from "@/lib/agent/orchestrator";
import type { ToolEvent } from "@/lib/agent/types";

// Tóm tắt args để hiển thị. Internal (set-membership): key=value an toàn. Connector: KHÔNG
// hiện giá trị (có thể chứa cred — D-SP4-3) → chỉ báo số tham số.
export function summarizeArgs(rawArgs: unknown, isInternal: boolean): string | undefined {
  let a: unknown = rawArgs;
  if (typeof a === "string") { try { a = JSON.parse(a); } catch { return undefined; } }
  if (!a || typeof a !== "object") return undefined;
  const obj = a as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return undefined;
  if (!isInternal) return `${keys.length} tham số`;
  return keys.slice(0, 4).map((k) => `${k}=${String(obj[k])}`).join(", ");
}

// "Nguồn": tool có result KHÔNG có key `error` và KHÔNG rỗng. Đọc convo runToolRounds trả:
// assistant{tool_calls:[…]} theo sau bởi các message role:'tool' (1 result / call, đúng thứ tự).
export function deriveCitations(convo: ChatMessage[], baseLen: number): string[] {
  const names: string[] = [];
  const tail = convo.slice(baseLen);
  for (let i = 0; i < tail.length; i++) {
    const calls = (tail[i] as { tool_calls?: unknown[] }).tool_calls;
    if (tail[i].role !== "assistant" || !Array.isArray(calls)) continue;
    let j = i + 1;
    for (const tc of calls) {
      const toolMsg = tail[j];
      if (!toolMsg || toolMsg.role !== "tool") break;
      const name = (tc as { function?: { name?: string } }).function?.name ?? "";
      if (name && hasData(toolMsg.content)) names.push(name);
      j++;
    }
  }
  return [...new Set(names)];
}

function hasData(content: string): boolean {
  let v: unknown;
  try { v = JSON.parse(content); } catch { return content.trim().length > 0; }
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return !("error" in (v as object)) && Object.keys(v as object).length > 0;
  return true;
}

// Gom tool frames từ onEvent: gán bộ đếm `c` theo cặp call→result (phát tuần tự — D-SP4-5),
// redact args theo set-membership internal. THUẦN (mảng `frames` mutate tại chỗ).
export function makeFrameCollector(internalNames: Set<string>): {
  onEvent: (e: ToolEvent) => void;
  frames: ChatFrame[];
} {
  const frames: ChatFrame[] = [];
  let c = -1;
  return {
    frames,
    onEvent(e) {
      if (e.type === "tool_call") {
        c++;
        frames.push({ t: "tool", phase: "call", c, name: e.name, args: summarizeArgs(e.args, internalNames.has(e.name)) });
      } else {
        frames.push({ t: "tool", phase: "result", c, name: e.name, ok: e.ok });
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/chat/trace.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chat/trace.ts src/lib/chat/trace.test.ts
git commit -m "feat(chat): server trace helpers (redact args, derive citations, frame collector)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Tool label helper (`toolLabel.ts`)

**Files:**
- Create: `src/components/chat/toolLabel.ts`
- Test: `src/components/chat/toolLabel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/chat/toolLabel.test.ts
import { describe, expect, test } from "vitest";
import { toolLabel } from "./toolLabel";

const fakeT = (key: string) => ({
  "chat.toolFindStuck": "Tìm agent kẹt",
}[key] ?? key);

describe("toolLabel", () => {
  test("internal đã map → nhãn i18n", () => {
    expect(toolLabel("laam_find_stuck", fakeT)).toBe("Tìm agent kẹt");
  });
  test("connector chưa map → humanize tên thô", () => {
    expect(toolLabel("github_list_repos", fakeT)).toBe("github list repos");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/chat/toolLabel.test.ts`
Expected: FAIL — `Cannot find module './toolLabel'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/chat/toolLabel.ts
// Nhãn thân thiện cho trace/citations (mỹ thuật, client-side — D-SP4-3: lệch nhãn ≠ rò).
// 5 internal tool map sang key i18n; connector → humanize tên thô.
import type { Translator } from "@/i18n/types";

// 1 item trace đã ghép call↔result theo `c` (ChatClient dựng từ frames).
export type ToolTraceItem = {
  c: number;
  name: string;
  args?: string;
  ok?: boolean;   // chỉ có khi done
  done: boolean;  // result frame đã tới
};

const TOOL_LABEL_KEY: Record<string, string> = {
  laam_list_agents: "chat.toolListAgents",
  laam_get_agent: "chat.toolGetAgent",
  laam_query_stats: "chat.toolQueryStats",
  laam_list_machines: "chat.toolListMachines",
  laam_find_stuck: "chat.toolFindStuck",
};

export function toolLabel(name: string, t: Translator): string {
  const key = TOOL_LABEL_KEY[name];
  return key ? t(key) : name.replace(/_/g, " ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/chat/toolLabel.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/toolLabel.ts src/components/chat/toolLabel.test.ts
git commit -m "feat(chat): tool friendly-label helper + ToolTraceItem type" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: i18n keys

**Files:**
- Modify: `src/i18n/dictionaries/chat.ts` (thêm trước dòng đóng `};`)

- [ ] **Step 1: Add the keys** (thêm vào cuối object `chat`, ngay trước `};` dòng 196)

```ts
  // --- SP-4: tool trace + citations ---
  'chat.toolUsed': { vi: 'Đã dùng {n} công cụ', en: 'Used {n} tool(s)', zh: '已用 {n} 个工具' },
  'chat.source': { vi: 'Nguồn', en: 'Source', zh: '来源' },
  'chat.toolListAgents': { vi: 'Liệt kê agent', en: 'List agents', zh: '列出 agent' },
  'chat.toolGetAgent': { vi: 'Xem chi tiết agent', en: 'Get agent', zh: '查看 agent' },
  'chat.toolQueryStats': { vi: 'Thống kê hệ thống', en: 'System stats', zh: '系统统计' },
  'chat.toolListMachines': { vi: 'Liệt kê máy', en: 'List machines', zh: '列出机器' },
  'chat.toolFindStuck': { vi: 'Tìm agent kẹt', en: 'Find stuck agents', zh: '查找卡住的 agent' },
```

- [ ] **Step 2: Verify dictionary test still passes**

Run: `npx vitest run src/i18n/dictionaries/chat.test.ts`
Expected: PASS (nếu test kiểm parity 3 ngôn ngữ — mọi key mới đều có vi/en/zh).

- [ ] **Step 3: Commit**

```bash
git add src/i18n/dictionaries/chat.ts
git commit -m "feat(chat): i18n keys for tool trace + citations (vi/en/zh)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Presentational components (`ToolTrace`, `Citations`)

**Files:**
- Create: `src/components/chat/ToolTrace.tsx`, `src/components/chat/Citations.tsx`
- Test: `src/components/chat/ToolTrace.test.tsx`, `src/components/chat/Citations.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/chat/ToolTrace.test.tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { ToolTrace } from "./ToolTrace";

const wrap = (ui: React.ReactNode) => render(<I18nProvider lang="vi">{ui}</I18nProvider>);

describe("ToolTrace", () => {
  test("rỗng → null (vô hình ca 0 tool)", () => {
    const { container } = wrap(<ToolTrace items={[]} />);
    expect(container.firstChild).toBeNull();
  });
  test("undefined → null", () => {
    const { container } = wrap(<ToolTrace items={undefined} />);
    expect(container.firstChild).toBeNull();
  });
  test("hiện tóm tắt số công cụ", () => {
    wrap(<ToolTrace items={[{ c: 0, name: "laam_find_stuck", done: true, ok: true }]} />);
    expect(screen.getByText(/Đã dùng 1 công cụ/)).toBeTruthy();
  });
});
```

```tsx
// src/components/chat/Citations.test.tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { Citations } from "./Citations";

const wrap = (ui: React.ReactNode) => render(<I18nProvider lang="vi">{ui}</I18nProvider>);

describe("Citations", () => {
  test("rỗng → null", () => {
    const { container } = wrap(<Citations names={[]} />);
    expect(container.firstChild).toBeNull();
  });
  test("hiện Nguồn + nhãn thân thiện", () => {
    wrap(<Citations names={["laam_find_stuck"]} />);
    expect(screen.getByText(/Nguồn/)).toBeTruthy();
    expect(screen.getByText(/Tìm agent kẹt/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/chat/ToolTrace.test.tsx src/components/chat/Citations.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the components**

```tsx
// src/components/chat/ToolTrace.tsx
"use client";
// SP-4: trace tool-call 1 lượt chat (đã gọi tool nào, ✓/✗ + args). Gập, vô hình khi rỗng.
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import { toolLabel, type ToolTraceItem } from "./toolLabel";

export function ToolTrace({ items }: { items?: ToolTraceItem[] }) {
  const t = useT(chat);
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-1.5 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
      >
        <ChevronRight size={12} aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`} />
        {t("chat.toolUsed", { n: items.length })}
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-4">
          {items.map((it) => (
            <li key={it.c} className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-300">
              <span aria-hidden className={it.ok === false ? "text-red-500" : it.done ? "text-green-600" : "text-neutral-400"}>
                {it.done ? (it.ok === false ? "✗" : "✓") : "…"}
              </span>
              <span>{toolLabel(it.name, t)}</span>
              {it.args && <span className="text-neutral-400">({it.args})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

```tsx
// src/components/chat/Citations.tsx
"use client";
// SP-4: footer "Nguồn: …" — tool đọc thành công đã cấp dữ liệu cho câu trả lời.
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";
import { toolLabel } from "./toolLabel";

export function Citations({ names }: { names?: string[] }) {
  const t = useT(chat);
  if (!names || names.length === 0) return null;
  return (
    <div className="mt-1.5 text-xs text-neutral-400 dark:text-neutral-500">
      {t("chat.source")}: {names.map((n) => toolLabel(n, t)).join(" · ")}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/chat/ToolTrace.test.tsx src/components/chat/Citations.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ToolTrace.tsx src/components/chat/Citations.tsx src/components/chat/ToolTrace.test.tsx src/components/chat/Citations.test.tsx
git commit -m "feat(chat): ToolTrace + Citations presentational components" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Wire route (`route.ts`) — server, phát frame

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Add imports** (sau dòng 8, cạnh các import `@/lib/agent/*`)

```ts
import type { ToolEvent } from "@/lib/agent/types";
import { encodeFrame, type ChatFrame } from "@/lib/chat/frames";
import { makeFrameCollector, deriveCitations } from "@/lib/chat/trace";
```

- [ ] **Step 2: Gom tool frames + cites** — thay khối tạo `dispatch` + `runToolRounds` (hiện ~dòng 132–156) bằng:

```ts
  // Một lượt chat luôn chạy tool-loop (do internal tools luôn bật).
  const internalNames = new Set(INTERNAL_TOOLS.map((t) => t.name));
  const { onEvent, frames: toolFrames } = makeFrameCollector(internalNames);
  const dispatch = makeDispatch(INTERNAL_TOOLS, { userId, now, lang }, onEvent);
  const callOllama = async (
    messages: ChatMessage[],
    roundTools: typeof tools,
  ): Promise<OllamaChatResponse> => {
    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: payload.model,
        messages,
        ...(roundTools.length ? { tools: roundTools } : {}),
        options: payload.options,
        stream: false,
      }),
    });
    if (!r.ok) throw new Error(`Ollama ${r.status}`);
    return (await r.json()) as OllamaChatResponse;
  };
  const baseLen = payload.messages.length;
  let cites: string[] = [];
  try {
    payload.messages = await runToolRounds(payload.messages, tools, { callOllama, dispatch });
    cites = deriveCitations(payload.messages, baseLen);
  } catch {
    // Tool loop lỗi (Ollama/connector) — stream trả lời thường; frames có thể rỗng (fail-soft).
  }
```

- [ ] **Step 3: Phát trailing frames** — trong `finally` của stream, thay khối token frame (hiện ~dòng 224–234) bằng:

```ts
        if (full) {
          await db.insert(chatMessages).values({
            conversationId: convId,
            role: "assistant",
            content: full,
            tokensIn,
            tokensOut,
          });
          // Trailing frames (bọc U+001E): tool trace → citations → token usage. Client strip
          // khỏi text hiển thị. Fail-soft: lỗi enqueue (client aborted) → bỏ qua.
          try {
            const frames: ChatFrame[] = [
              ...toolFrames,
              ...(cites.length ? [{ t: "cite", names: cites } as ChatFrame] : []),
              { t: "tokens", i: tokensIn, o: tokensOut },
            ];
            for (const f of frames) controller.enqueue(encoder.encode(encodeFrame(f)));
          } catch {
            /* response already cancelled (client aborted) — nothing to send */
          }
        }
```

- [ ] **Step 4: Verify route test + type check**

Run: `npx vitest run src/app/api/chat/route.test.ts`
Expected: PASS (test cũ `buildOllamaPayload` + harness-wiring không đổi).
Run: `npx tsc --noEmit`
Expected: no errors.

> **Lưu ý verify (M-4):** không có integration test cho luồng stream của route (FE chưa có ChatClient.test). Đúng đắn end-to-end của frame được khoá ở `frames.test.ts`/`trace.test.ts` (thuần); xác nhận stream thật cần **preview thủ công** (Task 8) hoặc tuyên bố giới hạn (Rule 12).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(chat): stream tool-event + citation frames; migrate token frame to tagged envelope" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: FE touch points (`ChatClient`, `types`, `MessageItem`) — **GATE: FE sign-off (P1)**

> Chỉ làm sau khi FE đã OK ở `comms/active/sp4-to-frontend-chat-touchpoints.md`. Tất cả là **additive**.

**Files:**
- Modify: `src/components/chat/types.ts`, `src/components/chat/ChatClient.tsx`, `src/components/chat/MessageItem.tsx`

- [ ] **Step 1: `types.ts` — thêm 2 field vào `ChatMsg`** (sau `tokensOut?` dòng 13)

```ts
import type { ToolTraceItem } from "./toolLabel";

export type ChatMsg = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt?: number;
  tokensIn?: number;
  tokensOut?: number;
  toolTrace?: ToolTraceItem[]; // SP-4: trace tool (ephemeral, không reload)
  cites?: string[];            // SP-4: tên tool nguồn (ephemeral)
};
```

- [ ] **Step 2: `ChatClient.tsx` — strip U+001E khỏi attachment** (trong `withAttachments`, dòng ~140-143)

Thay `${a.text}` bằng bản đã strip để byte điều khiển không phá frame (I-4):

```ts
  function withAttachments(text: string): string {
    if (!attachments.length) return text;
    const clean = (s: string) => s.replace(//g, ""); // strip SEP (defense-in-depth D-SP4-2)
    const blocks = attachments
      .map((a) => `--- ${a.kind === "url" ? "URL" : "Tệp"}: ${a.name} ---\n${clean(a.text)}`)
      .join("\n\n");
    return `${blocks}\n\n${text}`;
  }
```

- [ ] **Step 3: `ChatClient.tsx` — mở rộng `setLastAssistant`** (dòng 122-135)

```ts
  function setLastAssistant(
    prev: ChatMsg[],
    content: string,
    tokens?: { tokensIn: number; tokensOut: number },
    toolTrace?: ToolTraceItem[],
    cites?: string[],
  ): ChatMsg[] {
    const copy = [...prev];
    for (let i = copy.length - 1; i >= 0; i--) {
      if (copy[i].role === "assistant") {
        copy[i] = {
          ...copy[i],
          content,
          ...(tokens ?? {}),
          ...(toolTrace !== undefined ? { toolTrace } : {}),
          ...(cites !== undefined ? { cites } : {}),
        };
        break;
      }
    }
    return copy;
  }
```

Thêm import ở đầu file: `import { splitFrames, type ChatFrame } from "@/lib/chat/frames";` và `import type { ToolTraceItem } from "./toolLabel";`.

- [ ] **Step 4: `ChatClient.tsx` — đổi parser stream** (thay khối dòng 171-200)

```ts
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let raw = "";
        const trace = new Map<number, ToolTraceItem>();
        let cites: string[] | undefined;
        let tokens: { tokensIn: number; tokensOut: number } | undefined;
        const applyFrames = (frames: ChatFrame[]) => {
          for (const f of frames) {
            if (f.t === "tool") {
              const cur = trace.get(f.c) ?? { c: f.c, name: f.name, done: false };
              if (f.phase === "call") { cur.name = f.name; cur.args = f.args; }
              else { cur.ok = f.ok; cur.done = true; }
              trace.set(f.c, cur);
            } else if (f.t === "cite") cites = f.names;
            else if (f.t === "tokens") tokens = { tokensIn: f.i, tokensOut: f.o };
          }
        };
        const items = () => [...trace.values()].sort((a, b) => a.c - b.c);
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += dec.decode(value, { stream: true });
          const { text, frames } = splitFrames(raw);
          applyFrames(frames);
          const list = items();
          setMessages((p) => setLastAssistant(p, text, undefined, list.length ? list : undefined, cites));
        }
        const { text, frames } = splitFrames(raw);
        applyFrames(frames);
        const list = items();
        setMessages((p) => setLastAssistant(p, text, tokens, list.length ? list : undefined, cites));
```

- [ ] **Step 5: `MessageItem.tsx` — 2 slot** (thay nhánh assistant render, dòng 66-72)

Thêm import: `import { ToolTrace } from "./ToolTrace";` và `import { Citations } from "./Citations";`

```tsx
        {isAssistant && isEmpty && streaming ? (
          <span className="text-neutral-500 dark:text-neutral-400">{t("chat.thinking")}</span>
        ) : isAssistant ? (
          <>
            <ToolTrace items={msg.toolTrace} />
            <MarkdownView source={msg.content} />
            <Citations names={msg.cites} />
          </>
        ) : (
          msg.content
        )}
```

- [ ] **Step 6: Verify FE tests + type check**

Run: `npx vitest run src/components/chat/`
Expected: PASS — `MessageItem.test.tsx`, `MessageList.test.tsx`, `ChatExport.test.tsx`, `Composer.test.tsx`, `ConversationSidebar.test.tsx`, `SettingsPanel.test.tsx`, `ToolTrace.test.tsx`, `Citations.test.tsx`, `toolLabel.test.ts` đều xanh (slot mới null khi rỗng ⇒ test cũ không đổi).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/types.ts src/components/chat/ChatClient.tsx src/components/chat/MessageItem.tsx
git commit -m "feat(chat): render tool trace + citations in message bubble (frame parser)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Full verification

- [ ] **Step 1: Toàn bộ test suite**

Run: `npx vitest run`
Expected: baseline hiện hành + test mới SP-4 đều PASS (đo lại số trên nhánh; KHÔNG hardcode tuyệt đối). 0 fail.

- [ ] **Step 2: Type + build**

Run: `npx tsc --noEmit` → no errors.
Run: `npm run build` → build xanh.

- [ ] **Step 3: Preview thủ công (Success #5 — nếu được phép chạy dev)**

> agent-ops-rules: KHÔNG tự chạy dev. Nếu user cho phép preview: gửi câu "agent nào đang kẹt?" → xác nhận (a) trace "Đã dùng N công cụ" + ✓ chi tiết, (b) footer "Nguồn: …", (c) câu chào ("hi") → KHÔNG trace/footer, (d) bấm Stop giữa chừng → không rò `U+001E{…`. Nếu KHÔNG preview được → tuyên bố giới hạn verify (Rule 12), dựa vào unit test `frames`/`trace`.

- [ ] **Step 4: Commit (nếu có chỉnh lặt vặt từ verify)**

```bash
git add -A
git commit -m "test(chat): verify SP-4 UX feedback end-to-end" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (đã chạy)

- **Spec coverage:** Success #1 (trace+cite)→Task 5/6; #2 (0 tool vô hình)→Task 5 test; #3 ({error} loại)→Task 2 `deriveCitations` test; #4 (Stop không rò)→Task 1 GUARD test; #5 (token cũ)→Task 1 token shape + Task 6 migrate; #6 (fail-soft)→Task 6 try/catch; #7 (build/tsc)→Task 8. D-SP4-1…7 đều có task. Cross-SP (§8 spec): frames.ts-first→P2; suspend-flush→P3; DRY extractor→ghi chú Task 2 (`deriveCitations` chia sẻ với SP-3 `extractToolTurns` khi merge); FE sign-off→P1/Task 7.
- **Placeholder scan:** không có TBD/TODO; mọi step code đầy đủ.
- **Type consistency:** `ChatFrame`/`ToolTraceItem`/`ChatMessage` nhất quán giữa Task 1/2/3/5/6/7; `setLastAssistant` chữ ký mới khớp mọi caller (param optional, caller cũ không vỡ).
