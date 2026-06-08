# Streamdown Spike — Implementation Plan (2026-06-07)

> **Spike, time-box 1–2 ngày, KHÔNG migration.** Mục tiêu duy nhất: trả lời 4 acceptance criteria của [[streamdown-spike]] bằng code chạy được + test, sau feature flag, **song song** `MarkdownView` (không gỡ đường cũ). Đậu cả 4 → lên plan thay. Rớt criteria (1) → fallback react-markdown, **KHÔNG hybrid**.

**Goal:** Dựng `StreamdownView` (drop-in API `{source, className}` y `MarkdownView`) dùng `streamdown@2.5.0`, route ```chart/```map sang ChartBlock/MapBlock TRƯỚC khi Shiki giành, giữ Shiki theme-aware cho code thường. Bật/tắt qua env flag. Cộng quick-win độc lập: fix `CodeBlock` hardcode `oneLight` (hỏng dark).

**Tech Stack:** `streamdown@2.5.0` (đã cài, peer react ^19 ✓, deps gồm `mermaid`/`shiki`/`rehype-harden` — bundled, không CDN). Dark mode **class-based** (`.dark` trên `<html>`, Tailwind v4 `@custom-variant`) — `shikiTheme:[light,dark]` switch theo cùng cơ chế.

## API thật (ground, từ `node_modules/streamdown/dist/index.d.ts`)
- `<Streamdown>` = `Options` (react-markdown-like: `components`, `remark/rehypePlugins`, `allowedElements`…) + `parseIncompleteMarkdown`, `shikiTheme:[ThemeInput,ThemeInput]`, `mermaid`, `controls`, `className`, `plugins`, `caret`, `dir`.
- Export sẵn `CodeBlock({code,language,...})` + `StreamdownContext` → override `components.code` của ta route chart/map, **delegate code thường cho `<CodeBlock>` của Streamdown** (chạy trong context của `<Streamdown>` nên có shikiTheme).
- Type `Components` tách `inlineCode` riêng ⇒ **rủi ro nhị phân**: chưa chắc `components.code` của ta thắng Shiki nội bộ cho fenced block. **Test sẽ phán** (xem Step 4).

---

## Steps

### Step 0 — CSS/Tailwind wiring (gate compile)
- `globals.css`: thêm `@import "streamdown/styles.css";` + `@source "../../node_modules/streamdown/dist";` (Tailwind v4 quét class utility của streamdown).
- **Success:** `npm run build`/tsc không lỗi CSS; KHÔNG tự chạy build (agent-ops-rules) → verify bằng tsc + test.

### Step 1 — Feature flag
- Đọc `process.env.NEXT_PUBLIC_CHAT_RENDERER` (Next inline ở build). `"streamdown"` → StreamdownView, mặc định → MarkdownView.
- `.env.example`: thêm dòng `NEXT_PUBLIC_CHAT_RENDERER=` (mặc định rỗng = react-markdown, đường cũ nguyên vẹn).

### Step 2 — `ChatMarkdown.tsx` (switch, drop-in)
- Component `{source, className}` chọn StreamdownView vs MarkdownView theo flag. `MessageItem` đổi import `MarkdownView` → `ChatMarkdown` (1 dòng). Đường cũ giữ nguyên khi flag tắt.

### Step 3 — `StreamdownView.tsx`
- `<Streamdown shikiTheme={[light,dark]} mermaid components={{code, pre}} parseIncompleteMarkdown>`.
- `components.code`: tách lang+raw (như MarkdownView). `chart`→`<ChartBlock>`, `map`→`<MapBlock>`, không-match→`<code>` inline, còn lại→Streamdown `<CodeBlock code language/>`.
- `pre`: passthrough `<>{children}</>` (như MarkdownView, để block component tự bọc).

### Step 4 — Tests `StreamdownView.test.tsx` (mirror MarkdownView.test.tsx) — **phán criteria 1**
- ```chart → `.chat-chart` tồn tại (criteria 1a). ```map → `.chat-map-wrap` (1b).
- ```js → có code block (criteria 2, presence; theme-aware = runtime).
- `<script>` bị strip (rehype-harden). GFM table → `<table>`.
- **Success:** chart/map test XANH ⇒ criteria 1 đậu trong jsdom. ĐỎ ⇒ Shiki nuốt fence → ghi nhận rớt, kích hoạt fallback (đường cũ vẫn chạy vì flag mặc định tắt).

### Step 5 — Quick-win độc lập: `CodeBlock` theme-aware
- Thêm `src/hooks/useIsDark.ts` (đọc `.dark` + MutationObserver, theo pattern useChartTheme). `CodeBlock` chọn `oneDark`/`oneLight`. Cải thiện **đường cũ**, không phụ thuộc spike.
- Test: render trong `<html class="dark">` style đổi (hoặc tối thiểu không vỡ).

### Step 6 — Verify (Phase 5, NEVER SKIP)
- `npm test` toàn bộ xanh (suite cũ không vỡ + test mới). `tsc --noEmit` sạch.
- **KHÔNG** tự `npm run dev/build` (agent-ops-rules) → criteria 3 (no-flicker), 4 (CJK visual), theme-aware runtime = **bàn giao user verify trên host** (ghi rõ — Rule 12 fail loud).

## Verification runtime (user, trên host — ngoài phạm vi agent)
Bật `NEXT_PUBLIC_CHAT_RENDERER=streamdown`, mở /chat: (3) stream không nhấp nháy; (4) chat tiếng Trung dấu câu đúng; code dark-mode theme đổi; Mermaid render offline (ngắt mạng thử). Verify `mermaid`/Shiki KHÔNG fetch CDN (DevTools Network).

## Out of scope
browser-act (B), Skill Forge (C), human-handoff (D) — defer. Frame protocol (splitFrames/citations/ConfirmCard) bất biến, không đụng.
