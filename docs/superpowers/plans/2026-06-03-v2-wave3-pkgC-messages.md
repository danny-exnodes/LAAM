# V2 Wave 3 — Package W3-C (message render + actions + export) Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. TDD per component.

**Goal:** Build the presentational chat message-render slice for v2 `/chat`: `MessageItem`, `MessageList`, and `ChatExport` — conforming exactly to the LOCKED prop contracts in the Wave 3 plan.

**Architecture:** Pure presentational React components. `MessageItem` renders one `ChatMsg` (assistant → `MarkdownView` from Wave 0; user → plain bubble) with a hover action toolbar (copy/edit/regenerate/delete calling prop callbacks) + relative timestamp + streaming placeholder. `MessageList` maps messages → `MessageItem` + a trailing scroll-anchor. `ChatExport` renders MD/JSON buttons wired to Wave 0 `toMarkdown`/`downloadMarkdown`/`downloadJson`. All labels via `useT(chat)` — dictionary already has every needed key.

**Tech Stack:** React 19, TS, Tailwind 4, vitest + RTL + jsdom. Wave 0: `@/components/render/MarkdownView`, `@/lib/export`, `@/i18n/provider`, `@/i18n/dictionaries/chat`. Shared types from `@/components/chat/types`.

---

## Files

- Create: `v2/src/components/chat/MessageItem.tsx` + `MessageItem.test.tsx`
- Create: `v2/src/components/chat/MessageList.tsx` + `MessageList.test.tsx`
- Create: `v2/src/components/chat/ChatExport.tsx` + `ChatExport.test.tsx`

## LOCKED prop contracts (import types from `@/components/chat/types`)
```ts
MessageList(props: {
  messages: ChatMsg[]; streaming: boolean;
  onCopy(m: ChatMsg): void; onEdit(m: ChatMsg): void;
  onRegenerate(m: ChatMsg): void; onDelete(m: ChatMsg): void;
}): JSX.Element;
ChatExport(props: { messages: ChatMsg[]; title: string }): JSX.Element;
```
`MessageItem` is internal (not in the locked list); it takes one `msg: ChatMsg`, `streaming: boolean`, and the same 4 callbacks. The 4 callbacks are passed straight through from `MessageList`.

## Dictionary keys (ALL already exist in `dictionaries/chat.ts` — no additions expected)
- Actions: `chat.actCopy`/`actCopyTitle`, `chat.actEdit`/`actEditTitle`, `chat.actRegen`/`actRegenTitle`, `chat.actDelete`/`actDeleteTitle`
- Streaming placeholder: `chat.thinking` ("đang soạn…")
- Export buttons: `chat.expDownloadMd`/`expDownloadMdTitle`, `chat.expDownloadJson`/`expDownloadJsonTitle`

## Behavior notes (ported from v1 `chat-actions.js` / `chat-export.js`)
- v1 edit = user-only, regenerate = assistant-only, copy + delete = both roles. Mirror that: render Edit only on `user`, Regenerate only on `assistant`; Copy + Delete on both.
- v1 disables action buttons while streaming. Keep that: when `streaming` is true, the edit/regenerate/delete buttons are disabled (copy stays enabled — it never mutates and v1's copy had no busy guard). The streaming placeholder itself shows for an empty assistant message.
- Export filenames: `${title}.md` / `${title}.json` (per W3-C spec — no slug munging; ChatClient/TL passes a sane title).
- `toMarkdown(messages)` accepts `{role, content}[]` directly — `ChatMsg[]` is structurally compatible.
- Relative timestamp: `createdAt` is epoch **ms**. `@/lib/format`'s `ago()` takes a `Date` and returns Vietnamese-only strings, so it is NOT i18n-aware. Per the spec ("relative timestamp from createdAt (ms)") and to stay self-contained + testable, add a tiny local `relTime(ms)` helper in MessageItem. Keep it dependency-free.

---

## Task 1: MessageItem — assistant markdown + user bubble

**Files:** Create `v2/src/components/chat/MessageItem.tsx` + `MessageItem.test.tsx`

- [ ] **Step 1: Write failing tests** (`MessageItem.test.tsx`)

```tsx
import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";

// MarkdownView is exercised in Wave 0; here we only need to confirm assistant
// content flows THROUGH it (a table renders), so use the real component.
import { MessageItem } from "./MessageItem";
import type { ChatMsg } from "./types";

function noop() {}
const cbs = { onCopy: noop, onEdit: noop, onRegenerate: noop, onDelete: noop };

function wrap(ui: React.ReactNode) {
  return render(<I18nProvider lang="vi">{ui}</I18nProvider>);
}

test("assistant markdown table renders through MarkdownView", () => {
  const m: ChatMsg = { id: "a1", role: "assistant", content: "| A | B |\n|---|---|\n| 1 | 2 |" };
  wrap(<MessageItem msg={m} streaming={false} {...cbs} />);
  expect(screen.getByRole("table")).toBeTruthy();
  expect(screen.getByText("A")).toBeTruthy();
});

test("user message renders as plain text (no markdown table)", () => {
  const m: ChatMsg = { id: "u1", role: "user", content: "| A | B |\n|---|---|\n| 1 | 2 |" };
  wrap(<MessageItem msg={m} streaming={false} {...cbs} />);
  expect(screen.queryByRole("table")).toBeNull();
  // The literal pipe text is shown verbatim.
  expect(screen.getByText(/\| A \| B \|/)).toBeTruthy();
});

test("empty assistant message while streaming shows the typing placeholder", () => {
  const m: ChatMsg = { id: "a2", role: "assistant", content: "" };
  wrap(<MessageItem msg={m} streaming={true} {...cbs} />);
  expect(screen.getByText("đang soạn…")).toBeTruthy();
});

test("copy button calls onCopy with the message", () => {
  const onCopy = vi.fn();
  const m: ChatMsg = { id: "a3", role: "assistant", content: "hello" };
  wrap(<MessageItem msg={m} streaming={false} {...cbs} onCopy={onCopy} />);
  fireEvent.click(screen.getBytitle("Chép nội dung tin nhắn"));
  expect(onCopy).toHaveBeenCalledWith(m);
});

test("edit shows for user only; regenerate for assistant only", () => {
  const u: ChatMsg = { id: "u2", role: "user", content: "hi" };
  const { rerender } = wrap(<MessageItem msg={u} streaming={false} {...cbs} />);
  expect(screen.queryByTitle("Sửa & gửi lại tin nhắn")).toBeTruthy();
  expect(screen.queryByTitle("Tạo lại câu trả lời")).toBeNull();

  const a: ChatMsg = { id: "a4", role: "assistant", content: "yo" };
  rerender(<I18nProvider lang="vi"><MessageItem msg={a} streaming={false} {...cbs} /></I18nProvider>);
  expect(screen.queryByTitle("Sửa & gửi lại tin nhắn")).toBeNull();
  expect(screen.queryByTitle("Tạo lại câu trả lời")).toBeTruthy();
});

test("delete/regenerate/edit disabled while streaming; copy stays enabled", () => {
  const a: ChatMsg = { id: "a5", role: "assistant", content: "done text" };
  wrap(<MessageItem msg={a} streaming={true} {...cbs} />);
  expect((screen.getByTitle("Xoá tin nhắn này") as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByTitle("Tạo lại câu trả lời") as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByTitle("Chép nội dung tin nhắn") as HTMLButtonElement).disabled).toBe(false);
});

test("regenerate/edit/delete callbacks fire", () => {
  const onRegenerate = vi.fn(); const onDelete = vi.fn();
  const a: ChatMsg = { id: "a6", role: "assistant", content: "x" };
  wrap(<MessageItem msg={a} streaming={false} {...cbs} onRegenerate={onRegenerate} onDelete={onDelete} />);
  fireEvent.click(screen.getByTitle("Tạo lại câu trả lời"));
  fireEvent.click(screen.getByTitle("Xoá tin nhắn này"));
  expect(onRegenerate).toHaveBeenCalledWith(a);
  expect(onDelete).toHaveBeenCalledWith(a);
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/components/chat/MessageItem` → FAIL (no MessageItem).

- [ ] **Step 3: Implement `MessageItem.tsx`** — `"use client"`; props `{ msg, streaming, onCopy, onEdit, onRegenerate, onDelete }`; assistant non-empty → `<MarkdownView source={msg.content}/>`; assistant empty while streaming → placeholder `t("chat.thinking")`; user → plain `<div>` with `whitespace-pre-wrap`. Toolbar buttons: Copy (both), Edit (user), Regenerate (assistant), Delete (both); each `title`/`aria-label` from dict; edit/regen/delete `disabled={streaming}`; onClick → callback(msg). Relative time line from `relTime(msg.createdAt)` when present. Hover-reveal toolbar via Tailwind `group`/`group-hover`.

- [ ] **Step 4: Run, verify pass.**

## Task 2: MessageList — map + scroll anchor

**Files:** Create `v2/src/components/chat/MessageList.tsx` + `MessageList.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { MessageList } from "./MessageList";
import type { ChatMsg } from "./types";

const msgs: ChatMsg[] = [
  { id: "u1", role: "user", content: "hi" },
  { id: "a1", role: "assistant", content: "hello there" },
];
const cbs = { onCopy: vi.fn(), onEdit: vi.fn(), onRegenerate: vi.fn(), onDelete: vi.fn() };

function wrap(ui: React.ReactNode) {
  return render(<I18nProvider lang="vi">{ui}</I18nProvider>);
}

test("renders one item per message", () => {
  wrap(<MessageList messages={msgs} streaming={false} {...cbs} />);
  expect(screen.getByText("hi")).toBeTruthy();
  expect(screen.getByText("hello there")).toBeTruthy();
});

test("passes callbacks through to items", () => {
  wrap(<MessageList messages={msgs} streaming={false} {...cbs} />);
  fireEvent.click(screen.getAllByTitle("Chép nội dung tin nhắn")[1]);
  expect(cbs.onCopy).toHaveBeenCalledWith(msgs[1]);
});

test("renders a scroll-anchor element at the end", () => {
  const { container } = wrap(<MessageList messages={msgs} streaming={false} {...cbs} />);
  expect(container.querySelector("[data-scroll-anchor]")).toBeTruthy();
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `MessageList.tsx`** — `"use client"`; maps `messages` → `<MessageItem key={m.id} msg={m} streaming={streaming} {...callbacks}/>`; trailing `<div data-scroll-anchor />`. No own state.

- [ ] **Step 4: Run, verify pass.**

## Task 3: ChatExport — MD/JSON buttons via Wave 0 export

**Files:** Create `v2/src/components/chat/ChatExport.tsx` + `ChatExport.test.tsx`

- [ ] **Step 1: Write failing tests** (mock `@/lib/export` like `DashboardExport.test.tsx`)

```tsx
import { expect, test, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";

const downloadMarkdown = vi.fn();
const downloadJson = vi.fn();
const toMarkdown = vi.fn(() => "MD-OUTPUT");
vi.mock("@/lib/export", () => ({
  downloadMarkdown: (...a: unknown[]) => downloadMarkdown(...a),
  downloadJson: (...a: unknown[]) => downloadJson(...a),
  toMarkdown: (...a: unknown[]) => toMarkdown(...a),
}));

import { ChatExport } from "./ChatExport";
import type { ChatMsg } from "./types";

const msgs: ChatMsg[] = [{ id: "u1", role: "user", content: "hi" }];

function wrap() {
  return render(
    <I18nProvider lang="vi">
      <ChatExport messages={msgs} title="my-chat" />
    </I18nProvider>,
  );
}

beforeEach(() => { downloadMarkdown.mockClear(); downloadJson.mockClear(); toMarkdown.mockClear(); });

test("MD button downloads toMarkdown(messages) under <title>.md", () => {
  wrap();
  fireEvent.click(screen.getByText("Tải .md"));
  expect(toMarkdown).toHaveBeenCalledWith(msgs);
  expect(downloadMarkdown).toHaveBeenCalledWith("my-chat.md", "MD-OUTPUT");
});

test("JSON button downloads the messages array under <title>.json", () => {
  wrap();
  fireEvent.click(screen.getByText("Tải .json"));
  expect(downloadJson).toHaveBeenCalledWith("my-chat.json", msgs);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement `ChatExport.tsx`** — `"use client"`; `useT(chat)`; two buttons. MD: `downloadMarkdown(`${title}.md`, toMarkdown(messages))`; JSON: `downloadJson(`${title}.json`, messages)`. Labels `chat.expDownloadMd`/`chat.expDownloadJson`, titles `...Title`. Match `DashboardExport` button styling.

- [ ] **Step 4: Run, verify pass.**

## Task 4: Verify whole package + report

- [ ] `cd v2 && npx vitest run src/components/chat/MessageList src/components/chat/MessageItem src/components/chat/ChatExport` → all green.
- [ ] Checkpoint `.serena/checkpoint/messages-2026-06-03.md`; mark Task #3 completed; SendMessage to team-lead with files + pasted vitest summary + note any dict keys added (expect none).

## Self-review notes
- Spec coverage: MessageItem (markdown/plain/actions/timestamp/streaming) ✓, MessageList (map+anchor) ✓, ChatExport (MD/JSON via Wave 0) ✓, useT labels ✓, RTL tests (table renders, copy calls onCopy, export calls mocked fns) ✓.
- No new deps; no edits to locked `types.ts` / package.json / sibling-owned files.
- `relTime` kept local + tiny; flagged as deviation from `format.ago` (not i18n-aware, takes Date not ms).
