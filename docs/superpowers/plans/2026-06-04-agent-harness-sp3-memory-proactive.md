# Agent Harness SP-3 (Memory & Proactive) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lưu lại tool turns, tóm tắt hội thoại dài, và chủ động cảnh báo agent kẹt/chi phí cao — tất cả qua module thuần + DI nối vào `/api/chat`, **không đổi hợp đồng SP-1**.

**Architecture:** 3 module thuần mới (`persist`/`summarize`/`proactive`) + 1 loader dùng chung (`_load`), test bằng vitest (mock `@/db`); nối vào `src/app/api/chat/route.ts` theo thứ tự §5.5 của spec (summarize → proactive compose-around `buildSystemPrompt` → tool-loop → persist tool turns + assistant). Schema thêm bảng `chat_tool_call` + 3 cột `chat_conversation` qua **migration 0003 additive**.

**Tech Stack:** Next.js 16 route handler · Drizzle (`db.select/insert/update`) · vitest · Ollama native tool-calling + 1 lần gọi non-streaming cho summarize · **không thêm npm dep**.

**Spec:** `docs/superpowers/specs/2026-06-04-agent-harness-sp3-memory-proactive-design.md` (§2 contract impact, §3–5 thiết kế, §5.5 thứ tự route, §6 migration). Verdict chủ SP-1: `comms/resolved/sp3-to-lead-design-review.md`.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/db/schema.ts` | **Modify:** thêm `boolean` import, bảng `chatToolCalls`, 3 cột `chatConversations` (`summary`/`summarizedThroughId`/`proactiveState`), type `ChatToolCall` |
| `drizzle/0003_*.sql` + `meta/` | **Generated (host):** migration additive — KHÔNG hand-write |
| `src/lib/agent/persist.ts` (+test) | `extractToolTurns(convo, baseLen)` — trích tool turns từ convo trả về |
| `src/lib/agent/summarize.ts` (+test) | `planHistory` (thuần) + `summarizeMessages` (DI model) |
| `src/lib/agent/tools/laam/_load.ts` (+import update) | `loadSessionRows()` rút từ `query-stats.ts` (verdict A2) |
| `src/lib/agent/proactive.ts` (+test) | `detectAlerts` + `selectNewAlerts` + `formatProactiveNotice` |
| `src/app/api/chat/route.ts` | **Modify:** nối summarize + proactive + persist (thứ tự §5.5) |

---

## Task 0: Isolation (worktree)

**Files:** none (git).

- [ ] **Step 1: Tạo worktree** — Invoke `superpowers:using-git-worktrees`. Nhánh `feat/agent-harness-sp3`, ví dụ `D:\Projects\personal_projects\LAAM-sp3`. Lý do: dev `:3000` chạy từ cây chính theo dõi `src/` — sửa `route.ts`/`schema.ts` ở đó sẽ recompile/ngắt; worktree cô lập ([[agent-ops-rules]] — không tự chạy service).
- [ ] **Step 2: Xác nhận** — Run: `git -C "D:\Projects\personal_projects\LAAM" worktree list`. Expected: thấy worktree mới. Mọi path dưới đây theo gốc worktree.

---

## Task 1: Schema + migration 0003 (additive)

**Files:**
- Modify: `src/db/schema.ts`
- Generated (host): `drizzle/0003_*.sql`, `drizzle/meta/*`

- [ ] **Step 1: Thêm `boolean` vào import drizzle** — sửa khối import đầu `schema.ts`:

```ts
import {
  pgTable,
  pgEnum,
  text,
  integer,
  doublePrecision,
  jsonb,
  timestamp,
  primaryKey,
  unique,
  boolean,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Thêm 3 cột vào `chatConversations`** — trong định nghĩa `chat_conversation`, thêm ngay sau dòng `model: text("model"),`:

```ts
  // SP-3 Memory: rolling summary + watermark (id message cuối đã summarize).
  summary: text("summary"),
  summarizedThroughId: text("summarizedThroughId"),
  // SP-3 Proactive: dedupe per-conversation — alert key -> epoch ms lần nêu cuối.
  proactiveState: jsonb("proactiveState").$type<{ surfaced: Record<string, number> }>(),
```

- [ ] **Step 3: Thêm bảng `chatToolCalls`** — ngay sau định nghĩa `chatMessages` (trước `connectorCredentials`):

```ts
// SP-3 — lưu mỗi lượt tool (tool_call + result) mà orchestrator chạy trong 1 turn.
// chat_message GIỮ NGUYÊN (role 'user'|'assistant'); bảng này tách riêng nên consumer
// hiện có (/api/conversations/[id], ChatClient) không đổi. SP-4 đọc để render.
export const chatToolCalls = pgTable("chat_tool_call", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  conversationId: text("conversationId")
    .notNull()
    .references(() => chatConversations.id, { onDelete: "cascade" }),
  // assistant message mà lượt tool phục vụ; nullable cho ca câu trả lời rỗng.
  messageId: text("messageId").references(() => chatMessages.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull().default(0),
  name: text("name").notNull(),
  args: jsonb("args"),
  result: jsonb("result"),
  ok: boolean("ok").notNull().default(true),
  bytes: integer("bytes").notNull().default(0),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});
```

- [ ] **Step 4: Thêm type export** — cạnh `export type ChatMessage = ...`:

```ts
export type ChatToolCall = typeof chatToolCalls.$inferSelect;
```

- [ ] **Step 5: Kiểm tsc** — Run: `npx tsc --noEmit`. Expected: không lỗi mới.

- [ ] **Step 6: ⚠️ ACTION REQUIRED (user chạy trên HOST — drizzle-kit không chạy sandbox)** — yêu cầu user chạy `npm run db:generate`, rồi review `drizzle/0003_*.sql`. Expected: chỉ `CREATE TABLE "chat_tool_call"` + `ALTER TABLE "chat_conversation" ADD COLUMN ...` + 2 FK — **additive, không DROP/ALTER cột cũ**. Agent KHÔNG tự chạy db:generate. Xem [[db-migrations]].

- [ ] **Step 7: Commit** (sau khi user đã generate) — `git add src/db/schema.ts drizzle/ && git commit -m "feat(db): SP-3 schema — chat_tool_call + conversation summary/proactive cols (migration 0003)"`

- [ ] **Step 8: ⚠️ ACTION REQUIRED** — user chạy `npm run db:migrate` trên host để áp 0003 vào Postgres đang chạy. (Cần cho smoke test Task 7; KHÔNG bắt buộc cho unit test các task sau — chúng mock `@/db`.)

---

## Task 2: `persist.ts` — extractToolTurns

**Files:**
- Create: `src/lib/agent/persist.ts`
- Test: `src/lib/agent/persist.test.ts`

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, test } from "vitest";
import { extractToolTurns } from "./persist";
import type { ChatMessage } from "./orchestrator";

const base: ChatMessage[] = [
  { role: "system", content: "S" },
  { role: "user", content: "hỏi" },
];

describe("extractToolTurns", () => {
  test("ghép tool_calls với tool result; tính ok/bytes/seq", () => {
    const convo: ChatMessage[] = [
      ...base,
      { role: "assistant", content: "", tool_calls: [{ function: { name: "laam_list_agents", arguments: { status: "running" } } }] },
      { role: "tool", content: JSON.stringify({ agents: [] }) },
      { role: "assistant", content: "xong" },
    ];
    const rows = extractToolTurns(convo, base.length);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ seq: 0, name: "laam_list_agents", ok: true });
    expect(rows[0].args).toEqual({ status: "running" });
    expect(rows[0].result).toEqual({ agents: [] });
    expect(rows[0].bytes).toBe(JSON.stringify({ agents: [] }).length);
  });

  test("arguments chuỗi JSON → parse; chuỗi hỏng → {}", () => {
    const convo: ChatMessage[] = [
      ...base,
      { role: "assistant", content: "", tool_calls: [
        { function: { name: "a", arguments: '{"x":1}' } },
        { function: { name: "b", arguments: "{hỏng" } },
      ] },
      { role: "tool", content: "{}" },
      { role: "tool", content: "{}" },
    ];
    const rows = extractToolTurns(convo, base.length);
    expect(rows[0].args).toEqual({ x: 1 });
    expect(rows[1].args).toEqual({});
  });

  test("result có key 'error' → ok=false", () => {
    const convo: ChatMessage[] = [
      ...base,
      { role: "assistant", content: "", tool_calls: [{ function: { name: "a", arguments: {} } }] },
      { role: "tool", content: JSON.stringify({ error: "không tìm thấy" }) },
    ];
    expect(extractToolTurns(convo, base.length)[0].ok).toBe(false);
  });

  test("chỉ text, không tool → []", () => {
    const convo: ChatMessage[] = [...base, { role: "assistant", content: "chào" }];
    expect(extractToolTurns(convo, base.length)).toEqual([]);
  });

  test("baseLen bỏ qua lịch sử cũ", () => {
    const convo: ChatMessage[] = [
      { role: "assistant", content: "", tool_calls: [{ function: { name: "old", arguments: {} } }] },
      { role: "tool", content: "{}" },
      { role: "user", content: "mới" },
      { role: "assistant", content: "trả lời" },
    ];
    expect(extractToolTurns(convo, 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy FAIL** — Run: `npx vitest run src/lib/agent/persist.test.ts`. Expected: FAIL ("cannot find module ./persist").

- [ ] **Step 3: Implement** — `src/lib/agent/persist.ts`

```ts
// SP-3 — trích các lượt tool mà runToolRounds đã APPEND vào convo (từ baseLen trở đi),
// để persist vào chat_tool_call. Thuần — test không cần DB. Đọc giá trị TRẢ VỀ của
// runToolRounds (không dùng ToolEvent, vốn thiếu body/args) — verdict A1.
import type { ChatMessage } from "./orchestrator";

export type ToolTurnRow = {
  seq: number;
  name: string;
  args: unknown;
  result: unknown;
  ok: boolean;
  bytes: number;
};

// args: model có thể gửi object hoặc chuỗi JSON; chuỗi hỏng → {} (khớp makeDispatch).
function parseArgs(v: unknown): unknown {
  if (typeof v !== "string") return v ?? {};
  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
}

// result: tool message content là JSON.stringify(result); hỏng → giữ chuỗi thô.
function parseResult(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

export function extractToolTurns(convo: ChatMessage[], baseLen: number): ToolTurnRow[] {
  const rows: ToolTurnRow[] = [];
  let seq = 0;
  let i = Math.max(0, baseLen);
  while (i < convo.length) {
    const msg = convo[i];
    const calls =
      msg.role === "assistant" && Array.isArray(msg.tool_calls) ? msg.tool_calls : null;
    if (!calls) {
      i++;
      continue;
    }
    let j = i + 1; // tool result messages nằm ngay sau, mỗi call 1 message theo thứ tự.
    for (const tc of calls) {
      const fn = (tc as { function?: { name?: string; arguments?: unknown } }).function ?? {};
      const toolMsg = convo[j];
      const content = toolMsg && toolMsg.role === "tool" ? toolMsg.content ?? "" : "";
      const result = parseResult(content);
      const isErr =
        !!result &&
        typeof result === "object" &&
        !Array.isArray(result) &&
        "error" in (result as Record<string, unknown>);
      rows.push({
        seq: seq++,
        name: fn.name ?? "",
        args: parseArgs(fn.arguments),
        result,
        ok: !isErr,
        bytes: content.length,
      });
      if (toolMsg && toolMsg.role === "tool") j++;
    }
    i = j;
  }
  return rows;
}
```

- [ ] **Step 4: Chạy PASS** — Run: `npx vitest run src/lib/agent/persist.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/agent/persist.* && git commit -m "feat(agent): extractToolTurns — capture tool turns from convo (SP-3 persist)"`

---

## Task 3: `summarize.ts` — planHistory + summarizeMessages

**Files:**
- Create: `src/lib/agent/summarize.ts`
- Test: `src/lib/agent/summarize.test.ts`

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, test, vi } from "vitest";
import { planHistory, summarizeMessages, type HistoryMsg } from "./summarize";

const mk = (id: string, role: string, content: string): HistoryMsg => ({ id, role, content });

describe("planHistory", () => {
  test("dưới ngân sách → không tóm tắt, replay toàn bộ live", () => {
    const msgs = [mk("1", "user", "a"), mk("2", "assistant", "b")];
    const p = planHistory(msgs, null, null, { budgetChars: 1000 });
    expect(p.needsSummary).toBe(false);
    expect(p.toReplay).toHaveLength(2);
    expect(p.toSummarize).toEqual([]);
  });

  test("trên ngân sách → gập phần cũ, giữ keepLast cuối", () => {
    const msgs = Array.from({ length: 10 }, (_, i) =>
      mk(String(i), i % 2 ? "assistant" : "user", "x".repeat(50)),
    );
    const p = planHistory(msgs, null, null, { budgetChars: 100, keepLast: 4 });
    expect(p.needsSummary).toBe(true);
    expect(p.toReplay).toHaveLength(4);
    expect(p.toSummarize).toHaveLength(6);
    expect(p.toReplay[0].id).toBe("6");
  });

  test("watermark → chỉ xét message sau watermark", () => {
    const msgs = [mk("1", "user", "a"), mk("2", "assistant", "b"), mk("3", "user", "c")];
    const p = planHistory(msgs, "tóm tắt cũ", "2", { budgetChars: 1000 });
    expect(p.toReplay.map((m) => m.id)).toEqual(["3"]);
  });

  test("live nhỏ hơn sàn → không gập dù quá ngân sách", () => {
    const msgs = [mk("1", "user", "x".repeat(999))];
    const p = planHistory(msgs, null, null, { budgetChars: 10, keepLast: 6 });
    expect(p.needsSummary).toBe(false);
    expect(p.toReplay).toHaveLength(1);
  });
});

describe("summarizeMessages", () => {
  test("gọi model với prevSummary + nội dung; trả về đã trim", async () => {
    const callModel = vi.fn(async () => "  BẢN TÓM TẮT  ");
    const out = await summarizeMessages([mk("1", "user", "việc A")], "trước đó", "vi", { callModel });
    expect(out).toBe("BẢN TÓM TẮT");
    const prompt = callModel.mock.calls[0][0] as string;
    expect(prompt).toContain("trước đó");
    expect(prompt).toContain("việc A");
  });
});
```

- [ ] **Step 2: Chạy FAIL** — Run: `npx vitest run src/lib/agent/summarize.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** — `src/lib/agent/summarize.ts`

```ts
// SP-3 — bound lịch sử replay theo ngân sách CHAR (model 16GB). planHistory thuần;
// summarizeMessages dùng model (judgment, Rule 5) qua DI để test không cần Ollama.
export type HistoryMsg = { id: string; role: string; content: string };

export type HistoryPlan = {
  needsSummary: boolean;
  toSummarize: HistoryMsg[]; // lượt cũ cần gập vào summary
  toReplay: HistoryMsg[]; // lượt gần nhất giữ nguyên văn
};

const DEFAULT_BUDGET = 16000; // ~4k token
const DEFAULT_KEEP = 6; // 3 cặp hỏi-đáp
const MIN_KEEP = 2; // luôn giữ ≥ lượt user hiện tại + 1

export function planHistory(
  messages: HistoryMsg[],
  existingSummary: string | null,
  watermarkId: string | null,
  opts: { budgetChars?: number; keepLast?: number } = {},
): HistoryPlan {
  const budget = opts.budgetChars ?? DEFAULT_BUDGET;
  const keepLast = opts.keepLast ?? DEFAULT_KEEP;

  // chỉ xét message SAU watermark (phần đã summarize không replay).
  let live = messages;
  if (watermarkId) {
    const idx = messages.findIndex((m) => m.id === watermarkId);
    live = idx >= 0 ? messages.slice(idx + 1) : messages;
  }

  const summaryLen = existingSummary ? existingSummary.length : 0;
  const liveLen = live.reduce((n, m) => n + (m.content?.length ?? 0), 0);
  if (summaryLen + liveLen <= budget) {
    return { needsSummary: false, toSummarize: [], toReplay: live };
  }

  const keep = Math.max(MIN_KEEP, keepLast);
  if (live.length <= keep) {
    // không gập thêm được mà vẫn giữ lượt hiện tại → replay nguyên (model tự cắt). Rule 12: caller log.
    return { needsSummary: false, toSummarize: [], toReplay: live };
  }
  const cut = live.length - keep;
  return {
    needsSummary: true,
    toSummarize: live.slice(0, cut),
    toReplay: live.slice(cut),
  };
}

export type SummarizeDeps = { callModel: (prompt: string) => Promise<string> };

const SUMMARY_INSTRUCTION: Record<string, string> = {
  vi: "Gộp phần TÓM TẮT TRƯỚC (nếu có) và đoạn hội thoại cũ dưới đây thành một bản tóm tắt ngắn gọn, giữ lại sự kiện, quyết định và tên/ID/số liệu CHÍNH XÁC cần để tiếp tục. Chỉ xuất nội dung tóm tắt, không lời dẫn.",
  en: "Merge the PREVIOUS SUMMARY (if any) and the old conversation below into one concise summary, preserving facts, decisions and exact names/IDs/numbers needed to continue. Output only the summary.",
  zh: "将下面的“先前摘要”（如有）与旧对话合并为一段简洁摘要，保留继续所需的事实、决定和准确的名称/ID/数字。只输出摘要内容。",
};

export async function summarizeMessages(
  toSummarize: HistoryMsg[],
  prevSummary: string | null,
  lang: string,
  deps: SummarizeDeps,
): Promise<string> {
  const instruction = SUMMARY_INSTRUCTION[lang] ?? SUMMARY_INSTRUCTION.vi;
  const prev = prevSummary ? `TÓM TẮT TRƯỚC:\n${prevSummary}\n\n` : "";
  const body = toSummarize.map((m) => `${m.role}: ${m.content}`).join("\n");
  const out = await deps.callModel(`${instruction}\n\n${prev}HỘI THOẠI CŨ:\n${body}`);
  return (out ?? "").trim();
}
```

- [ ] **Step 4: Chạy PASS** — Run: `npx vitest run src/lib/agent/summarize.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/agent/summarize.* && git commit -m "feat(agent): planHistory + summarizeMessages (SP-3 summarize)"`

---

## Task 4: Tách `_load.ts` dùng chung (verdict A2(b))

**Files:**
- Create: `src/lib/agent/tools/laam/_load.ts`
- Modify: `src/lib/agent/tools/laam/query-stats.ts`

> Refactor (move) — không thêm hành vi. Tiêu chí: `query-stats.test.ts` cũ giữ XANH (verdict A2: ưu tiên không phá test). KHÔNG đụng `/api/stats/route.ts` (để bản sao của nó + ghi chú; repoint là follow-up tùy chọn).

- [ ] **Step 1: Tạo `_load.ts`** — chuyển nguyên hàm `loadSessionRows` (đang private trong `query-stats.ts`), thêm `export`:

```ts
// SP-3 — loader dùng chung agent_session → SessionRow (cho query-stats + proactive).
// Rút ra đây để KHÔNG có bản sao thứ 3 (verdict A2(b); chủ SP-1 authorize sửa query-stats).
// Lưu ý: select+map này vẫn nhân bản từ src/app/api/stats/route.ts (nguồn chân lý) — nếu
// đổi shape, sửa cả 2. Repoint /api/stats sang đây = follow-up tùy chọn (giữ test xanh).
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentSessions, projects } from "@/db/schema";
import type { SessionRow } from "@/lib/stats.types";

export async function loadSessionRows(): Promise<SessionRow[]> {
  const rows = await db
    .select({
      id: agentSessions.id,
      status: agentSessions.status,
      model: agentSessions.model,
      gitBranch: agentSessions.gitBranch,
      project: projects.name,
      startedAt: agentSessions.startedAt,
      lastActivity: agentSessions.lastActivity,
      messageCount: agentSessions.messageCount,
      toolCount: agentSessions.toolCount,
      subAgentCount: agentSessions.subAgentCount,
      tokensIn: agentSessions.tokensIn,
      tokensOut: agentSessions.tokensOut,
      costUsd: agentSessions.costUsd,
      tools: agentSessions.tools,
      histo: agentSessions.histo,
    })
    .from(agentSessions)
    .leftJoin(projects, eq(agentSessions.projectId, projects.id));
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    model: r.model,
    gitBranch: r.gitBranch,
    project: r.project,
    startedAt: r.startedAt ? r.startedAt.getTime() : null,
    lastActivity: r.lastActivity ? r.lastActivity.getTime() : null,
    messageCount: r.messageCount,
    toolCount: r.toolCount,
    subAgentCount: r.subAgentCount,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    costUsd: r.costUsd,
    tools: r.tools ?? null,
    histo: r.histo ?? null,
  }));
}
```

- [ ] **Step 2: Sửa `query-stats.ts`** — xoá hàm `loadSessionRows` cục bộ + import drizzle không còn dùng; import từ `_load`. File mới:

```ts
import { computeStats } from "@/lib/stats";
import type { Stats } from "@/lib/stats.types";
import type { Tool } from "../../types";
import { loadSessionRows } from "./_load";

// Trả bản TÓM TẮT (không gửi heatmap/activity dài → tránh tràn context model).
export function shapeStatsSummary(stats: Stats) {
  return {
    totals: stats.totals,
    byStatus: stats.byStatus,
    byModel: stats.byModel,
    topProjects: stats.byProject.slice(0, 5),
    topTools: stats.toolLeaderboard.slice(0, 5),
  };
}

export const queryStats: Tool = {
  name: "laam_query_stats",
  description:
    "Tổng hợp số liệu toàn bộ agent: tổng phiên/đang chạy, token, chi phí, theo model, top project, top tool.",
  kind: "read",
  parameters: { type: "object", properties: {} },
  async handler() {
    return shapeStatsSummary(computeStats(await loadSessionRows()));
  },
};
```

- [ ] **Step 3: Chạy test cũ + tsc** — Run: `npx vitest run src/lib/agent/tools/laam/query-stats.test.ts` rồi `npx tsc --noEmit`. Expected: query-stats test **vẫn PASS** (nó nhắm `shapeStatsSummary`, không nhắm loader); tsc sạch.
- [ ] **Step 4: Commit** — `git add src/lib/agent/tools/laam/_load.ts src/lib/agent/tools/laam/query-stats.ts && git commit -m "refactor(agent): extract shared loadSessionRows to _load.ts (SP-3 A2)"`

---

## Task 5: `proactive.ts` — detect + dedupe + format

**Files:**
- Create: `src/lib/agent/proactive.ts`
- Test: `src/lib/agent/proactive.test.ts`

- [ ] **Step 1: Viết test thất bại**

```ts
import { describe, expect, test } from "vitest";
import { detectAlerts, selectNewAlerts, formatProactiveNotice } from "./proactive";
import type { SessionRow } from "@/lib/stats.types";

const now = Date.UTC(2026, 5, 5, 12, 0, 0);
const row = (over: Partial<SessionRow>): SessionRow => ({
  id: "s1", status: "running", model: "qwen", gitBranch: "main", project: "LAAM",
  startedAt: now - 60 * 60000, lastActivity: now - 60000, messageCount: 0, toolCount: 0,
  subAgentCount: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, tools: null, histo: null, ...over,
});

describe("detectAlerts", () => {
  test("stuck khi chưa done & quá ngưỡng 10'", () => {
    const a = detectAlerts([row({ lastActivity: now - 20 * 60000 })], now);
    expect(a.find((x) => x.type === "stuck")?.key).toBe("stuck:s1");
  });
  test("done → không stuck, không cost", () => {
    const a = detectAlerts([row({ status: "done", lastActivity: now - 60 * 60000, costUsd: 5 })], now);
    expect(a).toEqual([]);
  });
  test("cost-alert theo ngưỡng tuyệt đối", () => {
    const a = detectAlerts([row({ costUsd: 1.5 })], now, { stuckMin: 999 });
    expect(a.find((x) => x.type === "cost")?.costUsd).toBe(1.5);
  });
  test("cost-alert theo burn-rate", () => {
    const a = detectAlerts([row({ costUsd: 0.5, startedAt: now - 60000, lastActivity: now })], now, {
      stuckMin: 999, costUsd: 999, burnUsdPerMin: 0.1,
    });
    expect(a.some((x) => x.type === "cost")).toBe(true);
  });
});

describe("selectNewAlerts", () => {
  const alerts = [{ type: "stuck" as const, key: "stuck:s1", sessionId: "s1", project: "LAAM", minutesIdle: 20 }];
  test("key mới → surface + ghi state", () => {
    const r = selectNewAlerts(alerts, null, now);
    expect(r.toSurface).toHaveLength(1);
    expect(r.newState.surfaced["stuck:s1"]).toBe(now);
  });
  test("key vừa nêu trong cooldown → không lặp", () => {
    const r = selectNewAlerts(alerts, { surfaced: { "stuck:s1": now - 1000 } }, now, 6 * 3600 * 1000);
    expect(r.toSurface).toEqual([]);
  });
  test("key quá cooldown → nêu lại", () => {
    const r = selectNewAlerts(alerts, { surfaced: { "stuck:s1": now - 7 * 3600 * 1000 } }, now, 6 * 3600 * 1000);
    expect(r.toSurface).toHaveLength(1);
  });
});

describe("formatProactiveNotice", () => {
  test("rỗng → ''", () => {
    expect(formatProactiveNotice([], "vi")).toBe("");
  });
  test("vi: có stuck + cost, format $", () => {
    const s = formatProactiveNotice(
      [
        { type: "stuck", key: "stuck:s1", sessionId: "s1", project: "LAAM", minutesIdle: 20 },
        { type: "cost", key: "cost:s2", sessionId: "s2", project: "API", costUsd: 1.3 },
      ],
      "vi",
    );
    expect(s).toContain("kẹt");
    expect(s).toContain("LAAM");
    expect(s).toContain("$1.30");
  });
  test("en/zh không lỗi", () => {
    const a = [{ type: "stuck" as const, key: "k", sessionId: "s", project: null, minutesIdle: 5 }];
    expect(formatProactiveNotice(a, "en")).toContain("stuck");
    expect(formatProactiveNotice(a, "zh")).toContain("agent");
  });
});
```

- [ ] **Step 2: Chạy FAIL** — Run: `npx vitest run src/lib/agent/proactive.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** — `src/lib/agent/proactive.ts`

```ts
// SP-3 — phát hiện agent kẹt / chi phí cao từ dữ liệu agent_session (dùng chung, qua _load).
// Tái dùng isStuck (không nhân bản). COST-ALERT = tuyệt đối/burn-rate trên phiên CHƯA done —
// KHÔNG phải Δcost/Δt windowed (agent_session chỉ có TỔNG cost/phiên — giới hạn dữ liệu, D-SP3-5).
import type { SessionRow } from "@/lib/stats.types";
import { isStuck } from "@/lib/stuck";

export type ProactiveAlert = {
  type: "stuck" | "cost";
  key: string; // dedupe ổn định: `stuck:<id>` | `cost:<id>`
  sessionId: string;
  project: string | null;
  minutesIdle?: number;
  costUsd?: number;
};

export type ProactiveState = { surfaced: Record<string, number> }; // key -> epoch ms lần nêu cuối

const STUCK_MIN = 10;
const COST_USD = 1.0;
const BURN_USD_PER_MIN = 0.1;
const MAX_ALERTS = 5;
const COOLDOWN_MS = 6 * 3600 * 1000;
const PRUNE_MS = 24 * 3600 * 1000;

export function detectAlerts(
  rows: SessionRow[],
  now: number,
  opts: { stuckMin?: number; costUsd?: number; burnUsdPerMin?: number; max?: number } = {},
): ProactiveAlert[] {
  const stuckMin = opts.stuckMin ?? STUCK_MIN;
  const costThr = opts.costUsd ?? COST_USD;
  const burnThr = opts.burnUsdPerMin ?? BURN_USD_PER_MIN;
  const max = opts.max ?? MAX_ALERTS;

  const alerts: ProactiveAlert[] = [];
  for (const s of rows) {
    if (isStuck({ status: s.status ?? "", lastActivity: s.lastActivity }, stuckMin, now)) {
      const minutesIdle = s.lastActivity != null ? Math.round((now - s.lastActivity) / 60000) : 0;
      alerts.push({ type: "stuck", key: `stuck:${s.id}`, sessionId: s.id, project: s.project, minutesIdle });
    }
  }
  for (const s of rows) {
    if (s.status === "done") continue;
    const cost = s.costUsd ?? 0;
    const durMin = s.startedAt != null && s.lastActivity != null ? (s.lastActivity - s.startedAt) / 60000 : 0;
    const burn = durMin > 0 ? cost / durMin : 0;
    if (cost >= costThr || burn >= burnThr) {
      alerts.push({ type: "cost", key: `cost:${s.id}`, sessionId: s.id, project: s.project, costUsd: cost });
    }
  }
  return alerts.slice(0, max);
}

export function selectNewAlerts(
  alerts: ProactiveAlert[],
  state: ProactiveState | null,
  now: number,
  cooldownMs: number = COOLDOWN_MS,
): { toSurface: ProactiveAlert[]; newState: ProactiveState } {
  const surfaced: Record<string, number> = { ...(state?.surfaced ?? {}) };
  const toSurface: ProactiveAlert[] = [];
  for (const a of alerts) {
    const last = surfaced[a.key];
    if (last == null || now - last > cooldownMs) {
      toSurface.push(a);
      surfaced[a.key] = now;
    }
  }
  for (const k of Object.keys(surfaced)) {
    if (surfaced[k] < now - PRUNE_MS) delete surfaced[k]; // gọn state
  }
  return { toSurface, newState: { surfaced } };
}

type NoticeStrings = {
  lead: string; tail: string;
  stuckHead: (n: number) => string; costHead: (n: number) => string;
  idle: (m?: number) => string; money: (c?: number) => string;
};
const STR: Record<string, NoticeStrings> = {
  vi: { lead: "⚠️ Lưu ý chủ động:", tail: "Nếu liên quan, hãy nhắc người dùng.",
    stuckHead: (n) => `${n} agent đang kẹt`, costHead: (n) => `${n} agent chi phí cao`,
    idle: (m) => `kẹt ${m}′`, money: (c) => `$${(c ?? 0).toFixed(2)}` },
  en: { lead: "⚠️ Proactive note:", tail: "Mention to the user if relevant.",
    stuckHead: (n) => `${n} agent(s) stuck`, costHead: (n) => `${n} agent(s) costly`,
    idle: (m) => `idle ${m}m`, money: (c) => `$${(c ?? 0).toFixed(2)}` },
  zh: { lead: "⚠️ 主动提示：", tail: "如相关请提醒用户。",
    stuckHead: (n) => `${n} 个 agent 卡住`, costHead: (n) => `${n} 个 agent 费用偏高`,
    idle: (m) => `闲置 ${m} 分`, money: (c) => `$${(c ?? 0).toFixed(2)}` },
};

export function formatProactiveNotice(alerts: ProactiveAlert[], lang: string): string {
  if (!alerts.length) return "";
  const s = STR[lang] ?? STR.vi;
  const proj = (a: ProactiveAlert) => a.project ?? a.sessionId;
  const stuck = alerts.filter((a) => a.type === "stuck");
  const cost = alerts.filter((a) => a.type === "cost");
  const parts: string[] = [];
  if (stuck.length)
    parts.push(`${s.stuckHead(stuck.length)} — ${stuck.map((a) => `${proj(a)} (${s.idle(a.minutesIdle)})`).join(", ")}`);
  if (cost.length)
    parts.push(`${s.costHead(cost.length)} — ${cost.map((a) => `${proj(a)} (${s.money(a.costUsd)})`).join(", ")}`);
  return `${s.lead} ${parts.join("; ")}. ${s.tail}`;
}
```

- [ ] **Step 4: Chạy PASS** — Run: `npx vitest run src/lib/agent/proactive.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/lib/agent/proactive.* && git commit -m "feat(agent): proactive detect/dedupe/format (SP-3)"`

---

## Task 6: Nối vào `src/app/api/chat/route.ts`

**Files:**
- Modify: `src/app/api/chat/route.ts`

> Theo thứ tự §5.5 spec. Phần `buildOllamaPayload` + `readLang` GIỮ NGUYÊN. Dưới đây là **toàn bộ `POST` mới + import + helper `callModelText`**; giữ nguyên các phần không nhắc tới.

- [ ] **Step 1: Sửa khối import** (đầu file) — thêm 4 import SP-3 + `chatToolCalls`:

```ts
import { eq, asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { chatConversations, chatMessages, chatToolCalls } from "@/db/schema";
import { chatTools } from "@/lib/connectors";
import { buildSystemPrompt } from "@/lib/agent/context";
import { INTERNAL_TOOLS, modelToolSchemas, makeDispatch } from "@/lib/agent/registry";
import { runToolRounds, type ChatMessage, type OllamaChatResponse } from "@/lib/agent/orchestrator";
import { extractToolTurns } from "@/lib/agent/persist";
import { planHistory, summarizeMessages, type HistoryMsg } from "@/lib/agent/summarize";
import {
  detectAlerts,
  selectNewAlerts,
  formatProactiveNotice,
  type ProactiveState,
} from "@/lib/agent/proactive";
import { loadSessionRows } from "@/lib/agent/tools/laam/_load";
```

- [ ] **Step 2: Thay toàn bộ thân `export async function POST`** bằng:

```ts
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const userId = session.user.id;

  const body = ((await req.json().catch(() => null)) ?? {}) as ChatBody;
  const message = (body.message ?? "").toString().trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "Empty message" }), { status: 400 });
  }
  const model = typeof body.model === "string" && body.model.trim() ? body.model : MODEL;

  // Resolve/create conversation; giữ summary/watermark/proactiveState (SP-3).
  let conversationId = body.conversationId;
  let convSummary: string | null = null;
  let convWatermark: string | null = null;
  let convProactive: ProactiveState | null = null;
  if (conversationId) {
    const rows = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);
    if (!rows[0] || rows[0].userId !== userId) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    convSummary = rows[0].summary ?? null;
    convWatermark = rows[0].summarizedThroughId ?? null;
    convProactive = (rows[0].proactiveState as ProactiveState | null) ?? null;
  } else {
    conversationId = crypto.randomUUID();
    await db.insert(chatConversations).values({
      id: conversationId,
      userId,
      title: message.slice(0, 60),
      model,
    });
  }
  const convId = conversationId;

  await db.insert(chatMessages).values({ conversationId: convId, role: "user", content: message });

  const history = await db
    .select({ id: chatMessages.id, role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, convId))
    .orderBy(asc(chatMessages.createdAt));

  const now = Date.now();
  const lang = readLang(req);

  // --- Summarize (SP-3): bound lịch sử replay theo char-budget. ---
  const plan = planHistory(history as HistoryMsg[], convSummary, convWatermark);
  let effectiveSummary = convSummary;
  if (plan.needsSummary) {
    try {
      effectiveSummary = await summarizeMessages(plan.toSummarize, convSummary, lang, {
        callModel: (prompt) => callModelText(prompt, model),
      });
      const through = plan.toSummarize[plan.toSummarize.length - 1]?.id ?? null;
      await db
        .update(chatConversations)
        .set({ summary: effectiveSummary, summarizedThroughId: through })
        .where(eq(chatConversations.id, convId));
    } catch (e) {
      console.error("[chat] summarize failed (fail-soft)", e); // giữ summary cũ; vẫn replay bounded
    }
  }

  const payload = buildOllamaPayload(
    body,
    plan.toReplay.map((m) => ({ role: m.role, content: m.content })),
    { model: MODEL, system: SYSTEM },
  );

  // Internal tools (LAAM) LUÔN có; connector tools nếu user đã kết nối.
  let connectorTools = [] as Awaited<ReturnType<typeof chatTools>>;
  try {
    connectorTools = await chatTools(userId);
  } catch {
    connectorTools = [];
  }
  const tools = modelToolSchemas(INTERNAL_TOOLS, connectorTools);

  // --- System prompt động + proactive notice COMPOSE-AROUND buildSystemPrompt (SP-3). ---
  const hasSystemOverride = typeof body.system === "string" && body.system.trim().length > 0;
  let systemContent = hasSystemOverride
    ? (body.system as string)
    : buildSystemPrompt({ lang, now, toolNames: tools.map((t) => t.function.name) });
  if (!hasSystemOverride) {
    try {
      const rows = await loadSessionRows();
      const { toSurface, newState } = selectNewAlerts(detectAlerts(rows, now), convProactive, now);
      const notice = formatProactiveNotice(toSurface, lang);
      if (notice) {
        systemContent = systemContent + "\n\n" + notice;
        await db
          .update(chatConversations)
          .set({ proactiveState: newState })
          .where(eq(chatConversations.id, convId));
      }
    } catch (e) {
      console.error("[chat] proactive detect failed (fail-soft)", e);
    }
  }
  payload.messages[0] = { role: "system", content: systemContent };

  // Summary làm system message #2 (sau persona), nếu có. (Open-Q1 impl: fallback 'user' nếu cần.)
  if (effectiveSummary) {
    payload.messages.splice(1, 0, {
      role: "system",
      content: "Bối cảnh hội thoại trước (tóm tắt): " + effectiveSummary,
    });
  }

  // Tool-loop. baseLen chụp SAU summary+proactive, TRƯỚC runToolRounds (verdict A1).
  const dispatch = makeDispatch(INTERNAL_TOOLS, { userId, now, lang });
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
  let toolTurns: ReturnType<typeof extractToolTurns> = [];
  try {
    payload.messages = await runToolRounds(payload.messages, tools, { callOllama, dispatch });
    toolTurns = extractToolTurns(payload.messages, baseLen);
  } catch {
    // Tool loop lỗi (Ollama/connector) — stream trả lời thường từ payload.
  }

  const assistantMsgId = crypto.randomUUID();

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return new Response(
      `Không kết nối được Ollama (${OLLAMA_URL}). Đảm bảo Ollama đang chạy và đã 'ollama pull ${model}'.`,
      { status: 502, headers: { "x-conversation-id": convId } },
    );
  }
  if (!ollamaRes.ok || !ollamaRes.body) {
    const t = await ollamaRes.text().catch(() => "");
    return new Response(`Ollama lỗi ${ollamaRes.status}: ${t.slice(0, 200)}`, {
      status: 502,
      headers: { "x-conversation-id": convId },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = ollamaRes.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buf = "";
      let full = "";
      let tokensIn = 0;
      let tokensOut = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            try {
              const j = JSON.parse(t);
              const tok = j?.message?.content ?? "";
              if (tok) {
                full += tok;
                controller.enqueue(encoder.encode(tok));
              }
              if (j?.done) {
                if (typeof j.prompt_eval_count === "number") tokensIn = j.prompt_eval_count;
                if (typeof j.eval_count === "number") tokensOut = j.eval_count;
              }
            } catch {
              /* skip partial line */
            }
          }
        }
      } finally {
        if (full) {
          await db.insert(chatMessages).values({
            id: assistantMsgId,
            conversationId: convId,
            role: "assistant",
            content: full,
            tokensIn,
            tokensOut,
          });
          try {
            // LƯU Ý: giữa cặp "" dưới đây là ký tự U+001E (record separator, VÔ HÌNH khi render).
            // Client strip frame {i,o} này khỏi text hiển thị. GIỮ NGUYÊN giao thức hiện có —
            // SP-4 sở hữu frame schema, KHÔNG đổi ở SP-3. Copy nguyên khối, đừng gõ lại tay.
            controller.enqueue(encoder.encode("" + JSON.stringify({ i: tokensIn, o: tokensOut })));
          } catch {
            /* client aborted */
          }
        }
        if (toolTurns.length) {
          try {
            await db.insert(chatToolCalls).values(
              toolTurns.map((t) => ({
                conversationId: convId,
                messageId: full ? assistantMsgId : null,
                seq: t.seq,
                name: t.name,
                args: t.args,
                result: t.result,
                ok: t.ok,
                bytes: t.bytes,
              })),
            );
          } catch (e) {
            console.error("[chat] persist tool turns failed (fail-soft)", e);
          }
        }
        await db
          .update(chatConversations)
          .set({ updatedAt: new Date() })
          .where(eq(chatConversations.id, convId));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-conversation-id": convId,
      "cache-control": "no-cache",
    },
  });
}

// Helper SP-3: gọi model 1 lần non-streaming (cho summarize). Hoisted — đặt cuối file OK.
async function callModelText(prompt: string, model: string): Promise<string> {
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: false }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  const j = (await r.json()) as OllamaChatResponse;
  return j?.message?.content ?? "";
}
```

- [ ] **Step 3: tsc** — Run: `npx tsc --noEmit`. Expected: sạch (fix import thừa nếu báo).
- [ ] **Step 4: Test cũ của route** — Run: `npx vitest run src/app/api/chat/route.test.ts`. Expected: PASS (test SP-1 "internal tools luôn có trong schema" không phụ thuộc thay đổi này).

> **Ghi chú test (Rule 9/12):** logic SP-3 nằm ở các hàm thuần đã test kỹ (Task 2/3/5). `POST` là adapter I/O (auth + db + fetch streaming) — test full-POST cần mock ReadableStream rất giòn; theo đúng pattern repo (route.test.ts nhẹ), hành vi tích hợp được nghiệm thu bằng **smoke test thật** ở Task 7, KHÔNG giả vờ phủ test cho phần streaming.

- [ ] **Step 5: Commit** — `git add src/app/api/chat/route.ts && git commit -m "feat(agent): wire SP-3 into /api/chat — persist tool turns + summarize + proactive"`

---

## Task 7: Verify toàn bộ + docs/Serena + finish

**Files:**
- Modify: `.serena/memories/services/v2-app.md`, `.serena/checkpoint/sp3-2026-06-05.md`, `README.md`, `CHANGELOG.md`

- [ ] **Step 1: Full test** — Run: `npx vitest run`. Expected: **baseline 398 + test SP-3 (persist/summarize/proactive) đều XANH**. Đỏ → STOP, sửa (defect thật).
- [ ] **Step 2: Build** — Run: `npm run build`. Expected: compile OK, route `/api/chat` có mặt. (Trong worktree — KHÔNG build in-place khi prod chạy; [[agent-ops-rules]].)
- [ ] **Step 3: ⚠️ Smoke thật (cần user + đã `db:migrate`)** — nếu user cho phép chạy dev: (a) chat hỏi liên tục cho lịch sử vượt ~16k char → kiểm `chat_conversation.summary` được ghi + trả lời vẫn mạch lạc; (b) khi có agent kẹt thật → lượt chat nêu cảnh báo, lượt kế **không lặp**; (c) một lượt có tool → `select count(*) from chat_tool_call` tăng + `/chat` hiển thị như cũ (không thấy JSON tool thô). **Không tự khởi động dev.**
- [ ] **Step 4: Cập nhật Serena/docs** — `services/v2-app.md` thêm mục "Agent Harness SP-3" (3 module + migration 0003 + cột mới). Cập nhật checkpoint `sp3-2026-06-05.md`. CHANGELOG `[Unreleased]` + README (VN) nếu hành vi user-facing đổi (chat nhớ dài + cảnh báo chủ động).
- [ ] **Step 5: Commit** — `git add .serena README.md CHANGELOG.md && git commit -m "docs(serena): record Agent Harness SP-3 (memory & proactive) done"`
- [ ] **Step 6: Finish** — Invoke `superpowers:finishing-a-development-branch` (PR/merge `feat/agent-harness-sp3`). Phối hợp: chỉ đụng `/api/chat` + `src/lib/agent/*` + `schema.ts`/`drizzle` — KHÔNG đụng `components/chat/*` (SP-4) / `connectors/*`. Ping lead review (per thread resolved).

---

## Success Criteria (từ spec §1)
- [ ] Lượt chat có tool → `chat_tool_call` đủ hàng (name/args/result/ok/bytes); `chat_message` không role lạ; `/chat` + `/api/conversations/[id]` hiển thị như cũ.
- [ ] Hội thoại vượt ngân sách → `summary` + `summarizedThroughId` được ghi; payload Ollama bị bound (summary + N lượt gần); trả lời mạch lạc.
- [ ] Agent kẹt/chi phí cao MỚI → model nêu cảnh báo từ dữ liệu thật; cùng cảnh báo không lặp mỗi turn (dedupe); không kẹt → không nhiễu.
- [ ] Module `persist/summarize/proactive/_load` thuần + DI; 398 + test mới XANH; `tsc` sạch; `next build` xanh.
- [ ] Lỗi persist/summarize/proactive → fail-soft (chat vẫn trả lời) + log.
- [ ] Migration **0003 additive**; KHÔNG đổi `types.ts`/`buildSystemPrompt`; KHÔNG thêm npm dep; KHÔNG đụng `components/chat/*`/`connectors/*`. Token-undercount để backlog SP-1.
```
