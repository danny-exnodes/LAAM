# V2 Wave 3 — Package W3-D (Composer + SettingsPanel + ConversationSidebar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development per component. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the three presentational chat UI components (Composer, SettingsPanel, ConversationSidebar) conforming EXACTLY to the LOCKED prop contracts in the Wave 3 plan, wired to i18n via `useT(dictionaries/chat)`.

**Architecture:** Pure presentational React client components. They hold only ephemeral local UI state (slash-menu open, drag-over, inline-rename buffer); all durable state + actions come via props/callbacks from `ChatClient` (TL-owned). Import shared types from `@/components/chat/types`. Reuse existing `chat.*` i18n keys — the dict already covers every label these need, so NO dict changes are required.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / Tailwind 4. Tests: vitest + @testing-library/react + jsdom. Wrap RTL renders in `<I18nProvider lang="vi">`.

---

## Constraints (from teammate brief + AGENTS.md)
- Own ONLY: `v2/src/components/chat/{Composer,SettingsPanel,ConversationSidebar}.tsx` + matching `*.test.tsx`.
- Do NOT touch `types.ts`, MessageList/MessageItem/ChatExport, ChatClient/page, api routes, package.json/vitest/tsconfig, or the chat dict (no new keys needed).
- Run only: `npx vitest run src/components/chat/Composer src/components/chat/SettingsPanel src/components/chat/ConversationSidebar`.
- Do NOT commit. Simplicity, surgical, fail loud.

## i18n key map (all keys already exist in `dictionaries/chat.ts`)
- Composer: `chat.inputPh`, `chat.inputAria`, `chat.send`, `chat.stop`, `chat.sendAria`, `chat.stopAria`, `chat.attachFileTitle`, `chat.attachFileAria`, `chat.attachUrlTitle`, `chat.attachUrlAria`, `chat.attachRemoveAria`, `chat.attachChars`, `chat.counter`, `chat.dropHere`, `chat.dropFormats`, `chat.urlPrompt`, `chat.scrollBottomAria`, `chat.cmdMenuHead`, `chat.cmdNew`, `chat.cmdClear`, `chat.cmdStop`, `chat.cmdExport`, `chat.cmdSettings`.
- SettingsPanel: `chat.setTitle`, `chat.setModelLabel`, `chat.setTempLabel`, `chat.setTempHint`, `chat.setToppLabel`, `chat.setSystemLabel`, `chat.setSystemPh`, `chat.setApplyNote`.
- ConversationSidebar: `chat.histTitle`, `chat.histNew`, `chat.histNewAria`, `chat.histFilterPh`, `chat.histFilterAria`, `chat.histListAria`, `chat.histUntitled`, `chat.histNoMatch`, `chat.histEmpty`, `chat.histRenameAria`, `chat.histRenameTitle`, `chat.histDeleteAria`, `chat.histDeleteTitle`, `chat.histRenameInputAria`.

## Slash commands (Composer)
Mapped to provided callbacks (no extra props): `/moi`→onClear-via?... — NOTE: locked Composer props expose only onSend/onStop. The other commands (new/clear/export/settings) have no callback here, so the slash menu is a typed-text affordance: selecting a command replaces input with nothing and, for the ones we CAN action, calls them: `/dung`→onStop. `/moi /xoa /xuat /caidat` have no local callback → selecting them just clears the slash text (ChatClient owns those via its own controls). Keep it minimal: show the 5 commands when input starts with `/`, filter by prefix, click/Enter picks → for `dung` call onStop, otherwise clear input. This matches the brief's "keep minimal" guidance and the locked prop surface.

---

## Task 1: Composer

**Files:**
- Create: `v2/src/components/chat/Composer.tsx`
- Test: `v2/src/components/chat/Composer.test.tsx`

- [ ] **Step 1: Write failing tests** covering: controlled textarea calls onChange; Enter (no shift) calls onSend + preventDefault; Shift+Enter does NOT call onSend; Esc calls onStop; send button disabled when streaming; send button disabled when value empty; clicking send calls onSend; typing `/` shows slash menu with commands; attachment chip × calls onRemoveAttachment(id); URL button calls onAddUrl with prompt result; char counter shows for non-empty value.
- [ ] **Step 2: Run, verify fail** (`npx vitest run src/components/chat/Composer`).
- [ ] **Step 3: Implement Composer.tsx.**
- [ ] **Step 4: Run, verify pass.**

## Task 2: SettingsPanel

**Files:**
- Create: `v2/src/components/chat/SettingsPanel.tsx`
- Test: `v2/src/components/chat/SettingsPanel.test.tsx`

- [ ] **Step 1: Write failing tests**: model select renders options from `models` and reflects `settings.model`; changing model calls onChange with new model; temperature slider change calls onChange with new temperature; topP slider change calls onChange with new topP; system textarea change calls onChange with new system; the displayed temp/topP values reflect props.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement SettingsPanel.tsx.**
- [ ] **Step 4: Run, verify pass.**

## Task 3: ConversationSidebar

**Files:**
- Create: `v2/src/components/chat/ConversationSidebar.tsx`
- Test: `v2/src/components/chat/ConversationSidebar.test.tsx`

- [ ] **Step 1: Write failing tests**: renders conv titles; search input bound to `query`, typing calls onQuery; list filtered client-side by `query` against title; active conv highlighted (aria-current); clicking a row calls onOpen(id); new button calls onNew; delete × calls onDelete(id); double-click title → input → Enter calls onRename(id, newTitle); empty state when no convs; no-match state when query filters all out; untitled fallback for empty title.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement ConversationSidebar.tsx.**
- [ ] **Step 4: Run, verify pass.**

## Success
`npx vitest run src/components/chat/Composer src/components/chat/SettingsPanel src/components/chat/ConversationSidebar` all green. No other files modified. No commit.
