## 1. Slash-Command Menu Location & Implementation

**File**: `D:/Projects/personal_projects/LAAM/src/components/chat/Composer.tsx`

**Command Data Structure** (lines 18-24):
```typescript
const COMMANDS: { name: string; labelKey: string }[] = [
  { name: "moi", labelKey: "chat.cmdNew" },
  { name: "xoa", labelKey: "chat.cmdClear" },
  { name: "dung", labelKey: "chat.cmdStop" },
  { name: "xuat", labelKey: "chat.cmdExport" },
  { name: "caidat", labelKey: "chat.cmdSettings" },
];
```

**Menu Triggering** (lines 70-76):
The menu is shown when the textarea value starts with "/" and is filtered by the token after the slash:
```typescript
const slashOpen = value.startsWith("/");
const slashQuery = slashOpen ? value.slice(1).split(/\s/)[0].toLowerCase() : "";
const matches = slashOpen
  ? COMMANDS.filter((c) => c.name.startsWith(slashQuery))
  : [];
```

**Menu Rendering** (lines 200-229):
The menu is absolutely positioned above the textarea, styled as a listbox with button options. Each command is rendered as a button with `/name` in monospace and the localized label:
```typescript
{slashOpen && matches.length > 0 && (
  <div
    role="listbox"
    className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
  >
    <div className="border-b border-neutral-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:border-neutral-700">
      {t("chat.cmdMenuHead")}
    </div>
    <div className="p-1">
      {matches.map((c) => (
        <button
          key={c.name}
          type="button"
          role="option"
          aria-selected="false"
          onClick={() => pickCommand(c.name)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
        >
          <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
            /{c.name}
          </span>
          <span className="truncate text-neutral-600 dark:text-neutral-300">
            {t(c.labelKey)}
          </span>
        </button>
      ))}
    </div>
  </div>
)}
```

**Command Execution** (lines 78-87):
When a command is selected (via click or Enter), `pickCommand()` is called:
```typescript
function pickCommand(name: string) {
  onChange("");
  switch (name) {
    case "moi": return onNew();
    case "xoa": return onClear();
    case "dung": return onStop();
    case "xuat": return onExport();
    case "caidat": return onToggleSettings();
  }
}
```
The input is cleared via `onChange("")`, then the corresponding handler prop is invoked. Enter key on a slash command runs the first match (line 97).

---

## 2. Chat Composer Component Structure & Parent Wiring

**File**: `D:/Projects/personal_projects/LAAM/src/components/chat/Composer.tsx`

**Props Interface** (lines 26-60):
```typescript
export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  attachments,
  notice,
  onAddFiles,
  onAddUrl,
  onRemoveAttachment,
  onNew,
  onClear,
  onExport,
  onToggleSettings,
  ocrAvailable = true,
  modelName,
}: {
  value: string;
  onChange(v: string): void;
  onSend(): void;
  onStop(): void;
  streaming: boolean;
  attachments: Attachment[];
  notice?: string | null;
  onAddFiles(files: FileList): void;
  onAddUrl(url: string): void;
  onRemoveAttachment(id: string): void;
  onNew(): void;
  onClear(): void;
  onExport(): void;
  onToggleSettings(): void;
  ocrAvailable?: boolean;
  modelName?: string;
})
```

**Text Insertion** (line 236):
Text is inserted via the onChange callback when the user types:
```typescript
onChange={(e) => onChange(e.target.value)}
```

**Send Mechanism** (lines 95-99, 298-304):
Send is triggered by:
1. Enter key (no shift) â€” executes slash command if open, else calls onSend()
2. Click on Send button â€” calls onSend()
```typescript
<button
  type="button"
  aria-label={t("chat.sendAria")}
  onClick={onSend}
  disabled={sendDisabled}
  className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
>
  <Send size={14} aria-hidden />
  {t("chat.send")}
</button>
```

**Parent: ChatClient** (file: `D:/Projects/personal_projects/LAAM/src/components/chat/ChatClient.tsx`)

ChatClient wires all handlers (lines 859-876):
```typescript
<Composer
  value={input}
  onChange={setInput}
  onSend={send}
  onStop={stop}
  streaming={streaming}
  attachments={attachments}
  notice={imgNotice}
  onAddFiles={onAddFiles}
  onAddUrl={onAddUrl}
  onRemoveAttachment={onRemoveAttachment}
  onNew={newConv}
  onClear={clearConv}
  onExport={() => setExportOpen(true)}
  onToggleSettings={() => setSettingsOpen((v) => !v)}
  ocrAvailable={ocrAvailable}
  modelName={modelName}
/>
```

ChatClient owns all state and handlers. To add a new picker UI, you would:
1. Add a new handler prop (e.g., `onPickTool`) to Composer
2. Create a handler in ChatClient (similar to `onNew()`, `onClear()`)
3. Pass it to Composer via the prop
4. Integrate the picker trigger logic into Composer (similar to how slash-menu is triggered)

---

## 3. Client-Side Tool Discovery

**API Endpoint**: `D:/Projects/personal_projects/LAAM/src/app/api/chat/info/route.ts`

**GET /api/chat/info Response** (lines 12-21):
```typescript
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    model: MODEL,
    claudeModels: process.env.ANTHROPIC_API_KEY ? [...CLAUDE_MODELS] : [],
  });
}
```

**Response Shape** (verbatim):
```json
{
  "model": "gemma4:e4b",
  "claudeModels": ["claude-sonnet-4-6", "claude-opus-4-8"]
}
```
- `model`: string â€” the default/deployed chat model
- `claudeModels`: string[] â€” whitelist of available Claude API models; empty array if no ANTHROPIC_API_KEY

**ChatClient Usage** (lines 90-96):
```typescript
fetch("/api/chat/info")
  .then((r) => r.json())
  .then((d: { model?: string; claudeModels?: string[] }) => {
    if (d.model) setSettings((s) => ({ ...s, model: d.model! }));
    if (Array.isArray(d.claudeModels)) setClaudeModels(d.claudeModels);
  })
  .catch(() => {});
```

**Related Fetch**: ChatClient also fetches `/api/ollama/models` (lines 84-88):
```typescript
fetch("/api/ollama/models")
  .then((r) => r.json())
  .then((d: { models?: string[] }) => {
    if (Array.isArray(d.models)) setModels(d.models);
  })
  .catch(() => {});
```

**No Direct Tools Endpoint**: The client does NOT fetch a tools list. Tool discovery happens server-side during `/api/chat` streaming. The chat route composes available tools based on server configuration, not via a separate client-side fetch.

---

## 4. i18n Pattern: File Locations, Key Structure, and Usage

**Translation Files** (all in `D:/Projects/personal_projects/LAAM/src/i18n/dictionaries/`):
- `chat.ts` â€” chat page strings (vi/en/zh)
- `common.ts` â€” shared UI strings
- `auth.ts` â€” authentication strings
- `agents.ts` â€” agent page strings
- `connectors.ts` â€” connector configuration strings
- (and 10+ others for other features)

**Type Definitions** (`D:/Projects/personal_projects/LAAM/src/i18n/types.ts`):
```typescript
export type Lang = 'vi' | 'en' | 'zh';

export interface Entry {
  vi: string;
  en: string;
  zh: string;
}

export type Dict = Record<string, Entry>;

export type Translator = (key: string, vars?: Record<string, string | number>) => string;
```

**Example Dictionary Structure** (`D:/Projects/personal_projects/LAAM/src/i18n/dictionaries/chat.ts`, lines 1-10):
```typescript
export const chat: Dict = {
  'chat.title': { vi: 'TrÃ² chuyá»‡n â€” LAAM', en: 'Chat â€” LAAM', zh: 'å¯¹è¯ â€” LAAM' },
  'chat.sidebarAria': { vi: 'Lá»‹ch sá»­ trÃ² chuyá»‡n', en: 'Conversation history', zh: 'å¯¹è¯åŽ†å²' },
  'chat.cmdNew': { vi: 'Cuá»™c trÃ² chuyá»‡n má»›i', en: 'New conversation', zh: 'æ–°å»ºå¯¹è¯' },
  'chat.cmdClear': { vi: 'XoÃ¡ ná»™i dung há»™i thoáº¡i', en: 'Clear conversation', zh: 'æ¸…ç©ºå¯¹è¯å†…å®¹' },
  'chat.counter': { vi: '{chars} kÃ½ tá»± Â· ~{tokens} token', en: '{chars} chars Â· ~{tokens} tokens', zh: '{chars} å­—ç¬¦ Â· çº¦ {tokens} token' },
};
```

**Usage Pattern in Client Components** (Composer.tsx, line 10-11, 61):
```typescript
import { useT } from "@/i18n/provider";
import { chat } from "@/i18n/dictionaries/chat";

export function Composer({ ... }) {
  const t = useT(chat);
  // Later in the component:
  {t("chat.cmdMenuHead")}  // returns translated string for active lang
  {t("chat.counter", { chars: value.length, tokens: Math.ceil(value.length / 4) })}  // with interpolation
}
```

**useT Hook** (`D:/Projects/personal_projects/LAAM/src/i18n/provider.tsx`, lines 33-39):
```typescript
export function useT(namespace: Dict): Translator {
  const { lang } = useLang();
  return useCallback<Translator>(
    (key, vars) => resolve(namespace, lang, key, vars),
    [namespace, lang],
  );
}
```

**Resolution Logic** (`D:/Projects/personal_projects/LAAM/src/i18n/index.ts`, lines 12-30):
The resolve function implements fallback: active-lang â†’ vi â†’ the key itself, then interpolates {var} placeholders:
```typescript
export function resolve(
  dict: Dict,
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const entry = dict[key];
  let s: string | undefined;
  if (entry) {
    s = entry[lang] || entry.vi;  // fallback to Vietnamese
  }
  if (s == null || s === '') s = key;  // fallback to the key itself
  if (vars) {
    s = s.replace(VAR_RE, (m, name: string) =>
      vars[name] != null ? String(vars[name]) : m,
    );
  }
  return s;
}
```

**To Add a New Key**:
1. Add entry to the appropriate Dict in `src/i18n/dictionaries/*.ts`:
```typescript
'chat.newKey': { vi: 'tiáº¿ng Viá»‡t', en: 'English', zh: 'ä¸­æ–‡' },
```
2. Use in component:
```typescript
const t = useT(chat);
return <span>{t('chat.newKey', { param: 'value' })}</span>;
```

---

## 5. Existing Dropdown/Popover/Menu Primitives

**Slash-Command Menu** (Composer.tsx, lines 200-229) â€” closest existing pattern:
- Positioned absolutely above the textarea (`bottom-full`)
- Uses `role="listbox"` with button children (`role="option"`)
- Responsive styling: rounded border, shadow, dark-mode aware
- Hover states: `hover:bg-neutral-100 dark:hover:bg-neutral-700`
- Keyboard nav: Enter key executes first match, Escape cancels

**Model Settings Picker** (SettingsPanel.tsx, lines 54-80) â€” native `<select>` with optgroups:
```typescript
<select
  aria-label={t("chat.setModelLabel")}
  value={settings.model}
  onChange={(e) => onChange({ ...settings, model: e.target.value })}
  className={FIELD_CLS}
>
  {hasGroups ? (
    <>
      <optgroup label={t("chat.grpLocal")}>
        {ollamaList.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </optgroup>
      <optgroup label={t("chat.grpClaude")}>
        {claudeModels.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </optgroup>
    </>
  ) : (
    list.map((m) => (
      <option key={m} value={m}>
        {m}
      </option>
    ))
  )}
</select>
```

**UI Primitives Available**:
- `MatteCard` (src/components/ui/matte-card.tsx) â€” reusable opaque surface with optional Bloom effect
- `Bloom` (src/components/ui/bloom.tsx) â€” decorative radial glow for depth

**Recommended Pattern for a New Tool Picker**:
The slash-menu pattern (listbox + button grid) is reusable. You could abstract it into a `<CommandMenu>` or `<Popover>` component if needed, but the current inline implementation in Composer is lightweight and works well.

---

## 6. Chat Component Test Patterns

**Representative File**: `D:/Projects/personal_projects/LAAM/src/components/chat/Composer.test.tsx`

**Setup Pattern** (lines 9-32):
```typescript
import { expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider } from "@/i18n/provider";
import { Composer } from "./Composer";
import type { Attachment } from "./types";

type Props = Parameters<typeof Composer>[0];

function setup(over: Partial<Props> = {}) {
  const props: Props = {
    value: "",
    onChange: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    streaming: false,
    attachments: [],
    onAddFiles: vi.fn(),
    onAddUrl: vi.fn(),
    onRemoveAttachment: vi.fn(),
    onNew: vi.fn(),
    onClear: vi.fn(),
    onExport: vi.fn(),
    onToggleSettings: vi.fn(),
    ...over,
  };
  render(
    <I18nProvider lang="vi">
      <Composer {...props} />
    </I18nProvider>,
  );
  return props;
}
```

**Test Example** (lines 75-80):
```typescript
test("typing a slash prefix shows the slash-command menu", () => {
  setup({ value: "/" });
  expect(screen.getByText("Lá»‡nh nhanh")).toBeInTheDocument();
  expect(screen.getByText("Cuá»™c trÃ² chuyá»‡n má»›i")).toBeInTheDocument();
});
```

**Key Patterns**:
1. **Wrapper**: Always wrap with `<I18nProvider lang="vi">` for translation testing
2. **Mocks**: All handler props are `vi.fn()` mocks via the setup helper
3. **Render**: Use `screen` from @testing-library/react for queries (by aria-label, text, role)
4. **Fire Events**: Use `fireEvent.change()`, `fireEvent.click()`, `fireEvent.keyDown()`
5. **Assert**: Check mock call counts and arguments, or DOM presence

**Integration Test Example** (`D:/Projects/personal_projects/LAAM/src/components/chat/ChatClient.test.tsx`, lines 9-41):
```typescript
function streamResponse(chunks: string[], convId = "conv-1"): Response {
  let i = 0;
  return {
    ok: true,
    headers: { get: (k: string) => (k === "x-conversation-id" ? convId : null) },
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: new TextEncoder().encode(chunks[i++]) }
            : { done: true, value: undefined },
      }),
    },
  } as unknown as Response;
}

function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/chat" && init?.method === "POST") return streamResponse(["chÃ o báº¡n"]);
    const json = url.startsWith("/api/conversations")
      ? { conversations: [] }
      : url === "/api/ollama/models"
        ? { models: [] }
        : url === "/api/chat/info"
          ? { model: "test-model" }
          : url === "/api/ocr"
            ? { available: true }
            : {};
    return { ok: true, json: async () => json } as unknown as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

test("click prompt máº«u gá»­i tin nháº¯n ngay", async () => {
  const fetchMock = mockFetch();
  vi.stubGlobal("fetch", fetchMock);
  render(
    <I18nProvider lang="vi">
      <ChatClient />
    </I18nProvider>,
  );
  // ... test continues ...
});
```

**Key Patterns for Integration Tests**:
1. **Mock global fetch**: Route by URL, return Response objects with streams or JSON
2. **Stream reader**: For /api/chat, return a ReadableStream with getReader() that yields text chunks
3. **Async assertions**: Use `waitFor()` to wait for async updates
4. **I18nProvider wrapper**: Still required at root for i18n context