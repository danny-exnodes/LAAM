# Decision: Streamdown spike (renderer chat) + defer browser-act/skills

**Ngày:** 2026-06-07 · **Vai trò:** technical consultant · **Trạng thái:** DUYỆT SPIKE (time-box 1–2 ngày), **chưa migration**. User đã chốt.

**Nguồn:** nghiên cứu 2 công cụ ngoài — [Streamdown](https://github.com/vercel/streamdown) (drop-in react-markdown cho AI streaming) + [browser-act/skills](https://github.com/browser-act/skills) (browser-automation CLI cho agent).

## Vấn đề
Chat LAAM stream từng token: `ChatClient.tsx` đọc `getReader()` + `splitFrames(raw)` → **render lại `MarkdownView` (react-markdown) mỗi chunk** → nhấp nháy/reflow. Code-block (`CodeBlock.tsx`) hardcode Prism `oneLight` → **hỏng dark mode**. Không CJK riêng (tool 3 ngôn ngữ vi/en/zh), không Mermaid/KaTeX.

## Đóng khung rủi ro (user chỉnh)
KHÔNG phải "low-risk drop-in". Rủi ro **tập trung + nhị phân**, nằm đúng 1 chỗ: Streamdown ship plugin Shiki **tự sở hữu code block** → câu hỏi sống-chết = có chặn được fence ```chart / ```map route sang ChartBlock/MapBlock **trước khi** code plugin giành lấy, mà vẫn giữ Shiki cho code thường, **dưới streaming + dark mode**, hay không.

## Acceptance criteria spike (DUY NHẤT — đậu cả 4 mới lên plan thay)
1. ```chart + ```map vẫn render ChartBlock/MapBlock (không bị nuốt thành code block).
2. Code thường được Shiki highlight, theme-aware theo dark mode.
3. Không nhấp nháy/reflow khi stream từng chunk.
4. CJK (zh) render đúng.

## Quy tắc spike
- Làm **sau feature flag**, dựng **song song** MarkdownView, **không gỡ** đường cũ.
- Rớt (1) → **fallback**: giữ react-markdown + fix thủ công flicker & dark-mode. **KHÔNG hybrid 2 đường render.**
- Verify bắt buộc, đừng sót:
  - **Local-first**: Mermaid/Shiki **không** load asset qua `cdnUrl` — phải chạy offline ($0/local-first, không thêm phụ thuộc mạng).
  - **Bundle**: lazy-load đúng plugin cần (code/cjk/mermaid/math), không kéo nguyên.
  - shadcn = chỉ map một bộ **CSS variables tối thiểu** — KHÔNG nuốt shadcn.
  - Tương thích React 19 / Next 16.
- **Bỏ qua** frame protocol (`splitFrames`/citations/ConfirmCard): bọc ngoài chuỗi markdown, gần như zero rủi ro — đừng tốn thời gian.

## Quick win tách riêng (độc lập spike)
Bug `CodeBlock.tsx` hardcode `oneLight` (hỏng dark) fix ngay bằng Prism theme-aware. Nếu spike trôi > 2 ngày → làm interim fix này trước. Liên quan [[v2-dark-mode-theming]].

## Defer (chốt với user)
- **B — Browser connector (ý tưởng browser-act):** CHƯA làm. Triết lý lọc đúng (giữ Chrome-reuse-login + indexed-output; bỏ stealth/proxy/CAPTCHA trả phí + cloud — ngược local-first/$0/nội bộ). Nhưng surface lớn (harness, session mgmt, gate SP-2, maintenance cao) + Python (LAAM Node). **Gate mở discovery = phải có 1 use case nội bộ THẬT, site no-API đang chặn ai đó hôm nay.** Chưa có use case → chưa spike.
- **C — Skill Forge concept:** backlog/vision. Map thẳng workflow-template "moat-leaning" — gắn vào sẵn có, KHÔNG spin initiative mới. Xem [[workflow-orchestration-architecture]].
- **D — human-handoff khi agent kẹt:** backlog, rẻ, tái dùng ProactiveCard/ConfirmCard (proactive-stuck SP-3) — làm lúc nào cũng được.

## Liên quan
[[v2-dark-mode-theming]] · [[agent-harness-sp4-ux-feedback]] (frame protocol/citations) · [[world-tools-layer]] (web_*) · [[workflow-orchestration-architecture]] · [[poc-model-choice]].
